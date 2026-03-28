// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe

/**
 * Text correction utilities shared between the webapp and plugin.
 * Platform-independent — no DOM, Obsidian, or HTTP dependencies.
 */

/**
 * Default system prompt for the correction LLM.
 */
export const DEFAULT_CORRECT_PROMPT =
	"You are a precise text corrector for dictated text. The input language may vary " +
	"(commonly Dutch, but follow whatever language the text is in).\n\n" +
	"CORRECT ONLY:\n" +
	"- Capitalization (sentence starts, proper nouns)\n" +
	"- Clearly misspelled or garbled words (from speech recognition)\n" +
	"- Missing or wrong punctuation\n\n" +
	"DO NOT CHANGE:\n" +
	"- Sentence structure or word order\n" +
	"- Style or tone\n" +
	"- Markdown formatting (# headings, - lists, - [ ] to-do items)\n" +
	"- Special prefix markers at the start of lines (e.g. >>, >, > [!note], etc.)\n" +
	"- Text inserted by custom commands — these are intentional formatting elements\n\n" +
	"INLINE CORRECTION INSTRUCTIONS:\n" +
	"The text was dictated via speech recognition. The speaker sometimes gives " +
	"inline instructions meant for you. Recognize these patterns:\n" +
	"- Explicit markers: 'voor de correctie', 'voor de correctie achteraf', " +
	"'for the correction', 'correction note'\n" +
	"- Spelled-out words: 'V-O-X-T-R-A-L' or 'with an x' → merge into the intended word\n" +
	"- Self-corrections: 'no not X but Y', 'nee niet X maar Y', 'I mean Y', 'ik bedoel Y'\n" +
	"- Meta-commentary: 'that's a Dutch word', 'with a capital letter', 'met een hoofdletter'\n\n" +
	"When you encounter such instructions:\n" +
	"1. Apply the instruction to the REST of the text\n" +
	"2. Remove the instruction/meta-commentary itself from the output\n" +
	"3. Keep all content text — NEVER remove normal sentences\n\n" +
	"CRITICAL RULES:\n" +
	"- Your output must be SHORTER than or equal to the input (after removing meta-instructions)\n" +
	"- NEVER add your own text, commentary, explanations, or notes\n" +
	"- NEVER add parenthesized text like '(text missing)' or '(no corrections needed)'\n" +
	"- NEVER continue, elaborate, or expand on the content\n" +
	"- NEVER invent or hallucinate text that wasn't in the input\n" +
	"- If the input is short (even one word), just return it corrected\n" +
	"- Your output must contain ONLY the corrected version of the input text, NOTHING else";

/**
 * Minimal interface for commands that have insertable text markers.
 * Matches the relevant fields of CustomCommand from types.ts.
 */
export interface CommandMarkers {
	insertText?: string;
	slotPrefix?: string;
	slotSuffix?: string;
}

/**
 * Build a prompt suffix that tells the correction LLM to preserve
 * text markers produced by the user's custom commands.
 */
export function buildCustomCommandGuard(commands: CommandMarkers[]): string {
	const markers: string[] = [];

	for (const cmd of commands) {
		if (cmd.insertText) markers.push(cmd.insertText.trim());
		if (cmd.slotPrefix) markers.push(cmd.slotPrefix.trim());
		if (cmd.slotSuffix) markers.push(cmd.slotSuffix.trim());
	}

	// Deduplicate and filter empty
	const unique = [...new Set(markers)].filter(Boolean);
	if (unique.length === 0) return "";

	const escaped = unique.map((m) => `"${m}"`).join(", ");
	return (
		"\n\nCUSTOM COMMAND OUTPUT — DO NOT REMOVE:\n" +
		"The user has voice commands that insert specific text markers. " +
		"These markers MUST be preserved exactly as-is: " +
		escaped +
		"\nNever strip, rewrite, or 'correct' these markers."
	);
}

/**
 * Remove parenthesized text blocks that the correction LLM added
 * but were NOT in the original transcription.
 */
export function stripLlmCommentary(corrected: string, original: string): string {
	const parenPattern = /\s*\([^)]{10,}\)\s*/g;
	let cleaned = corrected;
	let match;

	while ((match = parenPattern.exec(corrected)) !== null) {
		const block = match[0].trim();
		if (!original.includes(block)) {
			cleaned = cleaned.replace(match[0], " ");
		}
	}

	return cleaned.trim();
}

/**
 * Detect likely hallucinated transcription output.
 * Whisper-style models hallucinate when given silence or very short
 * audio, producing repetitive or impossibly long text.
 */
export function isLikelyHallucination(
	text: string,
	audioDurationSec: number
): boolean {
	if (!text.trim()) return false;

	const words = text.trim().split(/\s+/).length;
	const wordsPerSec = audioDurationSec > 0 ? words / audioDurationSec : words;

	// Normal speech is ~2-3 words/sec. Allow generous headroom but
	// flag anything over 5 words/sec as suspicious.
	if (wordsPerSec > 5 && words > 20) {
		return true;
	}

	// Detect repetitive blocks: 3+ blocks separated by horizontal rules.
	const blocks = text.split(/\n---\n|^---$/m).filter((b) => b.trim());
	if (blocks.length >= 3) {
		return true;
	}

	// Detect repeated sentences (3+ identical or near-identical)
	const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
	if (sentences.length >= 6) {
		const normalized = sentences.map((s) =>
			s.trim().toLowerCase().replace(/\s+/g, " ")
		);
		const counts = new Map<string, number>();
		for (const s of normalized) {
			counts.set(s, (counts.get(s) || 0) + 1);
		}
		for (const [, count] of counts) {
			if (count >= 3) {
				return true;
			}
		}
	}

	return false;
}
