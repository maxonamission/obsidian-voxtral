// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe
/**
 * Lightweight phonetic normalization for voice command matching.
 *
 * Rules, articles and filler words are loaded from per-language JSON
 * files in src/languages/. This module provides the processing logic
 * that reads those rules and applies them to input text.
 */

import { SUPPORTED_LANGUAGES, type LangCode } from "./lang";

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

interface LangPhoneticData {
	phonetics: { pattern: string; flags: string; replacement: string }[];
	articles: string[];
	fillers: string[];
}

const ALL_LANGS: Record<string, LangPhoneticData> = {
	nl: nlData, en: enData, fr: frData, de: deData,
	es: esData, pt: ptData, it: itData, ru: ruData,
	zh: zhData, hi: hiData, ar: arData, ja: jaData, ko: koData,
};

/** Compile phonetic rules from JSON to [RegExp, string] pairs. */
function compileRules(
	data: { pattern: string; flags: string; replacement: string }[]
): [RegExp, string][] {
	return data.map(({ pattern, flags, replacement }) => [
		new RegExp(pattern, flags),
		replacement,
	]);
}

/**
 * Phonetic equivalence rules per language (compiled from JSON).
 */
const PHONETIC_RULES: Partial<Record<LangCode, [RegExp, string][]>> =
	Object.fromEntries(
		SUPPORTED_LANGUAGES
			.filter((code) => ALL_LANGS[code].phonetics.length > 0)
			.map((code) => [code, compileRules(ALL_LANGS[code].phonetics)])
	) as Partial<Record<LangCode, [RegExp, string][]>>;

/**
 * Articles/determiners to strip per language (loaded from JSON).
 */
const ARTICLES: Partial<Record<LangCode, string[]>> = Object.fromEntries(
	SUPPORTED_LANGUAGES.map((code) => [code, ALL_LANGS[code].articles])
) as Partial<Record<LangCode, string[]>>;

/**
 * Common trailing filler words per language (loaded from JSON).
 */
const TRAILING_FILLERS: Partial<Record<LangCode, string[]>> = Object.fromEntries(
	SUPPORTED_LANGUAGES
		.filter((code) => ALL_LANGS[code].fillers.length > 0)
		.map((code) => [code, ALL_LANGS[code].fillers])
) as Partial<Record<LangCode, string[]>>;

/**
 * Apply phonetic normalization rules for the given language.
 * Returns a phonetically simplified version of the text.
 */
export function phoneticNormalize(text: string, lang: string): string {
	const rules = PHONETIC_RULES[lang as LangCode];
	if (!rules) return text;

	let result = text;
	for (const [pattern, replacement] of rules) {
		result = result.replace(pattern, replacement);
	}
	return result;
}

/**
 * Strip leading articles/determiners from text.
 * "een nieuwe alinea" → "nieuwe alinea"
 */
export function stripArticles(text: string, lang: string): string {
	const articles = ARTICLES[lang as LangCode];
	if (!articles || articles.length === 0) return text;

	const words = text.split(/\s+/);
	// Strip up to 2 leading articles (e.g. "de nieuwe" has 1 article)
	let stripped = 0;
	while (stripped < Math.min(2, words.length - 1)) {
		if (articles.includes(words[stripped])) {
			stripped++;
		} else {
			break;
		}
	}
	return stripped > 0 ? words.slice(stripped).join(" ") : text;
}

/**
 * Strip trailing filler words from text.
 * "nieuwe alinea alsjeblieft" → "nieuwe alinea"
 */
export function stripTrailingFillers(text: string, lang: string): string {
	const fillers = TRAILING_FILLERS[lang as LangCode];
	if (!fillers || fillers.length === 0) return text;

	let result = text;
	// Check multi-word fillers first (e.g. "s il vous plait")
	for (const filler of fillers.sort((a, b) => b.length - a.length)) {
		if (result.endsWith(" " + filler)) {
			result = result.slice(0, -(filler.length + 1)).trimEnd();
		}
	}
	return result;
}

/**
 * Try to split a compound word into its component words.
 * "nieuwealinea" → "nieuwe alinea"
 *
 * Uses the known command patterns as a dictionary to find splits.
 */
export function trySplitCompound(text: string, knownWords: string[]): string {
	// Only try splitting if text has no spaces and is long enough
	if (text.includes(" ") || text.length < 4) return text;

	// Try each known multi-word pattern: check if text is a concatenation
	for (const phrase of knownWords) {
		const words = phrase.split(/\s+/);
		if (words.length < 2) continue;
		const joined = words.join("");
		if (text === joined) {
			return phrase;
		}
	}

	return text;
}
