// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe
import { Editor, Notice } from "obsidian";
import { RealtimeTranscriber } from "./mistral-api";
import {
	matchCommand,
	isSlotActive,
} from "./voice-commands";
import { VoxtralSettings } from "./types";
import { DictationTracker } from "./dictation-tracker";
import { vlog } from "./plugin-logger";
import type { SessionCallbacks } from "./realtime-session";

/**
 * Dual-delay realtime transcription session.
 *
 * ## Architecture
 *
 * Two parallel WebSocket streams receive the same PCM audio:
 *
 * ```
 *  Microphone ──► AudioRecorder ──► PCM chunks
 *                                       │
 *                       ┌───────────────┼───────────────┐
 *                       ▼                               ▼
 *               Fast stream                      Slow stream
 *            (low delay, e.g. 240ms)          (high delay, e.g. 2400ms)
 *                       │                               │
 *                       ▼                               ▼
 *              Immediate preview              Accurate transcription
 *              (may contain errors)          + voice command detection
 *                       │                               │
 *                       └───────────┬───────────────────┘
 *                                   ▼
 *                            Reconciliation
 *                                   │
 *                                   ▼
 *                            Editor display
 * ```
 *
 * ## Reconciliation algorithm
 *
 * The editor displays a single range of text starting at `insertOffset`:
 *
 *   displayText = slowText + fastText.substring(slowText.length)
 *
 * In other words: slow text is the source of truth; fast text only shows
 * the portion that extends BEYOND what slow has confirmed so far.
 *
 * When slow catches up (slowText grows), its text automatically replaces
 * the fast preview — no explicit "swap" is needed because the display
 * formula always prefers slow.
 *
 * ## Voice command flow
 *
 * Commands are ONLY detected in the slow stream (more accurate):
 *
 * 1. Slow delta arrives → `slowText` grows
 * 2. `processSlowCommands()` scans for complete sentences
 * 3. Each sentence is checked via `matchCommand()`
 * 4. If command found: clear display range, execute action, commit
 * 5. If no command: insert text permanently via `tracker.trackInsertAtCursor()`
 * 6. Remainder (incomplete sentence) stays in `slowText` for next delta
 *
 * ## State machine
 *
 * ```
 *  ┌─────────┐   start()    ┌────────────┐
 *  │  idle   │─────────────►│ connecting │
 *  └─────────┘              └─────┬──────┘
 *                                 │ both WS connected
 *                                 ▼
 *                          ┌────────────┐   stream ends    ┌──────────────┐
 *                          │  streaming │─────────────────►│ reconnecting │
 *                          └──────┬─────┘                  └──────┬───────┘
 *                                 │                               │ success
 *                                 │                               ▼
 *                                 │                        ┌────────────┐
 *                                 │                        │  streaming │
 *                                 │                        └────────────┘
 *                                 │ stop()
 *                                 ▼
 *                          ┌────────────┐
 *                          │ finalizing │ (flush remaining text)
 *                          └──────┬─────┘
 *                                 │
 *                                 ▼
 *                          ┌─────────┐
 *                          │  idle   │
 *                          └─────────┘
 * ```
 *
 * ## Edge cases
 *
 * - **Slow stream disconnects**: Flush confirmed text at current position,
 *   reset accumulators, reconnect. Fast stream continues providing preview.
 * - **Fast stream disconnects**: Reconnect silently. Display falls back to
 *   slow-only until fast catches up.
 * - **Streams drift apart**: Fast is always ahead of slow (lower delay).
 *   The display formula handles this naturally: fast shows the preview,
 *   slow replaces it when ready.
 * - **User moves cursor**: Detected in `renderText()`. Confirmed slow text
 *   is committed at the old position, accumulators reset, new text starts
 *   at the cursor's new location.
 * - **Command followed by trailing punctuation**: The API may send "." after
 *   a command was already executed. `commandJustRan` flag causes this
 *   trailing punctuation to be silently discarded.
 * - **Both streams fail repeatedly**: After `maxConsecutiveFailures` (5)
 *   reconnect attempts, recording is stopped with a user notice.
 */

/** Session state for debug logging. */
const enum SessionState {
	Idle = "idle",
	Connecting = "connecting",
	Streaming = "streaming",
	Reconnecting = "reconnecting",
	Finalizing = "finalizing",
}
export class DualDelaySession {
	private fastTranscriber: RealtimeTranscriber | null = null;
	private slowTranscriber: RealtimeTranscriber | null = null;

	// Session state
	private state: SessionState = SessionState.Idle;

	// Text accumulators
	private fastText = "";
	private slowText = "";
	private fastPrevRaw = "";
	private slowPrevRaw = "";
	private slowTurnDelta = 0;

	// Editor state
	private insertOffset = 0;
	private displayLen = 0;
	private slowCommitted = 0;
	private commandJustRan = false;

	// Reconnection
	private consecutiveFailures = 0;
	private maxConsecutiveFailures = 5;

	constructor(
		private settings: VoxtralSettings,
		private tracker: DictationTracker,
		private callbacks: SessionCallbacks,
	) {}

	/** Transition to a new state with debug logging. */
	private setState(newState: SessionState): void {
		const prev = this.state;
		this.state = newState;
		vlog.debug(`Voxtral: DualDelay state: ${prev} → ${newState}`);
	}

	/** Connect both WebSocket streams and initialize state. */
	async start(editor: Editor): Promise<void> {
		this.setState(SessionState.Connecting);
		this.fastText = "";
		this.slowText = "";
		this.insertOffset = editor.posToOffset(editor.getCursor());
		this.displayLen = 0;
		this.slowCommitted = 0;
		this.slowTurnDelta = 0;
		this.fastPrevRaw = "";
		this.slowPrevRaw = "";
		this.commandJustRan = false;
		this.consecutiveFailures = 0;

		await this.connectWebSockets(editor);
		this.setState(SessionState.Streaming);
	}

	/** Update insert offset after a slot closes so subsequent text
	 *  continues at the correct cursor position. */
	flushAfterSlot(editor: Editor): void {
		this.insertOffset = editor.posToOffset(editor.getCursor());
	}

	/** Send PCM audio data to both transcribers. */
	sendAudio(pcmData: ArrayBuffer): void {
		this.fastTranscriber?.sendAudio(pcmData);
		this.slowTranscriber?.sendAudio(pcmData);
	}

	/** Finalize the session: flush remaining text and close streams. */
	async stop(): Promise<void> {
		this.setState(SessionState.Finalizing);
		this.fastTranscriber?.endAudio();
		this.slowTranscriber?.endAudio();

		await new Promise((resolve) => setTimeout(resolve, 1000));

		const editor = this.callbacks.getEditor();
		if (editor) {
			// Process any remaining slow commands
			this.processSlowCommands(editor);

			// Finalize: replace with slow text (most accurate)
			const finalText = this.slowText || this.fastText;
			if (finalText) {
				const from = editor.offsetToPos(this.insertOffset);
				const to = editor.offsetToPos(
					this.insertOffset + this.displayLen,
				);
				editor.replaceRange(finalText, from, to);
				const endOffset = this.insertOffset + finalText.length;
				editor.setCursor(editor.offsetToPos(endOffset));

				// Track the final range for auto-correct
				this.tracker.addRange(
					this.insertOffset,
					this.insertOffset + finalText.length,
				);
			}
		}

		this.fastTranscriber?.close();
		this.slowTranscriber?.close();
		this.fastTranscriber = null;
		this.slowTranscriber = null;

		// Reset state
		this.fastText = "";
		this.slowText = "";
		this.displayLen = 0;
		this.slowCommitted = 0;
		this.slowTurnDelta = 0;
		this.setState(SessionState.Idle);
	}

	// ── WebSocket lifecycle ──

	private async connectWebSockets(editor: Editor): Promise<void> {
		const fastDelay = this.settings.dualDelayFastMs;
		const slowDelay = this.settings.dualDelaySlowMs;

		// Fast stream — immediate text feedback
		this.fastTranscriber = new RealtimeTranscriber(
			this.settings,
			{
				onSessionCreated: () => {
					vlog.debug(
						"Voxtral: Fast stream session created",
					);
				},
				onDelta: (text) => {
					this.handleFastDelta(text);
					this.renderText(editor);
				},
				onDone: () => {
					this.renderText(editor);
				},
				onError: (message) => {
					vlog.error(
						"Voxtral: Fast stream error:",
						message,
					);
				},
				onDisconnect: () => {
					void this.handleStreamDisconnect("fast");
				},
			},
			fastDelay,
		);

		// Slow stream — accurate text + voice commands
		this.slowTranscriber = new RealtimeTranscriber(
			this.settings,
			{
				onSessionCreated: () => {
					vlog.debug(
						"Voxtral: Slow stream session created",
					);
				},
				onDelta: (text) => {
					this.handleSlowDelta(text);
					this.renderText(editor);
					this.processSlowCommands(editor);
				},
				onDone: () => {
					this.renderText(editor);
					this.processSlowCommands(editor);
				},
				onError: (message) => {
					vlog.error(
						"Voxtral: Slow stream error:",
						message,
					);
				},
				onDisconnect: () => {
					void this.handleStreamDisconnect("slow");
				},
			},
			slowDelay,
		);

		await Promise.all([
			this.fastTranscriber.connect(),
			this.slowTranscriber.connect(),
		]);
	}

	private async handleStreamDisconnect(
		stream: "fast" | "slow",
	): Promise<void> {
		if (!this.callbacks.isRecording()) return;

		const editor = this.callbacks.getEditor();
		if (!editor) {
			this.callbacks.stopRecording();
			return;
		}

		this.setState(SessionState.Reconnecting);
		vlog.debug(
			`Voxtral: ${stream} stream ended, reconnecting...`,
		);

		try {
			if (stream === "fast") {
				await this.reconnectFastStream(editor);
			} else {
				await this.reconnectSlowStream(editor);
			}
			this.consecutiveFailures = 0;
			this.setState(SessionState.Streaming);
		} catch (e) {
			this.consecutiveFailures++;
			vlog.error(
				`Voxtral: ${stream} stream reconnect failed (${this.consecutiveFailures})`,
				e,
			);
			if (
				this.consecutiveFailures >=
				this.maxConsecutiveFailures
			) {
				new Notice(
					"Cannot reconnect. Recording stopped.",
					6000,
				);
				this.callbacks.stopRecording();
				return;
			}
			const delay = Math.min(
				500 * this.consecutiveFailures,
				3000,
			);
			await new Promise((resolve) =>
				setTimeout(resolve, delay),
			);
			if (this.callbacks.isRecording()) {
				void this.handleStreamDisconnect(stream);
			}
		}
	}

	private async reconnectFastStream(editor: Editor): Promise<void> {
		const fastDelay = this.settings.dualDelayFastMs;
		this.fastTranscriber = new RealtimeTranscriber(
			this.settings,
			{
				onSessionCreated: () =>
					vlog.debug(
						"Voxtral: Fast stream reconnected",
					),
				onDelta: (text) => {
					this.fastText += text;
					this.renderText(editor);
				},
				onDone: () => this.renderText(editor),
				onError: (message) =>
					vlog.error(
						"Voxtral: Fast stream error:",
						message,
					),
				onDisconnect: () =>
					void this.handleStreamDisconnect("fast"),
			},
			fastDelay,
		);
		await this.fastTranscriber.connect();
	}

	private async reconnectSlowStream(editor: Editor): Promise<void> {
		// Flush any remaining text from the previous turn as committed text
		// (the utterance ended, so no more text will complete the sentence)
		if (this.slowText.trim()) {
			const from = editor.offsetToPos(this.insertOffset);
			const to = editor.offsetToPos(
				this.insertOffset + this.displayLen,
			);
			editor.replaceRange("", from, to);
			editor.setCursor(from);
			this.displayLen = 0;
			this.tracker.trackInsertAtCursor(editor, this.slowText);
			this.insertOffset = editor.posToOffset(
				editor.getCursor(),
			);
		}
		// Reset counters for new turn
		this.slowCommitted = 0;
		this.slowText = "";
		this.fastText = "";
		this.slowTurnDelta = 0;
		this.slowPrevRaw = "";
		this.fastPrevRaw = "";

		const slowDelay = this.settings.dualDelaySlowMs;
		this.slowTranscriber = new RealtimeTranscriber(
			this.settings,
			{
				onSessionCreated: () =>
					vlog.debug(
						"Voxtral: Slow stream reconnected",
					),
				onDelta: (text) => {
					this.handleSlowDelta(text);
					this.renderText(editor);
					this.processSlowCommands(editor);
				},
				onDone: () => {
					this.renderText(editor);
					this.processSlowCommands(editor);
				},
				onError: (message) =>
					vlog.error(
						"Voxtral: Slow stream error:",
						message,
					),
				onDisconnect: () =>
					void this.handleStreamDisconnect("slow"),
			},
			slowDelay,
		);
		await this.slowTranscriber.connect();
	}

	// ── Delta handlers ──

	private handleFastDelta(text: string): void {
		const isCumulative =
			this.fastPrevRaw && text.startsWith(this.fastPrevRaw);
		let newPart = isCumulative
			? text.substring(this.fastPrevRaw.length)
			: text;
		this.fastPrevRaw = isCumulative
			? text
			: this.fastPrevRaw + text;

		if (!newPart) return;

		// Strip leading whitespace from first text after a slot opens
		// (prevents "** text" which breaks markdown formatting)
		if (isSlotActive() && this.fastText === "") {
			newPart = newPart.replace(/^\s+/, "");
			if (!newPart) return;
		}

		this.fastText += newPart;
	}

	private handleSlowDelta(text: string): void {
		const isCumulative =
			this.slowPrevRaw && text.startsWith(this.slowPrevRaw);
		let newPart = isCumulative
			? text.substring(this.slowPrevRaw.length)
			: text;
		this.slowPrevRaw = isCumulative
			? text
			: this.slowPrevRaw + text;

		if (!newPart) return;

		// Strip leading whitespace from first text after a slot opens
		if (isSlotActive() && this.slowText === "") {
			newPart = newPart.replace(/^\s+/, "");
			if (!newPart) return;
		}

		this.slowText += newPart;
		this.slowTurnDelta += newPart.length;
	}

	// ── Editor rendering ──

	/**
	 * Update the editor with the current dual-delay text.
	 * Shows slow (confirmed) text + any fast text beyond slow.
	 */
	private renderText(editor: Editor): void {
		// Detect if user has manually repositioned cursor (e.g. pressed Enter,
		// clicked elsewhere).  When this happens, commit the confirmed slow
		// text at the old position and start fresh at the new cursor location.
		const cursorOffset = editor.posToOffset(editor.getCursor());
		const expectedEnd = this.insertOffset + this.displayLen;

		if (cursorOffset !== expectedEnd) {
			if (this.displayLen > 0) {
				// Commit only the confirmed (slow) text at the old position
				const slowText = this.slowText;
				const from = editor.offsetToPos(this.insertOffset);
				const to = editor.offsetToPos(expectedEnd);
				editor.replaceRange(slowText, from, to);

				// The replacement may have shifted offsets — adjust cursor
				const shift = slowText.length - this.displayLen;
				const newCursor =
					cursorOffset >= expectedEnd
						? cursorOffset + shift
						: cursorOffset;
				editor.setCursor(editor.offsetToPos(newCursor));

				// Reset accumulators — committed text is now permanent
				this.slowCommitted += slowText.length;
				this.slowText = "";
				this.fastText = "";
				this.displayLen = 0;
				this.insertOffset = newCursor;
				return;
			}
			// No displayed text yet — just update insert offset
			this.insertOffset = cursorOffset;
		}

		const slowLen = this.slowText.length;
		const fastLen = this.fastText.length;

		let displayText: string;
		if (fastLen > slowLen) {
			displayText =
				this.slowText + this.fastText.substring(slowLen);
		} else {
			displayText = this.slowText;
		}

		// Replace the current dual-delay range in the editor
		const from = editor.offsetToPos(this.insertOffset);
		const to = editor.offsetToPos(
			this.insertOffset + this.displayLen,
		);

		// Strip leading whitespace when the display region is empty —
		// the API often prepends a space for word separation, but at
		// the start of a new sentence (after the previous one was
		// committed) this would cause an unwanted leading space.
		if (this.displayLen === 0) {
			displayText = displayText.replace(/^\s+/, "");
		}

		editor.replaceRange(displayText, from, to);
		this.displayLen = displayText.length;

		// Move cursor to end
		const endOffset = this.insertOffset + this.displayLen;
		editor.setCursor(editor.offsetToPos(endOffset));
	}

	// ── Voice command processing ──

	/**
	 * Process voice commands from the slow stream (more accurate).
	 * Checks completed sentences in slowText for voice commands.
	 */
	private processSlowCommands(editor: Editor): void {
		if (!this.slowText) return;

		// Discard orphaned punctuation/whitespace that trails a previously
		// executed command.  This happens when the API sends a cumulative
		// delta that appends just "." after the command text was already
		// consumed and executed (e.g. "Nieuwe alinea" → "Nieuwe alinea.").
		if (
			this.commandJustRan &&
			/^[\s.!?,;:]*$/.test(this.slowText)
		) {
			this.commandJustRan = false;
			if (this.displayLen > 0) {
				const from = editor.offsetToPos(this.insertOffset);
				const to = editor.offsetToPos(
					this.insertOffset + this.displayLen,
				);
				editor.replaceRange("", from, to);
				editor.setCursor(from);
				this.displayLen = 0;
			}
			this.slowCommitted += this.slowText.length;
			this.slowText = "";
			this.fastText = "";
			this.insertOffset = editor.posToOffset(
				editor.getCursor(),
			);
			return;
		}
		this.commandJustRan = false;

		const segments = this.slowText.match(
			/[^.!?]+[.!?]+\s*/g,
		);

		// Also check the remainder (text without sentence-ending punctuation)
		// for standalone voice commands like "wikilink", "vet", etc.
		const segmentText = segments ? segments.join("") : "";
		const remainder = this.slowText.substring(segmentText.length);

		// If there are no complete sentences, check if the entire text
		// is a standalone voice command (no surrounding text needed).
		if (!segments && remainder.trim()) {
			const cmdMatch = matchCommand(remainder.trim());
			if (cmdMatch && !cmdMatch.textBefore) {
				// Pure command without text before — execute it
				const from = editor.offsetToPos(this.insertOffset);
				const to = editor.offsetToPos(
					this.insertOffset + this.displayLen,
				);
				editor.replaceRange("", from, to);
				editor.setCursor(from);
				this.displayLen = 0;

				cmdMatch.command.action(editor);
				if (cmdMatch.command.id === "stopRecording") {
					setTimeout(
						() => this.callbacks.stopRecording(),
						0,
					);
				}
				if (isSlotActive()) {
					this.callbacks.updateStatusBar("slot");
				}

				this.commandJustRan = true;
				this.slowCommitted += this.slowText.length;
				this.slowText = "";
				this.fastText = "";
				this.insertOffset = editor.posToOffset(
					editor.getCursor(),
				);
				return;
			}
			// Not a command — leave it for later (more text may come)
			return;
		}

		if (!segments) return;

		const matchedLength = segmentText.length;

		// Always flush completed sentences — even without commands.
		// This keeps accumulators small (preventing performance degradation)
		// and ensures confirmed text is permanently committed.

		// Clear the dual-delay text from editor first
		const from = editor.offsetToPos(this.insertOffset);
		const to = editor.offsetToPos(
			this.insertOffset + this.displayLen,
		);
		editor.replaceRange("", from, to);
		editor.setCursor(from);
		this.displayLen = 0;

		// Process each segment: insert text or execute command
		for (const segment of segments) {
			const match = matchCommand(segment);
			if (match) {
				if (match.textBefore) {
					let before = match.textBefore;
					if (match.command.punctuation) {
						before = before.replace(
							/[,;.!?]+\s*$/,
							"",
						);
					}
					this.tracker.trackInsertAtCursor(
						editor,
						before,
					);
				}
				match.command.action(editor);
				this.commandJustRan = true;

				if (match.command.id === "stopRecording") {
					setTimeout(
						() => this.callbacks.stopRecording(),
						0,
					);
				}
				if (isSlotActive()) {
					this.callbacks.updateStatusBar("slot");
				}
			} else {
				this.tracker.trackInsertAtCursor(editor, segment);
			}
		}

		// Trim accumulators: remove processed portion, keep remainder
		this.slowCommitted += matchedLength;
		this.slowText = remainder;
		// Reset fast text — the two streams produce different text so we
		// cannot byte-align them.  The fast stream will continue sending
		// deltas for upcoming audio to rebuild the preview.
		this.fastText = "";

		// Update insert offset and display length for remaining text
		this.insertOffset = editor.posToOffset(editor.getCursor());
		this.displayLen = 0;

		// Re-render remaining text
		if (this.slowText || this.fastText) {
			this.renderText(editor);
		}
	}
}
