import {
	Editor,
	MarkdownView,
	Notice,
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
import { processText, matchCommand } from "./voice-commands";

export default class VoxtralPlugin extends Plugin {
	settings: VoxtralSettings;
	private recorder: AudioRecorder;
	private realtimeTranscriber: RealtimeTranscriber | null = null;
	private isRecording = false;
	private statusBarEl: HTMLElement | null = null;
	private pendingText = ""; // Buffer for realtime partial text

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

		// Status bar
		this.statusBarEl = this.addStatusBarItem();
		this.updateStatusBar("idle");

		// Commands
		this.addCommand({
			id: "toggle-recording",
			name: "Start/stop opname",
			callback: () => this.toggleRecording(),
			hotkeys: [{ modifiers: ["Ctrl"], key: " " }],
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
	}

	onunload(): void {
		if (this.isRecording) {
			this.stopRecording();
		}
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

		try {
			if (this.settings.mode === "realtime") {
				await this.startRealtimeRecording(editor);
			} else {
				await this.startBatchRecording();
			}
			this.isRecording = true;
			this.updateStatusBar("recording");
			new Notice("Voxtral: Opname gestart");
		} catch (e) {
			console.error("Voxtral: Failed to start recording", e);
			new Notice(`Voxtral: Kon opname niet starten: ${e}`);
			this.updateStatusBar("idle");
		}
	}

	private async stopRecording(): Promise<void> {
		this.isRecording = false;
		this.updateStatusBar("processing");

		try {
			if (this.settings.mode === "realtime") {
				await this.stopRealtimeRecording();
			} else {
				await this.stopBatchRecording();
			}
		} catch (e) {
			console.error("Voxtral: Failed to stop recording", e);
			new Notice(`Voxtral: Fout bij stoppen: ${e}`);
		}

		this.updateStatusBar("idle");
		new Notice("Voxtral: Opname gestopt");
	}

	// ── Realtime recording ──

	private async startRealtimeRecording(editor: Editor): Promise<void> {
		this.pendingText = "";

		this.realtimeTranscriber = new RealtimeTranscriber(this.settings, {
			onSessionCreated: () => {
				console.log("Voxtral: Realtime session created");
			},
			onDelta: (text) => {
				this.handleRealtimeDelta(editor, text);
			},
			onDone: (text) => {
				// Final transcript for this segment
				this.handleRealtimeDone(editor, text);
			},
			onError: (message) => {
				console.error("Voxtral: Realtime error:", message);
				new Notice(`Voxtral: Streaming fout: ${message}`);
			},
		});

		await this.realtimeTranscriber.connect();

		// Start audio capture, sending PCM chunks to WebSocket
		await this.recorder.start(
			undefined,
			(pcmData) => {
				this.realtimeTranscriber?.sendAudio(pcmData);
			},
			(level) => {
				this.updateLevelIndicator(level);
			}
		);
	}

	private handleRealtimeDelta(editor: Editor, text: string): void {
		// Accumulate text in the pending buffer
		this.pendingText += text;

		// Check for sentence-ending punctuation to process commands
		const sentenceEnd = /[.!?]\s*$/;
		if (sentenceEnd.test(this.pendingText)) {
			const sentence = this.pendingText.trim();
			this.pendingText = "";

			// Check for "stop recording" command
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
		// Flush any remaining pending text
		if (this.pendingText.trim()) {
			processText(editor, this.pendingText.trim() + " ");
			this.pendingText = "";
		}
	}

	private async stopRealtimeRecording(): Promise<void> {
		// Signal end of audio
		this.realtimeTranscriber?.endAudio();

		// Wait a moment for final transcription to arrive
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Flush remaining text
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view && this.pendingText.trim()) {
			processText(view.editor, this.pendingText.trim());
			this.pendingText = "";
		}

		this.realtimeTranscriber?.close();
		this.realtimeTranscriber = null;
		await this.recorder.stop();

		// Auto-correct if enabled
		if (this.settings.autoCorrect && view) {
			await this.autoCorrectAfterStop(view.editor);
		}
	}

	// ── Batch recording ──

	private async startBatchRecording(): Promise<void> {
		await this.recorder.start(undefined, undefined, (level) => {
			this.updateLevelIndicator(level);
		});
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
		// Get the full note content and correct it
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

	// ── Status bar & level indicator ──

	private updateStatusBar(
		state: "idle" | "recording" | "processing"
	): void {
		if (!this.statusBarEl) return;
		switch (state) {
			case "idle":
				this.statusBarEl.setText("");
				this.statusBarEl.removeClass(
					"voxtral-recording",
					"voxtral-processing"
				);
				break;
			case "recording":
				this.statusBarEl.setText("● Opname");
				this.statusBarEl.addClass("voxtral-recording");
				this.statusBarEl.removeClass("voxtral-processing");
				break;
			case "processing":
				this.statusBarEl.setText("⏳ Verwerken...");
				this.statusBarEl.addClass("voxtral-processing");
				this.statusBarEl.removeClass("voxtral-recording");
				break;
		}
	}

	private updateLevelIndicator(level: number): void {
		if (!this.statusBarEl || !this.isRecording) return;
		// Simple text-based level indicator
		const bars = Math.round(level * 5);
		const indicator = "█".repeat(bars) + "░".repeat(5 - bars);
		this.statusBarEl.setText(`● Opname ${indicator}`);
	}
}
