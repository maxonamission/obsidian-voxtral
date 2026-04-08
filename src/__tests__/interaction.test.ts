import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Editor } from "obsidian";
import type { SessionCallbacks } from "../../../shared/src/realtime-session";
import { DEFAULT_SETTINGS, VoxtralSettings } from "../types";
import { DictationTracker } from "../../../shared/src/dictation-tracker";
import {
	setLanguage,
	loadCustomCommands,
	loadCustomCommandTriggers,
	isSlotActive,
	cancelSlot,
	setPreMatchHook,
} from "../../../shared/src/voice-commands";
import { isLikelyHallucination } from "../../../shared/src/mistral-api";

/**
 * Interaction tests — scenarios that span multiple subsystems.
 *
 * Story 1: Recording Lifecycle (Main ↔ AudioRecorder ↔ Session)
 * Story 2: Dual-Stream Reconciliation under pressure
 * Story 3: DictationTracker ↔ Editor state
 * Story 4: Slot system interactions
 * Story 5: Voice command conflicts
 * Story 6: Hallucination / edge cases with silence
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
		getSelection: vi.fn(() => ""),
		replaceSelection: vi.fn(),
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

vi.mock("../../../shared/src/mistral-api", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../../shared/src/mistral-api")>();
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
	return {
		...original,
		RealtimeTranscriber: MockRealtimeTranscriber,
		correctText: vi.fn((text: string) => Promise.resolve(text)),
		transcribeBatch: vi.fn(() => Promise.resolve("")),
	};
});

vi.mock("../../../shared/src/plugin-logger", () => ({
	vlog: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// Import AFTER mocks
const { DualDelaySession } = await import("../../../shared/src/dual-delay-session");
const { RealtimeSession } = await import("../../../shared/src/realtime-session");

// ── Helpers ──

function createSettings(overrides?: Partial<VoxtralSettings>): VoxtralSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

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
		notify: vi.fn(),
	};
}

function getDualTranscriberCallbacks() {
	const len = transcriberInstances.length;
	return {
		fast: transcriberInstances[len - 2].callbacks,
		slow: transcriberInstances[len - 1].callbacks,
	};
}

function getRealtimeTranscriberCallbacks() {
	return transcriberInstances[transcriberInstances.length - 1].callbacks;
}

// ── STORY 1: Recording Lifecycle ──

describe("Story 1: Recording Lifecycle (Main ↔ AudioRecorder ↔ Session)", () => {
	let editor: Editor;
	let tracker: DictationTracker;
	let callbacks: SessionCallbacks;

	beforeEach(() => {
		vi.clearAllMocks();
		transcriberInstances.length = 0;
		setLanguage("nl");
		cancelSlot();
		editor = createMockEditor("");
		tracker = new DictationTracker();
		callbacks = createCallbacks(editor);
	});

	describe("1a: PCM callback after session nullified", () => {
		it("sendAudio uses optional chaining — no crash when transcriber is null (DualDelay)", async () => {
			const settings = createSettings({ dualDelay: true });
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);

			// Simulate audio arriving
			const pcmData = new ArrayBuffer(1024);
			session.sendAudio(pcmData);

			// Stop session → transcribers become null
			await session.stop();

			// Audio callback fires AFTER stop — should not throw
			expect(() => session.sendAudio(pcmData)).not.toThrow();
		});

		it("sendAudio uses optional chaining — no crash when transcriber is null (Realtime)", async () => {
			const settings = createSettings();
			const session = new RealtimeSession(settings, tracker, callbacks);
			await session.start(editor);

			const pcmData = new ArrayBuffer(1024);
			session.sendAudio(pcmData);

			await session.stop(editor);

			// Audio callback fires AFTER stop — should not throw
			expect(() => session.sendAudio(pcmData)).not.toThrow();
		});
	});

	describe("1b: DualDelaySession.stop() waits for remaining text", () => {
		it("processes remaining slow text during the 1s finalization window", async () => {
			const settings = createSettings({ dualDelay: true });
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getDualTranscriberCallbacks();

			// Slow stream has text that hasn't been committed
			tc.slow.onDelta("Dit is tekst zonder punt");
			tc.fast.onDelta("Dit is tekst zonder punt");

			await session.stop();

			// The text should appear in the editor after finalization
			expect(editor.getValue()).toContain("Dit is tekst zonder punt");
		});

		it("falls back to fast text when slow is empty", async () => {
			const settings = createSettings({ dualDelay: true });
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getDualTranscriberCallbacks();

			// Only fast stream has text
			tc.fast.onDelta("Alleen fast tekst");

			await session.stop();

			expect(editor.getValue()).toContain("Alleen fast tekst");
		});
	});

	describe("1c: Reconnect creates new transcriber while old may still fire", () => {
		it("new transcriber replaces old — old callbacks don't cause duplicates (Realtime)", async () => {
			const settings = createSettings();
			const session = new RealtimeSession(settings, tracker, callbacks);
			await session.start(editor);

			const oldTc = getRealtimeTranscriberCallbacks();
			const instancesBefore = transcriberInstances.length;

			// Trigger disconnect → reconnect
			oldTc.onDisconnect();
			await new Promise((r) => setTimeout(r, 50));

			expect(transcriberInstances.length).toBeGreaterThan(instancesBefore);

			// New transcriber works
			const newTc = getRealtimeTranscriberCallbacks();
			newTc.onDelta("Na reconnect. ");

			expect(editor.getValue()).toContain("Na reconnect.");
		});

		it("reconnect resets turn counters so text doesn't duplicate (Realtime)", async () => {
			const settings = createSettings();
			const session = new RealtimeSession(settings, tracker, callbacks);
			await session.start(editor);

			const tc = getRealtimeTranscriberCallbacks();
			tc.onDelta("Eerste zin. ");
			tc.onDisconnect();
			await new Promise((r) => setTimeout(r, 50));

			// After reconnect, send similar text
			const newTc = getRealtimeTranscriberCallbacks();
			newTc.onDelta("Tweede zin. ");

			const text = editor.getValue();
			expect(text).toContain("Eerste zin.");
			expect(text).toContain("Tweede zin.");
		});
	});
});

// ── STORY 2: Dual-Stream Reconciliation under pressure ──

describe("Story 2: Dual-Stream Reconciliation under pressure", () => {
	let editor: Editor;
	let tracker: DictationTracker;
	let callbacks: SessionCallbacks;
	let settings: VoxtralSettings;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		transcriberInstances.length = 0;
		setLanguage("nl");
		cancelSlot();
		editor = createMockEditor("");
		tracker = new DictationTracker();
		settings = createSettings({ dualDelay: true });
		callbacks = createCallbacks(editor);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("2a: Fast stream delivers voice command before slow", () => {
		it("command appears as preview text until slow processes it", async () => {
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getDualTranscriberCallbacks();

			// Fast stream sends command text as preview
			tc.fast.onDelta("nieuwe alinea");

			// At this point, the text appears in editor as preview
			// (commands are ONLY detected in slow stream)
			const previewText = editor.getValue();
			expect(previewText).toContain("nieuwe alinea");

			// Slow stream catches up — command is now detected and executed
			tc.slow.onDelta("nieuwe alinea");
			vi.advanceTimersByTime(400); // standalone command debounce

			const finalText = editor.getValue();
			// Command should have been executed (new paragraph)
			expect(finalText).toContain("\n\n");
			// Preview text should be cleared
			expect(finalText).not.toContain("nieuwe alinea");
		});
	});

	describe("2b: Slow stream stalls while fast continues", () => {
		it("fast preview continues showing even without slow confirmation", async () => {
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getDualTranscriberCallbacks();

			// Fast stream keeps delivering while slow is stuck
			tc.fast.onDelta("Woord een");
			tc.fast.onDelta("Woord een twee");
			tc.fast.onDelta("Woord een twee drie");

			// Display should show latest fast text as preview
			expect(editor.getValue()).toBe("Woord een twee drie");

			// Slow finally delivers partial confirmation
			tc.slow.onDelta("Woord een");

			// Display should still include fast extension
			expect(editor.getValue()).toBe("Woord een twee drie");
		});
	});

	describe("2c: Both streams disconnect simultaneously", () => {
		it("handles concurrent disconnects without crashing", async () => {
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getDualTranscriberCallbacks();

			// Send some text first
			tc.fast.onDelta("Tekst voor disconnect.");
			tc.slow.onDelta("Tekst voor disconnect.");

			// Both streams disconnect at the same time
			tc.fast.onDisconnect();
			tc.slow.onDisconnect();

			await vi.advanceTimersByTimeAsync(100);

			// Session should still be functional if recording
			// (new transcribers created for both streams)
			expect(transcriberInstances.length).toBeGreaterThan(2);
		});

		it("stops recording after maxConsecutiveFailures", async () => {
			const localSettings = createSettings({ dualDelay: true });
			const session = new DualDelaySession(localSettings, tracker, callbacks);
			await session.start(editor);
			const tc = getDualTranscriberCallbacks();

			// Each disconnect creates a new transcriber. We make them
			// all fail by temporarily overriding push on the array.
			const origPush = Array.prototype.push;
			const boundPush = origPush.bind(transcriberInstances);
			transcriberInstances.push = function (...args: unknown[]) {
				const result = boundPush(...args);
				const newest = transcriberInstances[transcriberInstances.length - 1];
				newest.connect.mockImplementation(() => {
					throw new Error("Connection refused");
				});
				return result;
			} as typeof transcriberInstances.push;

			tc.fast.onDisconnect();

			// Run through enough timers for 5+ reconnect attempts
			for (let i = 0; i < 20; i++) {
				await vi.advanceTimersByTimeAsync(5000);
			}

			// Restore push to prevent leaking
			transcriberInstances.push = origPush as typeof transcriberInstances.push;

			// After 5 failures, stopRecording should be called
			expect(mockStopRecording).toHaveBeenCalled();
		}, 15000);
	});

	describe("2d: Unicode punctuation in sentence boundaries", () => {
		it("handles text with ellipsis correctly", async () => {
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getDualTranscriberCallbacks();

			// Ellipsis is not a standard sentence end for the regex
			tc.slow.onDelta("Dit is tekst...");
			tc.fast.onDelta("Dit is tekst...");

			// The regex [^.!?]+[.!?]+ should match "..." as sentence end
			const text = editor.getValue();
			expect(text).toContain("Dit is tekst");
		});

		it("processes text with guillemets as regular text", async () => {
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getDualTranscriberCallbacks();

			// Guillemets are not sentence-ending punctuation
			tc.slow.onDelta("Hij zei «hallo» en ging weg.");
			tc.fast.onDelta("Hij zei «hallo» en ging weg.");

			const text = editor.getValue();
			expect(text).toContain("Hij zei");
		});
	});
});

// ── STORY 3: DictationTracker ↔ Editor state ──

describe("Story 3: DictationTracker ↔ Editor state", () => {
	let editor: Editor;
	let tracker: DictationTracker;

	beforeEach(() => {
		vi.clearAllMocks();
		transcriberInstances.length = 0;
		setLanguage("nl");
		cancelSlot();
		editor = createMockEditor("");
		tracker = new DictationTracker();
	});

	describe("3a: Tracked ranges after undo", () => {
		it("ranges become invalid when undo changes editor content", () => {
			// Simulate dictating text
			tracker.trackInsertAtCursor(editor, "Eerste tekst. ");
			expect(editor.getValue()).toContain("Eerste tekst.");
			expect(tracker.hasRanges()).toBe(true);

			// Simulate undo — editor content changes but tracker doesn't know
			// In real Obsidian, undo would revert the editor state.
			// Here we simulate by manually clearing the editor.
			const cursor = editor.getCursor();
			editor.replaceRange("", { line: 0, ch: 0 }, cursor);
			editor.setCursor({ line: 0, ch: 0 });

			// Tracker still thinks it has valid ranges
			expect(tracker.hasRanges()).toBe(true);

			// Adding more text should still work without crashing
			tracker.trackInsertAtCursor(editor, "Na undo. ");
			expect(editor.getValue()).toContain("Na undo.");
		});
	});

	describe("3b: Cursor jump during active dual-delay session", () => {
		it("commits slow text when cursor jumps mid-reconciliation", async () => {
			const settings = createSettings({ dualDelay: true });
			const callbacks = createCallbacks(editor);
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getDualTranscriberCallbacks();

			// Build up some text
			tc.fast.onDelta("Eerste deel tekst");
			tc.slow.onDelta("Eerste deel");

			// User clicks at beginning of document
			editor.setCursor({ line: 0, ch: 0 });

			// Next delta triggers cursor movement detection
			tc.fast.onDelta("Eerste deel tekst meer");

			// Slow text should have been committed at old position
			const text = editor.getValue();
			expect(text).toContain("Eerste deel");
		});
	});

	describe("3c: Template insertion bypasses tracker", () => {
		it("template text is not tracked for auto-correct", () => {
			// Set up a pre-match hook that always matches (simulating template)
			setPreMatchHook((hookEditor, _normalized, _raw) => {
				const cursor = hookEditor.getCursor();
				hookEditor.replaceRange("\n# Template Content\n", cursor);
				const newPos = { line: cursor.line + 2, ch: 0 };
				hookEditor.setCursor(newPos);
				return true;
			});

			// Process text that triggers the template hook
			tracker.trackProcessText(editor, "sjabloon test");

			// Template content should be in editor
			expect(editor.getValue()).toContain("Template Content");

			// BUT the tracker should have a range for the cursor delta
			// (processText inserts via the hook, which moves cursor)
			// The key insight: template insertion happens inside processText,
			// so the tracker records the offset change, but doesn't know
			// the content came from a template vs dictation

			// Clean up
			setPreMatchHook(null);
		});
	});
});

// ── STORY 4: Slot system interactions ──

describe("Story 4: Slot system interactions", () => {
	let editor: Editor;
	let tracker: DictationTracker;
	let callbacks: SessionCallbacks;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		transcriberInstances.length = 0;
		setLanguage("nl");
		cancelSlot();
		editor = createMockEditor("");
		tracker = new DictationTracker();
		callbacks = createCallbacks(editor);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("4a: Double close — voice command + keyboard escape", () => {
		it("second closeSlot is a no-op when slot already closed", async () => {
			const settings = createSettings({ dualDelay: true });
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getDualTranscriberCallbacks();

			// Open a bold slot
			tc.slow.onDelta("vet openen");
			vi.advanceTimersByTime(400);
			expect(isSlotActive()).toBe(true);

			// Type some text in the slot
			tc.fast.onDelta("belangrijk");

			// Voice close
			tc.slow.onDelta("vet sluiten");
			vi.advanceTimersByTime(400);
			expect(isSlotActive()).toBe(false);

			// Keyboard Escape comes right after (race condition) — should not crash
			cancelSlot(); // simulates Escape handler
			expect(isSlotActive()).toBe(false);
		});
	});

	describe("4b: RealtimeSession slot behavior", () => {
		it("flushAfterSlot flushes pending text in realtime mode", async () => {
			const settings = createSettings();
			const session = new RealtimeSession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getRealtimeTranscriberCallbacks();

			// Accumulate text without sentence end
			tc.onDelta("tekst in slot");

			// Flush after slot close
			session.flushAfterSlot(editor);

			// Text should be inserted
			expect(editor.getValue()).toContain("tekst in slot");
		});

		it("flushAfterSlot is a no-op when no pending text", async () => {
			const settings = createSettings();
			const session = new RealtimeSession(settings, tracker, callbacks);
			await session.start(editor);

			// Nothing pending
			expect(() => session.flushAfterSlot(editor)).not.toThrow();
			expect(editor.getValue()).toBe("");
		});
	});

	describe("4c: Slot state persists across editor changes", () => {
		it("slot remains active when a different editor is returned by getEditor", async () => {
			const settings = createSettings({ dualDelay: true });
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getDualTranscriberCallbacks();

			// Open a bold slot
			tc.slow.onDelta("vet openen");
			vi.advanceTimersByTime(400);
			expect(isSlotActive()).toBe(true);

			// activeSlot is a global — it doesn't track which editor it belongs to
			// Creating a "new" editor doesn't clear it
			const editor2 = createMockEditor("Ander document");
			expect(isSlotActive()).toBe(true);

			// Cancelling from any context clears it
			cancelSlot();
			expect(isSlotActive()).toBe(false);

			// Suppress unused var warning
			void editor2;
		});
	});
});

// ── STORY 5: Voice command conflicts ──

describe("Story 5: Voice command conflicts", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		transcriberInstances.length = 0;
		setLanguage("nl");
		cancelSlot();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("5a: Custom command overlaps built-in", () => {
		it("custom command 'nieuw' does not hijack 'nieuwe alinea'", () => {
			const editor = createMockEditor("");

			// Load a custom command with trigger "nieuw"
			loadCustomCommands([{
				id: "custom-new",
				type: "insert",
				insertText: "[CUSTOM]",
				triggers: { nl: ["nieuw"] },
			}]);
			loadCustomCommandTriggers([{
				id: "custom-new",
				type: "insert",
				insertText: "[CUSTOM]",
				triggers: { nl: ["nieuw"] },
			}]);

			const tracker = new DictationTracker();

			// Process "nieuwe alinea" — should match built-in newParagraph, not custom "nieuw"
			tracker.trackProcessText(editor, "nieuwe alinea");

			const text = editor.getValue();
			// Built-in should win: new paragraph
			expect(text).toContain("\n\n");
			expect(text).not.toContain("[CUSTOM]");

			// Clean up
			loadCustomCommands([]);
			loadCustomCommandTriggers([]);
		});

		it("exact custom trigger matches when standalone", () => {
			const editor = createMockEditor("");

			loadCustomCommands([{
				id: "custom-new",
				type: "insert",
				insertText: "[CUSTOM]",
				triggers: { nl: ["nieuw"] },
			}]);
			loadCustomCommandTriggers([{
				id: "custom-new",
				type: "insert",
				insertText: "[CUSTOM]",
				triggers: { nl: ["nieuw"] },
			}]);

			const tracker = new DictationTracker();

			// Process just "nieuw" — should match the custom command
			tracker.trackProcessText(editor, "nieuw");

			expect(editor.getValue()).toContain("[CUSTOM]");

			loadCustomCommands([]);
			loadCustomCommandTriggers([]);
		});
	});

	describe("5b: Language change mid-session", () => {
		it("commands match in new language after setLanguage", async () => {
			const editor = createMockEditor("");
			const tracker = new DictationTracker();
			const callbacks = createCallbacks(editor);
			const settings = createSettings({ dualDelay: true });
			const session = new DualDelaySession(settings, tracker, callbacks);
			await session.start(editor);
			const tc = getDualTranscriberCallbacks();

			// Start with Dutch
			setLanguage("nl");
			tc.slow.onDelta("nieuwe alinea");
			vi.advanceTimersByTime(400);

			const textNl = editor.getValue();
			expect(textNl).toContain("\n\n");

			// Switch to English mid-session
			setLanguage("en");

			// English command should now work
			tc.slow.onDelta("new paragraph");
			vi.advanceTimersByTime(400);

			const textEn = editor.getValue();
			// Should contain two paragraph breaks total
			const paragraphs = (textEn.match(/\n\n/g) || []).length;
			expect(paragraphs).toBeGreaterThanOrEqual(2);
		});

		it("old language commands no longer match after language switch", () => {
			const editor = createMockEditor("");
			const tracker = new DictationTracker();

			setLanguage("en");

			// Dutch command should not match in English mode
			// (unless it happens to fuzzy-match something)
			tracker.trackProcessText(editor, "nieuwe alinea.");

			const text = editor.getValue();
			// In English mode, "nieuwe alinea" is not a command — it's just text
			// The text should appear as-is (inserted, not executed as command)
			expect(text).toContain("nieuwe alinea");
		});
	});

	describe("5c: Template name conflicts with built-in command", () => {
		it("pre-match hook (template) takes priority over built-in command", () => {
			const editor = createMockEditor("");
			const tracker = new DictationTracker();

			// Set up a pre-match hook that matches "nieuwe alinea"
			// (simulating a template named "nieuwe alinea")
			setPreMatchHook((_hookEditor, normalized) => {
				if (normalized.includes("nieuwe alinea")) {
					const cursor = _hookEditor.getCursor();
					_hookEditor.replaceRange("[TEMPLATE]", cursor);
					_hookEditor.setCursor({
						line: cursor.line,
						ch: cursor.ch + "[TEMPLATE]".length,
					});
					return true; // handled
				}
				return false;
			});

			tracker.trackProcessText(editor, "nieuwe alinea");

			// Template should have won over the built-in command
			expect(editor.getValue()).toContain("[TEMPLATE]");
			expect(editor.getValue()).not.toContain("\n\n");

			setPreMatchHook(null);
		});
	});
});

// ── STORY 6: Hallucination / edge cases with silence ──

describe("Story 6: Hallucination edge cases with silence", () => {
	describe("6a: Zero-duration audio", () => {
		it("flags text with 0-second duration (infinite words/sec)", () => {
			const text = Array(25).fill("word").join(" ");
			expect(isLikelyHallucination(text, 0)).toBe(true);
		});

		it("does not flag short text with 0-second duration", () => {
			// Only 5 words — below the >20 threshold
			expect(isLikelyHallucination("hello world foo bar baz", 0)).toBe(false);
		});

		it("does not flag empty text with 0-second duration", () => {
			expect(isLikelyHallucination("", 0)).toBe(false);
		});

		it("does not flag whitespace-only with 0-second duration", () => {
			expect(isLikelyHallucination("   \n  \t  ", 0)).toBe(false);
		});
	});

	describe("6b: Silence-only audio", () => {
		it("does not flag very few words in long audio (normal slow speech)", () => {
			// 3 words in 30 seconds = 0.1 w/s — totally fine
			expect(isLikelyHallucination("Ja hoor goed", 30)).toBe(false);
		});

		it("flags typical silence hallucination patterns", () => {
			// Whisper/Voxtral tends to generate repeated "Thank you" or
			// music descriptions when it only hears silence
			const repeated = "Dank je wel. Dank je wel. Dank je wel. Dank je wel. Dank je wel. Dank je wel.";
			expect(isLikelyHallucination(repeated, 3)).toBe(true);
		});

		it("flags horizontal rule repetition from silence", () => {
			const blocks = "Stilte.\n---\nStilte.\n---\nStilte.";
			expect(isLikelyHallucination(blocks, 5)).toBe(true);
		});

		it("does not flag legitimate repeated words below threshold", () => {
			// Only 2 repetitions among few sentences — should pass
			const text = "Ja. Ja. Nee. Misschien.";
			expect(isLikelyHallucination(text, 10)).toBe(false);
		});

		it("handles negative duration same as zero (fallback to word count)", () => {
			// When audioDurationSec <= 0, the function uses wordsPerSec = words
			// So 25 words → wordsPerSec = 25 > 5, and words > 20 → flagged
			const text = Array(25).fill("word").join(" ");
			expect(isLikelyHallucination(text, -1)).toBe(true);
		});

		it("does not flag short text with negative duration", () => {
			// 5 words with negative duration: wordsPerSec = 5, not > 5
			expect(isLikelyHallucination("een twee drie vier vijf", -1)).toBe(false);
		});

		it("handles very small positive duration (near-zero)", () => {
			const text = Array(25).fill("word").join(" ");
			// 25 words in 0.001 seconds = 25000 w/s — definitely flagged
			expect(isLikelyHallucination(text, 0.001)).toBe(true);
		});
	});
});
