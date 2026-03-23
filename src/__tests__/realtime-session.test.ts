import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Editor } from "obsidian";
import type { SessionCallbacks } from "../realtime-session";
import { DEFAULT_SETTINGS, VoxtralSettings } from "../types";
import { DictationTracker } from "../dictation-tracker";
import { setLanguage } from "../voice-commands";

/**
 * Tests for RealtimeSession (single-stream mode).
 *
 * Focus areas:
 * 1. Delta accumulation and sentence flushing
 * 2. Cumulative vs incremental delta handling
 * 3. Turn boundary handling (handleDone)
 * 4. Stop pattern detection
 * 5. Reconnect lifecycle
 * 6. Text flows normally during active slots (no buffering)
 */

// ── Mock Editor ──

function createMockEditor(initialText = ""): Editor {
	const lines: Array<{ text: string }> = [{ text: initialText }];
	let cursorLine = 0;
	let cursorCh = initialText.length;

	function getText(): string {
		return lines.map((l) => l.text).join("\n");
	}

	function posToOffset(pos: { line: number; ch: number }): number {
		let offset = 0;
		for (let i = 0; i < pos.line && i < lines.length; i++) {
			offset += lines[i].text.length + 1;
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

	return {
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
				return fullText.substring(posToOffset(from), posToOffset(to));
			},
		),
		undo: vi.fn(),
	} as unknown as Editor;
}

// ── Mock RealtimeTranscriber ──

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

vi.mock("../plugin-logger", () => ({
	vlog: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("obsidian", () => ({
	Notice: vi.fn(),
}));

const { RealtimeSession } = await import("../realtime-session");

// ── Helpers ──

function createSettings(overrides?: Partial<VoxtralSettings>): VoxtralSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

/** Standalone mock fns — avoids unbound-method lint errors in assertions */
const mockStopRecording = vi.fn();
const mockIsRecording = vi.fn(() => true);

function createCallbacks(editor: Editor): SessionCallbacks {
	mockStopRecording.mockClear();
	mockIsRecording.mockClear().mockReturnValue(true);
	return {
		updateStatusBar: vi.fn(),
		stopRecording: mockStopRecording,
		isRecording: mockIsRecording,
		getEditor: vi.fn(() => editor),
	};
}

function getTranscriberCallbacks() {
	const last = transcriberInstances[transcriberInstances.length - 1];
	return last.callbacks;
}

// ── Tests ──

describe("RealtimeSession", () => {
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

	describe("delta accumulation", () => {
		it("accumulates text until sentence-ending punctuation", async () => {
			const session = new RealtimeSession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// Send partial text (no sentence end)
			tc.onDelta("Hallo wereld");
			// Text should not be flushed yet
			expect(editor.getValue()).toBe("");

			// Complete the sentence
			tc.onDelta("Hallo wereld. ");

			// Now it should be flushed
			expect(editor.getValue()).toContain("Hallo wereld.");
		});

		it("flushes after accumulating more than 120 characters", async () => {
			const session = new RealtimeSession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// Send a long text without sentence ending
			const longText = "a ".repeat(65); // 130 chars
			tc.onDelta(longText);

			expect(editor.getValue()).toContain("a a a");
		});

		it("handles cumulative deltas correctly", async () => {
			const session = new RealtimeSession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			tc.onDelta("Hel");
			tc.onDelta("Hello");
			tc.onDelta("Hello world. ");

			// Should only contain the text once, not duplicated
			const text = editor.getValue();
			expect(text).toContain("Hello world.");
			// Verify no duplication
			expect(text.indexOf("Hello")).toBe(text.lastIndexOf("Hello"));
		});

		it("handles incremental (non-cumulative) deltas", async () => {
			const session = new RealtimeSession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// These are not cumulative — each is new text
			tc.onDelta("Hello ");
			// Reset prevRaw to simulate non-cumulative (different turn)
			tc.onDelta("world. ");

			expect(editor.getValue()).toContain("Hello world.");
		});
	});

	describe("turn boundaries (handleDone)", () => {
		it("flushes remaining text on done event", async () => {
			const session = new RealtimeSession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// Send text without sentence ending
			tc.onDelta("Partial text");
			expect(editor.getValue()).toBe("");

			// Done event triggers flush
			tc.onDone("Partial text");

			expect(editor.getValue()).toContain("Partial text");
		});

		it("includes text only in done event (not in deltas)", async () => {
			const session = new RealtimeSession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// Small delta
			tc.onDelta("Hi");
			// Done event has more text than what deltas sent
			tc.onDone("Hi there");

			expect(editor.getValue()).toContain("Hi there");
		});
	});

	describe("stop pattern detection", () => {
		it("detects 'stop opname' and stops recording", async () => {
			const session = new RealtimeSession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			tc.onDelta("Stop opname. ");

			expect(mockStopRecording).toHaveBeenCalled();
		});

		it("detects 'beeindig opname' and stops recording", async () => {
			const session = new RealtimeSession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			tc.onDelta("Beëindig opname. ");

			expect(mockStopRecording).toHaveBeenCalled();
		});

		it("detects 'stop recording' in English", async () => {
			const session = new RealtimeSession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			tc.onDelta("Stop recording. ");

			expect(mockStopRecording).toHaveBeenCalled();
		});
	});

	describe("reconnect lifecycle", () => {
		it("reconnects silently after disconnect during recording", async () => {
			const session = new RealtimeSession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			const instancesBefore = transcriberInstances.length;

			// Simulate disconnect
			tc.onDisconnect();
			// Allow async reconnect
			await new Promise((r) => setTimeout(r, 50));

			// A new transcriber should have been created
			expect(transcriberInstances.length).toBeGreaterThan(instancesBefore);
		});

		it("does not reconnect when not recording", async () => {
			const session = new RealtimeSession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// Stop recording
			mockIsRecording.mockReturnValue(false);

			const instancesBefore = transcriberInstances.length;
			tc.onDisconnect();
			await new Promise((r) => setTimeout(r, 50));

			// Should not have created a new transcriber
			expect(transcriberInstances.length).toBe(instancesBefore);
		});
	});

	describe("slot interaction", () => {
		it("text continues to flow during active slot (no buffering)", async () => {
			const session = new RealtimeSession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// Simulate a voice command that opens a slot by sending text
			// that triggers the bold command
			tc.onDelta("Vet. ");

			// Bold command should have fired, inserting **
			const textAfterCommand = editor.getValue();
			expect(textAfterCommand).toContain("**");

			// Now send more text — it should NOT be buffered
			tc.onDelta("Belangrijk woord. ");

			// Text should appear in the editor (not buffered)
			const finalText = editor.getValue();
			expect(finalText).toContain("Belangrijk woord.");
		});
	});

	describe("finalization (stop)", () => {
		it("flushes remaining pending text on stop", async () => {
			const session = new RealtimeSession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// Send text without sentence ending
			tc.onDelta("Unfinished");

			await session.stop(editor);

			expect(editor.getValue()).toContain("Unfinished");
		});

		it("closes the WebSocket connection", async () => {
			const session = new RealtimeSession(settings, tracker, callbacks);
			await session.start(editor);

			const transcriber = transcriberInstances[transcriberInstances.length - 1];

			await session.stop(editor);

			expect(transcriber.endAudio.mock.calls.length).toBeGreaterThan(0);
			expect(transcriber.close.mock.calls.length).toBeGreaterThan(0);
		});
	});

	describe("flushAfterSlot", () => {
		it("flushes pending text after slot closes", async () => {
			const session = new RealtimeSession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getTranscriberCallbacks();

			// Accumulate some text without sentence ending
			tc.onDelta("some text");

			session.flushAfterSlot(editor);

			// Pending text should have been processed
			expect(editor.getValue()).toContain("some text");
		});
	});
});
