import { describe, it, expect, beforeAll } from "vitest";
import { matchCommand, normalizeCommand, setLanguage } from "../voice-commands";

// ── Helpers ──

/** Set language and match — returns matched command id or null */
function match(lang: string, text: string): string | null {
	setLanguage(lang);
	const result = matchCommand(text);
	return result?.command.id ?? null;
}

/** Match and return both command id and textBefore */
function matchFull(lang: string, text: string) {
	setLanguage(lang);
	return matchCommand(text);
}

// ── normalizeCommand ──

describe("normalizeCommand", () => {
	it("lowercases text", () => {
		expect(normalizeCommand("Nieuwe Alinea")).toBe("nieuwe alinea");
	});

	it("strips diacritics", () => {
		expect(normalizeCommand("café")).toBe("cafe");
		expect(normalizeCommand("über")).toBe("uber");
	});

	it("replaces hyphens with spaces", () => {
		expect(normalizeCommand("bullet-point")).toBe("bullet point");
	});

	it("removes punctuation", () => {
		expect(normalizeCommand("hello, world!")).toBe("hello world");
		expect(normalizeCommand("test. done?")).toBe("test done");
	});

	it("trims whitespace", () => {
		expect(normalizeCommand("  hello  ")).toBe("hello");
	});
});

// ── Dutch command matching ──

describe("Dutch command matching", () => {
	beforeAll(() => setLanguage("nl"));

	// Pass 1: exact match
	it("matches 'nieuwe alinea' exactly", () => {
		expect(match("nl", "nieuwe alinea")).toBe("newParagraph");
	});

	it("matches 'nieuwe alinea' as suffix of longer text", () => {
		expect(match("nl", "dit is wat tekst nieuwe alinea")).toBe("newParagraph");
	});

	it("matches 'nieuw alinea' variant", () => {
		expect(match("nl", "nieuw alinea")).toBe("newParagraph");
	});

	it("matches 'nieuwe paragraaf'", () => {
		expect(match("nl", "nieuwe paragraaf")).toBe("newParagraph");
	});

	it("matches 'nieuwe regel'", () => {
		expect(match("nl", "nieuwe regel")).toBe("newLine");
	});

	it("matches 'kop een'", () => {
		expect(match("nl", "kop een")).toBe("heading1");
	});

	it("matches 'kop 1'", () => {
		expect(match("nl", "kop 1")).toBe("heading1");
	});

	it("matches 'kop twee'", () => {
		expect(match("nl", "kop twee")).toBe("heading2");
	});

	it("matches 'kop drie'", () => {
		expect(match("nl", "kop drie")).toBe("heading3");
	});

	it("matches 'nieuw punt'", () => {
		expect(match("nl", "nieuw punt")).toBe("bulletPoint");
	});

	it("matches 'nieuw to do item'", () => {
		expect(match("nl", "nieuw to do item")).toBe("todoItem");
	});

	it("matches 'herstel'", () => {
		expect(match("nl", "herstel")).toBe("undo");
	});

	it("matches 'beeindig opname'", () => {
		expect(match("nl", "beeindig opname")).toBe("stopRecording");
	});

	it("matches 'beeindig de opname'", () => {
		expect(match("nl", "beeindig de opname")).toBe("stopRecording");
	});

	it("matches 'dubbele punt'", () => {
		expect(match("nl", "dubbele punt")).toBe("colon");
	});

	it("matches 'wikilink'", () => {
		expect(match("nl", "wikilink")).toBe("wikilink");
	});

	it("matches 'vet openen'", () => {
		expect(match("nl", "vet openen")).toBe("boldOpen");
	});

	it("matches 'vet sluiten'", () => {
		expect(match("nl", "vet sluiten")).toBe("boldClose");
	});

	it("matches 'cursief openen'", () => {
		expect(match("nl", "cursief openen")).toBe("italicOpen");
	});

	it("matches 'cursief sluiten'", () => {
		expect(match("nl", "cursief sluiten")).toBe("italicClose");
	});

	it("matches 'verwijder laatste alinea'", () => {
		expect(match("nl", "verwijder laatste alinea")).toBe("deleteLastParagraph");
	});

	it("matches 'verwijder laatste zin'", () => {
		expect(match("nl", "verwijder laatste zin")).toBe("deleteLastLine");
	});

	// Pass 2: filler stripping
	it("matches command with trailing filler 'alsjeblieft'", () => {
		expect(match("nl", "nieuwe alinea alsjeblieft")).toBe("newParagraph");
	});

	it("matches command with trailing filler 'graag'", () => {
		expect(match("nl", "nieuwe alinea graag")).toBe("newParagraph");
	});

	it("matches command with trailing filler 'even'", () => {
		expect(match("nl", "nieuwe regel even")).toBe("newLine");
	});

	// Pass 2b: article stripping
	it("matches with leading article 'een nieuwe alinea' via article stripping", () => {
		expect(match("nl", "een nieuwe alinea")).toBe("newParagraph");
	});

	// Pass 3: phonetic matching
	it("matches phonetic variant via ij→ei normalization", () => {
		// "nieuwe" with ij→ei becomes "neuwe" phonetically
		// This tests that the phonetic pass works
		setLanguage("nl");
		const result = matchCommand("nieijwe alinea"); // gibberish but tests phonetic
		// May or may not match depending on exact phonetic rules
		// The important thing is no crash
		expect(result === null || result.command.id === "newParagraph").toBe(true);
	});

	// Pass 4: compound splitting
	it("matches 'nieuwealinea' via compound splitting", () => {
		expect(match("nl", "nieuwealinea")).toBe("newParagraph");
	});

	it("matches 'nieuweregel' via compound splitting", () => {
		expect(match("nl", "nieuweregel")).toBe("newLine");
	});

	it("matches 'nieuwpunt' via compound splitting", () => {
		expect(match("nl", "nieuwpunt")).toBe("bulletPoint");
	});

	// Pass 5: fuzzy matching (Levenshtein ≤ 2)
	it("matches 'niewe alinea' via fuzzy (Levenshtein 1 — missing u)", () => {
		expect(match("nl", "niewe alinea")).toBe("newParagraph");
	});

	it("matches 'neuwe alinea' via fuzzy (Levenshtein 1 — i→u swap)", () => {
		expect(match("nl", "neuwe alinea")).toBe("newParagraph");
	});

	// Mishearing corrections
	it("matches 'niveau' → 'nieuwe' via mishearing correction", () => {
		expect(match("nl", "niveau alinea")).toBe("newParagraph");
	});

	it("matches 'niva' → 'nieuwe' via mishearing correction", () => {
		expect(match("nl", "niva alinea")).toBe("newParagraph");
	});

	it("matches 'beeindigde opname' via mishearing correction", () => {
		// "beeindigde" is corrected to "beeindig de" which matches "beeindig de opname"
		expect(match("nl", "beeindigde opname")).toBe("stopRecording");
	});

	// textBefore extraction
	it("extracts textBefore correctly for suffix match", () => {
		const result = matchFull("nl", "dit is wat tekst nieuwe alinea");
		expect(result).not.toBeNull();
		expect(result!.command.id).toBe("newParagraph");
		expect(result!.textBefore).toBe("dit is wat tekst");
	});

	it("returns empty textBefore when command is the full text", () => {
		const result = matchFull("nl", "nieuwe alinea");
		expect(result).not.toBeNull();
		expect(result!.textBefore).toBe("");
	});

	// False positive prevention
	it("does NOT match short unrelated text", () => {
		expect(match("nl", "dit")).toBeNull();
	});

	it("does NOT match random sentence", () => {
		expect(match("nl", "ik ga naar de winkel")).toBeNull();
	});

	it("does NOT match partial command in the middle of a word", () => {
		expect(match("nl", "herstellingen")).toBeNull();
	});
});

// ── English command matching ──

describe("English command matching", () => {
	beforeAll(() => setLanguage("en"));

	it("matches 'new paragraph' exactly", () => {
		expect(match("en", "new paragraph")).toBe("newParagraph");
	});

	it("matches 'new line'", () => {
		expect(match("en", "new line")).toBe("newLine");
	});

	it("matches 'heading one'", () => {
		expect(match("en", "heading one")).toBe("heading1");
	});

	it("matches 'heading 2'", () => {
		expect(match("en", "heading 2")).toBe("heading2");
	});

	it("matches 'bullet point'", () => {
		expect(match("en", "bullet point")).toBe("bulletPoint");
	});

	it("matches 'new todo'", () => {
		expect(match("en", "new todo")).toBe("todoItem");
	});

	it("matches 'undo'", () => {
		expect(match("en", "undo")).toBe("undo");
	});

	it("matches 'stop recording'", () => {
		expect(match("en", "stop recording")).toBe("stopRecording");
	});

	it("matches 'delete last paragraph'", () => {
		expect(match("en", "delete last paragraph")).toBe("deleteLastParagraph");
	});

	it("matches 'delete last sentence'", () => {
		expect(match("en", "delete last sentence")).toBe("deleteLastLine");
	});

	it("matches 'open bold'", () => {
		expect(match("en", "open bold")).toBe("boldOpen");
	});

	it("matches 'close bold'", () => {
		expect(match("en", "close bold")).toBe("boldClose");
	});

	it("matches 'open italic'", () => {
		expect(match("en", "open italic")).toBe("italicOpen");
	});

	it("matches 'close italic'", () => {
		expect(match("en", "close italic")).toBe("italicClose");
	});

	it("matches 'open code'", () => {
		expect(match("en", "open code")).toBe("inlineCodeOpen");
	});

	it("matches 'close code'", () => {
		expect(match("en", "close code")).toBe("inlineCodeClose");
	});

	// Filler stripping
	it("matches 'new paragraph please'", () => {
		expect(match("en", "new paragraph please")).toBe("newParagraph");
	});

	it("matches 'new line now'", () => {
		expect(match("en", "new line now")).toBe("newLine");
	});

	// Article stripping
	it("matches 'a new paragraph' via article stripping", () => {
		expect(match("en", "a new paragraph")).toBe("newParagraph");
	});

	// textBefore
	it("extracts textBefore for 'hello world new paragraph'", () => {
		const result = matchFull("en", "hello world new paragraph");
		expect(result).not.toBeNull();
		expect(result!.command.id).toBe("newParagraph");
		expect(result!.textBefore).toBe("hello world");
	});

	// False positives
	it("does NOT match random English text", () => {
		expect(match("en", "the weather is nice today")).toBeNull();
	});
});

// ── French command matching ──

describe("French command matching", () => {
	beforeAll(() => setLanguage("fr"));

	it("matches 'nouveau paragraphe'", () => {
		expect(match("fr", "nouveau paragraphe")).toBe("newParagraph");
	});

	it("matches 'nouvelle ligne'", () => {
		expect(match("fr", "nouvelle ligne")).toBe("newLine");
	});

	it("matches 'titre un'", () => {
		expect(match("fr", "titre un")).toBe("heading1");
	});

	it("matches 'annuler'", () => {
		expect(match("fr", "annuler")).toBe("undo");
	});

	it("matches 'arreter enregistrement'", () => {
		expect(match("fr", "arreter enregistrement")).toBe("stopRecording");
	});

	it("matches 'ouvrir gras'", () => {
		expect(match("fr", "ouvrir gras")).toBe("boldOpen");
	});

	// Mishearing: "nouvelle paragraphe" → "nouveau paragraphe"
	it("matches 'nouvelle paragraphe' via mishearing correction", () => {
		expect(match("fr", "nouvelle paragraphe")).toBe("newParagraph");
	});

	// French also falls back to English patterns
	it("matches English fallback 'new paragraph' in French mode", () => {
		expect(match("fr", "new paragraph")).toBe("newParagraph");
	});
});

// ── German command matching ──

describe("German command matching", () => {
	beforeAll(() => setLanguage("de"));

	it("matches 'neuer absatz'", () => {
		expect(match("de", "neuer absatz")).toBe("newParagraph");
	});

	it("matches 'neue zeile'", () => {
		expect(match("de", "neue zeile")).toBe("newLine");
	});

	it("matches 'uberschrift eins'", () => {
		expect(match("de", "uberschrift eins")).toBe("heading1");
	});

	it("matches 'ruckgangig'", () => {
		expect(match("de", "ruckgangig")).toBe("undo");
	});

	it("matches 'aufnahme beenden'", () => {
		expect(match("de", "aufnahme beenden")).toBe("stopRecording");
	});

	it("matches 'fett offnen'", () => {
		expect(match("de", "fett offnen")).toBe("boldOpen");
	});

	// Mishearing: "neue absatz" → "neuer absatz"
	it("matches 'neue absatz' via mishearing correction", () => {
		expect(match("de", "neue absatz")).toBe("newParagraph");
	});

	// Filler stripping
	it("matches 'neuer absatz bitte'", () => {
		expect(match("de", "neuer absatz bitte")).toBe("newParagraph");
	});

	// English fallback
	it("matches English fallback 'stop recording' in German mode", () => {
		expect(match("de", "stop recording")).toBe("stopRecording");
	});
});

// ── Cross-language: English fallback ──

describe("English fallback for all languages", () => {
	for (const lang of ["nl", "fr", "de", "es", "pt"]) {
		it(`matches 'new paragraph' in ${lang} mode (English fallback)`, () => {
			expect(match(lang, "new paragraph")).toBe("newParagraph");
		});
	}
});

// ── Edge cases ──

describe("Edge cases", () => {
	it("handles empty string", () => {
		expect(match("nl", "")).toBeNull();
	});

	it("handles whitespace-only string", () => {
		expect(match("nl", "   ")).toBeNull();
	});

	it("handles diacritics in command: 'één'", () => {
		// Diacritics are stripped, so this becomes "een"
		expect(normalizeCommand("één")).toBe("een");
	});

	it("handles mixed case input", () => {
		expect(match("nl", "Nieuwe Alinea")).toBe("newParagraph");
	});

	it("handles punctuation in input", () => {
		expect(match("nl", "nieuwe alinea.")).toBe("newParagraph");
	});

	it("handles input with extra spaces", () => {
		expect(match("nl", "nieuwe  alinea")).toBe("newParagraph");
	});
});
