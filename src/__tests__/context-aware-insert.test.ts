import { describe, it, expect, vi } from "vitest";
import type { Editor } from "obsidian";
import {
	detectInsertionContext,
	lowercaseFirstLetter,
} from "../voice-commands";

vi.mock("obsidian", () => ({
	Notice: vi.fn(),
}));

// ── Minimal mock editor ──

function createMockEditor(initialText: string, cursorLine: number, cursorCh: number): Editor {
	const lines = initialText.split("\n").map((text) => ({ text }));

	function posToOffset(pos: { line: number; ch: number }): number {
		let offset = 0;
		for (let i = 0; i < pos.line && i < lines.length; i++) {
			offset += lines[i].text.length + 1;
		}
		offset += Math.min(pos.ch, lines[pos.line]?.text.length ?? 0);
		return offset;
	}

	return {
		getCursor: vi.fn(() => ({ line: cursorLine, ch: cursorCh })),
		getRange: vi.fn(
			(from: { line: number; ch: number }, to: { line: number; ch: number }) => {
				const fullText = lines.map((l) => l.text).join("\n");
				return fullText.substring(posToOffset(from), posToOffset(to));
			},
		),
		getLine: vi.fn((n: number) => lines[n]?.text ?? ""),
		getValue: vi.fn(() => lines.map((l) => l.text).join("\n")),
	} as unknown as Editor;
}

// ── detectInsertionContext ──

describe("detectInsertionContext", () => {
	// -- sentence-start --

	it("returns sentence-start after a period", () => {
		const editor = createMockEditor("Hello world. ", 0, 13);
		expect(detectInsertionContext(editor)).toBe("sentence-start");
	});

	it("returns sentence-start after an exclamation mark", () => {
		const editor = createMockEditor("Wow! ", 0, 5);
		expect(detectInsertionContext(editor)).toBe("sentence-start");
	});

	it("returns sentence-start after a question mark", () => {
		const editor = createMockEditor("Really? ", 0, 8);
		expect(detectInsertionContext(editor)).toBe("sentence-start");
	});

	// -- new-line --

	it("returns new-line at column 0", () => {
		const editor = createMockEditor("First line\n", 1, 0);
		expect(detectInsertionContext(editor)).toBe("new-line");
	});

	it("returns new-line on empty first line", () => {
		const editor = createMockEditor("", 0, 0);
		expect(detectInsertionContext(editor)).toBe("new-line");
	});

	it("returns new-line on whitespace-only line", () => {
		const editor = createMockEditor("   ", 0, 3);
		expect(detectInsertionContext(editor)).toBe("new-line");
	});

	// -- list-or-heading --

	it("returns list-or-heading after bullet marker '- '", () => {
		const editor = createMockEditor("- ", 0, 2);
		expect(detectInsertionContext(editor)).toBe("list-or-heading");
	});

	it("returns list-or-heading after '* '", () => {
		const editor = createMockEditor("* ", 0, 2);
		expect(detectInsertionContext(editor)).toBe("list-or-heading");
	});

	it("returns list-or-heading after checkbox '- [ ] '", () => {
		const editor = createMockEditor("- [ ] ", 0, 6);
		expect(detectInsertionContext(editor)).toBe("list-or-heading");
	});

	it("returns list-or-heading after heading '## '", () => {
		const editor = createMockEditor("## ", 0, 3);
		expect(detectInsertionContext(editor)).toBe("list-or-heading");
	});

	it("returns list-or-heading after numbered list '1. '", () => {
		const editor = createMockEditor("1. ", 0, 3);
		expect(detectInsertionContext(editor)).toBe("list-or-heading");
	});

	it("returns list-or-heading after numbered list '2) '", () => {
		const editor = createMockEditor("2) ", 0, 3);
		expect(detectInsertionContext(editor)).toBe("list-or-heading");
	});

	it("returns mid-sentence after bullet with existing text", () => {
		const editor = createMockEditor("- Some text", 0, 11);
		expect(detectInsertionContext(editor)).toBe("mid-sentence");
	});

	// -- comment --

	it("returns comment after blockquote '> '", () => {
		const editor = createMockEditor("> ", 0, 2);
		expect(detectInsertionContext(editor)).toBe("comment");
	});

	it("returns comment after nested blockquote '>> '", () => {
		const editor = createMockEditor(">> ", 0, 3);
		expect(detectInsertionContext(editor)).toBe("comment");
	});

	it("returns comment after callout '> [!note] '", () => {
		const editor = createMockEditor("> [!note] ", 0, 10);
		expect(detectInsertionContext(editor)).toBe("comment");
	});

	it("returns comment after callout '> [!warning] '", () => {
		const editor = createMockEditor("> [!warning] ", 0, 13);
		expect(detectInsertionContext(editor)).toBe("comment");
	});

	it("returns mid-sentence after blockquote with existing text", () => {
		const editor = createMockEditor("> Some text", 0, 11);
		expect(detectInsertionContext(editor)).toBe("mid-sentence");
	});

	// -- mid-sentence --

	it("returns mid-sentence after a comma", () => {
		const editor = createMockEditor("Hello, ", 0, 7);
		expect(detectInsertionContext(editor)).toBe("mid-sentence");
	});

	it("returns mid-sentence after a regular word", () => {
		const editor = createMockEditor("Hello world", 0, 11);
		expect(detectInsertionContext(editor)).toBe("mid-sentence");
	});

	it("returns mid-sentence after a colon", () => {
		const editor = createMockEditor("Note: ", 0, 6);
		expect(detectInsertionContext(editor)).toBe("mid-sentence");
	});
});

// ── lowercaseFirstLetter ──

describe("lowercaseFirstLetter", () => {
	it("lowercases the first letter", () => {
		expect(lowercaseFirstLetter("Hello")).toBe("hello");
	});

	it("preserves leading whitespace", () => {
		expect(lowercaseFirstLetter(" En dan")).toBe(" en dan");
	});

	it("handles accented characters", () => {
		expect(lowercaseFirstLetter("Über")).toBe("über");
		expect(lowercaseFirstLetter("Éclair")).toBe("éclair");
	});

	it("returns text unchanged if already lowercase", () => {
		expect(lowercaseFirstLetter("already")).toBe("already");
	});

	it("returns empty string unchanged", () => {
		expect(lowercaseFirstLetter("")).toBe("");
	});

	it("handles single uppercase character", () => {
		expect(lowercaseFirstLetter("A")).toBe("a");
	});
});
