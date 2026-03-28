// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe

/**
 * Context-aware text insertion: detect what surrounds the cursor
 * and adapt capitalization and punctuation accordingly.
 *
 * These functions are platform-independent — they operate on plain
 * strings, not on Editor or DOM objects. The platform layer
 * (Obsidian plugin, webapp) reads the relevant text and passes it in.
 */

/**
 * Insertion context classification that drives casing and punctuation.
 */
export type InsertionContext =
	| "sentence-start"  // after .!? or empty document → uppercase, keep trailing period
	| "new-line"        // start of a line (col 0) or after \n → uppercase, keep trailing period
	| "list-or-heading" // after - / * / # / 1. markdown markers → uppercase, strip trailing period
	| "comment"         // after > / >> / > [!…] blockquote markers → uppercase, keep trailing period
	| "mid-sentence";   // everything else → lowercase, strip trailing period

/**
 * Detect the insertion context from text on the current line before
 * the cursor. Pass the full line content up to the cursor position.
 *
 * @param lineBefore - Text from column 0 to the cursor on the current line.
 *                     Empty string means column 0 (start of line).
 */
export function detectContext(lineBefore: string): InsertionContext {
	// Column 0 / empty line
	if (!lineBefore) return "new-line";

	const trimmed = lineBefore.trimEnd();
	if (!trimmed) return "new-line";

	// Blockquote / comment markers: "> ", ">> ", "> [!note] ", etc.
	if (/^>+\s/.test(lineBefore)) {
		const afterMarker = lineBefore.replace(/^>+\s(?:\[!.*?\]\s*)?/, "");
		if (!afterMarker.trim()) return "comment";
	}

	// Markdown list / heading markers: "- ", "* ", "- [ ] ", "# ", "1. ", "2) "
	if (/^(?:[-*]\s|[-*]\s\[.\]\s|#{1,6}\s|\d+[.)]\s)/.test(lineBefore)) {
		const afterMarker = lineBefore.replace(
			/^(?:[-*]\s(?:\[.\]\s)?|#{1,6}\s|\d+[.)]\s)/,
			""
		);
		if (!afterMarker.trim()) return "list-or-heading";
	}

	const lastChar = trimmed[trimmed.length - 1];

	// After sentence-ending punctuation
	if (lastChar === "." || lastChar === "!" || lastChar === "?") {
		return "sentence-start";
	}

	return "mid-sentence";
}

/**
 * Whether trailing sentence-ending punctuation (.!?) should be
 * stripped for the given insertion context.
 */
export function shouldStripTrailingPunctuation(context: InsertionContext): boolean {
	return context === "mid-sentence" || context === "list-or-heading";
}

/**
 * Whether the first letter should be lowercased for the given context.
 */
export function shouldLowercase(context: InsertionContext): boolean {
	return context === "mid-sentence";
}

/**
 * Lowercase the first letter of text, handling leading whitespace
 * and accented characters. " En" → " en", "Über" → "über".
 */
export function lowercaseFirstLetter(text: string): string {
	const match = text.match(
		/^(\s*)([A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝŸ])/
	);
	if (match) {
		return (
			match[1] + match[2].toLowerCase() + text.slice(match[1].length + 1)
		);
	}
	return text;
}

/**
 * Strip trailing sentence-ending punctuation added by the
 * transcription API when the context doesn't call for it.
 */
export function stripTrailingPunctuation(text: string): string {
	return text.replace(/[.!?]+\s*$/, "");
}
