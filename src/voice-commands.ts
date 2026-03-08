import { Editor } from "obsidian";

/**
 * Voice command processing — ported from the webapp's app.js.
 * Recognizes Dutch voice commands at the end of transcribed sentences
 * and executes them as Obsidian editor actions.
 */

interface VoiceCommand {
	patterns: string[];
	action: (editor: Editor) => void;
	label: string;
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

// Fix common misrecognitions
function fixMishearings(text: string): string {
	return text
		.replace(/\bniveau\b/g, "nieuwe")
		.replace(/\bnieuw alinea\b/g, "nieuwe alinea")
		.replace(/\bnieuw regel\b/g, "nieuwe regel")
		.replace(/\bnieuw punt\b/g, "nieuw punt");
}

function insertAtCursor(editor: Editor, text: string): void {
	const cursor = editor.getCursor();
	editor.replaceRange(text, cursor);
	// Move cursor to end of inserted text
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

	// Find the last double-newline (paragraph break)
	const lastPara = textBefore.lastIndexOf("\n\n");
	if (lastPara >= 0) {
		const from = editor.offsetToPos(lastPara);
		editor.replaceRange("", from, cursor);
	} else {
		// Delete everything up to cursor
		editor.replaceRange("", { line: 0, ch: 0 }, cursor);
	}
}

function deleteLastSentence(editor: Editor): void {
	const cursor = editor.getCursor();
	const fullText = editor.getValue();
	const offset = editor.posToOffset(cursor);
	const textBefore = fullText.substring(0, offset).trimEnd();

	// Find the last sentence ending (. ! ?)
	const sentenceEnd = Math.max(
		textBefore.lastIndexOf(". "),
		textBefore.lastIndexOf("! "),
		textBefore.lastIndexOf("? "),
		textBefore.lastIndexOf(".\n"),
		textBefore.lastIndexOf("!\n"),
		textBefore.lastIndexOf("?\n")
	);

	if (sentenceEnd >= 0) {
		const from = editor.offsetToPos(sentenceEnd + 1); // Keep the punctuation of previous sentence
		editor.replaceRange("", from, cursor);
	} else {
		// Delete to start of line
		editor.replaceRange("", { line: cursor.line, ch: 0 }, cursor);
	}
}

const COMMANDS: VoiceCommand[] = [
	{
		label: "Nieuwe alinea",
		patterns: [
			"nieuwe alinea",
			"nieuw alinea",
			"nieuwe paragraaf",
			"nieuw paragraaf",
			"nieuwe linie",
			"new paragraph",
		],
		action: (editor) => insertAtCursor(editor, "\n\n"),
	},
	{
		label: "Nieuwe regel",
		patterns: ["nieuwe regel", "nieuwe lijn", "new line", "volgende regel"],
		action: (editor) => insertAtCursor(editor, "\n"),
	},
	{
		label: "Kop 1",
		patterns: ["kop een", "kop 1", "kop een", "heading one", "heading 1"],
		action: (editor) => insertAtCursor(editor, "\n\n# "),
	},
	{
		label: "Kop 2",
		patterns: ["kop twee", "kop 2", "heading two", "heading 2"],
		action: (editor) => insertAtCursor(editor, "\n\n## "),
	},
	{
		label: "Kop 3",
		patterns: ["kop drie", "kop 3", "heading three", "heading 3"],
		action: (editor) => insertAtCursor(editor, "\n\n### "),
	},
	{
		label: "Nieuw punt",
		patterns: [
			"nieuw punt",
			"nieuw lijstpunt",
			"nieuw lijstitem",
			"lijst punt",
			"nieuw bullet",
			"bullet",
			"bullet point",
			"volgend punt",
		],
		action: (editor) => insertAtCursor(editor, "\n- "),
	},
	{
		label: "Nieuw to-do item",
		patterns: [
			"nieuw to do item",
			"nieuw todo item",
			"nieuw todo",
			"nieuwe to do",
			"nieuwe todo",
			"nieuw taak",
			"nieuwe taak",
			"new todo",
			"to do item",
			"todo item",
		],
		action: (editor) => insertAtCursor(editor, "\n- [ ] "),
	},
	{
		label: "Verwijder laatste alinea",
		patterns: [
			"verwijder laatste alinea",
			"verwijder laatste paragraaf",
			"wis laatste alinea",
			"delete last paragraph",
		],
		action: (editor) => deleteLastParagraph(editor),
	},
	{
		label: "Verwijder laatste regel",
		patterns: [
			"verwijder laatste regel",
			"verwijder laatste zin",
			"wis laatste regel",
			"wist laatste regel",
			"delete last line",
		],
		action: (editor) => deleteLastSentence(editor),
	},
	{
		label: "Herstel",
		patterns: ["herstel", "ongedaan maken", "undo"],
		action: (editor) => {
			// Trigger Obsidian's built-in undo
			(editor as any).undo();
		},
	},
];

export interface CommandMatch {
	command: VoiceCommand;
	/** The text before the command (to be inserted as normal text) */
	textBefore: string;
}

/**
 * Check if the given text ends with a voice command.
 * Returns the match (command + preceding text) or null.
 */
export function matchCommand(rawText: string): CommandMatch | null {
	const normalized = fixMishearings(normalizeCommand(rawText));

	for (const cmd of COMMANDS) {
		for (const pattern of cmd.patterns) {
			if (normalized.endsWith(pattern)) {
				// Extract text before the command
				const idx = normalized.lastIndexOf(pattern);
				const textBefore = rawText
					.substring(0, idx)
					.trimEnd();
				return { command: cmd, textBefore };
			}
		}
	}
	return null;
}

/**
 * Process a completed sentence: check for voice commands and execute them,
 * or insert the text as-is.
 */
export function processText(editor: Editor, text: string): void {
	const match = matchCommand(text);
	if (match) {
		// Insert any text before the command
		if (match.textBefore) {
			insertAtCursor(editor, match.textBefore);
		}
		// Execute the command
		match.command.action(editor);
	} else {
		insertAtCursor(editor, text);
	}
}

/**
 * Get all commands for the cheat sheet.
 */
export function getCommandList(): { label: string; patterns: string[] }[] {
	return COMMANDS.map((c) => ({
		label: c.label,
		patterns: c.patterns,
	}));
}
