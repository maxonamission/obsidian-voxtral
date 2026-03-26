// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe
/**
 * Language-specific voice command patterns and mishearing corrections.
 *
 * Data is loaded from per-language JSON files in src/languages/.
 * To add a new language: create a new JSON file following the schema
 * of any existing language file — no TypeScript changes needed.
 *
 * English ("en") is always active as fallback, regardless of the
 * configured language.
 */

// ── JSON imports (bundled by esbuild at build time) ──

import nlData from "./languages/nl.json";
import enData from "./languages/en.json";
import frData from "./languages/fr.json";
import deData from "./languages/de.json";
import esData from "./languages/es.json";
import ptData from "./languages/pt.json";
import itData from "./languages/it.json";
import ruData from "./languages/ru.json";
import zhData from "./languages/zh.json";
import hiData from "./languages/hi.json";
import arData from "./languages/ar.json";
import jaData from "./languages/ja.json";
import koData from "./languages/ko.json";

/** Shape of a language JSON data file */
interface LangData {
	code: string;
	name: string;
	patterns: Record<string, string[]>;
	labels: Record<string, string>;
	mishearings: { pattern: string; flags: string; replacement: string }[];
	phonetics: { pattern: string; flags: string; replacement: string }[];
	articles: string[];
	fillers: string[];
}

/** All loaded language data, keyed by language code */
const ALL_LANGS: Record<string, LangData> = {
	nl: nlData, en: enData, fr: frData, de: deData,
	es: esData, pt: ptData, it: itData, ru: ruData,
	zh: zhData, hi: hiData, ar: arData, ja: jaData, ko: koData,
};

// ── Public API (same exports as before) ──

/** All Voxtral-supported language codes */
export const SUPPORTED_LANGUAGES = [
	"nl", "en", "fr", "de", "es", "pt", "it",
	"ru", "zh", "hi", "ar", "ja", "ko",
] as const;

export type LangCode = (typeof SUPPORTED_LANGUAGES)[number];

/** Human-readable language names (for settings dropdown) */
export const LANGUAGE_NAMES: Record<LangCode, string> = Object.fromEntries(
	SUPPORTED_LANGUAGES.map((code) => [code, ALL_LANGS[code].name])
) as Record<LangCode, string>;

/** Command IDs — used as keys in patterns */
export type CommandId =
	| "newParagraph"
	| "newLine"
	| "heading1"
	| "heading2"
	| "heading3"
	| "bulletPoint"
	| "todoItem"
	| "numberedItem"
	| "deleteLastParagraph"
	| "deleteLastLine"
	| "undo"
	| "stopRecording"
	| "colon"
	| "wikilink"
	| "boldOpen"
	| "boldClose"
	| "italicOpen"
	| "italicClose"
	| "inlineCodeOpen"
	| "inlineCodeClose"
	| "tagOpen"
	| "tagClose"
	| "codeBlockOpen"
	| "codeBlockClose";

/** Patterns per language per command (loaded from JSON) */
export const PATTERNS: Partial<Record<LangCode, Partial<Record<CommandId, string[]>>>> =
	Object.fromEntries(
		SUPPORTED_LANGUAGES.map((code) => [code, ALL_LANGS[code].patterns])
	) as Partial<Record<LangCode, Partial<Record<CommandId, string[]>>>>;

/** Localized command labels for the help panel */
export const LABELS: Partial<Record<LangCode, Record<CommandId, string>>> =
	Object.fromEntries(
		SUPPORTED_LANGUAGES.map((code) => [code, ALL_LANGS[code].labels])
	) as Partial<Record<LangCode, Record<CommandId, string>>>;

/** Compile mishearing rules from JSON string patterns to RegExp objects */
function compileMishearings(
	data: { pattern: string; flags: string; replacement: string }[]
): [RegExp, string][] {
	return data.map(({ pattern, flags, replacement }) => [
		new RegExp(pattern, flags),
		replacement,
	]);
}

/**
 * Common speech-recognition mishearings per language.
 * Each entry is [pattern, replacement] applied after normalization.
 */
export const MISHEARINGS: Partial<Record<LangCode, [RegExp, string][]>> =
	Object.fromEntries(
		SUPPORTED_LANGUAGES
			.filter((code) => ALL_LANGS[code].mishearings.length > 0)
			.map((code) => [code, compileMishearings(ALL_LANGS[code].mishearings)])
	) as Partial<Record<LangCode, [RegExp, string][]>>;

/**
 * Get patterns for a command, merging the active language with English fallback.
 * Returns deduplicated patterns, active language first.
 */
export function getPatternsForCommand(commandId: CommandId, lang: string): string[] {
	const langPatterns = PATTERNS[lang as LangCode]?.[commandId] ?? [];
	const enPatterns = lang === "en" ? [] : (PATTERNS.en?.[commandId] ?? []);
	// Deduplicate while preserving order (active language first)
	const seen = new Set<string>();
	const result: string[] = [];
	for (const p of [...langPatterns, ...enPatterns]) {
		if (!seen.has(p)) {
			seen.add(p);
			result.push(p);
		}
	}
	return result;
}

/**
 * Get the localized label for a command, falling back to English.
 */
export function getLabel(commandId: CommandId, lang: string): string {
	return LABELS[lang as LangCode]?.[commandId] ?? LABELS.en?.[commandId] ?? commandId;
}

/**
 * Get mishearing fixes for a language (always includes the active language).
 */
export function getMishearings(lang: string): [RegExp, string][] {
	return MISHEARINGS[lang as LangCode] ?? [];
}
