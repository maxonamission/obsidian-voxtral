// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe
import { Editor, Notice } from "obsidian";
import { RealtimeTranscriber } from "./mistral-api";
import {
	normalizeCommand,
	isSlotActive,
} from "./voice-commands";
import { VoxtralSettings } from "./types";
import { DictationTracker } from "./dictation-tracker";
import { vlog } from "./plugin-logger";

/** Callbacks from the session back to the plugin orchestrator. */
export interface SessionCallbacks {
	updateStatusBar(state: "recording" | "slot"): void;
	stopRecording(): void;
	isRecording(): boolean;
	getEditor(): Editor | null;
}

/**
 * Manages a single-stream realtime transcription session.
 * Handles WebSocket connection, text delta processing,
 * disconnect/reconnect, and slot buffering.
 */
export class RealtimeSession {
	private transcriber: RealtimeTranscriber | null = null;
	private pendingText = "";
	private prevRaw = "";
	private turnDelta = 0;
	private turnProcessed = 0;
	private slotBuffer = "";
	private consecutiveFailures = 0;
	private maxConsecutiveFailures = 5;

	constructor(
		private settings: VoxtralSettings,
		private tracker: DictationTracker,
		private callbacks: SessionCallbacks,
	) {}

	/** Connect the WebSocket and start receiving transcription. */
	async start(editor: Editor): Promise<void> {
		this.pendingText = "";
		this.prevRaw = "";
		this.turnDelta = 0;
		this.turnProcessed = 0;
		this.slotBuffer = "";
		this.consecutiveFailures = 0;

		await this.connectWebSocket(editor);
	}

	/** Send PCM audio data to the transcriber. */
	sendAudio(pcmData: ArrayBuffer): void {
		this.transcriber?.sendAudio(pcmData);
	}

	/** Signal end of audio and finalize any pending text. */
	async stop(editor: Editor): Promise<void> {
		this.transcriber?.endAudio();

		await new Promise((resolve) => setTimeout(resolve, 1000));

		if (this.pendingText.trim()) {
			this.tracker.trackProcessText(
				editor,
				this.pendingText.trim(),
				() => this.callbacks.updateStatusBar("slot"),
			);
			this.pendingText = "";
		}

		this.transcriber?.close();
		this.transcriber = null;
	}

	/** Flush buffered transcription text after a slot closes. */
	flushSlotBuffer(editor: Editor): void {
		// Atomically capture and clear the buffer so any delta arriving
		// between closeSlot() and this flush goes to pendingText instead
		// of being double-processed.
		const buffered = this.slotBuffer;
		this.slotBuffer = "";

		if (buffered.trim()) {
			this.pendingText += buffered;
			if (this.pendingText.trim()) {
				this.tracker.trackProcessText(
					editor,
					this.pendingText.trim() + " ",
					() => this.callbacks.updateStatusBar("slot"),
				);
				this.pendingText = "";
			}
		}
	}

	// ── WebSocket lifecycle ──

	private async connectWebSocket(editor: Editor): Promise<void> {
		this.transcriber = new RealtimeTranscriber(this.settings, {
			onSessionCreated: () => {
				vlog.debug("Voxtral: Realtime session created");
			},
			onDelta: (text) => {
				this.handleDelta(editor, text);
			},
			onDone: (text) => {
				this.handleDone(editor, text);
			},
			onError: (message) => {
				vlog.error("Voxtral: Realtime error:", message);
				new Notice(`Streaming error: ${message}`);
			},
			onDisconnect: () => {
				void this.handleDisconnect();
			},
		});

		await this.transcriber.connect();
	}

	/**
	 * Handle WebSocket closure during recording.
	 *
	 * The Mistral realtime API closes the connection after each
	 * transcription.done event (end of utterance / silence detected).
	 * This is NORMAL — not an error. We silently reconnect so the
	 * user can keep talking without interruption.
	 *
	 * Only shows a warning if reconnection fails repeatedly.
	 */
	private async handleDisconnect(): Promise<void> {
		if (!this.callbacks.isRecording()) return;

		const editor = this.callbacks.getEditor();
		if (!editor) {
			this.callbacks.stopRecording();
			return;
		}

		// Silent, immediate reconnect — this is expected API behavior
		vlog.debug("Voxtral: Session ended, reconnecting silently...");

		// Reset turn counters for the new connection
		this.prevRaw = "";
		this.turnDelta = 0;
		this.turnProcessed = 0;

		try {
			await this.connectWebSocket(editor);
			this.consecutiveFailures = 0;
			vlog.debug("Voxtral: Session reconnected");
		} catch (e) {
			this.consecutiveFailures++;
			console.error(
				`Voxtral: Reconnect failed (${this.consecutiveFailures}/${this.maxConsecutiveFailures})`,
				e,
			);

			if (
				this.consecutiveFailures >= this.maxConsecutiveFailures
			) {
				new Notice(
					"Cannot connect to the API. Recording stopped.",
					6000,
				);
				this.callbacks.stopRecording();
				return;
			}

			// Brief delay before retry, only on actual failures
			const delay = Math.min(
				500 * this.consecutiveFailures,
				3000,
			);
			await new Promise((resolve) =>
				setTimeout(resolve, delay),
			);

			if (this.callbacks.isRecording()) {
				void this.handleDisconnect();
			}
		}
	}

	// ── Delta / Done text processing ──

	private handleDelta(editor: Editor, text: string): void {
		// Handle both cumulative and incremental deltas from the API
		const isCumulative =
			this.prevRaw && text.startsWith(this.prevRaw);
		const newText = isCumulative
			? text.substring(this.prevRaw.length)
			: text;
		this.prevRaw = isCumulative ? text : this.prevRaw + text;

		if (!newText) return;

		// While a slot is active, buffer incoming transcription
		if (isSlotActive()) {
			this.slotBuffer += newText;
			this.turnDelta += newText.length;
			return;
		}

		this.pendingText += newText;
		this.turnDelta += newText.length;

		// Flush on sentence-ending punctuation OR after accumulating enough text
		const sentenceEnd = /[.!?]\s*$/;
		const longEnough = this.pendingText.length > 120;

		if (sentenceEnd.test(this.pendingText) || longEnough) {
			const sentence = this.pendingText.trim();
			this.turnProcessed += this.pendingText.length;
			this.pendingText = "";

			const normalized = normalizeCommand(sentence);
			const stopPatterns = [
				"beeindig opname",
				"beeindig de opname",
				"beeindigt opname",
				"beeindigt de opname",
				"beeindigde opname",
				"beeindigde de opname",
				"stop opname",
				"stopopname",
				"stop de opname",
				"stop recording",
			];
			if (stopPatterns.some((p) => normalized.includes(p))) {
				this.callbacks.stopRecording();
				return;
			}

			this.tracker.trackProcessText(
				editor,
				sentence + " ",
				() => this.callbacks.updateStatusBar("slot"),
			);
		}
	}

	private handleDone(editor: Editor, doneText: string): void {
		// While a slot is active, buffer incoming transcription
		if (isSlotActive()) {
			return;
		}

		// The done event contains the COMPLETE transcription for this turn.
		// If the API sent final word(s) only in the done event (not as deltas),
		// append the missing portion to pendingText before flushing.
		if (doneText && doneText.length > this.turnDelta) {
			this.pendingText += doneText.substring(this.turnDelta);
		}

		if (this.pendingText.trim()) {
			this.tracker.trackProcessText(
				editor,
				this.pendingText.trim() + " ",
				() => this.callbacks.updateStatusBar("slot"),
			);
			this.pendingText = "";
		}

		// Reset turn counters for next utterance
		this.turnDelta = 0;
		this.turnProcessed = 0;
	}
}
