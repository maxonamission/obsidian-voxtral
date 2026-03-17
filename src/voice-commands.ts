import { Editor } from "obsidian";
import {
	CommandId,
	getPatternsForCommand,
	getLabel,
	getMishearings,
} from "./lang";

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

function insertAtCursor(editor: Editor, text: string): void {
	const cursor = editor.getCursor();

	// Ensure a space between existing text and new text when needed.
	if (cursor.ch > 0 && text.length > 0 && !/^[\s\n]/.test(text)) {
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
	{ id: "bulletPoint", action: (editor) => insertAtCursor(editor, "\n- ") },
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
		action: (editor) => { (editor as any).undo(); },
	},
	{
		id: "stopRecording",
		action: () => { /* handled by caller */ },
	},
	{ id: "colon", punctuation: true, action: colonAction },
];

export interface CommandMatch {
	command: CommandDef;
	/** The text before the command (to be inserted as normal text) */
	textBefore: string;
}

/**
 * Check if the given text ends with a voice command.
 * Returns the match (command + preceding text) or null.
 */
export function matchCommand(rawText: string): CommandMatch | null {
	const normalized = fixMishearings(normalizeCommand(rawText));

	for (const cmd of COMMAND_DEFS) {
		const patterns = getPatternsForCommand(cmd.id, activeLang);
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
	return null;
}

/**
 * Process transcribed text: split into sentences, check each for voice
 * commands, and execute them or insert the text as-is.
 */
export function processText(editor: Editor, text: string): void {
	const segments = text.match(/[^.!?]+[.!?]+\s*/g);

	if (!segments) {
		processSegment(editor, text);
		return;
	}

	const joined = segments.join("");
	const remainder = text.slice(joined.length);

	for (const segment of segments) {
		processSegment(editor, segment);
	}
	if (remainder.trim()) {
		processSegment(editor, remainder);
	}
}

function processSegment(editor: Editor, text: string): void {
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
	} else {
		insertAtCursor(editor, text);
	}
}

/**
 * Get all commands for the help panel, with localized labels and
 * patterns for the active language.
 */
export function getCommandList(): { label: string; patterns: string[] }[] {
	return COMMAND_DEFS.map((c) => ({
		label: getLabel(c.id, activeLang),
		patterns: getPatternsForCommand(c.id, activeLang),
	}));
}
