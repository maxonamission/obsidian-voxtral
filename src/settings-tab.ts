import { App, Platform, PluginSettingTab, Setting } from "obsidian";
import type VoxtralPlugin from "./main";
import { AudioRecorder } from "./audio-recorder";

export class VoxtralSettingTab extends PluginSettingTab {
	plugin: VoxtralPlugin;

	constructor(app: App, plugin: VoxtralPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Voxtral Transcribe" });

		new Setting(containerEl)
			.setName("Mistral API key")
			.setDesc("Je API key van platform.mistral.ai")
			.addText((text) =>
				text
					.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
					})
			)
			.then((setting) => {
				const input = setting.controlEl.querySelector("input");
				if (input) input.type = "password";
			});

		// Microphone selection
		const micSetting = new Setting(containerEl)
			.setName("Microfoon")
			.setDesc("Selecteer welke microfoon je wilt gebruiken");

		micSetting.addDropdown((drop) => {
			drop.addOption("", "Standaard systeemmicrofoon");
			drop.setValue(this.plugin.settings.microphoneDeviceId);

			// Populate async
			AudioRecorder.enumerateMicrophones().then((mics) => {
				for (const mic of mics) {
					drop.addOption(mic.deviceId, mic.label);
				}
				drop.setValue(this.plugin.settings.microphoneDeviceId);
			});

			drop.onChange(async (value) => {
				this.plugin.settings.microphoneDeviceId = value;
				await this.plugin.saveSettings();
			});
		});

		const modeDesc = Platform.isMobile
			? "Op mobiel is alleen batch modus beschikbaar. Gebruik tap-to-send (▶ knop) om chunks te verzenden terwijl je praat."
			: "Realtime: tekst verschijnt terwijl je praat. Batch: opname wordt achteraf getranscribeerd.";

		const modeSetting = new Setting(containerEl)
			.setName("Modus")
			.setDesc(modeDesc);

		if (Platform.isMobile) {
			modeSetting.addDropdown((drop) =>
				drop
					.addOption("batch", "Batch (na opname)")
					.setValue("batch")
					.setDisabled(true)
			);
		} else {
			modeSetting.addDropdown((drop) =>
				drop
					.addOption("realtime", "Realtime (streaming)")
					.addOption("batch", "Batch (na opname)")
					.setValue(this.plugin.settings.mode)
					.onChange(async (value) => {
						this.plugin.settings.mode = value as
							| "realtime"
							| "batch";
						await this.plugin.saveSettings();
					})
			);
		}

		new Setting(containerEl)
			.setName("Taal")
			.setDesc("Taal voor batch-transcriptie (ISO 639-1)")
			.addText((text) =>
				text
					.setPlaceholder("nl")
					.setValue(this.plugin.settings.language)
					.onChange(async (value) => {
						this.plugin.settings.language = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Automatische correctie")
			.setDesc(
				"Corrigeer spelling, hoofdletters en leestekens na het stoppen van de opname"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoCorrect)
					.onChange(async (value) => {
						this.plugin.settings.autoCorrect = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Streaming vertraging")
			.setDesc(
				"Vertraging in ms voor realtime modus. Lager = sneller maar minder nauwkeurig."
			)
			.addDropdown((drop) => {
				const options: Record<string, string> = {
					"240": "240 ms (snelst)",
					"480": "480 ms (standaard)",
					"640": "640 ms",
					"800": "800 ms",
					"1200": "1200 ms",
					"1600": "1600 ms",
					"2400": "2400 ms (nauwkeurigst)",
				};
				for (const [value, label] of Object.entries(options)) {
					drop.addOption(value, label);
				}
				drop.setValue(
					String(this.plugin.settings.streamingDelayMs)
				).onChange(async (value) => {
					this.plugin.settings.streamingDelayMs = Number(value);
					await this.plugin.saveSettings();
				});
			});

		// Support
		containerEl.createEl("h3", { text: "Steun dit project" });

		new Setting(containerEl)
			.setName("Buy Me a Coffee")
			.setDesc("Vind je deze plugin handig? Overweeg een donatie!")
			.addButton((btn) =>
				btn
					.setButtonText("☕ Buy Me a Coffee")
					.onClick(() => {
						window.open("https://buymeacoffee.com/maxonamission");
					})
			);

		// Advanced settings
		containerEl.createEl("h3", { text: "Geavanceerd" });

		new Setting(containerEl)
			.setName("Realtime model")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.realtimeModel)
					.onChange(async (value) => {
						this.plugin.settings.realtimeModel = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Batch model")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.batchModel)
					.onChange(async (value) => {
						this.plugin.settings.batchModel = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Correctie model")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.correctModel)
					.onChange(async (value) => {
						this.plugin.settings.correctModel = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Correctie systeemprompt")
			.setDesc("Laat leeg voor de standaardprompt")
			.addTextArea((text) =>
				text
					.setPlaceholder("Standaard correctieprompt wordt gebruikt...")
					.setValue(this.plugin.settings.systemPrompt)
					.onChange(async (value) => {
						this.plugin.settings.systemPrompt = value;
						await this.plugin.saveSettings();
					})
			)
			.then((setting) => {
				const textarea = setting.controlEl.querySelector("textarea");
				if (textarea) {
					textarea.rows = 6;
					textarea.style.width = "100%";
				}
			});
	}
}
