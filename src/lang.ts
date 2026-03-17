/**
 * Language-specific voice command patterns and mishearing corrections.
 *
 * Each command ID maps to an array of trigger phrases per language.
 * English ("en") is always active as fallback, regardless of the
 * configured language.
 *
 * To add a new language: add its ISO 639-1 code as a key in PATTERNS
 * and optionally in MISHEARINGS and LABELS.
 */

/** All Voxtral-supported language codes */
export const SUPPORTED_LANGUAGES = [
	"nl", "en", "fr", "de", "es", "pt", "it",
	"ru", "zh", "hi", "ar", "ja", "ko",
] as const;

export type LangCode = (typeof SUPPORTED_LANGUAGES)[number];

/** Human-readable language names (for settings dropdown) */
export const LANGUAGE_NAMES: Record<LangCode, string> = {
	nl: "Nederlands",
	en: "English",
	fr: "Français",
	de: "Deutsch",
	es: "Español",
	pt: "Português",
	it: "Italiano",
	ru: "Русский",
	zh: "中文",
	hi: "हिन्दी",
	ar: "العربية",
	ja: "日本語",
	ko: "한국어",
};

/** Command IDs — used as keys in PATTERNS */
export type CommandId =
	| "newParagraph"
	| "newLine"
	| "heading1"
	| "heading2"
	| "heading3"
	| "bulletPoint"
	| "todoItem"
	| "numberedItem"
	| "deleteLastParagraph"
	| "deleteLastLine"
	| "undo"
	| "stopRecording"
	| "colon";

/** Patterns per language per command */
export const PATTERNS: Partial<Record<LangCode, Partial<Record<CommandId, string[]>>>> = {
	// ── Dutch ──────────────────────────────────────────────────────
	nl: {
		newParagraph: ["nieuwe alinea", "nieuw alinea", "nieuwe paragraaf", "nieuw paragraaf", "nieuwe linie"],
		newLine: ["nieuwe regel", "nieuwe lijn", "volgende regel"],
		heading1: ["kop een", "kop 1"],
		heading2: ["kop twee", "kop 2"],
		heading3: ["kop drie", "kop 3"],
		bulletPoint: ["nieuw punt", "nieuw lijstpunt", "nieuw lijstitem", "lijst punt", "nieuw bullet", "nieuw item", "nieuwe item", "volgend item", "volgend punt"],
		todoItem: ["nieuw to do item", "nieuw todo item", "nieuw todo", "nieuwe to do", "nieuwe todo", "nieuw taak", "nieuwe taak"],
		numberedItem: ["nieuw genummerd item", "nieuw genummerd punt", "genummerd punt", "genummerd item", "volgend nummer", "nummer punt"],
		deleteLastParagraph: ["verwijder laatste alinea", "verwijder laatste paragraaf", "wis laatste alinea"],
		deleteLastLine: ["verwijder laatste regel", "verwijder laatste zin", "wis laatste regel", "wist laatste regel"],
		undo: ["herstel", "ongedaan maken"],
		stopRecording: ["beeindig opname", "beeindig de opname",  "stop opname", "stop de opname"],
		colon: ["dubbele punt", "double punt", "dubbelepunt"],
	},

	// ── English ────────────────────────────────────────────────────
	en: {
		newParagraph: ["new paragraph"],
		newLine: ["new line", "next line"],
		heading1: ["heading one", "heading 1"],
		heading2: ["heading two", "heading 2"],
		heading3: ["heading three", "heading 3"],
		bulletPoint: ["new item", "next item", "bullet", "bullet point", "new bullet"],
		todoItem: ["new todo", "new to do", "todo item", "to do item"],
		numberedItem: ["numbered item", "new numbered item", "next number"],
		deleteLastParagraph: ["delete last paragraph"],
		deleteLastLine: ["delete last line", "delete last sentence"],
		undo: ["undo"],
		stopRecording: ["stop recording"],
		colon: ["colon"],
	},

	// ── French ─────────────────────────────────────────────────────
	fr: {
		newParagraph: ["nouveau paragraphe", "nouvelle section", "nouveau alinea"],
		newLine: ["nouvelle ligne", "a la ligne", "retour a la ligne"],
		heading1: ["titre un", "titre 1"],
		heading2: ["titre deux", "titre 2"],
		heading3: ["titre trois", "titre 3"],
		bulletPoint: ["nouveau point", "nouvelle puce", "point suivant", "nouvel element", "nouvel item"],
		todoItem: ["nouvelle tache", "nouveau todo", "nouveau to do"],
		numberedItem: ["point numero", "element numero", "nouveau numero"],
		deleteLastParagraph: ["supprimer dernier paragraphe", "effacer dernier paragraphe"],
		deleteLastLine: ["supprimer derniere ligne", "effacer derniere ligne", "supprimer derniere phrase"],
		undo: ["annuler"],
		stopRecording: ["arreter enregistrement", "arreter l enregistrement", "stop enregistrement"],
		colon: ["deux points"],
	},

	// ── German ─────────────────────────────────────────────────────
	de: {
		newParagraph: ["neuer absatz", "neuer paragraph"],
		newLine: ["neue zeile", "nachste zeile"],
		heading1: ["uberschrift eins", "uberschrift 1"],
		heading2: ["uberschrift zwei", "uberschrift 2"],
		heading3: ["uberschrift drei", "uberschrift 3"],
		bulletPoint: ["neuer punkt", "neuer aufzahlungspunkt", "nachster punkt", "neues element"],
		todoItem: ["neue aufgabe", "neues todo", "neues to do"],
		numberedItem: ["nummerierter punkt", "neuer nummerierter punkt", "nachste nummer"],
		deleteLastParagraph: ["letzten absatz loschen", "absatz loschen"],
		deleteLastLine: ["letzte zeile loschen", "letzten satz loschen"],
		undo: ["ruckgangig", "ruckgangig machen"],
		stopRecording: ["aufnahme beenden", "aufnahme stoppen"],
		colon: ["doppelpunkt"],
	},

	// ── Spanish ────────────────────────────────────────────────────
	es: {
		newParagraph: ["nuevo parrafo", "nueva seccion"],
		newLine: ["nueva linea", "siguiente linea"],
		heading1: ["titulo uno", "titulo 1"],
		heading2: ["titulo dos", "titulo 2"],
		heading3: ["titulo tres", "titulo 3"],
		bulletPoint: ["nuevo punto", "nueva vineta", "siguiente punto", "nuevo elemento"],
		todoItem: ["nueva tarea", "nuevo todo", "nuevo to do"],
		numberedItem: ["punto numerado", "nuevo numero", "siguiente numero"],
		deleteLastParagraph: ["borrar ultimo parrafo", "eliminar ultimo parrafo"],
		deleteLastLine: ["borrar ultima linea", "eliminar ultima linea", "borrar ultima frase"],
		undo: ["deshacer"],
		stopRecording: ["parar grabacion", "detener grabacion"],
		colon: ["dos puntos"],
	},

	// ── Portuguese ─────────────────────────────────────────────────
	pt: {
		newParagraph: ["novo paragrafo", "nova secao"],
		newLine: ["nova linha", "proxima linha"],
		heading1: ["titulo um", "titulo 1"],
		heading2: ["titulo dois", "titulo 2"],
		heading3: ["titulo tres", "titulo 3"],
		bulletPoint: ["novo ponto", "novo item", "proximo ponto", "novo elemento"],
		todoItem: ["nova tarefa", "novo todo", "novo to do"],
		numberedItem: ["ponto numerado", "novo numero", "proximo numero"],
		deleteLastParagraph: ["apagar ultimo paragrafo", "excluir ultimo paragrafo"],
		deleteLastLine: ["apagar ultima linha", "excluir ultima linha", "apagar ultima frase"],
		undo: ["desfazer"],
		stopRecording: ["parar gravacao", "encerrar gravacao"],
		colon: ["dois pontos"],
	},

	// ── Russian ───────────────────────────────────────────────────
	ru: {
		newParagraph: ["новый абзац", "новый параграф"],
		newLine: ["новая строка", "следующая строка"],
		heading1: ["заголовок один", "заголовок 1"],
		heading2: ["заголовок два", "заголовок 2"],
		heading3: ["заголовок три", "заголовок 3"],
		bulletPoint: ["новый пункт", "новый элемент", "следующий пункт"],
		todoItem: ["новая задача", "новое задание"],
		numberedItem: ["нумерованный пункт", "следующий номер"],
		deleteLastParagraph: ["удалить последний абзац"],
		deleteLastLine: ["удалить последнюю строку", "удалить последнее предложение"],
		undo: ["отменить", "отмена"],
		stopRecording: ["остановить запись", "стоп запись"],
		colon: ["двоеточие"],
	},

	// ── Chinese ────────────────────────────────────────────────────
	zh: {
		newParagraph: ["新段落", "新的段落"],
		newLine: ["换行", "新行", "下一行"],
		heading1: ["标题一", "标题1", "一级标题"],
		heading2: ["标题二", "标题2", "二级标题"],
		heading3: ["标题三", "标题3", "三级标题"],
		bulletPoint: ["新项目", "列表项", "新的项目"],
		todoItem: ["新任务", "新待办", "待办事项"],
		numberedItem: ["编号项", "新编号", "下一个编号"],
		deleteLastParagraph: ["删除上一段", "删除最后一段"],
		deleteLastLine: ["删除上一行", "删除上一句"],
		undo: ["撤销", "撤回"],
		stopRecording: ["停止录音", "结束录音"],
		colon: ["冒号"],
	},

	// ── Hindi ──────────────────────────────────────────────────────
	hi: {
		newParagraph: ["नया पैराग्राफ", "नया अनुच्छेद"],
		newLine: ["नई लाइन", "अगली लाइन"],
		heading1: ["शीर्षक एक", "शीर्षक 1", "हेडिंग 1"],
		heading2: ["शीर्षक दो", "शीर्षक 2", "हेडिंग 2"],
		heading3: ["शीर्षक तीन", "शीर्षक 3", "हेडिंग 3"],
		bulletPoint: ["नया बिंदु", "नया पॉइंट", "अगला पॉइंट"],
		todoItem: ["नया कार्य", "नया टूडू"],
		numberedItem: ["क्रमांकित बिंदु", "अगला नंबर"],
		deleteLastParagraph: ["पिछला पैराग्राफ हटाओ"],
		deleteLastLine: ["पिछली लाइन हटाओ", "अंतिम लाइन हटाओ"],
		undo: ["पूर्ववत", "अनडू"],
		stopRecording: ["रिकॉर्डिंग बंद करो", "रिकॉर्डिंग रोको"],
		colon: ["कोलन"],
	},

	// ── Arabic ─────────────────────────────────────────────────────
	ar: {
		newParagraph: ["فقرة جديدة"],
		newLine: ["سطر جديد", "السطر التالي"],
		heading1: ["عنوان واحد", "عنوان 1"],
		heading2: ["عنوان اثنين", "عنوان 2"],
		heading3: ["عنوان ثلاثة", "عنوان 3"],
		bulletPoint: ["نقطة جديدة", "عنصر جديد"],
		todoItem: ["مهمة جديدة"],
		numberedItem: ["عنصر مرقم", "الرقم التالي"],
		deleteLastParagraph: ["احذف الفقرة الأخيرة"],
		deleteLastLine: ["احذف السطر الأخير", "احذف الجملة الأخيرة"],
		undo: ["تراجع"],
		stopRecording: ["أوقف التسجيل", "إيقاف التسجيل"],
		colon: ["نقطتان"],
	},

	// ── Japanese ───────────────────────────────────────────────────
	ja: {
		newParagraph: ["新しい段落", "新段落"],
		newLine: ["改行", "新しい行", "次の行"],
		heading1: ["見出し1", "見出しいち"],
		heading2: ["見出し2", "見出しに"],
		heading3: ["見出し3", "見出しさん"],
		bulletPoint: ["箇条書き", "新しい項目", "次の項目"],
		todoItem: ["新しいタスク", "タスク追加"],
		numberedItem: ["番号付き", "次の番号"],
		deleteLastParagraph: ["最後の段落を削除"],
		deleteLastLine: ["最後の行を削除", "最後の文を削除"],
		undo: ["元に戻す", "取り消し"],
		stopRecording: ["録音停止", "録音を止めて"],
		colon: ["コロン"],
	},

	// ── Korean ─────────────────────────────────────────────────────
	ko: {
		newParagraph: ["새 단락", "새 문단"],
		newLine: ["새 줄", "다음 줄", "줄 바꿈"],
		heading1: ["제목 1", "제목 하나"],
		heading2: ["제목 2", "제목 둘"],
		heading3: ["제목 3", "제목 셋"],
		bulletPoint: ["새 항목", "다음 항목", "글머리 기호"],
		todoItem: ["새 할일", "할일 추가"],
		numberedItem: ["번호 항목", "다음 번호"],
		deleteLastParagraph: ["마지막 단락 삭제"],
		deleteLastLine: ["마지막 줄 삭제", "마지막 문장 삭제"],
		undo: ["실행 취소", "되돌리기"],
		stopRecording: ["녹음 중지", "녹음 멈춰"],
		colon: ["콜론"],
	},

	// ── Italian ────────────────────────────────────────────────────
	it: {
		newParagraph: ["nuovo paragrafo", "nuova sezione", "nuovo capoverso"],
		newLine: ["nuova riga", "a capo", "riga successiva"],
		heading1: ["titolo uno", "titolo 1"],
		heading2: ["titolo due", "titolo 2"],
		heading3: ["titolo tre", "titolo 3"],
		bulletPoint: ["nuovo punto", "nuovo elemento", "punto successivo", "nuovo elenco"],
		todoItem: ["nuovo compito", "nuova attivita", "nuovo todo", "nuovo to do"],
		numberedItem: ["punto numerato", "nuovo numero", "numero successivo"],
		deleteLastParagraph: ["cancella ultimo paragrafo", "elimina ultimo paragrafo"],
		deleteLastLine: ["cancella ultima riga", "elimina ultima riga", "cancella ultima frase"],
		undo: ["annulla"],
		stopRecording: ["ferma registrazione", "interrompi registrazione", "stop registrazione"],
		colon: ["due punti"],
	},
};

/** Localized command labels for the help panel */
export const LABELS: Partial<Record<LangCode, Record<CommandId, string>>> = {
	nl: {
		newParagraph: "Nieuwe alinea",
		newLine: "Nieuwe regel",
		heading1: "Kop 1",
		heading2: "Kop 2",
		heading3: "Kop 3",
		bulletPoint: "Lijstpunt",
		todoItem: "To-do item",
		numberedItem: "Genummerd punt",
		deleteLastParagraph: "Verwijder laatste alinea",
		deleteLastLine: "Verwijder laatste regel",
		undo: "Ongedaan maken",
		stopRecording: "Stop opname",
		colon: "Dubbele punt",
	},
	en: {
		newParagraph: "New paragraph",
		newLine: "New line",
		heading1: "Heading 1",
		heading2: "Heading 2",
		heading3: "Heading 3",
		bulletPoint: "Bullet point",
		todoItem: "To-do item",
		numberedItem: "Numbered item",
		deleteLastParagraph: "Delete last paragraph",
		deleteLastLine: "Delete last line",
		undo: "Undo",
		stopRecording: "Stop recording",
		colon: "Colon",
	},
	fr: {
		newParagraph: "Nouveau paragraphe",
		newLine: "Nouvelle ligne",
		heading1: "Titre 1",
		heading2: "Titre 2",
		heading3: "Titre 3",
		bulletPoint: "Puce",
		todoItem: "Tâche",
		numberedItem: "Point numéroté",
		deleteLastParagraph: "Supprimer dernier paragraphe",
		deleteLastLine: "Supprimer dernière ligne",
		undo: "Annuler",
		stopRecording: "Arrêter l'enregistrement",
		colon: "Deux-points",
	},
	de: {
		newParagraph: "Neuer Absatz",
		newLine: "Neue Zeile",
		heading1: "Überschrift 1",
		heading2: "Überschrift 2",
		heading3: "Überschrift 3",
		bulletPoint: "Aufzählungspunkt",
		todoItem: "Aufgabe",
		numberedItem: "Nummerierter Punkt",
		deleteLastParagraph: "Letzten Absatz löschen",
		deleteLastLine: "Letzte Zeile löschen",
		undo: "Rückgängig",
		stopRecording: "Aufnahme beenden",
		colon: "Doppelpunkt",
	},
	es: {
		newParagraph: "Nuevo párrafo",
		newLine: "Nueva línea",
		heading1: "Título 1",
		heading2: "Título 2",
		heading3: "Título 3",
		bulletPoint: "Viñeta",
		todoItem: "Tarea",
		numberedItem: "Punto numerado",
		deleteLastParagraph: "Borrar último párrafo",
		deleteLastLine: "Borrar última línea",
		undo: "Deshacer",
		stopRecording: "Parar grabación",
		colon: "Dos puntos",
	},
	pt: {
		newParagraph: "Novo parágrafo",
		newLine: "Nova linha",
		heading1: "Título 1",
		heading2: "Título 2",
		heading3: "Título 3",
		bulletPoint: "Ponto",
		todoItem: "Tarefa",
		numberedItem: "Ponto numerado",
		deleteLastParagraph: "Apagar último parágrafo",
		deleteLastLine: "Apagar última linha",
		undo: "Desfazer",
		stopRecording: "Parar gravação",
		colon: "Dois pontos",
	},
	ru: {
		newParagraph: "Новый абзац",
		newLine: "Новая строка",
		heading1: "Заголовок 1",
		heading2: "Заголовок 2",
		heading3: "Заголовок 3",
		bulletPoint: "Новый пункт",
		todoItem: "Новая задача",
		numberedItem: "Нумерованный пункт",
		deleteLastParagraph: "Удалить последний абзац",
		deleteLastLine: "Удалить последнюю строку",
		undo: "Отменить",
		stopRecording: "Остановить запись",
		colon: "Двоеточие",
	},
	zh: {
		newParagraph: "新段落",
		newLine: "换行",
		heading1: "标题 1",
		heading2: "标题 2",
		heading3: "标题 3",
		bulletPoint: "列表项",
		todoItem: "待办事项",
		numberedItem: "编号项",
		deleteLastParagraph: "删除上一段",
		deleteLastLine: "删除上一行",
		undo: "撤销",
		stopRecording: "停止录音",
		colon: "冒号",
	},
	hi: {
		newParagraph: "नया पैराग्राफ",
		newLine: "नई लाइन",
		heading1: "शीर्षक 1",
		heading2: "शीर्षक 2",
		heading3: "शीर्षक 3",
		bulletPoint: "नया बिंदु",
		todoItem: "नया कार्य",
		numberedItem: "क्रमांकित बिंदु",
		deleteLastParagraph: "पिछला पैराग्राफ हटाओ",
		deleteLastLine: "पिछली लाइन हटाओ",
		undo: "पूर्ववत",
		stopRecording: "रिकॉर्डिंग बंद करो",
		colon: "कोलन",
	},
	ar: {
		newParagraph: "فقرة جديدة",
		newLine: "سطر جديد",
		heading1: "عنوان 1",
		heading2: "عنوان 2",
		heading3: "عنوان 3",
		bulletPoint: "نقطة جديدة",
		todoItem: "مهمة جديدة",
		numberedItem: "عنصر مرقم",
		deleteLastParagraph: "احذف الفقرة الأخيرة",
		deleteLastLine: "احذف السطر الأخير",
		undo: "تراجع",
		stopRecording: "أوقف التسجيل",
		colon: "نقطتان",
	},
	ja: {
		newParagraph: "新しい段落",
		newLine: "改行",
		heading1: "見出し 1",
		heading2: "見出し 2",
		heading3: "見出し 3",
		bulletPoint: "箇条書き",
		todoItem: "新しいタスク",
		numberedItem: "番号付き",
		deleteLastParagraph: "最後の段落を削除",
		deleteLastLine: "最後の行を削除",
		undo: "元に戻す",
		stopRecording: "録音停止",
		colon: "コロン",
	},
	ko: {
		newParagraph: "새 단락",
		newLine: "새 줄",
		heading1: "제목 1",
		heading2: "제목 2",
		heading3: "제목 3",
		bulletPoint: "새 항목",
		todoItem: "새 할일",
		numberedItem: "번호 항목",
		deleteLastParagraph: "마지막 단락 삭제",
		deleteLastLine: "마지막 줄 삭제",
		undo: "실행 취소",
		stopRecording: "녹음 중지",
		colon: "콜론",
	},
	it: {
		newParagraph: "Nuovo paragrafo",
		newLine: "Nuova riga",
		heading1: "Titolo 1",
		heading2: "Titolo 2",
		heading3: "Titolo 3",
		bulletPoint: "Punto elenco",
		todoItem: "Attività",
		numberedItem: "Punto numerato",
		deleteLastParagraph: "Cancella ultimo paragrafo",
		deleteLastLine: "Cancella ultima riga",
		undo: "Annulla",
		stopRecording: "Ferma registrazione",
		colon: "Due punti",
	},
};

/**
 * Common speech-recognition mishearings per language.
 * Each entry is [pattern, replacement] applied after normalization.
 */
export const MISHEARINGS: Partial<Record<LangCode, [RegExp, string][]>> = {
	nl: [
		[/\bniveau\b/g, "nieuwe"],
		[/\bnieuw alinea\b/g, "nieuwe alinea"],
		[/\bnieuw regel\b/g, "nieuwe regel"],
		[/\bnieuw punt\b/g, "nieuw punt"],
	],
	fr: [
		[/\bnouveau ligne\b/g, "nouvelle ligne"],
		[/\bnouvelle paragraphe\b/g, "nouveau paragraphe"],
	],
	de: [
		[/\bneue absatz\b/g, "neuer absatz"],
		[/\bneues zeile\b/g, "neue zeile"],
	],
};

/**
 * Get patterns for a command, merging the active language with English fallback.
 * Returns deduplicated patterns, active language first.
 */
export function getPatternsForCommand(commandId: CommandId, lang: string): string[] {
	const langPatterns = PATTERNS[lang as LangCode]?.[commandId] ?? [];
	const enPatterns = lang === "en" ? [] : (PATTERNS.en?.[commandId] ?? []);
	// Deduplicate while preserving order (active language first)
	const seen = new Set<string>();
	const result: string[] = [];
	for (const p of [...langPatterns, ...enPatterns]) {
		if (!seen.has(p)) {
			seen.add(p);
			result.push(p);
		}
	}
	return result;
}

/**
 * Get the localized label for a command, falling back to English.
 */
export function getLabel(commandId: CommandId, lang: string): string {
	return LABELS[lang as LangCode]?.[commandId] ?? LABELS.en?.[commandId] ?? commandId;
}

/**
 * Get mishearing fixes for a language (always includes the active language).
 */
export function getMishearings(lang: string): [RegExp, string][] {
	return MISHEARINGS[lang as LangCode] ?? [];
}
