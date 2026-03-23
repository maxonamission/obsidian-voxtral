// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe
import { Editor } from "obsidian";
import {
	CommandId,
	getPatternsForCommand,
	getLabel,
	getMishearings,
} from "./lang";
import {
	phoneticNormalize,
	stripArticles,
	stripTrailingFillers,
	trySplitCompound,
} from "./phonetics";
import type { CustomCommand } from "./types";

/**
 * Voice command processing — recognizes voice commands at the end of
 * transcribed sentences and executes them as Obsidian editor actions.
 * Patterns are loaded from lang.ts based on the active language.
 */

/** Currently active language (set via setLanguage) */
let activeLang = "nl";

/** Update the active language for command matching. */
export function setLanguage(lang: string): void {
	activeLang = lang;
}

interface CommandDef {
	id: CommandId;
	action: (editor: Editor) => void;
	/** If true, trailing punctuation is stripped from preceding text before inserting */
	punctuation?: boolean;
	/** If set, this command opens a slot (voice pauses, user types, exit closes) */
	slot?: SlotDef;
}

/** Slot definition: prefix/suffix inserted around user-typed content */
export interface SlotDef {
	prefix: string;
	suffix: string;
	/** What closes the slot: "enter" (default), "space", or "enter-or-space" */
	exitTrigger: "enter" | "space" | "enter-or-space";
}

/** Currently active slot, or null */
export interface ActiveSlot {
	def: SlotDef;
	commandId: CommandId;
}

let activeSlot: ActiveSlot | null = null;

/** Check if a slot is currently active */
export function isSlotActive(): boolean {
	return activeSlot !== null;
}

/** Get the active slot info */
export function getActiveSlot(): ActiveSlot | null {
	return activeSlot;
}

/**
 * Close the active slot: insert the suffix at the cursor.
 * Returns true if a slot was closed, false if none was active.
 */
export function closeSlot(editor: Editor): boolean {
	if (!activeSlot) return false;
	let pos = editor.getCursor();

	// Trim trailing whitespace before inserting suffix so that
	// markdown formatting is not broken (e.g. "**text **" won't
	// render as bold — we want "**text**").
	if (activeSlot.def.suffix) {
		const line = editor.getLine(pos.line);
		const before = line.substring(0, pos.ch);
		const trimmed = before.replace(/\s+$/, "");
		if (trimmed.length < before.length) {
			const trimFrom = { line: pos.line, ch: trimmed.length };
			editor.replaceRange("", trimFrom, pos);
			pos = { line: pos.line, ch: trimmed.length };
		}
	}

	// Check if the suffix is already present at the cursor position
	// (e.g. Obsidian's autocomplete or auto-pair may have inserted it).
	const suffix = activeSlot.def.suffix;
	const line = editor.getLine(pos.line);
	const afterCursor = line.substring(pos.ch, pos.ch + suffix.length);
	if (afterCursor === suffix) {
		// Suffix already present — just move past it
		editor.setCursor({ line: pos.line, ch: pos.ch + suffix.length });
	} else {
		editor.replaceRange(suffix, pos);
		editor.setCursor({ line: pos.line, ch: pos.ch + suffix.length });
	}
	activeSlot = null;
	return true;
}

/**
 * Cancel the active slot without inserting the suffix.
 */
export function cancelSlot(): void {
	activeSlot = null;
}

/**
 * Programmatically open a slot (for quick-templates like code blocks).
 */
export function openSlot(commandId: string, def: SlotDef): void {
	activeSlot = { def, commandId: commandId as CommandId };
}

// Normalize text for command matching: remove diacritics, hyphens, punctuation
export function normalizeCommand(text: string): string {
	return text
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "") // strip diacritics
		.replace(/-/g, " ")
		.replace(/[.,!?;:'"()[\]{}]/g, "")
		.toLowerCase()
		.trim();
}

// Apply language-specific mishearing corrections
function fixMishearings(text: string): string {
	for (const [pattern, replacement] of getMishearings(activeLang)) {
		text = text.replace(pattern, replacement);
	}
	return text;
}

// Levenshtein edit distance between two strings
function levenshtein(a: string, b: string): number {
	const m = a.length, n = b.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1));
	for (let i = 0; i <= m; i++) dp[i][0] = i;
	for (let j = 0; j <= n; j++) dp[0][j] = j;
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			dp[i][j] = a[i - 1] === b[j - 1]
				? dp[i - 1][j - 1]
				: 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
		}
	}
	return dp[m][n];
}

function insertAtCursor(editor: Editor, text: string): void {
	const cursor = editor.getCursor();

	// Ensure a space between existing text and new text when needed.
	// Skip when a slot is active — text is inserted right after a
	// formatting prefix (e.g. "**") and a space would break markdown.
	if (cursor.ch > 0 && text.length > 0 && !/^[\s\n]/.test(text) && !isSlotActive()) {
		const charBefore = editor.getRange(
			{ line: cursor.line, ch: cursor.ch - 1 },
			cursor
		);
		if (charBefore && /\S/.test(charBefore)) {
			text = " " + text;
		}
	}

	editor.replaceRange(text, cursor);
	const lines = text.split("\n");
	const lastLine = lines[lines.length - 1];
	const newLine = cursor.line + lines.length - 1;
	const newCh =
		lines.length === 1
			? cursor.ch + lastLine.length
			: lastLine.length;
	editor.setCursor({ line: newLine, ch: newCh });
}

function deleteLastParagraph(editor: Editor): void {
	const cursor = editor.getCursor();
	const fullText = editor.getValue();
	const offset = editor.posToOffset(cursor);
	const textBefore = fullText.substring(0, offset);

	const lastPara = textBefore.lastIndexOf("\n\n");
	if (lastPara >= 0) {
		const from = editor.offsetToPos(lastPara);
		editor.replaceRange("", from, cursor);
	} else {
		editor.replaceRange("", { line: 0, ch: 0 }, cursor);
	}
}

function deleteLastSentence(editor: Editor): void {
	const cursor = editor.getCursor();
	const fullText = editor.getValue();
	const offset = editor.posToOffset(cursor);
	const textBefore = fullText.substring(0, offset).trimEnd();

	const sentenceEnd = Math.max(
		textBefore.lastIndexOf(". "),
		textBefore.lastIndexOf("! "),
		textBefore.lastIndexOf("? "),
		textBefore.lastIndexOf(".\n"),
		textBefore.lastIndexOf("!\n"),
		textBefore.lastIndexOf("?\n")
	);

	if (sentenceEnd >= 0) {
		const from = editor.offsetToPos(sentenceEnd + 1);
		editor.replaceRange("", from, cursor);
	} else {
		editor.replaceRange("", { line: cursor.line, ch: 0 }, cursor);
	}
}

function colonAction(editor: Editor): void {
	// Strip any trailing punctuation before the cursor
	const cursor = editor.getCursor();
	if (cursor.ch > 0) {
		const lineText = editor.getLine(cursor.line);
		const before = lineText.substring(0, cursor.ch);
		const cleaned = before.replace(/[,;.!?]+\s*$/, "");
		if (cleaned.length < before.length) {
			const from = { line: cursor.line, ch: cleaned.length };
			editor.replaceRange("", from, cursor);
			editor.setCursor(from);
		}
	}
	const pos = editor.getCursor();
	editor.replaceRange(": ", pos);
	editor.setCursor({ line: pos.line, ch: pos.ch + 2 });
}

/**
 * Command definitions — the action logic is language-independent.
 * Patterns are resolved at runtime from lang.ts.
 */
const COMMAND_DEFS: CommandDef[] = [
	{ id: "newParagraph", action: (editor) => insertAtCursor(editor, "\n\n") },
	{ id: "newLine", action: (editor) => insertAtCursor(editor, "\n") },
	{ id: "heading1", action: (editor) => insertAtCursor(editor, "\n\n# ") },
	{ id: "heading2", action: (editor) => insertAtCursor(editor, "\n\n## ") },
	{ id: "heading3", action: (editor) => insertAtCursor(editor, "\n\n### ") },
	{
		id: "bulletPoint",
		action: (editor) => {
			// Context-aware: continue the current list type
			const cursor = editor.getCursor();
			const lineText = editor.getLine(cursor.line);
			if (/^(\d+)\.\s/.test(lineText)) {
				// Current line is a numbered list — continue numbering
				const num = parseInt(lineText.match(/^(\d+)/)?.[1] ?? "0", 10);
				insertAtCursor(editor, `\n${num + 1}. `);
			} else if (/^\s*- \[[ x]\]\s/.test(lineText)) {
				// Current line is a todo item — continue with unchecked todo
				insertAtCursor(editor, "\n- [ ] ");
			} else {
				// Default: unordered bullet
				insertAtCursor(editor, "\n- ");
			}
		},
	},
	{ id: "todoItem", action: (editor) => insertAtCursor(editor, "\n- [ ] ") },
	{
		id: "numberedItem",
		action: (editor) => {
			const cursor = editor.getCursor();
			const lineText = editor.getLine(cursor.line);
			const match = lineText.match(/^(\d+)\.\s/);
			const nextNum = match ? parseInt(match[1], 10) + 1 : 1;
			insertAtCursor(editor, `\n${nextNum}. `);
		},
	},
	{ id: "deleteLastParagraph", action: (editor) => deleteLastParagraph(editor) },
	{ id: "deleteLastLine", action: (editor) => deleteLastSentence(editor) },
	{
		id: "undo",
		action: (editor) => { editor.undo(); },
	},
	{
		id: "stopRecording",
		action: () => { /* handled by caller */ },
	},
	{ id: "colon", punctuation: true, action: colonAction },
	// ── Slot commands: open prefix, user types, exit closes suffix ──
	{
		id: "wikilink",
		slot: { prefix: "[[", suffix: "]]", exitTrigger: "enter" },
		action: (editor) => {
			const cursor = editor.getCursor();
			editor.replaceRange("[[", cursor);
			editor.setCursor({ line: cursor.line, ch: cursor.ch + 2 });
			activeSlot = {
				def: { prefix: "[[", suffix: "]]", exitTrigger: "enter" },
				commandId: "wikilink",
			};
		},
	},
	{
		id: "bold",
		slot: { prefix: "**", suffix: "**", exitTrigger: "enter" },
		action: (editor) => {
			const cursor = editor.getCursor();
			editor.replaceRange("**", cursor);
			editor.setCursor({ line: cursor.line, ch: cursor.ch + 2 });
			activeSlot = {
				def: { prefix: "**", suffix: "**", exitTrigger: "enter" },
				commandId: "bold",
			};
		},
	},
	{
		id: "italic",
		slot: { prefix: "*", suffix: "*", exitTrigger: "enter" },
		action: (editor) => {
			const cursor = editor.getCursor();
			editor.replaceRange("*", cursor);
			editor.setCursor({ line: cursor.line, ch: cursor.ch + 1 });
			activeSlot = {
				def: { prefix: "*", suffix: "*", exitTrigger: "enter" },
				commandId: "italic",
			};
		},
	},
	{
		id: "inlineCode",
		slot: { prefix: "`", suffix: "`", exitTrigger: "enter" },
		action: (editor) => {
			const cursor = editor.getCursor();
			editor.replaceRange("`", cursor);
			editor.setCursor({ line: cursor.line, ch: cursor.ch + 1 });
			activeSlot = {
				def: { prefix: "`", suffix: "`", exitTrigger: "enter" },
				commandId: "inlineCode",
			};
		},
	},
	{
		id: "tag",
		slot: { prefix: "#", suffix: "", exitTrigger: "enter-or-space" },
		action: (editor) => {
			const cursor = editor.getCursor();
			// Ensure space before tag if needed
			let prefix = "#";
			if (cursor.ch > 0) {
				const charBefore = editor.getRange(
					{ line: cursor.line, ch: cursor.ch - 1 },
					cursor
				);
				if (charBefore && /\S/.test(charBefore)) {
					prefix = " #";
				}
			}
			editor.replaceRange(prefix, cursor);
			editor.setCursor({ line: cursor.line, ch: cursor.ch + prefix.length });
			activeSlot = {
				def: { prefix: "#", suffix: "", exitTrigger: "enter-or-space" },
				commandId: "tag",
			};
		},
	},
];

/** Custom commands loaded from user settings */
let customCommandDefs: CommandDef[] = [];

/**
 * Load user-defined custom commands into the matching pipeline.
 * Call this whenever settings change.
 */
export function loadCustomCommands(commands: CustomCommand[]): void {
	customCommandLabels.clear();
	customCommandDefs = commands.map((cmd) => {
		if (cmd.type === "slot" && cmd.slotPrefix !== undefined) {
			const prefix = cmd.slotPrefix;
			const suffix = cmd.slotSuffix ?? "";
			const exit = cmd.slotExit ?? "enter";
			customCommandLabels.set(cmd.id, `${prefix}…${suffix}`);
			return {
				id: cmd.id as CommandId,
				slot: { prefix, suffix, exitTrigger: exit },
				action: (editor: Editor) => {
					const cursor = editor.getCursor();
					editor.replaceRange(prefix, cursor);
					editor.setCursor({ line: cursor.line, ch: cursor.ch + prefix.length });
					activeSlot = {
						def: { prefix, suffix, exitTrigger: exit },
						commandId: cmd.id as CommandId,
					};
				},
			};
		}
		// Insert command
		const text = cmd.insertText ?? "";
		const displayText = text.replace(/\n/g, "↵").slice(0, 30);
		customCommandLabels.set(cmd.id, displayText || cmd.id);
		return {
			id: cmd.id as CommandId,
			action: (editor: Editor) => insertAtCursor(editor, text),
		};
	});
}

/**
 * Get all commands (built-in + custom) for matching.
 */
function getAllCommands(): CommandDef[] {
	return [...COMMAND_DEFS, ...customCommandDefs];
}

/**
 * Get patterns for a custom command in the active language.
 */
function getCustomPatterns(cmdId: string, lang: string): string[] {
	// Find the original CustomCommand data — we need the triggers
	// This works because loadCustomCommands is always called before matching
	return customCommandTriggers.get(cmdId)?.get(lang) ??
		customCommandTriggers.get(cmdId)?.get("en") ?? [];
}

/** Map of custom command id → Map of lang → trigger phrases */
const customCommandTriggers = new Map<string, Map<string, string[]>>();

/** Map of custom command id → descriptive label for the help panel */
const customCommandLabels = new Map<string, string>();

/**
 * Reload custom command triggers (call alongside loadCustomCommands).
 */
export function loadCustomCommandTriggers(commands: CustomCommand[]): void {
	customCommandTriggers.clear();
	for (const cmd of commands) {
		const langMap = new Map<string, string[]>();
		for (const [lang, phrases] of Object.entries(cmd.triggers)) {
			langMap.set(lang, phrases);
		}
		customCommandTriggers.set(cmd.id, langMap);
	}
}

/**
 * Get patterns for a command, handling both built-in and custom.
 */
function getPatternsForAnyCommand(cmdId: string, lang: string): string[] {
	// Try built-in patterns first
	const builtinPatterns = getPatternsForCommand(cmdId as CommandId, lang);
	if (builtinPatterns.length > 0) return builtinPatterns;
	// Fall back to custom command patterns
	return getCustomPatterns(cmdId, lang);
}

export interface CommandMatch {
	command: CommandDef;
	/** The text before the command (to be inserted as normal text) */
	textBefore: string;
}

/**
 * Build a cache of all known command phrases (normalized) for compound splitting.
 */
function getAllCommandPhrases(): string[] {
	const phrases: string[] = [];
	for (const cmd of getAllCommands()) {
		for (const pattern of getPatternsForAnyCommand(cmd.id, activeLang)) {
			phrases.push(normalizeCommand(pattern));
		}
	}
	return phrases;
}

/**
 * Extract the trailing N words from text.
 */
function trailingWords(text: string, n: number): string {
	const words = text.trimEnd().split(/\s+/);
	return words.slice(-n).join(" ");
}

/**
 * Check if the given text ends with a voice command.
 * Returns the match (command + preceding text) or null.
 *
 * Matching pipeline (in order):
 * 1. Exact match (current text ends with a known pattern)
 * 2. Match after stripping trailing filler words ("alsjeblieft", "please")
 * 3. Phonetic match (phonetically normalized text matches phonetically normalized pattern)
 * 4. Compound-word match (concatenated words like "nieuwealinea")
 * 5. Fuzzy match (Levenshtein ≤ 2, standalone sentences only)
 */
export function matchCommand(rawText: string): CommandMatch | null {
	const normalized = fixMishearings(normalizeCommand(rawText));

	const allCmds = getAllCommands();

	// Pass 1: exact match (full or suffix)
	for (const cmd of allCmds) {
		const patterns = getPatternsForAnyCommand(cmd.id, activeLang);
		for (const pattern of patterns) {
			const normPattern = normalizeCommand(pattern);
			if (normalized.endsWith(normPattern)) {
				const patternWordCount = pattern.split(/\s+/).length;
				const rawWords = rawText.trimEnd().split(/\s+/);
				const textBefore = rawWords
					.slice(0, -patternWordCount)
					.join(" ")
					.trimEnd();
				return { command: cmd, textBefore };
			}
		}
	}

	// Pass 2: match after stripping articles + trailing fillers
	const strippedFillers = stripTrailingFillers(normalized, activeLang);
	if (strippedFillers !== normalized) {
		for (const cmd of allCmds) {
			const patterns = getPatternsForAnyCommand(cmd.id, activeLang);
			for (const pattern of patterns) {
				const normPattern = normalizeCommand(pattern);
				if (strippedFillers.endsWith(normPattern)) {
					const patternWordCount = pattern.split(/\s+/).length;
					const rawWords = rawText.trimEnd().split(/\s+/);
					// Account for the filler words that were stripped
					const fillerWordCount = normalized.split(/\s+/).length - strippedFillers.split(/\s+/).length;
					const textBefore = rawWords
						.slice(0, -(patternWordCount + fillerWordCount))
						.join(" ")
						.trimEnd();
					return { command: cmd, textBefore };
				}
			}
		}
	}

	// Pass 2b: strip leading articles from the trailing portion
	for (const cmd of allCmds) {
		const patterns = getPatternsForAnyCommand(cmd.id, activeLang);
		for (const pattern of patterns) {
			const normPattern = normalizeCommand(pattern);
			const patternWordCount = normPattern.split(/\s+/).length;
			// Take one extra word to check for article
			const tail = trailingWords(normalized, patternWordCount + 1);
			const stripped = stripArticles(tail, activeLang);
			if (stripped === normPattern) {
				const tailWordCount = tail.split(/\s+/).length;
				const rawWords = rawText.trimEnd().split(/\s+/);
				const textBefore = rawWords
					.slice(0, -tailWordCount)
					.join(" ")
					.trimEnd();
				return { command: cmd, textBefore };
			}
		}
	}

	// Pass 3: phonetic match — apply phonetic normalization to both sides
	const phoneticText = phoneticNormalize(normalized, activeLang);
	for (const cmd of allCmds) {
		const patterns = getPatternsForAnyCommand(cmd.id, activeLang);
		for (const pattern of patterns) {
			const phoneticPattern = phoneticNormalize(normalizeCommand(pattern), activeLang);
			if (phoneticPattern !== normalizeCommand(pattern) || phoneticText !== normalized) {
				// Only use phonetic matching if it actually changes something
				if (phoneticText.endsWith(phoneticPattern)) {
					const patternWordCount = pattern.split(/\s+/).length;
					const rawWords = rawText.trimEnd().split(/\s+/);
					const textBefore = rawWords
						.slice(0, -patternWordCount)
						.join(" ")
						.trimEnd();
					return { command: cmd, textBefore };
				}
			}
		}
	}

	// Pass 4: compound-word splitting ("nieuwealinea" → "nieuwe alinea")
	const lastWord = normalized.split(/\s+/).pop() ?? "";
	if (lastWord.length >= 4 && !lastWord.includes(" ")) {
		const allPhrases = getAllCommandPhrases();
		const split = trySplitCompound(lastWord, allPhrases);
		if (split !== lastWord) {
			// Re-run exact matching on the split version
			const words = normalized.split(/\s+/);
			words[words.length - 1] = split;
			const resplit = words.join(" ");
			for (const cmd of allCmds) {
				const patterns = getPatternsForAnyCommand(cmd.id, activeLang);
				for (const pattern of patterns) {
					const normPattern = normalizeCommand(pattern);
					if (resplit.endsWith(normPattern)) {
						const rawWords = rawText.trimEnd().split(/\s+/);
						// The compound word was one raw word
						const textBefore = rawWords
							.slice(0, -1)
							.join(" ")
							.trimEnd();
						return { command: cmd, textBefore };
					}
				}
			}
		}
	}

	// Pass 5: fuzzy match for standalone sentences only (Levenshtein ≤ 2)
	// This catches conjugation errors like "beeindigde opname" ≈ "beeindig de opname"
	// Guard: require both text and pattern to be at least 6 chars, and similar
	// in length, to avoid false positives on short words (e.g. "dit" ≈ "vet").
	let bestMatch: CommandMatch | null = null;
	let bestDist = 3; // threshold: must be strictly less than this
	for (const cmd of allCmds) {
		const patterns = getPatternsForAnyCommand(cmd.id, activeLang);
		for (const pattern of patterns) {
			const normPattern = normalizeCommand(pattern);
			if (normalized.length < 6 || normPattern.length < 6) continue;
			if (Math.abs(normalized.length - normPattern.length) > 3) continue;
			const dist = levenshtein(normalized, normPattern);
			if (dist > 0 && dist < bestDist) {
				bestDist = dist;
				bestMatch = { command: cmd, textBefore: "" };
			}
		}
	}
	return bestMatch;
}

/**
 * Optional pre-match hook. If set, called before normal command matching.
 * Returns true if the text was handled (template inserted), false otherwise.
 * Used by main.ts to integrate template matching (which needs App access).
 */
type PreMatchHook = (editor: Editor, normalizedText: string, rawText: string) => boolean;
let preMatchHook: PreMatchHook | null = null;

/** Register a pre-match hook (called before built-in command matching) */
export function setPreMatchHook(hook: PreMatchHook | null): void {
	preMatchHook = hook;
}

/**
 * Process transcribed text: split into sentences, check each for voice
 * commands, and execute them or insert the text as-is.
 */
export function processText(editor: Editor, text: string): boolean {
	let stopRequested = false;
	const segments = text.match(/[^.!?]+[.!?]+\s*/g);

	if (!segments) {
		stopRequested = processSegment(editor, text);
		return stopRequested;
	}

	const joined = segments.join("");
	const remainder = text.slice(joined.length);

	for (const segment of segments) {
		if (processSegment(editor, segment)) {
			stopRequested = true;
		}
	}
	if (remainder.trim()) {
		if (processSegment(editor, remainder)) {
			stopRequested = true;
		}
	}
	return stopRequested;
}

function processSegment(editor: Editor, text: string): boolean {
	// Try pre-match hook (templates) first
	if (preMatchHook) {
		const normalized = fixMishearings(normalizeCommand(text));
		if (preMatchHook(editor, normalized, text)) return false;
	}

	const match = matchCommand(text);
	if (match) {
		if (match.textBefore) {
			let before = match.textBefore;
			if (match.command.punctuation) {
				before = before.replace(/[,;.!?]+\s*$/, "");
			}
			insertAtCursor(editor, before);
		}
		match.command.action(editor);
		return match.command.id === "stopRecording";
	} else {
		insertAtCursor(editor, text);
	}
	return false;
}

/**
 * Get all commands for the help panel, with localized labels and
 * patterns for the active language.
 */
export function getCommandList(): { label: string; patterns: string[] }[] {
	const builtIn = COMMAND_DEFS.map((c) => ({
		label: getLabel(c.id, activeLang),
		patterns: getPatternsForCommand(c.id, activeLang),
	}));
	const custom = customCommandDefs.map((c) => ({
		label: customCommandLabels.get(c.id) ?? c.id,
		patterns: getPatternsForAnyCommand(c.id, activeLang),
	}));
	return [...builtIn, ...custom];
}
