// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe
import { App, Modal, Platform, PluginSettingTab, Setting } from "obsidian";
import type VoxtralPlugin from "./main";
import { AudioRecorder } from "./audio-recorder";
import { listModels } from "./mistral-api";
import type { MistralModel, } from "./mistral-api";
import type { FocusBehavior, CustomCommand } from "./types";
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES } from "./lang";

export class VoxtralSettingTab extends PluginSettingTab {
	plugin: VoxtralPlugin;
	private cachedModels: MistralModel[] | null = null;

	constructor(app: App, plugin: VoxtralPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		;

		new Setting(containerEl)
			.setName("Mistral API key")
			.setDesc("Your API key from platform.mistral.ai. Stored in Obsidian\u2019s plugin data folder (data.json), unencrypted. Do not share your data.json file.")
			.addText((text) =>
				text
					.setPlaceholder("Enter your API key")
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
			}).catch((err) => {
				console.error("Voxtral: Failed to enumerate microphones", err);
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
						this.display(); // re-render to update mode-dependent settings
					})
			);
		}

		// Enter-to-send (batch mode only)
		const isBatch = this.plugin.settings.mode === "batch" || Platform.isMobile;
		new Setting(containerEl)
			.setName("Enter = tap-to-send")
			.setDesc(
				isBatch
					? "In batch mode, pressing Enter sends the current audio chunk when the mic is live. " +
					  "While typing, Enter inserts a normal newline."
					: "Only available in batch mode. Switch to batch mode to change this setting."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(isBatch ? this.plugin.settings.enterToSend : false)
					.setDisabled(!isBatch)
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
			.setDesc("Language for transcription and voice commands")
			.addDropdown((dropdown) => {
				for (const code of SUPPORTED_LANGUAGES) {
					dropdown.addOption(code, `${LANGUAGE_NAMES[code]} (${code})`);
				}
				dropdown.setValue(this.plugin.settings.language);
				dropdown.onChange(async (value) => {
					this.plugin.settings.language = value;
					await this.plugin.saveSettings();
				});
			});

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
			.setName("Noise suppression")
			.setDesc(
				"Enable browser-level noise suppression, echo cancellation, and auto gain control. " +
				"Useful in noisy environments."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.noiseSuppression)
					.onChange(async (value) => {
						this.plugin.settings.noiseSuppression = value;
						await this.plugin.saveSettings();
					})
			);

		const isRealtime = !isBatch && !Platform.isMobile;

		new Setting(containerEl)
			.setName("Dual-delay mode")
			.setDesc(
				Platform.isMobile
					? "Not available on mobile (requires realtime streaming)."
					: !isRealtime
					? "Only available in realtime mode."
					: "Run two parallel streams: a fast one for immediate text and a slow one " +
					  "for higher accuracy and voice command detection. Overrides the streaming delay setting."
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.dualDelay)
					.setDisabled(!isRealtime)
					.onChange(async (value) => {
						this.plugin.settings.dualDelay = value;
						await this.plugin.saveSettings();
						this.display(); // re-render to show/hide delay settings
					});
			});

		if (isRealtime && !this.plugin.settings.dualDelay) {
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
		}

		// Hotkeys hint
		new Setting(containerEl).setName("Keyboard shortcuts").setHeading();

		new Setting(containerEl)
			.setName("Customize hotkeys")
			.setDesc(
				"You can assign keyboard shortcuts to all Voxtral commands " +
				"(start/stop recording, correct selection, correct note, etc.) " +
				"via Obsidian's Settings → Hotkeys. Search for \"Voxtral\"."
			)
			.addButton((btn) =>
				btn
					.setButtonText("Open hotkeys")
					.onClick(() => {
						// Open Obsidian's hotkey settings and pre-filter
						// @ts-expect-error Accessing internal Obsidian API for hotkey tab navigation
						const appSetting = this.app.setting;
						appSetting?.openTabById?.("hotkeys");
						const tab = appSetting?.activeTab;
						if (tab?.searchComponent) {
							tab.searchComponent.setValue("Voxtral");
							tab.updateHotkeyVisibility?.();
						}
					})
			);

		// Support
		new Setting(containerEl).setName("Support this project").setHeading();

		new Setting(containerEl)
			.setName("Buy me a coffee")
			.setDesc("Find this plugin useful? Consider a donation!")
			.addButton((btn) =>
				btn
					.setButtonText("Buy me a coffee")
					.onClick(() => {
						window.open("https://buymeacoffee.com/maxonamission");
					})
			);

		// Templates
		new Setting(containerEl).setName("Templates").setHeading();

		new Setting(containerEl)
			.setName("Templates folder")
			.setDesc(
				'Path to your templates folder (e.g. "Templates"). ' +
				'Say "template {name}" or "sjabloon {name}" to insert. Leave empty to disable.'
			)
			.addText((text) =>
				text
					.setPlaceholder("Templates")
					.setValue(this.plugin.settings.templatesFolder)
					.onChange(async (value) => {
						this.plugin.settings.templatesFolder = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Built-in quick-templates")
			.setDesc(
				'Say "tabel", "codeblok", "callout", "tip", or "waarschuwing" to insert ' +
				"common Markdown structures. Always active."
			);

		// Custom voice commands
		new Setting(containerEl).setName("Custom voice commands").setHeading();
		this.renderCustomCommands(containerEl);

		// Advanced settings
		new Setting(containerEl).setName("Advanced").setHeading();

		// Filter helpers based on model capabilities
		const isTranscriptionModel = (m: MistralModel) =>
			!!m.capabilities?.audio_transcription;
		const isTextChatModel = (m: MistralModel) =>
			!!m.capabilities?.completion_chat &&
			!m.capabilities?.audio_transcription &&
			!m.id.startsWith("voxtral");

		this.addModelDropdown(
			containerEl,
			"Realtime model",
			"Model for real-time streaming transcription",
			this.plugin.settings.realtimeModel,
			async (value) => {
				this.plugin.settings.realtimeModel = value.trim();
				await this.plugin.saveSettings();
			},
			isTranscriptionModel
		);

		this.addModelDropdown(
			containerEl,
			"Batch model",
			"Model for batch transcription",
			this.plugin.settings.batchModel,
			async (value) => {
				this.plugin.settings.batchModel = value.trim();
				await this.plugin.saveSettings();
			},
			isTranscriptionModel
		);

		this.addModelDropdown(
			containerEl,
			"Correction model",
			"Model for text correction",
			this.plugin.settings.correctModel,
			async (value) => {
				this.plugin.settings.correctModel = value.trim();
				await this.plugin.saveSettings();
			},
			isTextChatModel
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
					textarea.classList.add("voxtral-textarea-full");
				}
			});
	}

	private renderCustomCommands(containerEl: HTMLElement): void {
		const commands = this.plugin.settings.customCommands;
		const lang = this.plugin.settings.language;

		// Existing commands
		for (let i = 0; i < commands.length; i++) {
			const cmd = commands[i];
			const triggers = cmd.triggers[lang] ?? cmd.triggers["en"] ?? [];
			const typeLabel = cmd.type === "slot"
				? `${cmd.slotPrefix ?? ""}…${cmd.slotSuffix ?? ""}`
				: (cmd.insertText ?? "").replace(/\n/g, "↵").slice(0, 30);

			new Setting(containerEl)
				.setName(triggers.join(", ") || cmd.id)
				.setDesc(`${cmd.type === "slot" ? "Slot" : "Insert"}: ${typeLabel}`)
				.addButton((btn) =>
					btn
						.setButtonText("Edit")
						.onClick(() => {
							this.openCommandEditor(cmd, i);
						})
				)
				.addButton((btn) =>
					btn
						.setButtonText("Delete")
						.setWarning()
						.onClick(async () => {
							commands.splice(i, 1);
							await this.plugin.saveSettings();
							this.display();
						})
				);
		}

		// Add new command button
		new Setting(containerEl)
			.setDesc("Add a custom voice command for inserting text or opening a slot")
			.addButton((btn) =>
				btn
					.setButtonText("Add command")
					.setCta()
					.onClick(() => {
						const newCmd: CustomCommand = {
							id: `custom-${Date.now()}`,
							triggers: { [lang]: [""] },
							type: "insert",
							insertText: "",
						};
						commands.push(newCmd);
						this.openCommandEditor(newCmd, commands.length - 1);
					})
			);
	}

	private openCommandEditor(cmd: CustomCommand, index: number): void {
		const { plugin } = this;
		const redisplay = () => this.display();
		const lang = this.plugin.settings.language;

		let removeVVListener: (() => void) | undefined;
		const editorModal = new (class extends Modal {
			onOpen(): void {
				const { contentEl } = this;

				// Make the modal scrollable on mobile where the keyboard
				// covers the bottom half of the screen
				this.containerEl.addClass("voxtral-cmd-editor-overlay");
				this.modalEl.addClass("voxtral-cmd-editor-modal");

				// On mobile, use visualViewport to resize modal when
				// the on-screen keyboard appears/disappears
				if (Platform.isMobile && window.visualViewport) {
					const vv = window.visualViewport;
					const adjustHeight = () => {
						this.modalEl.style.maxHeight = `${vv.height - 32}px`;
					};
					adjustHeight();
					vv.addEventListener("resize", adjustHeight);
					removeVVListener = () => vv.removeEventListener("resize", adjustHeight);
				}

				// Prevent input events from leaking to the settings page
				// behind the modal (fixes mobile keyboard going to API key field)
				const stopLeak = (e: Event) => e.stopPropagation();
				contentEl.addEventListener("input", stopLeak, true);
				contentEl.addEventListener("keydown", stopLeak, true);
				contentEl.addEventListener("keyup", stopLeak, true);
				contentEl.addEventListener("keypress", stopLeak, true);

				// Title
				new Setting(contentEl).setName("Custom voice command").setHeading();

				// Trigger phrases
				let triggerInput: HTMLInputElement;
				new Setting(contentEl)
					.setName("Trigger phrases (comma-separated)")
					.addText((text) => {
						triggerInput = text.inputEl;
						text.setValue((cmd.triggers[lang] ?? []).join(", "));
					});

				// Type selector
				let typeValue = cmd.type;
				new Setting(contentEl)
					.setName("Type")
					.addDropdown((drop) => {
						drop.addOption("insert", "Insert text");
						drop.addOption("slot", "Slot (type between prefix/suffix)");
						drop.setValue(cmd.type);
						drop.onChange((value) => {
							typeValue = value as "insert" | "slot";
							updateVisibility();
						});
					});

				// Insert text field
				const insertContainer = contentEl.createDiv();
				let insertInput: HTMLInputElement;
				new Setting(insertContainer)
					.setName("Text to insert")
					.setDesc("Use \\n for newline")
					.addText((text) => {
						insertInput = text.inputEl;
						text.setValue((cmd.insertText ?? "").replace(/\n/g, "\\n"));
					});

				// Slot fields
				const slotContainer = contentEl.createDiv();
				let prefixInput: HTMLInputElement;
				let suffixInput: HTMLInputElement;
				let exitValue = cmd.slotExit ?? "enter";

				new Setting(slotContainer)
					.setName("Prefix (e.g. [[ or **)")
					.addText((text) => {
						prefixInput = text.inputEl;
						text.setValue(cmd.slotPrefix ?? "");
					});

				new Setting(slotContainer)
					.setName("Suffix (e.g. ]] or **)")
					.addText((text) => {
						suffixInput = text.inputEl;
						text.setValue(cmd.slotSuffix ?? "");
					});

				new Setting(slotContainer)
					.setName("Close slot on")
					.addDropdown((drop) => {
						drop.addOption("enter", "Enter");
						drop.addOption("space", "Space");
						drop.addOption("enter-or-space", "Enter or space");
						drop.setValue(exitValue);
						drop.onChange((value) => {
							exitValue = value as "enter" | "space" | "enter-or-space";
						});
					});

				// Show/hide based on type
				const updateVisibility = () => {
					insertContainer.toggle(typeValue === "insert");
					slotContainer.toggle(typeValue === "slot");
				};
				updateVisibility();

				// Auto-focus the trigger input (helps mobile keyboard target)
				if (Platform.isMobile) {
					setTimeout(() => triggerInput?.focus(), 100);
				}

				// Buttons
				new Setting(contentEl)
					.addButton((btn) =>
						btn.setButtonText("Cancel").onClick(() => {
							this.close();
						})
					)
					.addButton((btn) =>
						btn
							.setButtonText("Save")
							.setCta()
							.onClick(() => {
								// Parse triggers
								const triggers = triggerInput.value
									.split(",")
									.map((t: string) => t.trim())
									.filter((t: string) => t.length > 0);
								if (triggers.length === 0) {
									triggerInput.classList.add("voxtral-cmd-error");
									return;
								}

								cmd.triggers[lang] = triggers;
								cmd.type = typeValue;

								if (cmd.type === "insert") {
									cmd.insertText = insertInput.value.replace(/\\n/g, "\n");
									cmd.slotPrefix = undefined;
									cmd.slotSuffix = undefined;
									cmd.slotExit = undefined;
								} else {
									cmd.slotPrefix = prefixInput.value;
									cmd.slotSuffix = suffixInput.value;
									cmd.slotExit = exitValue;
									cmd.insertText = undefined;
								}

								plugin.settings.customCommands[index] = cmd;
								void plugin.saveSettings();
								this.close();
								redisplay();
							})
					);
			}

			onClose(): void {
				removeVVListener?.();
				this.contentEl.empty();
			}
		})(this.app);

		editorModal.open();
	}

	/**
	 * Add a model dropdown that fetches options from the Mistral API.
	 * Falls back to a text field if no API key is set or the fetch fails.
	 * The current value is always shown, even if not in the fetched list.
	 */
	private addModelDropdown(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		currentValue: string,
		onChange: (value: string) => Promise<void>,
		filter?: (model: MistralModel) => boolean
	): void {
		const setting = new Setting(containerEl).setName(name).setDesc(desc);

		setting.addDropdown((drop) => {
			// Always include the current value so it's visible immediately
			if (currentValue) {
				drop.addOption(currentValue, currentValue);
			}
			drop.setValue(currentValue);

			drop.onChange(async (value) => {
				await onChange(value);
			});

			// Fetch models async and populate
			this.getModels().then((models) => {
				if (models.length === 0) return;

				// Apply capability filter if provided
				const filtered = filter ? models.filter(filter) : models;

				// Clear and repopulate
				const selectEl = drop.selectEl;
				selectEl.empty();

				// Add all models, marking current value if present
				const ids = filtered.map((m) => m.id);
				if (currentValue && !ids.includes(currentValue)) {
					drop.addOption(currentValue, `${currentValue} (current)`);
				}
				for (const model of filtered) {
					drop.addOption(model.id, model.id);
				}
				drop.setValue(currentValue);
			}).catch((err) => {
				console.error("Voxtral: Failed to fetch models", err);
			});
		});
	}

	private async getModels(): Promise<MistralModel[]> {
		if (this.cachedModels) return this.cachedModels;

		const models = await listModels(this.plugin.settings.apiKey);
		if (models.length > 0) {
			this.cachedModels = models;
		}
		return models;
	}
}
