// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe
import { App, TFile, TFolder, Editor } from "obsidian";
import { normalizeCommand } from "./voice-commands";

/**
 * Template integration — scans the user's templates folder and
 * registers each template as a voice command ("template {naam}").
 *
 * Also provides built-in quick-templates for common Markdown
 * structures (table, code block, callout).
 */

export interface TemplateCommand {
	/** Normalized name used for matching (e.g. "meeting notes") */
	name: string;
	/** Display name (original filename without .md) */
	displayName: string;
	/** Full vault path to the template file */
	path: string;
}

/** Cached list of discovered template commands */
let templateCommands: TemplateCommand[] = [];

/**
 * Scan the templates folder and build the template command list.
 * Call this on plugin load and when settings change.
 */
export function scanTemplates(app: App, folderPath: string): void {
	templateCommands = [];
	if (!folderPath) return;

	const folder = app.vault.getFolderByPath(folderPath);
	if (!folder) return;

	scanFolder(folder);
}

function scanFolder(folder: TFolder): void {
	for (const child of folder.children) {
		if (child instanceof TFile && child.extension === "md") {
			const displayName = child.basename; // filename without .md
			templateCommands.push({
				name: normalizeCommand(displayName),
				displayName,
				path: child.path,
			});
		} else if (child instanceof TFolder) {
			// Recurse into subfolders
			scanFolder(child);
		}
	}
}

/** Get all discovered template commands */
export function getTemplateCommands(): TemplateCommand[] {
	return templateCommands;
}

/**
 * Try to match text against a template command.
 * Matches "template {name}" or "sjabloon {name}" (NL) patterns.
 *
 * Returns the matched template and any text before the command, or null.
 */
export function matchTemplate(
	normalizedText: string,
	lang: string
): { template: TemplateCommand; textBefore: string } | null {
	if (templateCommands.length === 0) return null;

	// Language-specific prefix keywords
	const prefixes = getTemplatePrefixes(lang);

	for (const prefix of prefixes) {
		for (const tmpl of templateCommands) {
			const pattern = `${prefix} ${tmpl.name}`;
			if (normalizedText === pattern) {
				return { template: tmpl, textBefore: "" };
			}
			if (normalizedText.endsWith(" " + pattern)) {
				const idx = normalizedText.lastIndexOf(" " + pattern);
				const textBefore = normalizedText.substring(0, idx).trim();
				return { template: tmpl, textBefore };
			}
		}
	}

	return null;
}

function getTemplatePrefixes(lang: string): string[] {
	switch (lang) {
		case "nl": return ["sjabloon", "template"];
		case "en": return ["template"];
		case "fr": return ["modele", "template"];
		case "de": return ["vorlage", "template"];
		case "es": return ["plantilla", "template"];
		case "pt": return ["modelo", "template"];
		case "it": return ["modello", "template"];
		case "ru": return ["шаблон", "template"];
		case "zh": return ["模板", "template"];
		case "hi": return ["टेम्पलेट", "template"];
		case "ar": return ["قالب", "template"];
		case "ja": return ["テンプレート", "template"];
		case "ko": return ["템플릿", "template"];
		default: return ["template"];
	}
}

/**
 * Insert a template's content at the cursor position.
 * Processes basic variables: {{date}}, {{time}}, {{title}}.
 */
export async function insertTemplate(
	app: App,
	editor: Editor,
	template: TemplateCommand
): Promise<void> {
	const file = app.vault.getFileByPath(template.path);
	if (!file) return;

	let content = await app.vault.cachedRead(file);

	// Process basic template variables
	const now = new Date();
	const activeFile = app.workspace.getActiveFile();
	const title = activeFile?.basename ?? "";

	content = content
		.replace(/\{\{date\}\}/gi, now.toISOString().split("T")[0])
		.replace(/\{\{time\}\}/gi, now.toTimeString().split(" ")[0].substring(0, 5))
		.replace(/\{\{title\}\}/gi, title);

	// Insert at cursor
	const cursor = editor.getCursor();

	// Ensure we're on a new line for template insertion
	if (cursor.ch > 0) {
		content = "\n" + content;
	}

	editor.replaceRange(content, cursor);

	// Move cursor to end of inserted content
	const lines = content.split("\n");
	const lastLine = lines[lines.length - 1];
	const newLine = cursor.line + lines.length - 1;
	const newCh = lines.length === 1 ? cursor.ch + lastLine.length : lastLine.length;
	editor.setCursor({ line: newLine, ch: newCh });
}

// ── Built-in quick-templates ──

export interface QuickTemplate {
	id: string;
	/** Trigger patterns per language */
	triggers: Record<string, string[]>;
	/** Content to insert (may contain a slot marker {|} for cursor placement) */
	content: string;
	/** Optional slot definition */
	slot?: { prefix: string; suffix: string; exitTrigger: "enter" | "space" | "enter-or-space" };
}

export const QUICK_TEMPLATES: QuickTemplate[] = [
	{
		id: "table",
		triggers: {
			nl: ["tabel", "nieuwe tabel"],
			en: ["table", "new table"],
			fr: ["tableau", "nouveau tableau"],
			de: ["tabelle", "neue tabelle"],
			es: ["tabla", "nueva tabla"],
			pt: ["tabela", "nova tabela"],
			it: ["tabella", "nuova tabella"],
		},
		content: "\n\n| Kolom 1 | Kolom 2 | Kolom 3 |\n| --- | --- | --- |\n| | | |\n",
	},
	{
		id: "codeBlock",
		triggers: {
			nl: ["codeblok", "code blok"],
			en: ["code block"],
			fr: ["bloc de code"],
			de: ["codeblock", "code block"],
			es: ["bloque de codigo"],
			pt: ["bloco de codigo"],
			it: ["blocco di codice"],
		},
		content: "\n\n```",
		slot: { prefix: "\n\n```", suffix: "\n```\n", exitTrigger: "enter" },
	},
	{
		id: "callout",
		triggers: {
			nl: ["callout", "opmerking", "notitie blok"],
			en: ["callout", "note block"],
			fr: ["callout", "bloc de note"],
			de: ["callout", "hinweisblock"],
			es: ["callout", "bloque de nota"],
			pt: ["callout", "bloco de nota"],
			it: ["callout", "blocco nota"],
		},
		content: "\n\n> [!note]\n> ",
	},
	{
		id: "warningCallout",
		triggers: {
			nl: ["waarschuwing", "waarschuwing blok"],
			en: ["warning", "warning block"],
			fr: ["avertissement"],
			de: ["warnung"],
			es: ["advertencia"],
			pt: ["aviso"],
			it: ["avviso"],
		},
		content: "\n\n> [!warning]\n> ",
	},
	{
		id: "tipCallout",
		triggers: {
			nl: ["tip", "tip blok"],
			en: ["tip", "tip block"],
			fr: ["astuce"],
			de: ["tipp"],
			es: ["consejo"],
			pt: ["dica"],
			it: ["suggerimento"],
		},
		content: "\n\n> [!tip]\n> ",
	},
];

/**
 * Try to match text against a quick-template.
 * Returns the template and text before it, or null.
 */
export function matchQuickTemplate(
	normalizedText: string,
	lang: string
): { template: QuickTemplate; textBefore: string } | null {
	for (const tmpl of QUICK_TEMPLATES) {
		const triggers = tmpl.triggers[lang] ?? tmpl.triggers["en"] ?? [];
		for (const trigger of triggers) {
			const normTrigger = normalizeCommand(trigger);
			if (normalizedText === normTrigger) {
				return { template: tmpl, textBefore: "" };
			}
			if (normalizedText.endsWith(" " + normTrigger)) {
				const idx = normalizedText.lastIndexOf(" " + normTrigger);
				const textBefore = normalizedText.substring(0, idx).trim();
				return { template: tmpl, textBefore };
			}
		}
	}
	return null;
}
