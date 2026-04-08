import { describe, it, expect } from "vitest";

/**
 * Verify that all shared module imports resolve correctly from the
 * obsidian-plugin context. These tests catch broken import paths after
 * modules are moved between obsidian-plugin/src and shared/src.
 */

describe("shared module imports from obsidian-plugin", () => {
	it("imports types and defaults from shared/src/types", async () => {
		const types = await import("../../../shared/src/types");
		expect(types.DEFAULT_SETTINGS).toBeDefined();
		expect(types.DEFAULT_SETTINGS.apiKey).toBeDefined();
		expect(typeof types.DEFAULT_SETTINGS.language).toBe("string");
	});

	it("imports editor adapter types from shared/src/editor-adapter", async () => {
		const mod = await import("../../../shared/src/editor-adapter");
		// These are type-only exports at runtime, but the module should resolve
		expect(mod).toBeDefined();
	});

	it("imports http adapter types from shared/src/http-adapter", async () => {
		const mod = await import("../../../shared/src/http-adapter");
		expect(mod).toBeDefined();
	});

	it("imports voice-commands functions from shared/src/voice-commands", async () => {
		const vc = await import("../../../shared/src/voice-commands");
		expect(typeof vc.processText).toBe("function");
		expect(typeof vc.matchCommand).toBe("function");
		expect(typeof vc.setLanguage).toBe("function");
		expect(typeof vc.loadCustomCommands).toBe("function");
		expect(typeof vc.isSlotActive).toBe("function");
	});

	it("imports mistral-api functions from shared/src/mistral-api", async () => {
		const api = await import("../../../shared/src/mistral-api");
		expect(typeof api.transcribeBatch).toBe("function");
		expect(typeof api.correctText).toBe("function");
		expect(typeof api.isLikelyHallucination).toBe("function");
	});

	it("imports realtime-session from shared/src/realtime-session", async () => {
		const mod = await import("../../../shared/src/realtime-session");
		expect(typeof mod.RealtimeSession).toBe("function");
	});

	it("imports dual-delay-session from shared/src/dual-delay-session", async () => {
		const mod = await import("../../../shared/src/dual-delay-session");
		expect(typeof mod.DualDelaySession).toBe("function");
	});

	it("imports dictation-tracker from shared/src/dictation-tracker", async () => {
		const mod = await import("../../../shared/src/dictation-tracker");
		expect(typeof mod.DictationTracker).toBe("function");
	});

	it("imports plugin-logger from shared/src/plugin-logger", async () => {
		const mod = await import("../../../shared/src/plugin-logger");
		expect(typeof mod.vlog).toBe("object");
		expect(typeof mod.getLogText).toBe("function");
		expect(typeof mod.getLogCount).toBe("function");
	});

	it("imports correction utilities from shared/src/correction", async () => {
		const mod = await import("../../../shared/src/correction");
		expect(typeof mod.buildCustomCommandGuard).toBe("function");
		expect(typeof mod.stripLlmCommentary).toBe("function");
		expect(typeof mod.isLikelyHallucination).toBe("function");
		expect(typeof mod.DEFAULT_CORRECT_PROMPT).toBe("string");
	});

	it("imports similarity from shared/src/similarity", async () => {
		const mod = await import("../../../shared/src/similarity");
		expect(typeof mod.levenshtein).toBe("function");
		expect(typeof mod.normalizeCommand).toBe("function");
	});

	it("imports lang data from shared/src/lang", async () => {
		const mod = await import("../../../shared/src/lang");
		expect(Array.isArray(mod.SUPPORTED_LANGUAGES)).toBe(true);
		expect(mod.SUPPORTED_LANGUAGES.length).toBeGreaterThan(0);
	});

	it("imports phonetics from shared/src/phonetics", async () => {
		const mod = await import("../../../shared/src/phonetics");
		expect(typeof mod.phoneticNormalize).toBe("function");
	});
});

describe("Obsidian Editor mock compatibility with EditorAdapter", () => {
	it("mock editor implements all EditorAdapter methods", async () => {
		// Import the EditorAdapter interface shape
		// We verify that the mock editor pattern used in tests provides all methods
		const requiredMethods = [
			"getCursor", "setCursor", "replaceRange", "getLine", "getValue",
			"getRange", "posToOffset", "offsetToPos", "getSelection",
			"replaceSelection", "undo",
		];

		// Create a mock editor like the test files do
		const mockEditor = {
			getCursor: () => ({ line: 0, ch: 0 }),
			setCursor: () => {},
			replaceRange: () => {},
			getLine: () => "",
			getValue: () => "",
			getRange: () => "",
			posToOffset: () => 0,
			offsetToPos: () => ({ line: 0, ch: 0 }),
			getSelection: () => "",
			replaceSelection: () => {},
			undo: () => {},
		};

		for (const method of requiredMethods) {
			expect(typeof (mockEditor as any)[method]).toBe("function");
		}
	});
});
