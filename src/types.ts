// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe
export type FocusBehavior = "pause" | "keep-recording" | "pause-after-delay";

/** User-defined custom voice command */
export interface CustomCommand {
	/** Unique ID (auto-generated) */
	id: string;
	/** Trigger phrases per language (key = lang code, value = phrases) */
	triggers: Record<string, string[]>;
	/** Command type: insert text or open a slot */
	type: "insert" | "slot";
	/** Text to insert (for type "insert") */
	insertText?: string;
	/** Slot prefix (for type "slot") */
	slotPrefix?: string;
	/** Slot suffix (for type "slot") */
	slotSuffix?: string;
	/** Slot exit trigger (for type "slot") */
	slotExit?: "voice" | "enter" | "space" | "enter-or-space";
	/** Pre-configured built-in command (reset to defaults only touches these) */
	builtIn?: boolean;
	/** Human-readable label for the help panel per language (falls back to trigger phrase) */
	labels?: Record<string, string>;
}

/** Default built-in custom commands (table, callouts) */
export function getDefaultBuiltInCommands(): CustomCommand[] {
	return [
		{
			id: "builtin-table",
			builtIn: true,
			labels: {
				nl: "Tabel", en: "Table", fr: "Tableau", de: "Tabelle",
				es: "Tabla", pt: "Tabela", it: "Tabella", ru: "Таблица",
				zh: "表格", ja: "テーブル", ko: "테이블", hi: "टेबल", ar: "جدول",
			},
			type: "insert",
			insertText: "\n\n| Kolom 1 | Kolom 2 | Kolom 3 |\n| --- | --- | --- |\n| | | |\n",
			triggers: {
				nl: ["tabel", "nieuwe tabel"],
				en: ["table", "new table"],
				fr: ["tableau", "nouveau tableau"],
				de: ["tabelle", "neue tabelle"],
				es: ["tabla", "nueva tabla"],
				pt: ["tabela", "nova tabela"],
				it: ["tabella", "nuova tabella"],
				ru: ["таблица", "новая таблица"],
				zh: ["表格", "新表格"],
				ja: ["テーブル", "新しいテーブル"],
				ko: ["테이블", "새 테이블"],
				hi: ["टेबल", "नई टेबल"],
				ar: ["جدول", "جدول جديد"],
			},
		},
		{
			id: "builtin-callout",
			builtIn: true,
			labels: {
				nl: "Callout (opmerking)", en: "Callout (note)", fr: "Callout (note)",
				de: "Callout (Hinweis)", es: "Callout (nota)", pt: "Callout (nota)",
				it: "Callout (nota)", ru: "Заметка", zh: "标注（备注）",
				ja: "コールアウト（注釈）", ko: "콜아웃 (메모)", hi: "कॉलआउट (नोट)", ar: "تنبيه (ملاحظة)",
			},
			type: "insert",
			insertText: "\n\n> [!note]\n> ",
			triggers: {
				nl: ["callout", "opmerking", "notitie blok"],
				en: ["callout", "note block"],
				fr: ["callout", "bloc de note"],
				de: ["callout", "hinweisblock"],
				es: ["callout", "bloque de nota"],
				pt: ["callout", "bloco de nota"],
				it: ["callout", "blocco nota"],
				ru: ["заметка", "блок заметки"],
				zh: ["标注", "注释块"],
				ja: ["コールアウト", "注釈"],
				ko: ["콜아웃", "메모 블록"],
				hi: ["कॉलआउट", "नोट ब्लॉक"],
				ar: ["تنبيه", "كتلة ملاحظة"],
			},
		},
		{
			id: "builtin-warning",
			builtIn: true,
			labels: {
				nl: "Callout (waarschuwing)", en: "Callout (warning)", fr: "Callout (avertissement)",
				de: "Callout (Warnung)", es: "Callout (advertencia)", pt: "Callout (aviso)",
				it: "Callout (avviso)", ru: "Предупреждение", zh: "标注（警告）",
				ja: "コールアウト（警告）", ko: "콜아웃 (경고)", hi: "कॉलआउट (चेतावनी)", ar: "تنبيه (تحذير)",
			},
			type: "insert",
			insertText: "\n\n> [!warning]\n> ",
			triggers: {
				nl: ["waarschuwing", "waarschuwing blok"],
				en: ["warning", "warning block"],
				fr: ["avertissement"],
				de: ["warnung"],
				es: ["advertencia"],
				pt: ["aviso"],
				it: ["avviso"],
				ru: ["предупреждение"],
				zh: ["警告"],
				ja: ["警告"],
				ko: ["경고"],
				hi: ["चेतावनी"],
				ar: ["تحذير"],
			},
		},
		{
			id: "builtin-tip",
			builtIn: true,
			labels: {
				nl: "Callout (tip)", en: "Callout (tip)", fr: "Callout (astuce)",
				de: "Callout (Tipp)", es: "Callout (consejo)", pt: "Callout (dica)",
				it: "Callout (suggerimento)", ru: "Совет", zh: "标注（提示）",
				ja: "コールアウト（ヒント）", ko: "콜아웃 (팁)", hi: "कॉलआउट (सुझाव)", ar: "تنبيه (نصيحة)",
			},
			type: "insert",
			insertText: "\n\n> [!tip]\n> ",
			triggers: {
				nl: ["tip", "tip blok"],
				en: ["tip", "tip block"],
				fr: ["astuce"],
				de: ["tipp"],
				es: ["consejo"],
				pt: ["dica"],
				it: ["suggerimento"],
				ru: ["совет"],
				zh: ["提示"],
				ja: ["ヒント"],
				ko: ["팁"],
				hi: ["सुझाव"],
				ar: ["نصيحة"],
			},
		},
	];
}

export interface VoxtralSettings {
	settingsVersion: number;
	apiKey: string;
	language: string;
	realtimeModel: string;
	batchModel: string;
	correctModel: string;
	autoCorrect: boolean;
	streamingDelayMs: number;
	dualDelay: boolean; // dual-delay mode: fast + slow stream for speed + accuracy
	dualDelayFastMs: number;
	dualDelaySlowMs: number;
	systemPrompt: string;
	mode: "realtime" | "batch";
	microphoneDeviceId: string; // "" = system default
	focusBehavior: FocusBehavior;
	focusPauseDelaySec: number; // seconds before pausing (for "pause-after-delay")
	dismissMobileBatchNotice: boolean; // hide "using batch mode" notice on mobile
	enterToSend: boolean; // Enter key acts as tap-to-send when mic is live in batch mode
	typingCooldownMs: number; // ms of silence before mic unmutes after typing
	noiseSuppression: boolean; // browser-level noise suppression, echo cancellation, AGC
	customCommands: CustomCommand[];
	templatesFolder: string; // path to templates folder (e.g. "Templates"), empty = disabled
}

export const DEFAULT_SETTINGS: VoxtralSettings = {
	settingsVersion: 1,
	apiKey: "",
	language: "nl",
	realtimeModel: "voxtral-mini-transcribe-realtime-2602",
	batchModel: "voxtral-mini-latest",
	correctModel: "mistral-small-latest",
	autoCorrect: true,
	streamingDelayMs: 480,
	dualDelay: false,
	dualDelayFastMs: 240,
	dualDelaySlowMs: 2400,
	systemPrompt: "",
	mode: "realtime",
	microphoneDeviceId: "",
	focusBehavior: "pause",
	focusPauseDelaySec: 30,
	dismissMobileBatchNotice: false,
	enterToSend: false,
	typingCooldownMs: 800,
	noiseSuppression: false,
	customCommands: [],
	templatesFolder: "",
};

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
	"- Markdown formatting (# headings, - lists, - [ ] to-do items)\n\n" +
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
