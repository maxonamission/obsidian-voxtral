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
import { VoxtralSettings, getDefaultBuiltInCommands } from "./types";
import { migrateSettings } from "./settings-migration";
import { VoxtralSettingTab } from "./settings-tab";
import {
	VoxtralHelpView,
	VIEW_TYPE_VOXTRAL_HELP,
} from "./help-view";
import { AudioRecorder } from "./audio-recorder";
import {
	transcribeBatch,
	correctText,
	isLikelyHallucination,
} from "./mistral-api";
import {
	processText,
	matchCommand,
	setLanguage,
	setPreMatchHook,
	isSlotActive,
	getActiveSlot,
	closeSlot,
	cancelSlot,
	loadCustomCommands,
	loadCustomCommandTriggers,
} from "./voice-commands";
import {
	scanTemplates,
	matchTemplate,
	insertTemplate,
} from "./templates";
import { vlog, getLogText, getLogCount } from "./plugin-logger";
import { DictationTracker } from "./dictation-tracker";
import { RealtimeSession, type SessionCallbacks } from "./realtime-session";
import { DualDelaySession } from "./dual-delay-session";

export default class VoxtralPlugin extends Plugin {
	settings: VoxtralSettings;
	private recorder: AudioRecorder;
	private realtimeSession: RealtimeSession | null = null;
	private dualDelaySession: DualDelaySession | null = null;
	private tracker = new DictationTracker();
	private isRecording = false;
	private isPaused = false;
	private isTypingMuted = false;
	private typingResumeTimer: ReturnType<typeof setTimeout> | null = null;
	private focusPauseTimer: ReturnType<typeof setTimeout> | null = null;
	private statusBarEl: HTMLElement | null = null;
	private sendRibbonEl: HTMLElement | null = null;
	private mobileActionEl: HTMLElement | null = null;
	private chunkIndex = 0;
	private consecutiveFailures = 0;
	private maxConsecutiveFailures = 5;
	private currentEditor: Editor | null = null;
	private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

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

	/** Callbacks shared by realtime and dual-delay sessions. */
	private get sessionCallbacks(): SessionCallbacks {
		return {
			updateStatusBar: (state) => this.updateStatusBar(state),
			stopRecording: () => { void this.stopRecording(); },
			isRecording: () => this.isRecording,
			getEditor: () =>
				this.currentEditor ||
				this.app.workspace.getActiveViewOfType(MarkdownView)?.editor ||
				null,
		};
	}

	async onload(): Promise<void> {
		await this.loadSettings();

		this.recorder = new AudioRecorder();

		// Register the help side panel view
		this.registerView(
			VIEW_TYPE_VOXTRAL_HELP,
			(leaf) => new VoxtralHelpView(leaf),
		);

		// Ribbon icon: toggle recording
		this.addRibbonIcon("mic", "Voxtral: start/stop recording", () => {
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
			name: "Correct dictated text",
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
		this.settings = migrateSettings(await this.loadData());
		// Seed built-in custom commands if none present
		const hasBuiltIn = this.settings.customCommands.some((c) => c.builtIn);
		if (!hasBuiltIn) {
			this.settings.customCommands = [
				...getDefaultBuiltInCommands(),
				...this.settings.customCommands,
			];
		}
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

	// ── Templates ──

	/** Scan templates folder and register the pre-match hook */
	private setupTemplates(): void {
		scanTemplates(this.app, this.settings.templatesFolder);

		// Pre-match hook handles user templates from the templates folder.
		// Built-in quick-templates (table, callout, etc.) are now regular
		// custom commands and go through the normal matchCommand() pipeline.
		setPreMatchHook((editor, normalizedText, rawText) => {
			const lang = this.settings.language;

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
				void insertTemplate(this.app, editor, tmplMatch.template);
				return true;
			}

			return false;
		});
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
			() => { void this.sendChunk(); },
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
					() => { void this.sendChunk(); },
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
					`Voxtral: App backgrounded, pausing in ${delaySec}s`,
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
		// ── Slot handling: Escape cancels; voice-exit slots let all keys through ──
		if (isSlotActive()) {
			const slot = getActiveSlot();
			if (e.key === "Escape") {
				e.preventDefault();
				cancelSlot();
				this.updateStatusBar("recording");
				return;
			}
			// Voice-exit slots: all keys (including Enter) pass through normally
			if (slot?.def.exitTrigger === "voice") {
				return;
			}
			// Legacy keyboard-exit slots (custom commands may still use these)
			const isEnterExit = slot?.def.exitTrigger === "enter" || slot?.def.exitTrigger === "enter-or-space";
			const isSpaceExit = slot?.def.exitTrigger === "space" || slot?.def.exitTrigger === "enter-or-space";
			if ((e.key === "Enter" && isEnterExit) || (e.key === " " && isSpaceExit)) {
				e.preventDefault();
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view) {
					closeSlot(view.editor);
					if (this.realtimeSession) {
						this.realtimeSession.flushAfterSlot(view.editor);
					}
					if (this.dualDelaySession) {
						this.dualDelaySession.flushAfterSlot(view.editor);
					}
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
						6000,
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
		this.tracker.reset();
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
					this.recorder.lastChunkDurationSec,
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
				const stopRequested = processText(editor, text);
				if (stopRequested) {
					await this.stopRecording();
					return;
				}
			}
		} catch (e) {
			vlog.error("Voxtral: Chunk transcription failed", e);
			this.updateStatusBar("recording");
			new Notice(`Chunk failed: ${e}`);
		}
	}

	// ── Realtime recording (delegates to session classes) ──

	private async startRealtimeRecording(editor: Editor): Promise<void> {
		this.tracker.reset();

		if (this.settings.dualDelay) {
			this.dualDelaySession = new DualDelaySession(
				this.settings,
				this.tracker,
				this.sessionCallbacks,
			);
			await this.dualDelaySession.start(editor);
		} else {
			this.realtimeSession = new RealtimeSession(
				this.settings,
				this.tracker,
				this.sessionCallbacks,
			);
			await this.realtimeSession.start(editor);
		}

		const deviceId = this.settings.microphoneDeviceId || undefined;
		await this.recorder.start(deviceId, (pcmData) => {
			if (this.dualDelaySession) {
				this.dualDelaySession.sendAudio(pcmData);
			} else if (this.realtimeSession) {
				this.realtimeSession.sendAudio(pcmData);
			}
		}, this.settings.noiseSuppression);
		if (this.recorder.fallbackUsed) {
			new Notice("Selected mic unavailable — using default");
		}
	}

	private async stopRealtimeRecording(): Promise<void> {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);

		if (this.dualDelaySession) {
			await this.dualDelaySession.stop();
			this.dualDelaySession = null;
		} else if (this.realtimeSession) {
			const editor = view?.editor;
			if (editor) {
				await this.realtimeSession.stop(editor);
			}
			this.realtimeSession = null;
		}

		await this.recorder.stop();

		if (this.settings.autoCorrect && view) {
			await this.tracker.autoCorrectAfterStop(view.editor, this.settings);
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
					this.recorder.lastChunkDurationSec,
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

	// ── Text correction ──

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
		if (!this.tracker.hasRanges()) {
			new Notice("No dictated text to correct");
			return;
		}

		if (!this.settings.apiKey) {
			new Notice("Please set your API key first");
			return;
		}

		try {
			new Notice("Correcting...");
			await this.tracker.autoCorrectAfterStop(editor, this.settings);
			new Notice("Dictated text corrected");
		} catch (e) {
			new Notice(`Correction failed: ${e}`);
		}
	}

	// ── Logs ──

	private async exportLogs(): Promise<void> {
		if (getLogCount() === 0) {
			new Notice("No logs to export");
			return;
		}
		await navigator.clipboard.writeText(getLogText());
		new Notice(`${getLogCount()} log entries copied to clipboard`);
	}

	// ── Help panel ──

	private async openHelpPanel(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(
			VIEW_TYPE_VOXTRAL_HELP,
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
		state: "idle" | "recording" | "processing" | "paused" | "slot",
	): void {
		if (!this.statusBarEl) return;
		switch (state) {
			case "idle":
				this.statusBarEl.setText("");
				this.statusBarEl.removeClass(
					"voxtral-recording",
					"voxtral-processing",
					"voxtral-paused",
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
