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
} from "./mistral-api";
import { processText } from "./voice-commands";

/** Check if Node.js APIs are available (desktop Electron only) */
function hasNodeJs(): boolean {
	try {
		require("https");
		return true;
	} catch {
		return false;
	}
}

export default class VoxtralPlugin extends Plugin {
	settings: VoxtralSettings;
	private recorder: AudioRecorder;
	private realtimeTranscriber: RealtimeTranscriber | null = null;
	private isRecording = false;
	private statusBarEl: HTMLElement | null = null;
	private sendRibbonEl: HTMLElement | null = null;
	private pendingText = "";
	private chunkIndex = 0;
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private currentEditor: Editor | null = null;

	/** Whether realtime mode is available on this platform */
	get canRealtime(): boolean {
		return !Platform.isMobile && hasNodeJs();
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
		this.addRibbonIcon("mic", "Voxtral: Start/stop opname", () => {
			this.toggleRecording();
		});

		// Status bar (desktop only)
		if (!Platform.isMobile) {
			this.statusBarEl = this.addStatusBarItem();
			this.updateStatusBar("idle");
		}

		// Commands
		this.addCommand({
			id: "toggle-recording",
			name: "Start/stop opname",
			callback: () => this.toggleRecording(),
			hotkeys: [{ modifiers: ["Ctrl"], key: " " }],
		});

		this.addCommand({
			id: "send-chunk",
			name: "Verzend audio chunk (tap-to-send)",
			callback: () => this.sendChunk(),
		});

		this.addCommand({
			id: "open-help-panel",
			name: "Toon stemcommando's (zijpaneel)",
			callback: () => this.openHelpPanel(),
		});

		this.addCommand({
			id: "correct-selection",
			name: "Corrigeer geselecteerde tekst",
			editorCallback: (editor: Editor) => this.correctSelection(editor),
		});

		this.addCommand({
			id: "correct-all",
			name: "Corrigeer hele notitie",
			editorCallback: (editor: Editor) => this.correctAll(editor),
		});

		// Settings tab
		this.addSettingTab(new VoxtralSettingTab(this.app, this));

		// Show mobile notice on first load
		if (Platform.isMobile && this.settings.mode === "realtime") {
			new Notice(
				"Voxtral: Realtime modus is niet beschikbaar op mobiel. " +
					"Batch modus wordt gebruikt. Tik op ▶ om audio te verzenden.",
				8000
			);
		}
	}

	onunload(): void {
		if (this.isRecording) {
			this.stopRecording();
		}
		this.removeSendButton();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	// ── Send button (shown during batch recording) ──

	private addSendButton(): void {
		this.removeSendButton();
		this.sendRibbonEl = this.addRibbonIcon(
			"send",
			"Voxtral: Verzend chunk",
			() => this.sendChunk()
		);
		this.sendRibbonEl.addClass("voxtral-send-button");
	}

	private removeSendButton(): void {
		if (this.sendRibbonEl) {
			this.sendRibbonEl.remove();
			this.sendRibbonEl = null;
		}
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
			new Notice(
				"Voxtral: Stel eerst je Mistral API key in via de instellingen."
			);
			return;
		}

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice("Voxtral: Open eerst een notitie om in te dicteren.");
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
			this.reconnectAttempts = 0;
			this.updateStatusBar("recording");

			// Show which microphone is active
			const micName = this.recorder.activeMicLabel;
			new Notice(`Voxtral: Opname gestart (${micName})`);
		} catch (e) {
			console.error("Voxtral: Failed to start recording", e);
			new Notice(`Voxtral: Kon opname niet starten: ${e}`);
			this.updateStatusBar("idle");
		}
	}

	private async stopRecording(): Promise<void> {
		this.isRecording = false;
		this.updateStatusBar("processing");
		this.removeSendButton();

		try {
			if (this.effectiveMode === "realtime") {
				await this.stopRealtimeRecording();
			} else {
				await this.stopBatchRecording();
			}
		} catch (e) {
			console.error("Voxtral: Failed to stop recording", e);
			new Notice(`Voxtral: Fout bij stoppen: ${e}`);
		}

		this.currentEditor = null;
		this.updateStatusBar("idle");
		new Notice("Voxtral: Opname gestopt");
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
			new Notice(`Voxtral: Chunk ${this.chunkIndex} verzenden...`);
			const blob = await this.recorder.flushChunk();

			if (blob.size === 0) {
				new Notice("Voxtral: Geen audio in chunk");
				return;
			}

			let text = await transcribeBatch(blob, this.settings);

			if (this.settings.autoCorrect && text) {
				text = await correctText(text, this.settings);
			}

			if (text) {
				processText(editor, text);
				new Notice(`Voxtral: Chunk ${this.chunkIndex} verwerkt`);
			}
		} catch (e) {
			console.error("Voxtral: Chunk transcription failed", e);
			new Notice(`Voxtral: Chunk mislukt: ${e}`);
		}
	}

	// ── Realtime recording ──

	private async startRealtimeRecording(editor: Editor): Promise<void> {
		this.pendingText = "";

		await this.connectRealtimeWebSocket(editor);

		const deviceId = this.settings.microphoneDeviceId || undefined;
		await this.recorder.start(deviceId, (pcmData) => {
			this.realtimeTranscriber?.sendAudio(pcmData);
		});
	}

	private async connectRealtimeWebSocket(editor: Editor): Promise<void> {
		this.realtimeTranscriber = new RealtimeTranscriber(this.settings, {
			onSessionCreated: () => {
				console.log("Voxtral: Realtime session created");
			},
			onDelta: (text) => {
				this.handleRealtimeDelta(editor, text);
			},
			onDone: (text) => {
				this.handleRealtimeDone(editor, text);
			},
			onError: (message) => {
				console.error("Voxtral: Realtime error:", message);
				new Notice(`Voxtral: Streaming fout: ${message}`);
			},
			onDisconnect: () => {
				this.handleRealtimeDisconnect();
			},
		});

		await this.realtimeTranscriber.connect();
	}

	/**
	 * Handle unexpected WebSocket disconnection during recording.
	 * Automatically reconnects up to maxReconnectAttempts times.
	 */
	private async handleRealtimeDisconnect(): Promise<void> {
		if (!this.isRecording) return; // User stopped, nothing to do

		this.reconnectAttempts++;
		if (this.reconnectAttempts > this.maxReconnectAttempts) {
			new Notice(
				"Voxtral: Verbinding verloren na meerdere pogingen. Opname gestopt.",
				6000
			);
			this.stopRecording();
			return;
		}

		const delay = Math.min(1000 * this.reconnectAttempts, 5000);
		console.log(
			`Voxtral: WebSocket disconnected, reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
		);
		this.updateStatusBar("reconnecting");
		new Notice(
			`Voxtral: Verbinding verbroken, opnieuw verbinden... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
		);

		await new Promise((resolve) => setTimeout(resolve, delay));

		if (!this.isRecording) return; // User may have stopped during wait

		const editor =
			this.currentEditor ||
			this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		if (!editor) {
			this.stopRecording();
			return;
		}

		try {
			await this.connectRealtimeWebSocket(editor);
			this.updateStatusBar("recording");
			new Notice("Voxtral: Verbinding hersteld");
			console.log("Voxtral: WebSocket reconnected successfully");
		} catch (e) {
			console.error("Voxtral: Reconnection failed", e);
			this.handleRealtimeDisconnect();
		}
	}

	private handleRealtimeDelta(editor: Editor, text: string): void {
		this.pendingText += text;

		// Flush on sentence-ending punctuation OR after accumulating enough text
		const sentenceEnd = /[.!?]\s*$/;
		const longEnough = this.pendingText.length > 120;

		if (sentenceEnd.test(this.pendingText) || longEnough) {
			const sentence = this.pendingText.trim();
			this.pendingText = "";

			const normalized = sentence.toLowerCase();
			if (
				normalized.includes("beeindig opname") ||
				normalized.includes("stop opname")
			) {
				this.stopRecording();
				return;
			}

			processText(editor, sentence + " ");
		}
	}

	private handleRealtimeDone(editor: Editor, _text: string): void {
		if (this.pendingText.trim()) {
			processText(editor, this.pendingText.trim() + " ");
			this.pendingText = "";
		}
	}

	private async stopRealtimeRecording(): Promise<void> {
		this.realtimeTranscriber?.endAudio();

		await new Promise((resolve) => setTimeout(resolve, 1000));

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view && this.pendingText.trim()) {
			processText(view.editor, this.pendingText.trim());
			this.pendingText = "";
		}

		this.realtimeTranscriber?.close();
		this.realtimeTranscriber = null;
		await this.recorder.stop();

		if (this.settings.autoCorrect && view) {
			await this.autoCorrectAfterStop(view.editor);
		}
	}

	// ── Batch recording ──

	private async startBatchRecording(): Promise<void> {
		const deviceId = this.settings.microphoneDeviceId || undefined;
		await this.recorder.start(deviceId);
	}

	private async stopBatchRecording(): Promise<void> {
		const blob = await this.recorder.stop();

		if (blob.size === 0) {
			new Notice("Voxtral: Geen audio opgenomen");
			return;
		}

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice("Voxtral: Geen actieve notitie gevonden");
			return;
		}

		const editor = view.editor;

		new Notice("Voxtral: Transcriptie bezig...");
		try {
			let text = await transcribeBatch(blob, this.settings);

			if (this.settings.autoCorrect && text) {
				new Notice("Voxtral: Correctie bezig...");
				text = await correctText(text, this.settings);
			}

			if (text) {
				processText(editor, text);
			}
		} catch (e) {
			console.error("Voxtral: Batch transcription failed", e);
			new Notice(`Voxtral: Transcriptie mislukt: ${e}`);
		}
	}

	// ── Text correction ──

	private async autoCorrectAfterStop(editor: Editor): Promise<void> {
		const text = editor.getValue();
		if (!text.trim()) return;

		try {
			new Notice("Voxtral: Correctie bezig...");
			const corrected = await correctText(text, this.settings);
			if (corrected && corrected !== text) {
				editor.setValue(corrected);
				new Notice("Voxtral: Tekst gecorrigeerd");
			}
		} catch (e) {
			console.error("Voxtral: Auto-correct failed", e);
		}
	}

	private async correctSelection(editor: Editor): Promise<void> {
		const selection = editor.getSelection();
		if (!selection) {
			new Notice("Voxtral: Selecteer eerst tekst om te corrigeren");
			return;
		}

		if (!this.settings.apiKey) {
			new Notice("Voxtral: Stel eerst je API key in");
			return;
		}

		try {
			new Notice("Voxtral: Correctie bezig...");
			const corrected = await correctText(selection, this.settings);
			if (corrected) {
				editor.replaceSelection(corrected);
				new Notice("Voxtral: Selectie gecorrigeerd");
			}
		} catch (e) {
			new Notice(`Voxtral: Correctie mislukt: ${e}`);
		}
	}

	private async correctAll(editor: Editor): Promise<void> {
		const text = editor.getValue();
		if (!text.trim()) {
			new Notice("Voxtral: Notitie is leeg");
			return;
		}

		if (!this.settings.apiKey) {
			new Notice("Voxtral: Stel eerst je API key in");
			return;
		}

		try {
			new Notice("Voxtral: Correctie bezig...");
			const corrected = await correctText(text, this.settings);
			if (corrected && corrected !== text) {
				editor.setValue(corrected);
				new Notice("Voxtral: Notitie gecorrigeerd");
			} else {
				new Notice("Voxtral: Geen correcties nodig");
			}
		} catch (e) {
			new Notice(`Voxtral: Correctie mislukt: ${e}`);
		}
	}

	// ── Help panel ──

	private async openHelpPanel(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(
			VIEW_TYPE_VOXTRAL_HELP
		);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE_VOXTRAL_HELP,
				active: true,
			});
			this.app.workspace.revealLeaf(leaf);
		}
	}

	// ── Status bar ──

	private updateStatusBar(
		state: "idle" | "recording" | "processing" | "reconnecting"
	): void {
		if (!this.statusBarEl) return;
		switch (state) {
			case "idle":
				this.statusBarEl.setText("");
				this.statusBarEl.removeClass(
					"voxtral-recording",
					"voxtral-processing",
					"voxtral-reconnecting"
				);
				break;
			case "recording": {
				const mic = this.recorder.activeMicLabel;
				const short =
					mic.length > 25 ? mic.slice(0, 22) + "..." : mic;
				this.statusBarEl.setText(`● ${short}`);
				this.statusBarEl.addClass("voxtral-recording");
				this.statusBarEl.removeClass(
					"voxtral-processing",
					"voxtral-reconnecting"
				);
				break;
			}
			case "processing":
				this.statusBarEl.setText("⏳ Verwerken...");
				this.statusBarEl.addClass("voxtral-processing");
				this.statusBarEl.removeClass(
					"voxtral-recording",
					"voxtral-reconnecting"
				);
				break;
			case "reconnecting":
				this.statusBarEl.setText("⟳ Verbinden...");
				this.statusBarEl.addClass("voxtral-reconnecting");
				this.statusBarEl.removeClass(
					"voxtral-recording",
					"voxtral-processing"
				);
				break;
		}
	}
}
