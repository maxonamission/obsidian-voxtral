import { describe, it, expect } from "vitest";
import { MISHEARINGS } from "../lang";

describe("Mishearing corrections — Dutch", () => {
	const nlRules = MISHEARINGS.nl!;

	function applyMishearings(text: string): string {
		let result = text;
		for (const [pattern, replacement] of nlRules) {
			// Reset lastIndex since we're reusing regex objects
			pattern.lastIndex = 0;
			result = result.replace(pattern, replacement);
		}
		return result;
	}

	it("corrects 'niveau' → 'nieuwe'", () => {
		expect(applyMishearings("niveau alinea")).toBe("nieuwe alinea");
	});

	it("corrects 'niva' → 'nieuwe'", () => {
		expect(applyMishearings("niva alinea")).toBe("nieuwe alinea");
	});

	it("corrects 'nieuw alinea' → 'nieuwe alinea'", () => {
		expect(applyMishearings("nieuw alinea")).toBe("nieuwe alinea");
	});

	it("corrects 'nieuw regel' → 'nieuwe regel'", () => {
		expect(applyMishearings("nieuw regel")).toBe("nieuwe regel");
	});

	it("corrects 'linea' → 'alinea'", () => {
		expect(applyMishearings("nieuwe linea")).toBe("nieuwe alinea");
	});

	it("corrects 'linie' → 'alinea'", () => {
		expect(applyMishearings("nieuwe linie")).toBe("nieuwe alinea");
	});

	it("corrects 'beeindigde' → 'beeindig de'", () => {
		expect(applyMishearings("beeindigde opname")).toBe("beeindig de opname");
	});

	it("does not modify text without mishearings", () => {
		expect(applyMishearings("kop een")).toBe("kop een");
	});

	it("handles multiple corrections in one text", () => {
		expect(applyMishearings("niva linea")).toBe("nieuwe alinea");
	});
});

describe("Mishearing corrections — French", () => {
	const frRules = MISHEARINGS.fr!;

	function applyMishearings(text: string): string {
		let result = text;
		for (const [pattern, replacement] of frRules) {
			pattern.lastIndex = 0;
			result = result.replace(pattern, replacement);
		}
		return result;
	}

	it("corrects 'nouveau ligne' → 'nouvelle ligne'", () => {
		expect(applyMishearings("nouveau ligne")).toBe("nouvelle ligne");
	});

	it("corrects 'nouvelle paragraphe' → 'nouveau paragraphe'", () => {
		expect(applyMishearings("nouvelle paragraphe")).toBe("nouveau paragraphe");
	});
});

describe("Mishearing corrections — German", () => {
	const deRules = MISHEARINGS.de!;

	function applyMishearings(text: string): string {
		let result = text;
		for (const [pattern, replacement] of deRules) {
			pattern.lastIndex = 0;
			result = result.replace(pattern, replacement);
		}
		return result;
	}

	it("corrects 'neue absatz' → 'neuer absatz'", () => {
		expect(applyMishearings("neue absatz")).toBe("neuer absatz");
	});

	it("corrects 'neues zeile' → 'neue zeile'", () => {
		expect(applyMishearings("neues zeile")).toBe("neue zeile");
	});
});

describe("Mishearing data integrity", () => {
	it("Dutch mishearings exist and are non-empty", () => {
		expect(MISHEARINGS.nl).toBeDefined();
		expect(MISHEARINGS.nl!.length).toBeGreaterThan(0);
	});

	it("French mishearings exist and are non-empty", () => {
		expect(MISHEARINGS.fr).toBeDefined();
		expect(MISHEARINGS.fr!.length).toBeGreaterThan(0);
	});

	it("German mishearings exist and are non-empty", () => {
		expect(MISHEARINGS.de).toBeDefined();
		expect(MISHEARINGS.de!.length).toBeGreaterThan(0);
	});

	it("all mishearing rules have valid regex patterns", () => {
		for (const rules of Object.values(MISHEARINGS)) {
			if (!rules) continue;
			for (const [pattern, replacement] of rules) {
				expect(pattern).toBeInstanceOf(RegExp);
				expect(typeof replacement).toBe("string");
			}
		}
	});
});
