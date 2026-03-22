// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe
import {
	Editor,
	MarkdownView,
	Notice,
	Platform,
	Plugin,
} from "obsidian";
import { VoxtralSettings, DEFAULT_SETTINGS } from "./types";
import { VoxtralSettingTab } from "./settings-tab";
import {
	VoxtralHelpView,
	VIEW_TYPE_VOXTRAL_HELP,
} from "./help-view";
import { AudioRecorder } from "./audio-recorder";
import {
	RealtimeTranscriber,
	transcribeBatch,
	correctText,
	isLikelyHallucination,
} from "./mistral-api";
import {
	normalizeCommand,
	processText,
	matchCommand,
	setLanguage,
	setPreMatchHook,
	isSlotActive,
	getActiveSlot,
	closeSlot,
	cancelSlot,
	openSlot,
	loadCustomCommands,
	loadCustomCommandTriggers,
} from "./voice-commands";
import {
	scanTemplates,
	matchTemplate,
	matchQuickTemplate,
	insertTemplate,
	type QuickTemplate,
} from "./templates";

// ── In-memory log buffer (ring buffer, last 500 entries) ──

const LOG_BUFFER_SIZE = 500;
const logBuffer: string[] = [];

function pushLog(level: string, args: unknown[]): void {
	const ts = new Date().toISOString();
	const msg = args
		.map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
		.join(" ");
	logBuffer.push(`[${ts}] [${level}] ${msg}`);
	if (logBuffer.length > LOG_BUFFER_SIZE) {
		logBuffer.shift();
	}
}

/** Voxtral-specific logger that stores entries in the ring buffer. */
const vlog = {
	debug: (...args: unknown[]): void => {
		pushLog("DEBUG", args);
		console.debug(...args);
	},
	warn: (...args: unknown[]): void => {
		pushLog("WARN", args);
		console.warn(...args);
	},
	error: (...args: unknown[]): void => {
		pushLog("ERROR", args);
		console.error(...args);
	},
};

export default class VoxtralPlugin extends Plugin {
	settings: VoxtralSettings;
	private recorder: AudioRecorder;
	private realtimeTranscriber: RealtimeTranscriber | null = null;
	private isRecording = false;
	private isPaused = false;
	private isTypingMuted = false;
	private typingResumeTimer: ReturnType<typeof setTimeout> | null = null;
	private focusPauseTimer: ReturnType<typeof setTimeout> | null = null;
	private statusBarEl: HTMLElement | null = null;
	private sendRibbonEl: HTMLElement | null = null;
	private mobileActionEl: HTMLElement | null = null;
	private pendingText = "";
	private realtimePrevRaw = ""; // raw cumulative text from API (for delta detection)
	private realtimeTurnDelta = 0; // bytes received via deltas in current realtime turn
	private realtimeTurnProcessed = 0; // bytes already flushed from pendingText in current turn
	private chunkIndex = 0;
	private consecutiveFailures = 0;
	private maxConsecutiveFailures = 5;
	private currentEditor: Editor | null = null;
	private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
	/** Text buffered while a slot is active (transcription paused) */
	private slotBuffer = "";
	/** Ranges of text inserted during realtime dictation.
	 *  Offsets are always in the current document coordinate system —
	 *  existing ranges are adjusted when a new insertion happens. */
	private dictatedRanges: Array<{ from: number; to: number }> = [];

	// ── Dual-delay state ──
	private dualSlowTranscriber: RealtimeTranscriber | null = null;
	private dualFastText = "";
	private dualSlowText = "";
	private dualInsertOffset = 0; // editor offset where dual-delay text starts
	private dualDisplayLen = 0;   // length of text currently shown in editor
	private dualSlowCommitted = 0; // bytes trimmed from dualSlowText by processDualSlowCommands
	private dualSlowTurnDelta = 0; // bytes received via deltas in current slow turn
	private dualFastPrevRaw = ""; // raw cumulative text from fast API (for delta detection)
	private dualSlowPrevRaw = ""; // raw cumulative text from slow API (for delta detection)
	private dualCommandJustRan = false; // true after a voice command was executed (for orphaned punctuation detection)

	/** Whether realtime mode is available on this platform */
	get canRealtime(): boolean {
		return !Platform.isMobile;
	}

	/** Effective mode: fall back to batch on mobile */
	get effectiveMode(): "realtime" | "batch" {
		if (this.settings.mode === "realtime" && this.canRealtime) {
			return "realtime";
		}
		return "batch";
	}

	async onload(): Promise<void> {
		await this.loadSettings();

		this.recorder = new AudioRecorder();

		// Register the help side panel view
		this.registerView(
			VIEW_TYPE_VOXTRAL_HELP,
			(leaf) => new VoxtralHelpView(leaf)
		);

		// Ribbon icon: toggle recording
		this.addRibbonIcon("mic", "Start/stop recording", () => {
			void this.toggleRecording();
		});

		// Status bar (desktop only)
		if (!Platform.isMobile) {
			this.statusBarEl = this.addStatusBarItem();
			this.updateStatusBar("idle");
		}

		// Commands
		this.addCommand({
			id: "toggle-recording",
			name: "Start/stop recording",
			icon: "mic",
			callback: () => { void this.toggleRecording(); },
		});

		this.addCommand({
			id: "send-chunk",
			name: "Send audio chunk (tap-to-send)",
			icon: "send",
			callback: () => { void this.sendChunk(); },
		});

		this.addCommand({
			id: "open-help-panel",
			name: "Show voice help panel",
			icon: "help-circle",
			callback: () => { void this.openHelpPanel(); },
		});

		this.addCommand({
			id: "export-logs",
			name: "Export logs to clipboard",
			icon: "clipboard-copy",
			callback: () => { void this.exportLogs(); },
		});

		this.addCommand({
			id: "correct-selection",
			name: "Correct selected text",
			icon: "spell-check",
			editorCallback: (editor: Editor) => { void this.correctSelection(editor); },
		});

		this.addCommand({
			id: "correct-all",
			name: "Correct entire note",
			icon: "file-check",
			editorCallback: (editor: Editor) => { void this.correctAll(editor); },
		});

		// Settings tab
		this.addSettingTab(new VoxtralSettingTab(this.app, this));

		// Auto-pause recording when app loses focus (mobile background)
		this.registerDomEvent(document, "visibilitychange", () => {
			this.handleVisibilityChange();
		});

		// Auto-mute microphone while typing to prevent keyboard noise
		// from being transcribed as hallucinated text.
		// Use capture phase so we can preventDefault on Enter
		// (tap-to-send, if enabled) before the editor inserts a newline.
		this.keydownHandler = (e: KeyboardEvent) => this.handleTypingMute(e);
		document.addEventListener("keydown", this.keydownHandler, true);

	}

	onunload(): void {
		if (this.isRecording) {
			void this.stopRecording();
		}
		this.removeSendButton();
		if (this.keydownHandler) {
			document.removeEventListener("keydown", this.keydownHandler, true);
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
		setLanguage(this.settings.language);
		loadCustomCommands(this.settings.customCommands);
		loadCustomCommandTriggers(this.settings.customCommands);
		this.setupTemplates();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		setLanguage(this.settings.language);
		loadCustomCommands(this.settings.customCommands);
		loadCustomCommandTriggers(this.settings.customCommands);
		this.setupTemplates();
		this.refreshHelpView();
	}

	/** Scan templates folder and register the pre-match hook */
	private setupTemplates(): void {
		scanTemplates(this.app, this.settings.templatesFolder);

		setPreMatchHook((editor, normalizedText, rawText) => {
			const lang = this.settings.language;

			// Try quick-templates first (table, code block, callout)
			const quickMatch = matchQuickTemplate(normalizedText, lang);
			if (quickMatch) {
				if (quickMatch.textBefore) {
					// Insert preceding text (reuse raw text for proper casing)
					const cmdWords = normalizedText.length - quickMatch.textBefore.length;
					const before = rawText.substring(0, rawText.length - cmdWords).trimEnd();
					if (before) {
						const cursor = editor.getCursor();
						if (cursor.ch > 0 && !/^[\s\n]/.test(before)) {
							const charBefore = editor.getRange(
								{ line: cursor.line, ch: cursor.ch - 1 },
								cursor
							);
							const prefix = charBefore && /\S/.test(charBefore) ? " " : "";
							editor.replaceRange(prefix + before, cursor);
							const newCh = cursor.ch + prefix.length + before.length;
							editor.setCursor({ line: cursor.line, ch: newCh });
						} else {
							editor.replaceRange(before, cursor);
							const newCh = cursor.ch + before.length;
							editor.setCursor({ line: cursor.line, ch: newCh });
						}
					}
				}
				this.insertQuickTemplate(editor, quickMatch.template);
				return true;
			}

			// Try user templates ("template {name}" / "sjabloon {name}")
			const tmplMatch = matchTemplate(normalizedText, lang);
			if (tmplMatch) {
				if (tmplMatch.textBefore) {
					const cmdWords = normalizedText.length - tmplMatch.textBefore.length;
					const before = rawText.substring(0, rawText.length - cmdWords).trimEnd();
					if (before) {
						const cursor = editor.getCursor();
						editor.replaceRange(before, cursor);
						const newCh = cursor.ch + before.length;
						editor.setCursor({ line: cursor.line, ch: newCh });
					}
				}
				// insertTemplate is async — fire and forget
				void insertTemplate(this.app, editor, tmplMatch.template);
				return true;
			}

			return false;
		});
	}

	/** Insert a quick-template at the cursor, optionally opening a slot */
	private insertQuickTemplate(editor: Editor, tmpl: QuickTemplate): void {
		if (tmpl.slot) {
			// Open a slot (e.g. code block: type language, then Enter closes)
			const cursor = editor.getCursor();
			editor.replaceRange(tmpl.slot.prefix, cursor);
			const lines = tmpl.slot.prefix.split("\n");
			const lastLine = lines[lines.length - 1];
			const newLine = cursor.line + lines.length - 1;
			const newCh = lines.length === 1 ? cursor.ch + lastLine.length : lastLine.length;
			editor.setCursor({ line: newLine, ch: newCh });
			openSlot(tmpl.id, tmpl.slot);
			this.updateStatusBar("slot");
		} else {
			// Simple content insertion
			const cursor = editor.getCursor();
			editor.replaceRange(tmpl.content, cursor);
			const lines = tmpl.content.split("\n");
			const lastLine = lines[lines.length - 1];
			const newLine = cursor.line + lines.length - 1;
			const newCh = lines.length === 1 ? cursor.ch + lastLine.length : lastLine.length;
			editor.setCursor({ line: newLine, ch: newCh });
		}
	}

	/** Re-render the help panel with the current language. */
	private refreshHelpView(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_VOXTRAL_HELP)) {
			const view = leaf.view;
			if (view instanceof VoxtralHelpView) {
				view.setLanguage(this.settings.language);
			}
		}
	}

	// ── Send button (shown during batch recording) ──

	private addSendButton(): void {
		this.removeSendButton();

		// Ribbon icon (desktop)
		this.sendRibbonEl = this.addRibbonIcon(
			"send",
			"Send chunk",
			() => { void this.sendChunk(); }
		);
		this.sendRibbonEl.addClass("voxtral-send-button");

		// On mobile, add a send action to the active MarkdownView's
		// header bar.  This is always visible above the keyboard.
		if (Platform.isMobile) {
			const view =
				this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				this.mobileActionEl = view.addAction(
					"send",
					"Send chunk",
					() => { void this.sendChunk(); }
				);
				this.mobileActionEl.addClass("voxtral-mobile-send");
			}
		}
	}

	private removeSendButton(): void {
		if (this.sendRibbonEl) {
			this.sendRibbonEl.remove();
			this.sendRibbonEl = null;
		}
		if (this.mobileActionEl) {
			this.mobileActionEl.remove();
			this.mobileActionEl = null;
		}
	}

	// ── Visibility (auto-pause on background) ──

	private handleVisibilityChange(): void {
		if (!this.isRecording) return;

		const behavior = this.settings.focusBehavior;

		if (document.hidden) {
			// Clear any pending delayed pause
			this.clearFocusPauseTimer();

			if (behavior === "keep-recording") {
				// Do nothing — keep recording in background
				vlog.debug("Voxtral: App backgrounded, recording continues");
			} else if (behavior === "pause-after-delay") {
				const delaySec = this.settings.focusPauseDelaySec;
				console.debug(
					`Voxtral: App backgrounded, pausing in ${delaySec}s`
				);
				this.focusPauseTimer = setTimeout(() => {
					if (this.isRecording && document.hidden) {
						this.pauseRecording();
					}
				}, delaySec * 1000);
			} else {
				// "pause" — immediate
				this.pauseRecording();
			}
		} else {
			// App came back to foreground
			this.clearFocusPauseTimer();
			if (this.isPaused) {
				this.resumeRecording();
			}
		}
	}

	private pauseRecording(): void {
		this.isPaused = true;
		this.recorder.pause();
		this.updateStatusBar("paused");
		vlog.debug("Voxtral: Recording paused (app backgrounded)");
	}

	private resumeRecording(): void {
		this.isPaused = false;
		this.recorder.resume();
		this.updateStatusBar("recording");
		new Notice("Recording resumed");
		vlog.debug("Voxtral: Recording resumed (app foregrounded)");
	}

	private clearFocusPauseTimer(): void {
		if (this.focusPauseTimer) {
			clearTimeout(this.focusPauseTimer);
			this.focusPauseTimer = null;
		}
	}

	// ── Typing mute (prevent keyboard noise from being transcribed) ──

	private handleTypingMute(e: KeyboardEvent): void {
		// ── Slot handling: Enter/Escape close/cancel the active slot ──
		if (isSlotActive()) {
			const slot = getActiveSlot();
			if (e.key === "Escape") {
				e.preventDefault();
				cancelSlot();
				this.updateStatusBar("recording");
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view) this.flushSlotBuffer(view.editor);
				return;
			}
			const isEnterExit = slot?.def.exitTrigger === "enter" || slot?.def.exitTrigger === "enter-or-space";
			const isSpaceExit = slot?.def.exitTrigger === "space" || slot?.def.exitTrigger === "enter-or-space";
			if ((e.key === "Enter" && isEnterExit) || (e.key === " " && isSpaceExit)) {
				e.preventDefault();
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view) {
					closeSlot(view.editor);
					this.flushSlotBuffer(view.editor);
				}
				this.updateStatusBar("recording");
				return;
			}
			// All other keys: let the user type normally into the slot
			return;
		}

		if (!this.isRecording || this.isPaused) return;

		// Ignore modifier-only keys and shortcuts
		if (
			e.key === "Control" ||
			e.key === "Alt" ||
			e.key === "Shift" ||
			e.key === "Meta" ||
			e.ctrlKey ||
			e.metaKey
		) {
			return;
		}

		// Enter = tap-to-send in batch mode, but only when the mic is
		// live (not typing). While typing / during the unmute cooldown,
		// Enter behaves normally (newline).
		if (
			e.key === "Enter" &&
			this.settings.enterToSend &&
			this.effectiveMode === "batch" &&
			!this.isTypingMuted &&
			!this.typingResumeTimer
		) {
			e.preventDefault();
			void this.sendChunk();
			return;
		}

		// Ignore keys that don't produce sustained keyboard noise,
		// but still reset the cooldown timer if we're already muted
		// so that e.g. Enter-as-newline extends the typing session.
		if (
			e.key === "Escape" ||
			e.key === "Tab" ||
			e.key === "Enter" ||
			e.key === "Backspace" ||
			e.key === "Delete" ||
			e.key === "ArrowUp" ||
			e.key === "ArrowDown" ||
			e.key === "ArrowLeft" ||
			e.key === "ArrowRight" ||
			e.key === "Home" ||
			e.key === "End" ||
			e.key === "PageUp" ||
			e.key === "PageDown" ||
			e.key.startsWith("F") && e.key.length <= 3
		) {
			// If already muted, reset the cooldown so the mic stays muted
			if (this.isTypingMuted && this.typingResumeTimer) {
				clearTimeout(this.typingResumeTimer);
				this.typingResumeTimer = setTimeout(() => {
					this.typingResumeTimer = null;
					if (this.isRecording && this.isTypingMuted && !this.isPaused) {
						this.isTypingMuted = false;
						this.recorder.unmute();
					}
				}, this.settings.typingCooldownMs);
			}
			return;
		}

		// Mute the microphone track (silences input without stopping recorder)
		if (!this.isTypingMuted) {
			this.isTypingMuted = true;
			this.recorder.mute();
		}

		// Reset the resume timer on every keystroke
		if (this.typingResumeTimer) {
			clearTimeout(this.typingResumeTimer);
		}

		// Unmute after cooldown period of no typing
		this.typingResumeTimer = setTimeout(() => {
			this.typingResumeTimer = null;
			if (this.isRecording && this.isTypingMuted && !this.isPaused) {
				this.isTypingMuted = false;
				this.recorder.unmute();
			}
		}, this.settings.typingCooldownMs);
	}

	// ── Recording toggle ──

	private async toggleRecording(): Promise<void> {
		if (this.isRecording) {
			await this.stopRecording();
		} else {
			await this.startRecording();
		}
	}

	private async startRecording(): Promise<void> {
		if (!this.settings.apiKey) {
			new Notice("Please set your API key in the plugin settings.");
			return;
		}

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice("Open a note first to start dictating.");
			return;
		}

		const editor = view.editor;
		this.currentEditor = editor;

		try {
			if (this.effectiveMode === "realtime") {
				await this.startRealtimeRecording(editor);
			} else {
				await this.startBatchRecording();
				this.addSendButton();
			}
			this.isRecording = true;
			this.chunkIndex = 0;
			this.consecutiveFailures = 0;
			this.updateStatusBar("recording");
			// Auto-open help panel on desktop only — on mobile it
			// takes over the whole screen which is annoying.
			if (!Platform.isMobile) {
				void this.openHelpPanel();
			}

			// Show which microphone is active
			const micName = this.recorder.activeMicLabel;
			if (this.effectiveMode === "batch") {
				const enterHint = this.settings.enterToSend
					? " Press Enter (when not typing) or tap send to transcribe chunks."
					: " Tap send to transcribe chunks while you keep talking.";
				if (
					Platform.isMobile &&
					!this.settings.dismissMobileBatchNotice
				) {
					// Show a one-time explainer on mobile; user can dismiss permanently
					const frag = document.createDocumentFragment();
					frag.createSpan({
						text:
							`Recording started (${micName}).` +
							" Tap the send button (\u2191) to transcribe chunks while you keep talking.",
					});
					frag.createEl("br");
					const dismiss = frag.createEl("a", {
						text: "Don\u2019t show again",
						href: "#",
						cls: "voxtral-dismiss-link",
					});
					dismiss.addEventListener("click", (e) => {
						e.preventDefault();
						this.settings.dismissMobileBatchNotice = true;
						void this.saveSettings();
					});
					new Notice(frag, 8000);
				} else {
					new Notice(
						`Voxtral: Recording started (${micName})\n` +
							enterHint.trim(),
						6000
					);
				}
			} else {
				new Notice(`Recording started (${micName})`);
			}
		} catch (e) {
			vlog.error("Voxtral: Failed to start recording", e);
			new Notice(`Could not start recording: ${e}`);
			this.updateStatusBar("idle");
		}
	}

	private async stopRecording(): Promise<void> {
		this.isRecording = false;
		this.isPaused = false;
		this.isTypingMuted = false;
		if (this.typingResumeTimer) {
			clearTimeout(this.typingResumeTimer);
			this.typingResumeTimer = null;
		}
		this.clearFocusPauseTimer();
		this.updateStatusBar("processing");
		this.removeSendButton();

		try {
			if (this.effectiveMode === "realtime") {
				await this.stopRealtimeRecording();
			} else {
				await this.stopBatchRecording();
			}
		} catch (e) {
			vlog.error("Voxtral: Failed to stop recording", e);
			new Notice(`Error stopping recording: ${e}`);
		}

		this.currentEditor = null;
		this.dictatedRanges = [];
		this.updateStatusBar("idle");
		new Notice("Recording stopped");
	}

	// ── Tap-to-send: flush current audio chunk without stopping ──

	private async sendChunk(): Promise<void> {
		if (!this.isRecording || this.effectiveMode !== "batch") {
			return;
		}

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		const editor = view.editor;
		this.chunkIndex++;

		try {
			this.updateStatusBar("processing");
			const blob = await this.recorder.flushChunk();

			if (blob.size === 0) {
				this.updateStatusBar("recording");
				return;
			}

			let text = await transcribeBatch(blob, this.settings);

			if (
				text &&
				isLikelyHallucination(
					text,
					this.recorder.lastChunkDurationSec
				)
			) {
				vlog.warn("Voxtral: Discarding hallucinated chunk");
				this.updateStatusBar("recording");
				return;
			}

			// Check for voice commands BEFORE auto-correct.
			// The correction LLM can mangle command phrases like
			// "nieuw todo item" into literal "[ ]" text.
			const hasCommand = text ? matchCommand(text) !== null : false;

			if (this.settings.autoCorrect && text && !hasCommand) {
				text = await correctText(text, this.settings);
			}

			this.updateStatusBar("recording");
			if (text) {
				processText(editor, text);
			}
		} catch (e) {
			vlog.error("Voxtral: Chunk transcription failed", e);
			this.updateStatusBar("recording");
			new Notice(`Chunk failed: ${e}`);
		}
	}

	// ── Realtime recording ──

	private async startRealtimeRecording(editor: Editor): Promise<void> {
		if (this.settings.dualDelay) {
			return this.startDualDelayRecording(editor);
		}

		this.pendingText = "";
		this.realtimePrevRaw = "";
		this.realtimeTurnDelta = 0;
		this.realtimeTurnProcessed = 0;
		this.dictatedRanges = [];

		await this.connectRealtimeWebSocket(editor);

		const deviceId = this.settings.microphoneDeviceId || undefined;
		await this.recorder.start(deviceId, (pcmData) => {
			this.realtimeTranscriber?.sendAudio(pcmData);
		}, this.settings.noiseSuppression);
		if (this.recorder.fallbackUsed) {
			new Notice("Selected mic unavailable — using default");
		}
	}

	private async connectRealtimeWebSocket(editor: Editor): Promise<void> {
		this.realtimeTranscriber = new RealtimeTranscriber(this.settings, {
			onSessionCreated: () => {
				vlog.debug("Voxtral: Realtime session created");
			},
			onDelta: (text) => {
				this.handleRealtimeDelta(editor, text);
			},
			onDone: (text) => {
				this.handleRealtimeDone(editor, text);
			},
			onError: (message) => {
				vlog.error("Voxtral: Realtime error:", message);
				new Notice(`Streaming error: ${message}`);
			},
			onDisconnect: () => {
				void this.handleRealtimeDisconnect();
			},
		});

		await this.realtimeTranscriber.connect();
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
	private async handleRealtimeDisconnect(): Promise<void> {
		if (!this.isRecording) return;

		const editor =
			this.currentEditor ||
			this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		if (!editor) {
			void this.stopRecording();
			return;
		}

		// Silent, immediate reconnect — this is expected API behavior
		vlog.debug("Voxtral: Session ended, reconnecting silently...");

		// Reset turn counters for the new connection
		this.realtimePrevRaw = "";
		this.realtimeTurnDelta = 0;
		this.realtimeTurnProcessed = 0;

		try {
			await this.connectRealtimeWebSocket(editor);
			this.consecutiveFailures = 0;
			vlog.debug("Voxtral: Session reconnected");
		} catch (e) {
			this.consecutiveFailures++;
			console.error(
				`Voxtral: Reconnect failed (${this.consecutiveFailures}/${this.maxConsecutiveFailures})`,
				e
			);

			if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
				new Notice(
					"Cannot connect to the API. Recording stopped.",
					6000
				);
				void this.stopRecording();
				return;
			}

			// Brief delay before retry, only on actual failures
			const delay = Math.min(
				500 * this.consecutiveFailures,
				3000
			);
			await new Promise((resolve) => setTimeout(resolve, delay));

			if (this.isRecording) {
				void this.handleRealtimeDisconnect();
			}
		}
	}

	private handleRealtimeDelta(editor: Editor, text: string): void {
		// Handle both cumulative and incremental deltas from the API
		const isCumulative = this.realtimePrevRaw && text.startsWith(this.realtimePrevRaw);
		const newText = isCumulative ? text.substring(this.realtimePrevRaw.length) : text;
		this.realtimePrevRaw = isCumulative ? text : this.realtimePrevRaw + text;

		if (!newText) return;

		// While a slot is active, buffer incoming transcription
		if (isSlotActive()) {
			this.slotBuffer += newText;
			this.realtimeTurnDelta += newText.length;
			return;
		}

		this.pendingText += newText;
		this.realtimeTurnDelta += newText.length;

		// Flush on sentence-ending punctuation OR after accumulating enough text
		const sentenceEnd = /[.!?]\s*$/;
		const longEnough = this.pendingText.length > 120;

		if (sentenceEnd.test(this.pendingText) || longEnough) {
			const sentence = this.pendingText.trim();
			this.realtimeTurnProcessed += this.pendingText.length;
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
				void this.stopRecording();
				return;
			}

			this.trackProcessText(editor, sentence + " ");
		}
	}

	private handleRealtimeDone(editor: Editor, doneText: string): void {
		// While a slot is active, buffer incoming transcription
		if (isSlotActive()) {
			return;
		}

		// The done event contains the COMPLETE transcription for this turn.
		// If the API sent final word(s) only in the done event (not as deltas),
		// append the missing portion to pendingText before flushing.
		if (doneText && doneText.length > this.realtimeTurnDelta) {
			this.pendingText += doneText.substring(this.realtimeTurnDelta);
		}

		if (this.pendingText.trim()) {
			this.trackProcessText(editor, this.pendingText.trim() + " ");
			this.pendingText = "";
		}

		// Reset turn counters for next utterance
		this.realtimeTurnDelta = 0;
		this.realtimeTurnProcessed = 0;
	}

	/** Flush buffered transcription text after a slot closes.
	 *  Atomic: captures and clears slotBuffer before processing
	 *  to prevent race conditions with incoming deltas. */
	private flushSlotBuffer(editor: Editor): void {
		// Atomically capture and clear the buffer so any delta arriving
		// between closeSlot() and this flush goes to pendingText instead
		// of being double-processed.
		const buffered = this.slotBuffer;
		this.slotBuffer = "";

		if (buffered.trim()) {
			this.pendingText += buffered;
			if (this.pendingText.trim()) {
				this.trackProcessText(editor, this.pendingText.trim() + " ");
				this.pendingText = "";
			}
		}
	}

	private async stopRealtimeRecording(): Promise<void> {
		if (this.dualSlowTranscriber) {
			return this.stopDualDelayRecording();
		}

		this.realtimeTranscriber?.endAudio();

		await new Promise((resolve) => setTimeout(resolve, 1000));

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view && this.pendingText.trim()) {
			this.trackProcessText(view.editor, this.pendingText.trim());
			this.pendingText = "";
		}

		this.realtimeTranscriber?.close();
		this.realtimeTranscriber = null;
		await this.recorder.stop();

		if (this.settings.autoCorrect && view) {
			await this.autoCorrectAfterStop(view.editor);
		}
	}

	// ── Dual-delay realtime recording ──

	private async startDualDelayRecording(editor: Editor): Promise<void> {
		this.pendingText = "";
		this.dictatedRanges = [];
		this.dualFastText = "";
		this.dualSlowText = "";
		this.dualInsertOffset = editor.posToOffset(editor.getCursor());
		this.dualDisplayLen = 0;
		this.dualSlowCommitted = 0;
		this.dualSlowTurnDelta = 0;
		this.dualFastPrevRaw = "";
		this.dualSlowPrevRaw = "";
		this.dualCommandJustRan = false;

		await this.connectDualDelayWebSockets(editor);

		const deviceId = this.settings.microphoneDeviceId || undefined;
		await this.recorder.start(deviceId, (pcmData) => {
			// Send audio to BOTH transcribers
			this.realtimeTranscriber?.sendAudio(pcmData);
			this.dualSlowTranscriber?.sendAudio(pcmData);
		}, this.settings.noiseSuppression);
		if (this.recorder.fallbackUsed) {
			new Notice("Selected mic unavailable — using default");
		}
	}

	private async connectDualDelayWebSockets(editor: Editor): Promise<void> {
		const fastDelay = this.settings.dualDelayFastMs;
		const slowDelay = this.settings.dualDelaySlowMs;

		// Fast stream — immediate text feedback
		this.realtimeTranscriber = new RealtimeTranscriber(this.settings, {
			onSessionCreated: () => {
				vlog.debug("Voxtral: Fast stream session created");
			},
			onDelta: (text) => {
				// Handle both cumulative and incremental deltas from the API
				const isCumulative = this.dualFastPrevRaw && text.startsWith(this.dualFastPrevRaw);
				if (isCumulative) {
					const newPart = text.substring(this.dualFastPrevRaw.length);
					if (newPart) this.dualFastText += newPart;
				} else {
					this.dualFastText += text;
				}
				this.dualFastPrevRaw = isCumulative ? text : this.dualFastPrevRaw + text;
				this.renderDualText(editor);
			},
			onDone: (_text) => {
				// Fast stream done — just re-render
				this.renderDualText(editor);
			},
			onError: (message) => {
				vlog.error("Voxtral: Fast stream error:", message);
			},
			onDisconnect: () => {
				void this.handleDualStreamDisconnect("fast");
			},
		}, fastDelay);

		// Slow stream — accurate text + voice commands
		this.dualSlowTranscriber = new RealtimeTranscriber(this.settings, {
			onSessionCreated: () => {
				vlog.debug("Voxtral: Slow stream session created");
			},
			onDelta: (text) => {
				// Handle both cumulative and incremental deltas from the API
				const isCumulative = this.dualSlowPrevRaw && text.startsWith(this.dualSlowPrevRaw);
				if (isCumulative) {
					const newPart = text.substring(this.dualSlowPrevRaw.length);
					if (newPart) {
						this.dualSlowText += newPart;
						this.dualSlowTurnDelta += newPart.length;
					}
				} else {
					this.dualSlowText += text;
					this.dualSlowTurnDelta += text.length;
				}
				this.dualSlowPrevRaw = isCumulative ? text : this.dualSlowPrevRaw + text;
				this.renderDualText(editor);
				this.processDualSlowCommands(editor);
			},
			onDone: (_text) => {
				// Stream done — process any remaining text, don't replace
				// accumulators (which would re-inject already-committed text)
				this.renderDualText(editor);
				this.processDualSlowCommands(editor);
			},
			onError: (message) => {
				vlog.error("Voxtral: Slow stream error:", message);
			},
			onDisconnect: () => {
				void this.handleDualStreamDisconnect("slow");
			},
		}, slowDelay);

		await Promise.all([
			this.realtimeTranscriber.connect(),
			this.dualSlowTranscriber.connect(),
		]);
	}

	private async handleDualStreamDisconnect(stream: "fast" | "slow"): Promise<void> {
		if (!this.isRecording) return;

		const editor =
			this.currentEditor ||
			this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		if (!editor) {
			void this.stopRecording();
			return;
		}

		vlog.debug(`Voxtral: ${stream} stream ended, reconnecting...`);

		try {
			if (stream === "fast" && this.realtimeTranscriber) {
				// Reconnect fast stream only
				const fastDelay = this.settings.dualDelayFastMs;
				this.realtimeTranscriber = new RealtimeTranscriber(this.settings, {
					onSessionCreated: () => vlog.debug("Voxtral: Fast stream reconnected"),
					onDelta: (text) => {
						this.dualFastText += text;
						this.renderDualText(editor);
					},
					onDone: () => this.renderDualText(editor),
					onError: (message) => vlog.error("Voxtral: Fast stream error:", message),
					onDisconnect: () => void this.handleDualStreamDisconnect("fast"),
				}, fastDelay);
				await this.realtimeTranscriber.connect();
			} else if (stream === "slow" && this.dualSlowTranscriber) {
				// Reconnect slow stream only
				// Flush any remaining text from the previous turn as committed text
				// (the utterance ended, so no more text will complete the sentence)
				if (this.dualSlowText.trim()) {
					const from = editor.offsetToPos(this.dualInsertOffset);
					const to = editor.offsetToPos(this.dualInsertOffset + this.dualDisplayLen);
					editor.replaceRange("", from, to);
					editor.setCursor(from);
					this.dualDisplayLen = 0;
					this.trackInsertAtCursor(editor, this.dualSlowText);
					this.dualInsertOffset = editor.posToOffset(editor.getCursor());
				}
				// Reset counters for new turn
				this.dualSlowCommitted = 0;
				this.dualSlowText = "";
				this.dualFastText = "";
				this.dualSlowTurnDelta = 0;
				this.dualSlowPrevRaw = "";
				this.dualFastPrevRaw = "";
				const slowDelay = this.settings.dualDelaySlowMs;
				this.dualSlowTranscriber = new RealtimeTranscriber(this.settings, {
					onSessionCreated: () => vlog.debug("Voxtral: Slow stream reconnected"),
					onDelta: (text) => {
						const isCumulative = this.dualSlowPrevRaw && text.startsWith(this.dualSlowPrevRaw);
						if (isCumulative) {
							const newPart = text.substring(this.dualSlowPrevRaw.length);
							if (newPart) {
								this.dualSlowText += newPart;
								this.dualSlowTurnDelta += newPart.length;
							}
						} else {
							this.dualSlowText += text;
							this.dualSlowTurnDelta += text.length;
						}
						this.dualSlowPrevRaw = isCumulative ? text : this.dualSlowPrevRaw + text;
						this.renderDualText(editor);
						this.processDualSlowCommands(editor);
					},
					onDone: (_text) => {
						this.renderDualText(editor);
						this.processDualSlowCommands(editor);
					},
					onError: (message) => vlog.error("Voxtral: Slow stream error:", message),
					onDisconnect: () => void this.handleDualStreamDisconnect("slow"),
				}, slowDelay);
				await this.dualSlowTranscriber.connect();
			}
			this.consecutiveFailures = 0;
		} catch (e) {
			this.consecutiveFailures++;
			vlog.error(`Voxtral: ${stream} stream reconnect failed (${this.consecutiveFailures})`, e);
			if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
				new Notice("Cannot reconnect. Recording stopped.", 6000);
				void this.stopRecording();
				return;
			}
			const delay = Math.min(500 * this.consecutiveFailures, 3000);
			await new Promise((resolve) => setTimeout(resolve, delay));
			if (this.isRecording) {
				void this.handleDualStreamDisconnect(stream);
			}
		}
	}

	/**
	 * Update the editor with the current dual-delay text.
	 * Shows slow (confirmed) text + any fast text beyond slow.
	 */
	private renderDualText(editor: Editor): void {
		// Detect if user has manually repositioned cursor (e.g. pressed Enter,
		// clicked elsewhere).  When this happens, commit the confirmed slow
		// text at the old position and start fresh at the new cursor location.
		const cursorOffset = editor.posToOffset(editor.getCursor());
		const expectedEnd = this.dualInsertOffset + this.dualDisplayLen;

		if (cursorOffset !== expectedEnd) {
			if (this.dualDisplayLen > 0) {
				// Commit only the confirmed (slow) text at the old position
				const slowText = this.dualSlowText;
				const from = editor.offsetToPos(this.dualInsertOffset);
				const to = editor.offsetToPos(expectedEnd);
				editor.replaceRange(slowText, from, to);

				// The replacement may have shifted offsets — adjust cursor
				const shift = slowText.length - this.dualDisplayLen;
				const newCursor = cursorOffset >= expectedEnd
					? cursorOffset + shift
					: cursorOffset;
				editor.setCursor(editor.offsetToPos(newCursor));

				// Reset accumulators — committed text is now permanent
				this.dualSlowCommitted += slowText.length;
				this.dualSlowText = "";
				this.dualFastText = "";
				this.dualDisplayLen = 0;
				this.dualInsertOffset = newCursor;
				return;
			}
			// No displayed text yet — just update insert offset
			this.dualInsertOffset = cursorOffset;
		}

		const slowLen = this.dualSlowText.length;
		const fastLen = this.dualFastText.length;

		let displayText: string;
		if (fastLen > slowLen) {
			displayText = this.dualSlowText + this.dualFastText.substring(slowLen);
		} else {
			displayText = this.dualSlowText;
		}

		// Replace the current dual-delay range in the editor
		const from = editor.offsetToPos(this.dualInsertOffset);
		const to = editor.offsetToPos(this.dualInsertOffset + this.dualDisplayLen);

		// Strip leading whitespace when inserting at start of a line —
		// the API often prepends a space for word separation, but at
		// column 0 this would cause unwanted indentation.
		if (from.ch === 0 && this.dualDisplayLen === 0) {
			displayText = displayText.replace(/^\s+/, "");
		}

		editor.replaceRange(displayText, from, to);
		this.dualDisplayLen = displayText.length;

		// Move cursor to end
		const endOffset = this.dualInsertOffset + this.dualDisplayLen;
		editor.setCursor(editor.offsetToPos(endOffset));
	}

	/**
	 * Process voice commands from the slow stream (more accurate).
	 * Checks completed sentences in dualSlowText for voice commands.
	 */
	private processDualSlowCommands(editor: Editor): void {
		if (!this.dualSlowText) return;

		// Discard orphaned punctuation/whitespace that trails a previously
		// executed command.  This happens when the API sends a cumulative
		// delta that appends just "." after the command text was already
		// consumed and executed (e.g. "Nieuwe alinea" → "Nieuwe alinea.").
		if (this.dualCommandJustRan && /^[\s.!?,;:]*$/.test(this.dualSlowText)) {
			this.dualCommandJustRan = false;
			if (this.dualDisplayLen > 0) {
				const from = editor.offsetToPos(this.dualInsertOffset);
				const to = editor.offsetToPos(this.dualInsertOffset + this.dualDisplayLen);
				editor.replaceRange("", from, to);
				editor.setCursor(from);
				this.dualDisplayLen = 0;
			}
			this.dualSlowCommitted += this.dualSlowText.length;
			this.dualSlowText = "";
			this.dualFastText = "";
			this.dualInsertOffset = editor.posToOffset(editor.getCursor());
			return;
		}
		this.dualCommandJustRan = false;

		const segments = this.dualSlowText.match(/[^.!?]+[.!?]+\s*/g);

		// Also check the remainder (text without sentence-ending punctuation)
		// for standalone voice commands like "wikilink", "vet", etc.
		const segmentText = segments ? segments.join("") : "";
		const remainder = this.dualSlowText.substring(segmentText.length);

		// If there are no complete sentences, check if the entire text
		// is a standalone voice command (no surrounding text needed).
		if (!segments && remainder.trim()) {
			const cmdMatch = matchCommand(remainder.trim());
			if (cmdMatch && !cmdMatch.textBefore) {
				// Pure command without text before — execute it
				const from = editor.offsetToPos(this.dualInsertOffset);
				const to = editor.offsetToPos(this.dualInsertOffset + this.dualDisplayLen);
				editor.replaceRange("", from, to);
				editor.setCursor(from);
				this.dualDisplayLen = 0;

				cmdMatch.command.action(editor);
				if (cmdMatch.command.id === "stopRecording") {
					setTimeout(() => { void this.stopRecording(); }, 0);
				}
				if (isSlotActive()) {
					this.updateStatusBar("slot");
				}

				this.dualCommandJustRan = true;
				this.dualSlowCommitted += this.dualSlowText.length;
				this.dualSlowText = "";
				this.dualFastText = "";
				this.dualInsertOffset = editor.posToOffset(editor.getCursor());
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
		const from = editor.offsetToPos(this.dualInsertOffset);
		const to = editor.offsetToPos(this.dualInsertOffset + this.dualDisplayLen);
		editor.replaceRange("", from, to);
		editor.setCursor(from);
		this.dualDisplayLen = 0;

		// Process each segment: insert text or execute command
		for (const segment of segments) {
			const match = matchCommand(segment);
			if (match) {
				if (match.textBefore) {
					let before = match.textBefore;
					if (match.command.punctuation) {
						before = before.replace(/[,;.!?]+\s*$/, "");
					}
					this.trackInsertAtCursor(editor, before);
				}
				match.command.action(editor);
				this.dualCommandJustRan = true;

				if (match.command.id === "stopRecording") {
					setTimeout(() => { void this.stopRecording(); }, 0);
				}
				if (isSlotActive()) {
					this.updateStatusBar("slot");
				}
			} else {
				this.trackInsertAtCursor(editor, segment);
			}
		}

		// Trim accumulators: remove processed portion, keep remainder
		this.dualSlowCommitted += matchedLength;
		this.dualSlowText = remainder;
		// Reset fast text — the two streams produce different text so we
		// cannot byte-align them.  The fast stream will continue sending
		// deltas for upcoming audio to rebuild the preview.
		this.dualFastText = "";

		// Update insert offset and display length for remaining text
		this.dualInsertOffset = editor.posToOffset(editor.getCursor());
		this.dualDisplayLen = 0;

		// Re-render remaining text
		if (this.dualSlowText || this.dualFastText) {
			this.renderDualText(editor);
		}
	}

	/**
	 * Helper: insert text at cursor and track the range for auto-correct.
	 */
	private trackInsertAtCursor(editor: Editor, text: string): void {
		const cursor = editor.getCursor();

		// Auto-space
		if (cursor.ch > 0 && text.length > 0 && !/^[\s\n]/.test(text)) {
			const charBefore = editor.getRange(
				{ line: cursor.line, ch: cursor.ch - 1 },
				cursor
			);
			if (charBefore && /\S/.test(charBefore)) {
				text = " " + text;
			}
		}

		const offsetBefore = editor.posToOffset(cursor);
		editor.replaceRange(text, cursor);
		const lines = text.split("\n");
		const lastLine = lines[lines.length - 1];
		const newLine = cursor.line + lines.length - 1;
		const newCh = lines.length === 1 ? cursor.ch + lastLine.length : lastLine.length;
		editor.setCursor({ line: newLine, ch: newCh });
		const offsetAfter = editor.posToOffset(editor.getCursor());
		const delta = offsetAfter - offsetBefore;

		if (delta > 0) {
			for (const range of this.dictatedRanges) {
				if (range.from >= offsetBefore) {
					range.from += delta;
					range.to += delta;
				} else if (range.to > offsetBefore) {
					range.to += delta;
				}
			}
			this.dictatedRanges.push({ from: offsetBefore, to: offsetAfter });
		}
	}

	private async stopDualDelayRecording(): Promise<void> {
		// End audio on both streams
		this.realtimeTranscriber?.endAudio();
		this.dualSlowTranscriber?.endAudio();

		await new Promise((resolve) => setTimeout(resolve, 1000));

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) {
			const editor = view.editor;
			// Process any remaining slow commands
			this.processDualSlowCommands(editor);

			// Finalize: replace with slow text (most accurate)
			const finalText = this.dualSlowText || this.dualFastText;
			if (finalText) {
				const from = editor.offsetToPos(this.dualInsertOffset);
				const to = editor.offsetToPos(this.dualInsertOffset + this.dualDisplayLen);
				editor.replaceRange(finalText, from, to);
				const endOffset = this.dualInsertOffset + finalText.length;
				editor.setCursor(editor.offsetToPos(endOffset));

				// Track the final range for auto-correct
				this.dictatedRanges.push({
					from: this.dualInsertOffset,
					to: this.dualInsertOffset + finalText.length,
				});
			}
		}

		this.realtimeTranscriber?.close();
		this.dualSlowTranscriber?.close();
		this.realtimeTranscriber = null;
		this.dualSlowTranscriber = null;
		await this.recorder.stop();

		// Reset dual state
		this.dualFastText = "";
		this.dualSlowText = "";
		this.dualDisplayLen = 0;
		this.dualSlowCommitted = 0;
		this.dualSlowTurnDelta = 0;

		if (this.settings.autoCorrect && view) {
			await this.autoCorrectAfterStop(view.editor);
		}
	}

	// ── Batch recording ──

	private async startBatchRecording(): Promise<void> {
		const deviceId = this.settings.microphoneDeviceId || undefined;
		await this.recorder.start(deviceId, undefined, this.settings.noiseSuppression);
		if (this.recorder.fallbackUsed) {
			new Notice("Selected mic unavailable — using default");
		}
	}

	private async stopBatchRecording(): Promise<void> {
		const blob = await this.recorder.stop();

		if (blob.size === 0) {
			new Notice("No audio recorded");
			return;
		}

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice("No active note found");
			return;
		}

		const editor = view.editor;

		try {
			let text = await transcribeBatch(blob, this.settings);

			if (
				text &&
				isLikelyHallucination(
					text,
					this.recorder.lastChunkDurationSec
				)
			) {
				vlog.warn("Voxtral: Discarding hallucinated batch");
				return;
			}

			const hasCommand = text ? matchCommand(text) !== null : false;

			if (this.settings.autoCorrect && text && !hasCommand) {
				text = await correctText(text, this.settings);
			}

			if (text) {
				processText(editor, text);
			}
		} catch (e) {
			vlog.error("Voxtral: Batch transcription failed", e);
			new Notice(`Transcription failed: ${e}`);
		}
	}

	// ── Dictation range tracking ──

	/**
	 * Wrap processText to track what was inserted in the editor.
	 * Records the cursor offset before and after to determine the
	 * range of inserted text, and adjusts existing ranges when an
	 * insertion shifts them.
	 */
	private trackProcessText(editor: Editor, text: string): void {
		const offsetBefore = editor.posToOffset(editor.getCursor());
		processText(editor, text);
		// If a slot was activated, update status bar
		if (isSlotActive()) {
			this.updateStatusBar("slot");
		}
		const offsetAfter = editor.posToOffset(editor.getCursor());
		const delta = offsetAfter - offsetBefore;

		if (delta > 0) {
			// Insertion: adjust existing ranges that sit at or after
			// the insertion point, then record the new range.
			for (const range of this.dictatedRanges) {
				if (range.from >= offsetBefore) {
					range.from += delta;
					range.to += delta;
				} else if (range.to > offsetBefore) {
					range.to += delta;
				}
			}
			this.dictatedRanges.push({ from: offsetBefore, to: offsetAfter });
		} else if (delta < 0) {
			// Deletion (voice command like "delete last paragraph"):
			// adjust existing ranges but don't record a new one.
			const deletedLen = -delta;
			const deletedFrom = offsetAfter;
			const deletedTo = offsetBefore;

			for (const range of this.dictatedRanges) {
				if (range.from >= deletedTo) {
					range.from -= deletedLen;
					range.to -= deletedLen;
				} else if (range.from >= deletedFrom) {
					range.from = deletedFrom;
					range.to = range.to <= deletedTo
						? deletedFrom
						: range.to - deletedLen;
				} else if (range.to > deletedFrom) {
					range.to = range.to <= deletedTo
						? deletedFrom
						: range.to - deletedLen;
				}
			}
			this.dictatedRanges = this.dictatedRanges.filter(
				(r) => r.to > r.from
			);
		}
	}

	// ── Text correction ──

	/**
	 * Merge overlapping or adjacent dictated ranges into a minimal set.
	 */
	private static mergeRanges(
		ranges: Array<{ from: number; to: number }>
	): Array<{ from: number; to: number }> {
		if (ranges.length === 0) return [];

		const sorted = [...ranges].sort((a, b) => a.from - b.from);
		const merged = [sorted[0]];

		for (let i = 1; i < sorted.length; i++) {
			const prev = merged[merged.length - 1];
			const cur = sorted[i];
			if (cur.from <= prev.to) {
				prev.to = Math.max(prev.to, cur.to);
			} else {
				merged.push({ ...cur });
			}
		}
		return merged;
	}

	/**
	 * After stopping realtime recording, correct only the text
	 * that was actually dictated.  Each tracked range is corrected
	 * independently, processed from end to start so that earlier
	 * offsets remain valid after replacements.
	 */
	private async autoCorrectAfterStop(editor: Editor): Promise<void> {
		if (this.dictatedRanges.length === 0) return;

		const merged = VoxtralPlugin.mergeRanges(this.dictatedRanges);
		merged.sort((a, b) => b.from - a.from); // end-to-start

		const fullText = editor.getValue();

		// Pre-compute positions and extract text before making changes
		const corrections: Array<{
			from: { line: number; ch: number };
			to: { line: number; ch: number };
			text: string;
		}> = [];

		for (const range of merged) {
			if (range.from >= fullText.length || range.to > fullText.length) {
				continue;
			}
			const text = fullText.substring(range.from, range.to);
			if (!text.trim()) continue;
			corrections.push({
				from: editor.offsetToPos(range.from),
				to: editor.offsetToPos(range.to),
				text,
			});
		}

		// Correct each range and replace (end-to-start preserves offsets)
		for (const c of corrections) {
			try {
				const corrected = await correctText(c.text, this.settings);
				if (corrected && corrected !== c.text) {
					editor.replaceRange(corrected, c.from, c.to);
				}
			} catch (e) {
				vlog.error("Voxtral: Auto-correct failed", e);
			}
		}
	}

	private async exportLogs(): Promise<void> {
		if (logBuffer.length === 0) {
			new Notice("No logs to export");
			return;
		}
		const text = logBuffer.join("\n");
		await navigator.clipboard.writeText(text);
		new Notice(`${logBuffer.length} log entries copied to clipboard`);
	}

	private async correctSelection(editor: Editor): Promise<void> {
		const selection = editor.getSelection();
		if (!selection) {
			new Notice("Select text first to correct it");
			return;
		}

		if (!this.settings.apiKey) {
			new Notice("Please set your API key first");
			return;
		}

		try {
			new Notice("Correcting...");
			const corrected = await correctText(selection, this.settings);
			if (corrected) {
				editor.replaceSelection(corrected);
				new Notice("Selection corrected");
			}
		} catch (e) {
			new Notice(`Correction failed: ${e}`);
		}
	}

	private async correctAll(editor: Editor): Promise<void> {
		const text = editor.getValue();
		if (!text.trim()) {
			new Notice("Note is empty");
			return;
		}

		if (!this.settings.apiKey) {
			new Notice("Please set your API key first");
			return;
		}

		try {
			new Notice("Correcting...");
			const corrected = await correctText(text, this.settings);
			if (corrected && corrected !== text) {
				editor.setValue(corrected);
				new Notice("Note corrected");
			} else {
				new Notice("No corrections needed");
			}
		} catch (e) {
			new Notice(`Correction failed: ${e}`);
		}
	}

	// ── Help panel ──

	private async openHelpPanel(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(
			VIEW_TYPE_VOXTRAL_HELP
		);
		if (existing.length > 0) {
			void this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE_VOXTRAL_HELP,
				active: true,
			});
			void this.app.workspace.revealLeaf(leaf);
		}
	}

	// ── Status bar ──

	private updateStatusBar(
		state: "idle" | "recording" | "processing" | "paused" | "slot"
	): void {
		if (!this.statusBarEl) return;
		switch (state) {
			case "idle":
				this.statusBarEl.setText("");
				this.statusBarEl.removeClass(
					"voxtral-recording",
					"voxtral-processing",
					"voxtral-paused"
				);
				break;
			case "recording": {
				// If a slot is active, show slot status instead
				if (isSlotActive()) {
					const slot = getActiveSlot();
					const label = slot?.commandId ?? "slot";
					this.statusBarEl.setText(`● ${label} — type, then Enter`);
					this.statusBarEl.addClass("voxtral-recording");
					this.statusBarEl.removeClass("voxtral-processing", "voxtral-paused");
					break;
				}
				const mic = this.recorder.activeMicLabel;
				const short =
					mic.length > 25 ? mic.slice(0, 22) + "..." : mic;
				this.statusBarEl.setText(`● ${short}`);
				this.statusBarEl.addClass("voxtral-recording");
				this.statusBarEl.removeClass("voxtral-processing", "voxtral-paused");
				break;
			}
			case "slot": {
				const slot = getActiveSlot();
				const label = slot?.commandId ?? "slot";
				this.statusBarEl.setText(`● ${label} — type, then Enter`);
				this.statusBarEl.addClass("voxtral-recording");
				this.statusBarEl.removeClass("voxtral-processing", "voxtral-paused");
				break;
			}
			case "paused":
				this.statusBarEl.setText("⏸ paused");
				this.statusBarEl.addClass("voxtral-paused");
				this.statusBarEl.removeClass("voxtral-recording", "voxtral-processing");
				break;
			case "processing":
				this.statusBarEl.setText("⏳ processing...");
				this.statusBarEl.addClass("voxtral-processing");
				this.statusBarEl.removeClass("voxtral-recording", "voxtral-paused");
				break;
		}
	}
}
