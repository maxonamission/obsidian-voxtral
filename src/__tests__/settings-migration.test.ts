import { describe, it, expect } from "vitest";
import { migrateSettings, CURRENT_VERSION } from "../settings-migration";
import { DEFAULT_SETTINGS } from "../types";

describe("migrateSettings", () => {
	it("returns defaults with current version for null data", () => {
		const result = migrateSettings(null);
		expect(result.settingsVersion).toBe(CURRENT_VERSION);
		expect(result.apiKey).toBe("");
		expect(result.language).toBe("nl");
	});

	it("returns defaults with current version for empty object", () => {
		const result = migrateSettings({});
		expect(result.settingsVersion).toBe(CURRENT_VERSION);
		expect(result.language).toBe("nl");
	});

	it("preserves existing settings and fills missing keys", () => {
		const result = migrateSettings({
			apiKey: "test-key",
			language: "en",
		});
		expect(result.apiKey).toBe("test-key");
		expect(result.language).toBe("en");
		expect(result.settingsVersion).toBe(CURRENT_VERSION);
		// Missing keys should get defaults
		expect(result.autoCorrect).toBe(DEFAULT_SETTINGS.autoCorrect);
		expect(result.mode).toBe(DEFAULT_SETTINGS.mode);
	});

	it("handles pre-migration data (no settingsVersion field)", () => {
		const result = migrateSettings({
			apiKey: "old-key",
			language: "nl",
			mode: "batch",
		});
		expect(result.settingsVersion).toBe(CURRENT_VERSION);
		expect(result.apiKey).toBe("old-key");
		expect(result.mode).toBe("batch");
	});

	it("preserves custom commands array", () => {
		const customCommands = [
			{
				id: "test-cmd",
				triggers: { nl: ["test"] },
				type: "insert",
				insertText: "hello",
			},
		];
		const result = migrateSettings({ customCommands });
		expect(result.customCommands).toEqual(customCommands);
	});

	it("preserves all non-default setting values", () => {
		const overrides = {
			apiKey: "my-key",
			language: "fr",
			realtimeModel: "custom-model",
			batchModel: "custom-batch",
			correctModel: "custom-correct",
			autoCorrect: false,
			streamingDelayMs: 999,
			dualDelay: true,
			dualDelayFastMs: 100,
			dualDelaySlowMs: 5000,
			systemPrompt: "custom prompt",
			mode: "batch" as const,
			microphoneDeviceId: "device-123",
			focusBehavior: "keep-recording" as const,
			focusPauseDelaySec: 60,
			dismissMobileBatchNotice: true,
			enterToSend: false,
			typingCooldownMs: 1500,
			noiseSuppression: true,
			customCommands: [],
			templatesFolder: "MyTemplates",
		};
		const result = migrateSettings(overrides);
		for (const [key, value] of Object.entries(overrides)) {
			expect((result as Record<string, unknown>)[key]).toEqual(value);
		}
		expect(result.settingsVersion).toBe(CURRENT_VERSION);
	});

	it("sets settingsVersion even if data already has a version", () => {
		const result = migrateSettings({ settingsVersion: 0 });
		expect(result.settingsVersion).toBe(CURRENT_VERSION);
	});

	it("handles non-numeric settingsVersion gracefully", () => {
		const result = migrateSettings({ settingsVersion: "broken" as unknown });
		expect(result.settingsVersion).toBe(CURRENT_VERSION);
	});

	it("CURRENT_VERSION matches DEFAULT_SETTINGS.settingsVersion", () => {
		expect(CURRENT_VERSION).toBe(DEFAULT_SETTINGS.settingsVersion);
	});
});
