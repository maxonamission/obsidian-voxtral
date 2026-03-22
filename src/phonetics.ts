// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe
/**
 * Lightweight phonetic normalization for voice command matching.
 *
 * Instead of full Soundex/Metaphone algorithms, this uses targeted
 * phonetic equivalence rules per language that catch common ASR
 * mishearings (e.g. "ij" ↔ "ei" in Dutch, "ph" → "f" in English).
 *
 * Also provides article stripping and compound-word splitting to
 * improve command matching robustness.
 */

import type { LangCode } from "./lang";

/**
 * Phonetic equivalence rules per language.
 * Each rule maps a pattern to its canonical phonetic form.
 * Applied after standard normalization (lowercase, no diacritics).
 */
const PHONETIC_RULES: Partial<Record<LangCode, [RegExp, string][]>> = {
	nl: [
		[/ij/g, "ei"],       // ij ↔ ei (most common Dutch confusion)
		[/au/g, "ou"],       // au ↔ ou
		[/dt\b/g, "t"],      // -dt → -t (verb endings)
		[/\bsch/g, "sg"],    // sch- → sg (ASR often drops the h)
		[/ck/g, "k"],        // ck → k
		[/ph/g, "f"],        // ph → f
		[/th/g, "t"],        // th → t
		[/ie/g, "i"],        // ie → i (long vs short)
		[/oe/g, "u"],        // oe → u
		[/ee/g, "e"],        // ee → e
		[/oo/g, "o"],        // oo → o
		[/uu/g, "u"],        // uu → u
		[/aa/g, "a"],        // aa → a
	],
	en: [
		[/ph/g, "f"],        // phone → fone
		[/th/g, "t"],        // the → te (ASR simplification)
		[/ck/g, "k"],        // check → chek
		[/ght/g, "t"],       // right → rit
		[/wh/g, "w"],        // what → wat
		[/kn/g, "n"],        // know → now
		[/wr/g, "r"],        // write → rite
		[/tion/g, "shun"],   // action → akshun
		[/sion/g, "shun"],   // mission → mishun
		[/([aeiou])ll/g, "$1l"], // bullet → bulet
		[/([aeiou])dd/g, "$1d"], // heading → heding
		[/([aeiou])tt/g, "$1t"], // getting → geting
	],
	fr: [
		[/eau/g, "o"],       // nouveau → nouvo
		[/aux/g, "o"],       // journaux → journo
		[/ai/g, "e"],        // faire → fere
		[/ei/g, "e"],        // seize → seze
		[/ph/g, "f"],        // paragraphe → paragrafe
		[/qu/g, "k"],        // quelque → kelke
		[/gn/g, "ny"],       // ligne → linye
		[/oi/g, "wa"],       // enregistrement → simplified
		[/ou/g, "u"],        // nouveau → nu
		[/an/g, "on"],       // dans → dons (nasal equivalence)
		[/en/g, "on"],       // enregistrement → onregistrement
	],
	de: [
		[/sch/g, "sh"],      // Überschrift → ubershrift
		[/ei/g, "ai"],       // Zeile → zaile (equivalent)
		[/ie/g, "i"],        // Zeile → zile
		[/ck/g, "k"],        // Rückgängig → rukgangig
		[/ph/g, "f"],        // Paragraph → paragraf
		[/th/g, "t"],        // Thema → tema
		[/v/g, "f"],         // vor → for (German v = f)
		[/tz/g, "ts"],       // Satz → sats
		[/dt\b/g, "t"],      // Stadt → stat
		[/aa/g, "a"],        // Saal → sal
		[/ee/g, "e"],        // Kaffee → kafe
		[/oo/g, "o"],        // Boot → bot
	],
	es: [
		[/ll/g, "y"],        // calle → caye
		[/v/g, "b"],         // volver → bolber
		[/ce/g, "se"],       // sección → sesion
		[/ci/g, "si"],       // acción → aksion
		[/qu/g, "k"],        // borrar → borar
		[/gu(?=[ei])/g, "g"],// guía → gia
		[/h/g, ""],          // hacer → acer (silent h)
	],
	pt: [
		[/lh/g, "ly"],       // trabalho → trabalyo
		[/nh/g, "ny"],       // linha → linya
		[/ch/g, "sh"],       // fechar → feshar
		[/qu/g, "k"],        // querer → kerer
		[/ção/g, "saun"],    // seção → sesaun
		[/ss/g, "s"],        // passo → paso
	],
	it: [
		[/gn/g, "ny"],       // registrazione → rejistratione
		[/gl(?=[i])/g, "ly"],// taglia → talya
		[/ch/g, "k"],        // che → ke
		[/gh/g, "g"],        // spaghetti → spagetti
		[/sc(?=[ei])/g, "sh"],// uscire → ushire
		[/zz/g, "ts"],       // piazza → piatsa
		[/cc(?=[ei])/g, "ch"],// accento → achento
	],
};

/**
 * Articles/determiners to strip per language.
 * These are commonly prepended by ASR before commands.
 */
const ARTICLES: Partial<Record<LangCode, string[]>> = {
	nl: ["een", "de", "het", "die", "dat", "deze"],
	en: ["a", "an", "the"],
	fr: ["un", "une", "le", "la", "les", "l", "du", "des"],
	de: ["ein", "eine", "einen", "einem", "einer", "der", "die", "das", "den", "dem", "des"],
	es: ["un", "una", "el", "la", "los", "las", "unos", "unas"],
	pt: ["um", "uma", "o", "a", "os", "as", "uns", "umas"],
	it: ["un", "uno", "una", "il", "lo", "la", "i", "gli", "le"],
	ru: [],  // No articles in Russian
	zh: [],
	hi: [],
	ar: ["ال"],  // al- prefix
	ja: [],
	ko: [],
};

/**
 * Common trailing filler words per language that should be ignored
 * when they appear after a command pattern.
 */
const TRAILING_FILLERS: Partial<Record<LangCode, string[]>> = {
	nl: ["alsjeblieft", "graag", "even", "maar", "eens", "dan", "nu", "hoor"],
	en: ["please", "now", "then", "thanks"],
	fr: ["s il vous plait", "s il te plait", "merci"],
	de: ["bitte", "mal", "jetzt", "dann"],
	es: ["por favor", "ahora", "gracias"],
	pt: ["por favor", "agora", "obrigado"],
	it: ["per favore", "ora", "adesso", "grazie"],
};

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
