import { App, Platform, PluginSettingTab, Setting } from "obsidian";
import type VoxtralPlugin from "./main";
import { AudioRecorder } from "./audio-recorder";
import type { FocusBehavior } from "./types";

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
			.setDesc("Your API key from platform.mistral.ai")
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
			.setName("Microphone")
			.setDesc("Select which microphone to use");

		micSetting.addDropdown((drop) => {
			drop.addOption("", "System default");
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
			? "Only batch mode is available on mobile. Use tap-to-send to submit chunks while you keep talking."
			: "Realtime: text appears as you speak. Batch: audio is transcribed after you stop recording.";

		const modeSetting = new Setting(containerEl)
			.setName("Mode")
			.setDesc(modeDesc);

		if (Platform.isMobile) {
			modeSetting.addDropdown((drop) =>
				drop
					.addOption("batch", "Batch (after recording)")
					.setValue("batch")
					.setDisabled(true)
			);
		} else {
			modeSetting.addDropdown((drop) =>
				drop
					.addOption("realtime", "Realtime (streaming)")
					.addOption("batch", "Batch (after recording)")
					.setValue(this.plugin.settings.mode)
					.onChange(async (value) => {
						this.plugin.settings.mode = value as
							| "realtime"
							| "batch";
						await this.plugin.saveSettings();
					})
			);
		}

		// Enter-to-send (batch mode)
		new Setting(containerEl)
			.setName("Enter = tap-to-send")
			.setDesc(
				"In batch mode, pressing Enter sends the current audio chunk when the mic is live. " +
				"While typing, Enter inserts a normal newline."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enterToSend)
					.onChange(async (value) => {
						this.plugin.settings.enterToSend = value;
						await this.plugin.saveSettings();
					})
			);

		// Typing cooldown
		new Setting(containerEl)
			.setName("Typing cooldown")
			.setDesc(
				"How long after you stop typing before the mic unmutes again"
			)
			.addDropdown((drop) => {
				const options: Record<string, string> = {
					"400": "400 ms (fast)",
					"800": "800 ms (default)",
					"1200": "1.2 sec",
					"1500": "1.5 sec",
					"2000": "2 sec",
					"3000": "3 sec",
				};
				for (const [value, label] of Object.entries(options)) {
					drop.addOption(value, label);
				}
				drop.setValue(
					String(this.plugin.settings.typingCooldownMs)
				).onChange(async (value) => {
					this.plugin.settings.typingCooldownMs = Number(value);
					await this.plugin.saveSettings();
				});
			});

		// Focus behavior
		new Setting(containerEl)
			.setName("On focus loss")
			.setDesc(
				"What should happen when you switch apps while recording?"
			)
			.addDropdown((drop) => {
				drop.addOption("pause", "Pause immediately");
				drop.addOption(
					"pause-after-delay",
					"Pause after delay"
				);
				drop.addOption("keep-recording", "Keep recording");
				drop.setValue(this.plugin.settings.focusBehavior).onChange(
					async (value) => {
						this.plugin.settings.focusBehavior =
							value as FocusBehavior;
						await this.plugin.saveSettings();
						// Re-render to show/hide delay setting
						this.display();
					}
				);
			});

		if (this.plugin.settings.focusBehavior === "pause-after-delay") {
			new Setting(containerEl)
				.setName("Pause delay (seconds)")
				.setDesc(
					"How long to wait in the background before pausing the recording"
				)
				.addDropdown((drop) => {
					const options: Record<string, string> = {
						"10": "10 sec",
						"30": "30 sec (default)",
						"60": "1 minute",
						"120": "2 minutes",
						"300": "5 minutes",
					};
					for (const [value, label] of Object.entries(options)) {
						drop.addOption(value, label);
					}
					drop.setValue(
						String(this.plugin.settings.focusPauseDelaySec)
					).onChange(async (value) => {
						this.plugin.settings.focusPauseDelaySec =
							Number(value);
						await this.plugin.saveSettings();
					});
				});
		}

		new Setting(containerEl)
			.setName("Language")
			.setDesc("Language for transcription (ISO 639-1 code, e.g. 'en', 'nl', 'de')")
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
			.setName("Auto-correct")
			.setDesc(
				"Automatically correct spelling, capitalization, and punctuation after recording"
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
			.setName("Streaming delay")
			.setDesc(
				"Delay in ms for realtime mode. Lower = faster but less accurate."
			)
			.addDropdown((drop) => {
				const options: Record<string, string> = {
					"240": "240 ms (fastest)",
					"480": "480 ms (default)",
					"640": "640 ms",
					"800": "800 ms",
					"1200": "1200 ms",
					"1600": "1600 ms",
					"2400": "2400 ms (most accurate)",
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
		containerEl.createEl("h3", { text: "Support this project" });

		new Setting(containerEl)
			.setName("Buy Me a Coffee")
			.setDesc("Find this plugin useful? Consider a donation!")
			.addButton((btn) =>
				btn
					.setButtonText("Buy Me a Coffee")
					.onClick(() => {
						window.open("https://buymeacoffee.com/maxonamission");
					})
			);

		// Advanced settings
		containerEl.createEl("h3", { text: "Advanced" });

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
			.setName("Correction model")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.correctModel)
					.onChange(async (value) => {
						this.plugin.settings.correctModel = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Correction system prompt")
			.setDesc("Leave empty to use the default prompt")
			.addTextArea((text) =>
				text
					.setPlaceholder("Default correction prompt will be used...")
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
