import { describe, it, expect, vi } from "vitest";
import { buildCustomCommandGuard } from "../../../shared/src/mistral-api";
import { DEFAULT_SETTINGS, type VoxtralSettings } from "../types";

function settingsWithCommands(
	commands: VoxtralSettings["customCommands"],
): VoxtralSettings {
	return { ...DEFAULT_SETTINGS, customCommands: commands };
}

describe("buildCustomCommandGuard", () => {
	it("returns empty string when no custom commands exist", () => {
		expect(buildCustomCommandGuard(DEFAULT_SETTINGS)).toBe("");
	});

	it("returns empty string when customCommands is empty array", () => {
		expect(buildCustomCommandGuard(settingsWithCommands([]))).toBe("");
	});

	it("includes insertText markers in the guard", () => {
		const settings = settingsWithCommands([
			{
				id: "review-comment",
				triggers: { en: ["review comment"] },
				type: "insert",
				insertText: ">> ",
			},
		]);
		const guard = buildCustomCommandGuard(settings);
		expect(guard).toContain('">>"');
		expect(guard).toContain("DO NOT REMOVE");
	});

	it("includes slotPrefix and slotSuffix markers", () => {
		const settings = settingsWithCommands([
			{
				id: "emphasis",
				triggers: { en: ["emphasis"] },
				type: "slot",
				slotPrefix: "**",
				slotSuffix: "**",
			},
		]);
		const guard = buildCustomCommandGuard(settings);
		expect(guard).toContain('"**"');
	});

	it("deduplicates identical markers", () => {
		const settings = settingsWithCommands([
			{
				id: "bold",
				triggers: { en: ["bold"] },
				type: "slot",
				slotPrefix: "**",
				slotSuffix: "**",
			},
		]);
		const guard = buildCustomCommandGuard(settings);
		// "**" should appear only once (deduplicated)
		const matches = guard.match(/"\*\*"/g);
		expect(matches).toHaveLength(1);
	});

	it("handles multiple custom commands", () => {
		const settings = settingsWithCommands([
			{
				id: "review",
				triggers: { en: ["review"] },
				type: "insert",
				insertText: ">> ",
			},
			{
				id: "callout",
				triggers: { en: ["callout"] },
				type: "insert",
				insertText: "> [!info]\n> ",
			},
		]);
		const guard = buildCustomCommandGuard(settings);
		expect(guard).toContain('">>"');
		expect(guard).toContain('"> [!info]');
	});

	it("skips commands with empty insertText", () => {
		const settings = settingsWithCommands([
			{
				id: "empty",
				triggers: { en: ["empty"] },
				type: "insert",
				insertText: "",
			},
		]);
		expect(buildCustomCommandGuard(settings)).toBe("");
	});

	it("trims whitespace-only markers", () => {
		const settings = settingsWithCommands([
			{
				id: "whitespace",
				triggers: { en: ["space"] },
				type: "insert",
				insertText: "   ",
			},
		]);
		// After trim(), "   " becomes "" which is filtered out
		expect(buildCustomCommandGuard(settings)).toBe("");
	});
});
