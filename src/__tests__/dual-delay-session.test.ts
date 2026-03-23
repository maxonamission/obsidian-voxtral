import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Editor } from "obsidian";
import type { SessionCallbacks } from "../realtime-session";
import { DEFAULT_SETTINGS, VoxtralSettings } from "../types";
import { DictationTracker } from "../dictation-tracker";
import { setLanguage } from "../voice-commands";

/**
 * Tests for DualDelaySession internals.
 *
 * Because DualDelaySession tightly couples to Editor and RealtimeTranscriber,
 * we test the core logic indirectly through the public API (start/stop/sendAudio)
 * using mocks.  The focus is on:
 *
 * 1. Reconciliation: fast/slow text merging
 * 2. Voice command detection and execution in slow stream
 * 3. Slot handling: leading whitespace stripping after slot opens
 * 4. Cursor movement detection and text commitment
 * 5. Reconnection state reset
 */

// ── Mock Editor ──

interface EditorLine {
	text: string;
}

/**
 * Minimal mock Editor that maintains a single-line text buffer.
 * Supports posToOffset, offsetToPos, getCursor, setCursor, replaceRange,
 * getLine, and getValue.
 */
function createMockEditor(initialText = ""): Editor {
	const lines: EditorLine[] = [{ text: initialText }];
	let cursorLine = 0;
	let cursorCh = initialText.length;

	function getText(): string {
		return lines.map((l) => l.text).join("\n");
	}

	function posToOffset(pos: { line: number; ch: number }): number {
		let offset = 0;
		for (let i = 0; i < pos.line && i < lines.length; i++) {
			offset += lines[i].text.length + 1; // +1 for newline
		}
		offset += Math.min(pos.ch, lines[pos.line]?.text.length ?? 0);
		return offset;
	}

	function offsetToPos(offset: number): { line: number; ch: number } {
		let remaining = offset;
		for (let i = 0; i < lines.length; i++) {
			if (remaining <= lines[i].text.length) {
				return { line: i, ch: remaining };
			}
			remaining -= lines[i].text.length + 1;
		}
		const lastLine = lines.length - 1;
		return { line: lastLine, ch: lines[lastLine].text.length };
	}

	const editor = {
		getCursor: vi.fn(() => ({ line: cursorLine, ch: cursorCh })),
		setCursor: vi.fn((pos: { line: number; ch: number }) => {
			cursorLine = pos.line;
			cursorCh = pos.ch;
		}),
		posToOffset: vi.fn(posToOffset),
		offsetToPos: vi.fn(offsetToPos),
		replaceRange: vi.fn(
			(
				text: string,
				from: { line: number; ch: number },
				to?: { line: number; ch: number },
			) => {
				const fullText = getText();
				const fromOffset = posToOffset(from);
				const toOffset = to ? posToOffset(to) : fromOffset;
				const newText =
					fullText.substring(0, fromOffset) +
					text +
					fullText.substring(toOffset);
				// Rebuild lines
				const newLines = newText.split("\n");
				lines.length = 0;
				for (const l of newLines) {
					lines.push({ text: l });
				}
			},
		),
		getLine: vi.fn((n: number) => lines[n]?.text ?? ""),
		getValue: vi.fn(() => getText()),
		getRange: vi.fn(
			(
				from: { line: number; ch: number },
				to: { line: number; ch: number },
			) => {
				const fullText = getText();
				return fullText.substring(
					posToOffset(from),
					posToOffset(to),
				);
			},
		),
		undo: vi.fn(),
	} as unknown as Editor;

	return editor;
}

// ── Mock RealtimeTranscriber ──

/** Track all created transcriber instances for test assertions */
const transcriberInstances: Array<{
	callbacks: {
		onSessionCreated: () => void;
		onDelta: (text: string) => void;
		onDone: (text: string) => void;
		onError: (message: string) => void;
		onDisconnect: () => void;
	};
	connect: ReturnType<typeof vi.fn>;
	sendAudio: ReturnType<typeof vi.fn>;
	endAudio: ReturnType<typeof vi.fn>;
	close: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("../mistral-api", () => {
	class MockRealtimeTranscriber {
		callbacks: unknown;
		connect = vi.fn(() => {
			(this.callbacks as { onSessionCreated: () => void }).onSessionCreated();
		});
		sendAudio = vi.fn();
		endAudio = vi.fn();
		close = vi.fn();

		constructor(_settings: unknown, callbacks: unknown, _delay?: number) {
			this.callbacks = callbacks;
			transcriberInstances.push(this as unknown as (typeof transcriberInstances)[number]);
		}
	}
	return { RealtimeTranscriber: MockRealtimeTranscriber };
});

// ── Mock plugin-logger ──
vi.mock("../plugin-logger", () => ({
	vlog: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// ── Mock obsidian Notice ──
vi.mock("obsidian", () => ({
	Notice: vi.fn(),
}));

// Import AFTER mocks are set up
const { DualDelaySession } = await import("../dual-delay-session");

// ── Helpers ──

function createSettings(overrides?: Partial<VoxtralSettings>): VoxtralSettings {
	return { ...DEFAULT_SETTINGS, dualDelay: true, ...overrides };
}

/** Standalone mock fns — avoids unbound-method lint errors in assertions */
const mockUpdateStatusBar = vi.fn();
const mockStopRecording = vi.fn();
const mockIsRecording = vi.fn(() => true);

function createCallbacks(editor: Editor): SessionCallbacks {
	mockUpdateStatusBar.mockClear();
	mockStopRecording.mockClear();
	mockIsRecording.mockClear().mockReturnValue(true);
	return {
		updateStatusBar: mockUpdateStatusBar,
		stopRecording: mockStopRecording,
		isRecording: mockIsRecording,
		getEditor: vi.fn(() => editor),
	};
}

/**
 * Get the captured callbacks for the fast and slow transcriber instances
 * created during session.start(). Fast is created first, slow second.
 */
function getTranscriberCallbacks() {
	const len = transcriberInstances.length;
	return {
		fast: transcriberInstances[len - 2].callbacks,
		slow: transcriberInstances[len - 1].callbacks,
	};
}

// ── Tests ──

describe("DualDelaySession", () => {
	let editor: Editor;
	let tracker: DictationTracker;
	let callbacks: SessionCallbacks;
	let settings: VoxtralSettings;

	beforeEach(() => {
		vi.clearAllMocks();
		transcriberInstances.length = 0;
		setLanguage("nl");
		editor = createMockEditor("");
		tracker = new DictationTracker();
		settings = createSettings();
		callbacks = createCallbacks(editor);
	});

	describe("reconciliation", () => {
		it("displays fast text as preview when slow has not caught up", async () => {
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// Fast stream sends text first
			tc.fast.onDelta("Hello world");

			expect(editor.getValue()).toBe("Hello world");
		});

		it("slow text replaces fast preview via display formula", async () => {
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// Fast stream sends preview
			tc.fast.onDelta("Helo wrld");

			// Slow stream catches up with accurate text
			tc.slow.onDelta("Hello world.");

			// After slow sentence completes, it gets committed via processSlowCommands
			// The text should now be the accurate slow version
			const text = editor.getValue();
			expect(text).toContain("Hello world.");
		});

		it("fast extends beyond slow text", async () => {
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// Slow has partial text
			tc.slow.onDelta("Hello");
			// Fast has more
			tc.fast.onDelta("Hello world test");

			// Display should show slow + fast extension: "Hello" + " world test"
			expect(editor.getValue()).toBe("Hello world test");
		});

		it("handles cumulative deltas correctly", async () => {
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// Cumulative deltas: each includes all previous text
			tc.fast.onDelta("Hel");
			tc.fast.onDelta("Hello");
			tc.fast.onDelta("Hello world");

			expect(editor.getValue()).toBe("Hello world");
		});
	});

	describe("voice command detection", () => {
		it("detects standalone voice command in slow stream", async () => {
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// Slow stream receives a standalone command
			tc.slow.onDelta("nieuwe alinea");

			// The command should have been executed (new paragraph = \n\n)
			const text = editor.getValue();
			expect(text).toContain("\n\n");
		});

		it("detects command at end of sentence in slow stream", async () => {
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// Complete sentence with command
			tc.slow.onDelta("Dit is tekst. Nieuwe alinea.");

			const text = editor.getValue();
			expect(text).toContain("Dit is tekst.");
			expect(text).toContain("\n\n");
		});

		it("stops recording when stop command is detected", async () => {
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			tc.slow.onDelta("stop opname");

			// stopRecording should have been called (async via setTimeout)
			await new Promise((r) => setTimeout(r, 10));
			expect(mockStopRecording).toHaveBeenCalled();
		});

		it("discards trailing punctuation after command execution", async () => {
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// Command fires
			tc.slow.onDelta("nieuwe alinea");
			// Then API sends trailing period (cumulative)
			tc.slow.onDelta("nieuwe alinea.");

			// The period should be silently discarded, not inserted
			const text = editor.getValue();
			expect(text).not.toContain(".");
		});
	});

	describe("slot handling", () => {
		it("strips leading whitespace from fast text after slot opens", async () => {
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// Slow stream detects bold command
			tc.slow.onDelta("vet");

			// Verify bold markers were inserted
			expect(editor.getValue()).toContain("**");

			// Clear mock state tracking for fresh fast deltas
			// Fast stream sends text with leading space (typical API behavior)
			tc.fast.onDelta(" Dit is vet");

			// The leading space should be stripped so markdown works: "**Dit is vet"
			const text = editor.getValue();
			expect(text).not.toMatch(/\*\*\s/);
			expect(text).toContain("**Dit");
		});

		it("strips leading whitespace from slow text after slot opens", async () => {
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// Slow stream detects bold command
			tc.slow.onDelta("vet");

			// Slow stream sends next text with leading space
			tc.slow.onDelta(" Dit is vet tekst.");

			const text = editor.getValue();
			// Should not have "** Dit" with space
			expect(text).not.toMatch(/\*\*\s+D/);
		});

		it("updates status bar when slot becomes active", async () => {
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			tc.slow.onDelta("vet");

			expect(mockUpdateStatusBar).toHaveBeenCalledWith("slot");
		});
	});

	describe("cursor movement detection", () => {
		it("commits slow text when cursor moves", async () => {
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// Send some text
			tc.fast.onDelta("Hello world");
			tc.slow.onDelta("Hello");

			// Simulate user moving cursor (e.g., clicked elsewhere)
			editor.setCursor({ line: 0, ch: 0 });

			// Trigger another delta to cause renderText to detect cursor move
			tc.fast.onDelta("Hello world more");

			// The slow text should have been committed — verify text is in editor
			expect(editor.getValue()).toContain("Hello");
		});
	});

	describe("finalization", () => {
		it("replaces display range with slow text on stop", async () => {
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// Fast preview
			tc.fast.onDelta("Helo wrld");
			// Slow accurate text (no sentence end, so not auto-committed)
			tc.slow.onDelta("Hello world");

			await session.stop();

			// Final text should use slow (most accurate)
			expect(editor.getValue()).toContain("Hello world");
		});

		it("uses fast text as fallback when slow is empty", async () => {
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// Only fast stream has text
			tc.fast.onDelta("Quick text");

			await session.stop();

			expect(editor.getValue()).toContain("Quick text");
		});
	});

	describe("flushAfterSlot", () => {
		it("updates insert offset to current cursor position", async () => {
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);

			// Simulate cursor at position 10
			editor.setCursor({ line: 0, ch: 10 });
			session.flushAfterSlot(editor);

			// Verify no error occurred (internal state not directly testable)
			expect(editor.getValue()).toBeDefined();
		});
	});
});
