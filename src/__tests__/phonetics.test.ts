import { describe, it, expect } from "vitest";
import {
	phoneticNormalize,
	stripArticles,
	stripTrailingFillers,
	trySplitCompound,
} from "../phonetics";

// ── phoneticNormalize ──

describe("phoneticNormalize — Dutch", () => {
	it("normalizes ij → ei", () => {
		expect(phoneticNormalize("wij", "nl")).toBe("wei");
	});

	it("normalizes au → ou", () => {
		expect(phoneticNormalize("blauw", "nl")).toBe("blouw");
	});

	it("normalizes dt word ending → t", () => {
		expect(phoneticNormalize("wordt", "nl")).toBe("wort");
	});

	it("normalizes sch → sg at start", () => {
		// sch→sg then ij→ei: "schrijven" → "sgreiven"
		expect(phoneticNormalize("schrijven", "nl")).toBe("sgreiven");
	});

	it("normalizes ck → k", () => {
		expect(phoneticNormalize("check", "nl")).toBe("chek");
	});

	it("normalizes ph → f", () => {
		expect(phoneticNormalize("telefph", "nl")).toBe("teleff");
	});

	it("normalizes double vowels: ee → e, oo → o, aa → a", () => {
		expect(phoneticNormalize("zee", "nl")).toBe("ze");
		expect(phoneticNormalize("boo", "nl")).toBe("bo");
		expect(phoneticNormalize("baa", "nl")).toBe("ba");
	});

	it("applies multiple rules in sequence", () => {
		// "schrijven" → sch→sg, ij→ei → "sgreiven"
		const result = phoneticNormalize("schrijven", "nl");
		expect(result).toBe("sgreiven");
	});
});

describe("phoneticNormalize — English", () => {
	it("normalizes ph → f", () => {
		expect(phoneticNormalize("phone", "en")).toBe("fone");
	});

	it("normalizes ght → t", () => {
		expect(phoneticNormalize("right", "en")).toBe("rit");
	});

	it("normalizes wh → w", () => {
		expect(phoneticNormalize("what", "en")).toBe("wat");
	});

	it("normalizes kn → n", () => {
		expect(phoneticNormalize("know", "en")).toBe("now");
	});

	it("normalizes tion → shun", () => {
		// ck→k rule doesn't apply here; tion→shun: "action" → "acshun"
		expect(phoneticNormalize("action", "en")).toBe("acshun");
	});

	it("normalizes sion → shun", () => {
		// "mission" has "ss" which becomes "s" via vowel+dd/tt/ll rules? No.
		// Actually "ss" doesn't match ([aeiou])ll pattern. "sion"→"shun": "misshun"
		expect(phoneticNormalize("mission", "en")).toBe("misshun");
	});
});

describe("phoneticNormalize — French", () => {
	it("normalizes eau → o", () => {
		expect(phoneticNormalize("eau", "fr")).toBe("o");
	});

	it("normalizes qu → k", () => {
		expect(phoneticNormalize("quelque", "fr")).toBe("kelke");
	});

	it("normalizes ph → f", () => {
		expect(phoneticNormalize("paragraphe", "fr")).toBe("paragrafe");
	});
});

describe("phoneticNormalize — German", () => {
	it("normalizes sch → sh", () => {
		// sch→sh then ei→ai: "schreiben" → "shraiben"
		expect(phoneticNormalize("schreiben", "de")).toBe("shraiben");
	});

	it("normalizes v → f", () => {
		expect(phoneticNormalize("vor", "de")).toBe("for");
	});

	it("normalizes ck → k", () => {
		expect(phoneticNormalize("ruck", "de")).toBe("ruk");
	});
});

describe("phoneticNormalize — unsupported language", () => {
	it("returns text unchanged for unknown language", () => {
		expect(phoneticNormalize("hello", "xx")).toBe("hello");
	});

	it("returns text unchanged for language without rules", () => {
		expect(phoneticNormalize("hello", "ja")).toBe("hello");
	});
});

// ── stripArticles ──

describe("stripArticles — Dutch", () => {
	it("strips 'de'", () => {
		expect(stripArticles("de nieuwe alinea", "nl")).toBe("nieuwe alinea");
	});

	it("strips 'het'", () => {
		expect(stripArticles("het punt", "nl")).toBe("punt");
	});

	it("strips 'een'", () => {
		expect(stripArticles("een nieuw punt", "nl")).toBe("nieuw punt");
	});

	it("strips up to 2 leading articles", () => {
		// "de de test" — unlikely but should handle
		expect(stripArticles("de de test", "nl")).toBe("test");
	});

	it("does not strip articles from single-word text", () => {
		expect(stripArticles("de", "nl")).toBe("de");
	});

	it("returns text unchanged if no articles", () => {
		expect(stripArticles("nieuwe alinea", "nl")).toBe("nieuwe alinea");
	});
});

describe("stripArticles — English", () => {
	it("strips 'the'", () => {
		expect(stripArticles("the paragraph", "en")).toBe("paragraph");
	});

	it("strips 'a'", () => {
		expect(stripArticles("a heading", "en")).toBe("heading");
	});

	it("strips 'an'", () => {
		expect(stripArticles("an item", "en")).toBe("item");
	});
});

describe("stripArticles — French", () => {
	it("strips 'le'", () => {
		expect(stripArticles("le paragraphe", "fr")).toBe("paragraphe");
	});

	it("strips 'la'", () => {
		expect(stripArticles("la ligne", "fr")).toBe("ligne");
	});

	it("strips 'les'", () => {
		expect(stripArticles("les points", "fr")).toBe("points");
	});
});

describe("stripArticles — German", () => {
	it("strips 'der'", () => {
		expect(stripArticles("der absatz", "de")).toBe("absatz");
	});

	it("strips 'die'", () => {
		expect(stripArticles("die zeile", "de")).toBe("zeile");
	});

	it("strips 'das'", () => {
		expect(stripArticles("das element", "de")).toBe("element");
	});
});

describe("stripArticles — Russian (no articles)", () => {
	it("returns text unchanged", () => {
		expect(stripArticles("новый абзац", "ru")).toBe("новый абзац");
	});
});

// ── stripTrailingFillers ──

describe("stripTrailingFillers — Dutch", () => {
	it("strips 'alsjeblieft'", () => {
		expect(stripTrailingFillers("nieuwe alinea alsjeblieft", "nl")).toBe("nieuwe alinea");
	});

	it("strips 'graag'", () => {
		expect(stripTrailingFillers("nieuwe alinea graag", "nl")).toBe("nieuwe alinea");
	});

	it("strips 'even'", () => {
		expect(stripTrailingFillers("nieuwe regel even", "nl")).toBe("nieuwe regel");
	});

	it("does not strip from the middle of text", () => {
		expect(stripTrailingFillers("even nieuwe alinea", "nl")).toBe("even nieuwe alinea");
	});

	it("returns text unchanged if no filler", () => {
		expect(stripTrailingFillers("nieuwe alinea", "nl")).toBe("nieuwe alinea");
	});
});

describe("stripTrailingFillers — English", () => {
	it("strips 'please'", () => {
		expect(stripTrailingFillers("new paragraph please", "en")).toBe("new paragraph");
	});

	it("strips 'now'", () => {
		expect(stripTrailingFillers("new line now", "en")).toBe("new line");
	});

	it("strips 'thanks'", () => {
		expect(stripTrailingFillers("undo thanks", "en")).toBe("undo");
	});
});

describe("stripTrailingFillers — French", () => {
	it("strips multi-word 's il vous plait'", () => {
		expect(stripTrailingFillers("nouveau paragraphe s il vous plait", "fr"))
			.toBe("nouveau paragraphe");
	});
});

describe("stripTrailingFillers — German", () => {
	it("strips 'bitte'", () => {
		expect(stripTrailingFillers("neuer absatz bitte", "de")).toBe("neuer absatz");
	});
});

// ── trySplitCompound ──

describe("trySplitCompound", () => {
	const knownPhrases = [
		"nieuwe alinea",
		"nieuwe regel",
		"nieuw punt",
		"kop een",
		"beeindig opname",
	];

	it("splits 'nieuwealinea' → 'nieuwe alinea'", () => {
		expect(trySplitCompound("nieuwealinea", knownPhrases)).toBe("nieuwe alinea");
	});

	it("splits 'nieuweregel' → 'nieuwe regel'", () => {
		expect(trySplitCompound("nieuweregel", knownPhrases)).toBe("nieuwe regel");
	});

	it("splits 'nieuwpunt' → 'nieuw punt'", () => {
		expect(trySplitCompound("nieuwpunt", knownPhrases)).toBe("nieuw punt");
	});

	it("splits 'kopeen' → 'kop een'", () => {
		expect(trySplitCompound("kopeen", knownPhrases)).toBe("kop een");
	});

	it("returns unchanged if no known split found", () => {
		expect(trySplitCompound("onbekend", knownPhrases)).toBe("onbekend");
	});

	it("returns unchanged for text with spaces", () => {
		expect(trySplitCompound("nieuwe alinea", knownPhrases)).toBe("nieuwe alinea");
	});

	it("returns unchanged for text shorter than 4 chars", () => {
		expect(trySplitCompound("ab", knownPhrases)).toBe("ab");
	});

	it("does not split single-word patterns", () => {
		// "herstel" is a single-word pattern, should not be "split"
		expect(trySplitCompound("herstel", ["herstel"])).toBe("herstel");
	});
});
