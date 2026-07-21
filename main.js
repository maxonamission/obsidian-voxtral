var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => VoxtralPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian9 = require("obsidian");

// ../shared/src/types.ts
var DEFAULT_SETTINGS = {
  settingsVersion: 10,
  apiKey: "",
  apiKeySecretId: "",
  apiBaseUrl: "https://api.mistral.ai",
  realtimeProtocol: "auto",
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
  autoOpenHelpDesktop: true,
  autoOpenHelpMobile: false,
  commandFeedback: true,
  debugLogging: false,
  fileTranscriptOutput: "cursor",
  fileTranscriptCorrect: false,
  fileTranscriptQualityWarnings: true,
  chunkSeconds: 600,
  fileTranscriptDiarize: false,
  fileTranscriptReview: false,
  ttsEnabled: false,
  ttsVoice: "en_paul_neutral",
  // a confirmed preset id; the live list is fetched (shared/src/tts.ts)
  vaultVocabulary: false,
  vaultWikilinks: false,
  localCorrectionUrl: "",
  localCorrectionModel: "ministral-3:3b"
};

// ../shared/src/similarity.ts
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from(
    { length: m + 1 },
    () => Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}
function normalizeCommand(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/-/g, " ").replace(/[.,!?;:'"()[\]{}]/g, "").toLowerCase().trim();
}

// ../shared/src/text-context.ts
function detectContext(lineBefore) {
  if (!lineBefore) return "new-line";
  const trimmed = lineBefore.trimEnd();
  if (!trimmed) return "new-line";
  if (/^>+\s/.test(lineBefore)) {
    const afterMarker = lineBefore.replace(/^>+\s(?:\[!.*?\]\s*)?/, "");
    if (!afterMarker.trim()) return "comment";
  }
  if (/^(?:[-*]\s|[-*]\s\[.\]\s|#{1,6}\s|\d+[.)]\s)/.test(lineBefore)) {
    const afterMarker = lineBefore.replace(
      /^(?:[-*]\s(?:\[.\]\s)?|#{1,6}\s|\d+[.)]\s)/,
      ""
    );
    if (!afterMarker.trim()) return "list-or-heading";
  }
  const lastChar = trimmed[trimmed.length - 1];
  if (lastChar === "." || lastChar === "!" || lastChar === "?") {
    return "sentence-start";
  }
  return "mid-sentence";
}
function shouldStripTrailingPunctuation(context) {
  return context === "mid-sentence" || context === "list-or-heading";
}
function shouldLowercase(context) {
  return context === "mid-sentence";
}
function lowercaseFirstLetter(text) {
  const match = text.match(
    /^(\s*)([A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝŸ])/
  );
  if (match) {
    return match[1] + match[2].toLowerCase() + text.slice(match[1].length + 1);
  }
  return text;
}
function stripTrailingPunctuation(text) {
  return text.replace(/[.!?]+\s*$/, "");
}
function isTableLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("|")) return true;
  if (/^:?-{2,}:?(\s*\|\s*:?-{2,}:?)+$/.test(trimmed)) return true;
  return false;
}

// ../shared/src/correction.ts
var DEFAULT_CORRECT_PROMPT = "You are a precise text corrector for dictated text. The input language may vary (commonly Dutch, but follow whatever language the text is in).\n\nCORRECT ONLY:\n- Capitalization (sentence starts, proper nouns)\n- Clearly misspelled or garbled words (from speech recognition)\n- Missing or wrong punctuation\n\nDO NOT CHANGE:\n- Sentence structure or word order\n- Style or tone\n- Markdown formatting (# headings, - lists, - [ ] to-do items)\n- Special prefix markers at the start of lines (e.g. >>, >, > [!note], etc.)\n- Text inserted by custom commands \u2014 these are intentional formatting elements\n\nINLINE CORRECTION INSTRUCTIONS:\nThe text was dictated via speech recognition. The speaker sometimes gives inline instructions meant for you. Recognize these patterns:\n- Explicit markers: 'voor de correctie', 'voor de correctie achteraf', 'for the correction', 'correction note'\n- Spelled-out words: 'V-O-X-T-R-A-L' or 'with an x' \u2192 merge into the intended word\n- Self-corrections: 'no not X but Y', 'nee niet X maar Y', 'I mean Y', 'ik bedoel Y'\n- Meta-commentary: 'that's a Dutch word', 'with a capital letter', 'met een hoofdletter'\n\nWhen you encounter such instructions:\n1. Apply the instruction to the REST of the text\n2. Remove the instruction/meta-commentary itself from the output\n3. Keep all content text \u2014 NEVER remove normal sentences\n\nCRITICAL RULES:\n- Your output must be SHORTER than or equal to the input (after removing meta-instructions)\n- NEVER add your own text, commentary, explanations, or notes\n- NEVER add parenthesized text like '(text missing)' or '(no corrections needed)'\n- NEVER continue, elaborate, or expand on the content\n- NEVER invent or hallucinate text that wasn't in the input\n- If the input is short (even one word), just return it corrected\n- Your output must contain ONLY the corrected version of the input text, NOTHING else";
function buildCustomCommandGuard(commands, lang) {
  var _a, _b, _c;
  const markers = [];
  for (const cmd of commands) {
    const localized = (_c = (_a = cmd.insertTextByLang) == null ? void 0 : _a[lang != null ? lang : "en"]) != null ? _c : (_b = cmd.insertTextByLang) == null ? void 0 : _b.en;
    if (localized) markers.push(localized.trim());
    if (cmd.insertText) markers.push(cmd.insertText.trim());
    if (cmd.slotPrefix) markers.push(cmd.slotPrefix.trim());
    if (cmd.slotSuffix) markers.push(cmd.slotSuffix.trim());
  }
  const unique = [...new Set(markers)].filter(Boolean);
  if (unique.length === 0) return "";
  const escaped = unique.map((m) => `"${m}"`).join(", ");
  return "\n\nCUSTOM COMMAND OUTPUT \u2014 DO NOT REMOVE:\nThe user has voice commands that insert specific text markers. These markers MUST be preserved exactly as-is: " + escaped + "\nNever strip, rewrite, or 'correct' these markers.";
}
function buildVocabularyGuard(terms) {
  const unique = [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
  if (unique.length === 0) return "";
  return "\n\nKNOWN VAULT TERMS:\nThe following are names/terms from the user's knowledge base (note titles, aliases, tags). If the transcript contains a close phonetic or misspelled match, prefer this exact spelling: " + unique.join(", ") + ".\nOnly apply this when there is a clear phonetic or spelling match \u2014 do not force unrelated words to match these terms.";
}
function applyVaultWikilinks(text, terms) {
  if (!text) return text;
  const unique = [...new Set(terms.map((t) => t.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );
  if (unique.length === 0) return text;
  const escaped = unique.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])(${escaped.join("|")})(?![\\p{L}\\p{N}_])`,
    "giu"
  );
  return text.replace(pattern, (match, _group, offset, full) => {
    var _a;
    const before = full.slice(Math.max(0, offset - 2), offset);
    const after = full.slice(offset + match.length, offset + match.length + 2);
    if (before === "[[" || after === "]]") return match;
    const canonical = (_a = unique.find((t) => t.toLowerCase() === match.toLowerCase())) != null ? _a : match;
    return `[[${canonical}]]`;
  });
}
function stripLlmCommentary(corrected, original) {
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
function isLikelyHallucination(text, audioDurationSec) {
  if (!text.trim()) return false;
  const words = text.trim().split(/\s+/).length;
  const wordsPerSec = audioDurationSec > 0 ? words / audioDurationSec : words;
  if (wordsPerSec > 5 && words > 20) {
    return true;
  }
  const blocks = text.split(/\n---\n|^---$/m).filter((b) => b.trim());
  if (blocks.length >= 3) {
    return true;
  }
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  if (sentences.length >= 6) {
    const normalized = sentences.map(
      (s) => s.trim().toLowerCase().replace(/\s+/g, " ")
    );
    const counts = /* @__PURE__ */ new Map();
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

// ../shared/src/languages/nl.json
var nl_default = {
  code: "nl",
  name: "Nederlands",
  patterns: {
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
    undoLastVoiceCommand: ["maak laatste commando ongedaan", "annuleer laatste commando", "laatste commando annuleren"],
    stopRecording: ["beeindig opname", "beeindig de opname", "stop opname", "stop de opname"],
    colon: ["dubbele punt", "double punt", "dubbelepunt"],
    wikilink: ["wikilink", "wiki link", "link"],
    boldOpen: ["vet openen", "dikgedrukt openen", "vet open"],
    boldClose: ["vet sluiten", "dikgedrukt sluiten", "vet dicht"],
    italicOpen: ["cursief openen", "schuingedrukt openen", "cursief open"],
    italicClose: ["cursief sluiten", "schuingedrukt sluiten", "cursief dicht"],
    inlineCodeOpen: ["code openen", "code open"],
    inlineCodeClose: ["code sluiten", "code dicht"],
    tagOpen: ["tag openen", "label openen", "tag open"],
    tagClose: ["tag sluiten", "label sluiten", "tag dicht"],
    codeBlockOpen: ["codeblok openen", "code blok openen", "codeblok open"],
    codeBlockClose: ["codeblok sluiten", "code blok sluiten", "codeblok dicht"]
  },
  labels: {
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
    undoLastVoiceCommand: "Laatste stemcommando ongedaan maken",
    stopRecording: "Stop opname",
    colon: "Dubbele punt",
    wikilink: "Wikilink [[\u2026]]",
    boldOpen: "Vet openen **",
    boldClose: "Vet sluiten **",
    italicOpen: "Cursief openen *",
    italicClose: "Cursief sluiten *",
    inlineCodeOpen: "Code openen `",
    inlineCodeClose: "Code sluiten `",
    tagOpen: "Tag openen #",
    tagClose: "Tag sluiten",
    codeBlockOpen: "Codeblok openen ```",
    codeBlockClose: "Codeblok sluiten ```"
  },
  mishearings: [
    { pattern: "\\bniveau\\b", flags: "g", replacement: "nieuwe" },
    { pattern: "\\bniva\\b", flags: "g", replacement: "nieuwe" },
    { pattern: "\\bnieuw alinea\\b", flags: "g", replacement: "nieuwe alinea" },
    { pattern: "\\bnieuw regel\\b", flags: "g", replacement: "nieuwe regel" },
    { pattern: "\\bnieuw punt\\b", flags: "g", replacement: "nieuw punt" },
    { pattern: "\\blinea\\b", flags: "g", replacement: "alinea" },
    { pattern: "\\blinie\\b", flags: "g", replacement: "alinea" },
    { pattern: "\\bbeeindigde\\b", flags: "g", replacement: "beeindig de" }
  ],
  phonetics: [
    { pattern: "ij", flags: "g", replacement: "ei" },
    { pattern: "au", flags: "g", replacement: "ou" },
    { pattern: "dt\\b", flags: "g", replacement: "t" },
    { pattern: "\\bsch", flags: "g", replacement: "sg" },
    { pattern: "ck", flags: "g", replacement: "k" },
    { pattern: "ph", flags: "g", replacement: "f" },
    { pattern: "th", flags: "g", replacement: "t" },
    { pattern: "ie", flags: "g", replacement: "i" },
    { pattern: "oe", flags: "g", replacement: "u" },
    { pattern: "ee", flags: "g", replacement: "e" },
    { pattern: "oo", flags: "g", replacement: "o" },
    { pattern: "uu", flags: "g", replacement: "u" },
    { pattern: "aa", flags: "g", replacement: "a" }
  ],
  articles: ["een", "de", "het", "die", "dat", "deze"],
  fillers: ["alsjeblieft", "graag", "even", "maar", "eens", "dan", "nu", "hoor"]
};

// ../shared/src/languages/en.json
var en_default = {
  code: "en",
  name: "English",
  patterns: {
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
    undoLastVoiceCommand: ["undo last command", "undo last voice command", "cancel last command"],
    stopRecording: ["stop recording"],
    colon: ["colon"],
    wikilink: ["wiki link", "wikilink", "link"],
    boldOpen: ["open bold", "bold open", "start bold"],
    boldClose: ["close bold", "bold close", "end bold"],
    italicOpen: ["open italic", "italic open", "start italic"],
    italicClose: ["close italic", "italic close", "end italic"],
    inlineCodeOpen: ["open code", "code open", "start code"],
    inlineCodeClose: ["close code", "code close", "end code"],
    tagOpen: ["open tag", "tag open", "start tag"],
    tagClose: ["close tag", "tag close", "end tag"],
    codeBlockOpen: ["open code block", "code block open", "start code block"],
    codeBlockClose: ["close code block", "code block close", "end code block"]
  },
  labels: {
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
    undoLastVoiceCommand: "Undo last voice command",
    stopRecording: "Stop recording",
    colon: "Colon",
    wikilink: "Wikilink [[\u2026]]",
    boldOpen: "Open bold **",
    boldClose: "Close bold **",
    italicOpen: "Open italic *",
    italicClose: "Close italic *",
    inlineCodeOpen: "Open code `",
    inlineCodeClose: "Close code `",
    tagOpen: "Open tag #",
    tagClose: "Close tag",
    codeBlockOpen: "Open code block ```",
    codeBlockClose: "Close code block ```"
  },
  mishearings: [],
  phonetics: [
    { pattern: "ph", flags: "g", replacement: "f" },
    { pattern: "th", flags: "g", replacement: "t" },
    { pattern: "ck", flags: "g", replacement: "k" },
    { pattern: "ght", flags: "g", replacement: "t" },
    { pattern: "wh", flags: "g", replacement: "w" },
    { pattern: "kn", flags: "g", replacement: "n" },
    { pattern: "wr", flags: "g", replacement: "r" },
    { pattern: "tion", flags: "g", replacement: "shun" },
    { pattern: "sion", flags: "g", replacement: "shun" },
    { pattern: "([aeiou])ll", flags: "g", replacement: "$1l" },
    { pattern: "([aeiou])dd", flags: "g", replacement: "$1d" },
    { pattern: "([aeiou])tt", flags: "g", replacement: "$1t" }
  ],
  articles: ["a", "an", "the"],
  fillers: ["please", "now", "then", "thanks"]
};

// ../shared/src/languages/fr.json
var fr_default = {
  code: "fr",
  name: "Fran\xE7ais",
  patterns: {
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
    wikilink: ["wiki lien", "lien wiki"],
    boldOpen: ["ouvrir gras", "gras ouvrir"],
    boldClose: ["fermer gras", "gras fermer"],
    italicOpen: ["ouvrir italique", "italique ouvrir"],
    italicClose: ["fermer italique", "italique fermer"],
    inlineCodeOpen: ["ouvrir code", "code ouvrir"],
    inlineCodeClose: ["fermer code", "code fermer"],
    tagOpen: ["ouvrir etiquette", "ouvrir tag"],
    tagClose: ["fermer etiquette", "fermer tag"],
    codeBlockOpen: ["ouvrir bloc de code"],
    codeBlockClose: ["fermer bloc de code"]
  },
  labels: {
    newParagraph: "Nouveau paragraphe",
    newLine: "Nouvelle ligne",
    heading1: "Titre 1",
    heading2: "Titre 2",
    heading3: "Titre 3",
    bulletPoint: "Puce",
    todoItem: "T\xE2che",
    numberedItem: "Point num\xE9rot\xE9",
    deleteLastParagraph: "Supprimer dernier paragraphe",
    deleteLastLine: "Supprimer derni\xE8re ligne",
    undo: "Annuler",
    stopRecording: "Arr\xEAter l'enregistrement",
    colon: "Deux-points",
    wikilink: "Wikilink [[\u2026]]",
    boldOpen: "Ouvrir gras **",
    boldClose: "Fermer gras **",
    italicOpen: "Ouvrir italique *",
    italicClose: "Fermer italique *",
    inlineCodeOpen: "Ouvrir code `",
    inlineCodeClose: "Fermer code `",
    tagOpen: "Ouvrir \xE9tiquette #",
    tagClose: "Fermer \xE9tiquette",
    codeBlockOpen: "Ouvrir bloc de code ```",
    codeBlockClose: "Fermer bloc de code ```"
  },
  mishearings: [
    { pattern: "\\bnouveau ligne\\b", flags: "g", replacement: "nouvelle ligne" },
    { pattern: "\\bnouvelle paragraphe\\b", flags: "g", replacement: "nouveau paragraphe" }
  ],
  phonetics: [
    { pattern: "eau", flags: "g", replacement: "o" },
    { pattern: "aux", flags: "g", replacement: "o" },
    { pattern: "ai", flags: "g", replacement: "e" },
    { pattern: "ei", flags: "g", replacement: "e" },
    { pattern: "ph", flags: "g", replacement: "f" },
    { pattern: "qu", flags: "g", replacement: "k" },
    { pattern: "gn", flags: "g", replacement: "ny" },
    { pattern: "oi", flags: "g", replacement: "wa" },
    { pattern: "ou", flags: "g", replacement: "u" },
    { pattern: "an", flags: "g", replacement: "on" },
    { pattern: "en", flags: "g", replacement: "on" }
  ],
  articles: ["un", "une", "le", "la", "les", "l", "du", "des"],
  fillers: ["s il vous plait", "s il te plait", "merci"]
};

// ../shared/src/languages/de.json
var de_default = {
  code: "de",
  name: "Deutsch",
  patterns: {
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
    wikilink: ["wikilink", "wiki link"],
    boldOpen: ["fett offnen", "fett auf"],
    boldClose: ["fett schliessen", "fett zu"],
    italicOpen: ["kursiv offnen", "kursiv auf"],
    italicClose: ["kursiv schliessen", "kursiv zu"],
    inlineCodeOpen: ["code offnen", "code auf"],
    inlineCodeClose: ["code schliessen", "code zu"],
    tagOpen: ["tag offnen", "tag auf"],
    tagClose: ["tag schliessen", "tag zu"],
    codeBlockOpen: ["codeblock offnen", "code block offnen"],
    codeBlockClose: ["codeblock schliessen", "code block schliessen"]
  },
  labels: {
    newParagraph: "Neuer Absatz",
    newLine: "Neue Zeile",
    heading1: "\xDCberschrift 1",
    heading2: "\xDCberschrift 2",
    heading3: "\xDCberschrift 3",
    bulletPoint: "Aufz\xE4hlungspunkt",
    todoItem: "Aufgabe",
    numberedItem: "Nummerierter Punkt",
    deleteLastParagraph: "Letzten Absatz l\xF6schen",
    deleteLastLine: "Letzte Zeile l\xF6schen",
    undo: "R\xFCckg\xE4ngig",
    stopRecording: "Aufnahme beenden",
    colon: "Doppelpunkt",
    wikilink: "Wikilink [[\u2026]]",
    boldOpen: "Fett \xF6ffnen **",
    boldClose: "Fett schlie\xDFen **",
    italicOpen: "Kursiv \xF6ffnen *",
    italicClose: "Kursiv schlie\xDFen *",
    inlineCodeOpen: "Code \xF6ffnen `",
    inlineCodeClose: "Code schlie\xDFen `",
    tagOpen: "Tag \xF6ffnen #",
    tagClose: "Tag schlie\xDFen",
    codeBlockOpen: "Codeblock \xF6ffnen ```",
    codeBlockClose: "Codeblock schlie\xDFen ```"
  },
  mishearings: [
    { pattern: "\\bneue absatz\\b", flags: "g", replacement: "neuer absatz" },
    { pattern: "\\bneues zeile\\b", flags: "g", replacement: "neue zeile" }
  ],
  phonetics: [
    { pattern: "sch", flags: "g", replacement: "sh" },
    { pattern: "ei", flags: "g", replacement: "ai" },
    { pattern: "ie", flags: "g", replacement: "i" },
    { pattern: "ck", flags: "g", replacement: "k" },
    { pattern: "ph", flags: "g", replacement: "f" },
    { pattern: "th", flags: "g", replacement: "t" },
    { pattern: "v", flags: "g", replacement: "f" },
    { pattern: "tz", flags: "g", replacement: "ts" },
    { pattern: "dt\\b", flags: "g", replacement: "t" },
    { pattern: "aa", flags: "g", replacement: "a" },
    { pattern: "ee", flags: "g", replacement: "e" },
    { pattern: "oo", flags: "g", replacement: "o" }
  ],
  articles: ["ein", "eine", "einen", "einem", "einer", "der", "die", "das", "den", "dem", "des"],
  fillers: ["bitte", "mal", "jetzt", "dann"]
};

// ../shared/src/languages/es.json
var es_default = {
  code: "es",
  name: "Espa\xF1ol",
  patterns: {
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
    wikilink: ["wikilink", "enlace wiki"],
    boldOpen: ["abrir negrita", "negrita abrir"],
    boldClose: ["cerrar negrita", "negrita cerrar"],
    italicOpen: ["abrir cursiva", "cursiva abrir"],
    italicClose: ["cerrar cursiva", "cursiva cerrar"],
    inlineCodeOpen: ["abrir codigo", "codigo abrir"],
    inlineCodeClose: ["cerrar codigo", "codigo cerrar"],
    tagOpen: ["abrir etiqueta", "abrir tag"],
    tagClose: ["cerrar etiqueta", "cerrar tag"],
    codeBlockOpen: ["abrir bloque de codigo"],
    codeBlockClose: ["cerrar bloque de codigo"]
  },
  labels: {
    newParagraph: "Nuevo p\xE1rrafo",
    newLine: "Nueva l\xEDnea",
    heading1: "T\xEDtulo 1",
    heading2: "T\xEDtulo 2",
    heading3: "T\xEDtulo 3",
    bulletPoint: "Vi\xF1eta",
    todoItem: "Tarea",
    numberedItem: "Punto numerado",
    deleteLastParagraph: "Borrar \xFAltimo p\xE1rrafo",
    deleteLastLine: "Borrar \xFAltima l\xEDnea",
    undo: "Deshacer",
    stopRecording: "Parar grabaci\xF3n",
    colon: "Dos puntos",
    wikilink: "Wikilink [[\u2026]]",
    boldOpen: "Abrir negrita **",
    boldClose: "Cerrar negrita **",
    italicOpen: "Abrir cursiva *",
    italicClose: "Cerrar cursiva *",
    inlineCodeOpen: "Abrir c\xF3digo `",
    inlineCodeClose: "Cerrar c\xF3digo `",
    tagOpen: "Abrir etiqueta #",
    tagClose: "Cerrar etiqueta",
    codeBlockOpen: "Abrir bloque de c\xF3digo ```",
    codeBlockClose: "Cerrar bloque de c\xF3digo ```"
  },
  mishearings: [],
  phonetics: [
    { pattern: "ll", flags: "g", replacement: "y" },
    { pattern: "v", flags: "g", replacement: "b" },
    { pattern: "ce", flags: "g", replacement: "se" },
    { pattern: "ci", flags: "g", replacement: "si" },
    { pattern: "qu", flags: "g", replacement: "k" },
    { pattern: "gu(?=[ei])", flags: "g", replacement: "g" },
    { pattern: "h", flags: "g", replacement: "" }
  ],
  articles: ["un", "una", "el", "la", "los", "las", "unos", "unas"],
  fillers: ["por favor", "ahora", "gracias"]
};

// ../shared/src/languages/pt.json
var pt_default = {
  code: "pt",
  name: "Portugu\xEAs",
  patterns: {
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
    wikilink: ["wikilink", "link wiki"],
    boldOpen: ["abrir negrito", "negrito abrir"],
    boldClose: ["fechar negrito", "negrito fechar"],
    italicOpen: ["abrir italico", "italico abrir"],
    italicClose: ["fechar italico", "italico fechar"],
    inlineCodeOpen: ["abrir codigo", "codigo abrir"],
    inlineCodeClose: ["fechar codigo", "codigo fechar"],
    tagOpen: ["abrir etiqueta", "abrir tag"],
    tagClose: ["fechar etiqueta", "fechar tag"],
    codeBlockOpen: ["abrir bloco de codigo"],
    codeBlockClose: ["fechar bloco de codigo"]
  },
  labels: {
    newParagraph: "Novo par\xE1grafo",
    newLine: "Nova linha",
    heading1: "T\xEDtulo 1",
    heading2: "T\xEDtulo 2",
    heading3: "T\xEDtulo 3",
    bulletPoint: "Ponto",
    todoItem: "Tarefa",
    numberedItem: "Ponto numerado",
    deleteLastParagraph: "Apagar \xFAltimo par\xE1grafo",
    deleteLastLine: "Apagar \xFAltima linha",
    undo: "Desfazer",
    stopRecording: "Parar grava\xE7\xE3o",
    colon: "Dois pontos",
    wikilink: "Wikilink [[\u2026]]",
    boldOpen: "Abrir negrito **",
    boldClose: "Fechar negrito **",
    italicOpen: "Abrir it\xE1lico *",
    italicClose: "Fechar it\xE1lico *",
    inlineCodeOpen: "Abrir c\xF3digo `",
    inlineCodeClose: "Fechar c\xF3digo `",
    tagOpen: "Abrir etiqueta #",
    tagClose: "Fechar etiqueta",
    codeBlockOpen: "Abrir bloco de c\xF3digo ```",
    codeBlockClose: "Fechar bloco de c\xF3digo ```"
  },
  mishearings: [],
  phonetics: [
    { pattern: "lh", flags: "g", replacement: "ly" },
    { pattern: "nh", flags: "g", replacement: "ny" },
    { pattern: "ch", flags: "g", replacement: "sh" },
    { pattern: "qu", flags: "g", replacement: "k" },
    { pattern: "\xE7\xE3o", flags: "g", replacement: "saun" },
    { pattern: "ss", flags: "g", replacement: "s" }
  ],
  articles: ["um", "uma", "o", "a", "os", "as", "uns", "umas"],
  fillers: ["por favor", "agora", "obrigado"]
};

// ../shared/src/languages/it.json
var it_default = {
  code: "it",
  name: "Italiano",
  patterns: {
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
    wikilink: ["wikilink", "link wiki"],
    boldOpen: ["apri grassetto", "grassetto apri"],
    boldClose: ["chiudi grassetto", "grassetto chiudi"],
    italicOpen: ["apri corsivo", "corsivo apri"],
    italicClose: ["chiudi corsivo", "corsivo chiudi"],
    inlineCodeOpen: ["apri codice", "codice apri"],
    inlineCodeClose: ["chiudi codice", "codice chiudi"],
    tagOpen: ["apri tag", "apri etichetta"],
    tagClose: ["chiudi tag", "chiudi etichetta"],
    codeBlockOpen: ["apri blocco di codice"],
    codeBlockClose: ["chiudi blocco di codice"]
  },
  labels: {
    newParagraph: "Nuovo paragrafo",
    newLine: "Nuova riga",
    heading1: "Titolo 1",
    heading2: "Titolo 2",
    heading3: "Titolo 3",
    bulletPoint: "Punto elenco",
    todoItem: "Attivit\xE0",
    numberedItem: "Punto numerato",
    deleteLastParagraph: "Cancella ultimo paragrafo",
    deleteLastLine: "Cancella ultima riga",
    undo: "Annulla",
    stopRecording: "Ferma registrazione",
    colon: "Due punti",
    wikilink: "Wikilink [[\u2026]]",
    boldOpen: "Apri grassetto **",
    boldClose: "Chiudi grassetto **",
    italicOpen: "Apri corsivo *",
    italicClose: "Chiudi corsivo *",
    inlineCodeOpen: "Apri codice `",
    inlineCodeClose: "Chiudi codice `",
    tagOpen: "Apri tag #",
    tagClose: "Chiudi tag",
    codeBlockOpen: "Apri blocco di codice ```",
    codeBlockClose: "Chiudi blocco di codice ```"
  },
  mishearings: [],
  phonetics: [
    { pattern: "gn", flags: "g", replacement: "ny" },
    { pattern: "gl(?=[i])", flags: "g", replacement: "ly" },
    { pattern: "ch", flags: "g", replacement: "k" },
    { pattern: "gh", flags: "g", replacement: "g" },
    { pattern: "sc(?=[ei])", flags: "g", replacement: "sh" },
    { pattern: "zz", flags: "g", replacement: "ts" },
    { pattern: "cc(?=[ei])", flags: "g", replacement: "ch" }
  ],
  articles: ["un", "uno", "una", "il", "lo", "la", "i", "gli", "le"],
  fillers: ["per favore", "ora", "adesso", "grazie"]
};

// ../shared/src/languages/ru.json
var ru_default = {
  code: "ru",
  name: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439",
  patterns: {
    newParagraph: ["\u043D\u043E\u0432\u044B\u0439 \u0430\u0431\u0437\u0430\u0446", "\u043D\u043E\u0432\u044B\u0439 \u043F\u0430\u0440\u0430\u0433\u0440\u0430\u0444"],
    newLine: ["\u043D\u043E\u0432\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430", "\u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430"],
    heading1: ["\u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A \u043E\u0434\u0438\u043D", "\u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A 1"],
    heading2: ["\u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A \u0434\u0432\u0430", "\u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A 2"],
    heading3: ["\u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A \u0442\u0440\u0438", "\u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A 3"],
    bulletPoint: ["\u043D\u043E\u0432\u044B\u0439 \u043F\u0443\u043D\u043A\u0442", "\u043D\u043E\u0432\u044B\u0439 \u044D\u043B\u0435\u043C\u0435\u043D\u0442", "\u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u043F\u0443\u043D\u043A\u0442"],
    todoItem: ["\u043D\u043E\u0432\u0430\u044F \u0437\u0430\u0434\u0430\u0447\u0430", "\u043D\u043E\u0432\u043E\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u0435"],
    numberedItem: ["\u043D\u0443\u043C\u0435\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u043F\u0443\u043D\u043A\u0442", "\u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u043D\u043E\u043C\u0435\u0440"],
    deleteLastParagraph: ["\u0443\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0439 \u0430\u0431\u0437\u0430\u0446"],
    deleteLastLine: ["\u0443\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u044E\u044E \u0441\u0442\u0440\u043E\u043A\u0443", "\u0443\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0435 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435"],
    undo: ["\u043E\u0442\u043C\u0435\u043D\u0438\u0442\u044C", "\u043E\u0442\u043C\u0435\u043D\u0430"],
    stopRecording: ["\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C", "\u0441\u0442\u043E\u043F \u0437\u0430\u043F\u0438\u0441\u044C"],
    colon: ["\u0434\u0432\u043E\u0435\u0442\u043E\u0447\u0438\u0435"],
    wikilink: ["\u0432\u0438\u043A\u0438 \u0441\u0441\u044B\u043B\u043A\u0430", "\u0432\u0438\u043A\u0438 \u043B\u0438\u043D\u043A"],
    boldOpen: ["\u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0436\u0438\u0440\u043D\u044B\u0439", "\u0436\u0438\u0440\u043D\u044B\u0439 \u043E\u0442\u043A\u0440\u044B\u0442\u044C"],
    boldClose: ["\u0437\u0430\u043A\u0440\u044B\u0442\u044C \u0436\u0438\u0440\u043D\u044B\u0439", "\u0436\u0438\u0440\u043D\u044B\u0439 \u0437\u0430\u043A\u0440\u044B\u0442\u044C"],
    italicOpen: ["\u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043A\u0443\u0440\u0441\u0438\u0432", "\u043A\u0443\u0440\u0441\u0438\u0432 \u043E\u0442\u043A\u0440\u044B\u0442\u044C"],
    italicClose: ["\u0437\u0430\u043A\u0440\u044B\u0442\u044C \u043A\u0443\u0440\u0441\u0438\u0432", "\u043A\u0443\u0440\u0441\u0438\u0432 \u0437\u0430\u043A\u0440\u044B\u0442\u044C"],
    inlineCodeOpen: ["\u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043A\u043E\u0434", "\u043A\u043E\u0434 \u043E\u0442\u043A\u0440\u044B\u0442\u044C"],
    inlineCodeClose: ["\u0437\u0430\u043A\u0440\u044B\u0442\u044C \u043A\u043E\u0434", "\u043A\u043E\u0434 \u0437\u0430\u043A\u0440\u044B\u0442\u044C"],
    tagOpen: ["\u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0442\u0435\u0433", "\u0442\u0435\u0433 \u043E\u0442\u043A\u0440\u044B\u0442\u044C"],
    tagClose: ["\u0437\u0430\u043A\u0440\u044B\u0442\u044C \u0442\u0435\u0433", "\u0442\u0435\u0433 \u0437\u0430\u043A\u0440\u044B\u0442\u044C"],
    codeBlockOpen: ["\u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0431\u043B\u043E\u043A \u043A\u043E\u0434\u0430"],
    codeBlockClose: ["\u0437\u0430\u043A\u0440\u044B\u0442\u044C \u0431\u043B\u043E\u043A \u043A\u043E\u0434\u0430"]
  },
  labels: {
    newParagraph: "\u041D\u043E\u0432\u044B\u0439 \u0430\u0431\u0437\u0430\u0446",
    newLine: "\u041D\u043E\u0432\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430",
    heading1: "\u0417\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A 1",
    heading2: "\u0417\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A 2",
    heading3: "\u0417\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A 3",
    bulletPoint: "\u041D\u043E\u0432\u044B\u0439 \u043F\u0443\u043D\u043A\u0442",
    todoItem: "\u041D\u043E\u0432\u0430\u044F \u0437\u0430\u0434\u0430\u0447\u0430",
    numberedItem: "\u041D\u0443\u043C\u0435\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u043F\u0443\u043D\u043A\u0442",
    deleteLastParagraph: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0439 \u0430\u0431\u0437\u0430\u0446",
    deleteLastLine: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u044E\u044E \u0441\u0442\u0440\u043E\u043A\u0443",
    undo: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C",
    stopRecording: "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C",
    colon: "\u0414\u0432\u043E\u0435\u0442\u043E\u0447\u0438\u0435",
    wikilink: "\u0412\u0438\u043A\u0438-\u0441\u0441\u044B\u043B\u043A\u0430 [[\u2026]]",
    boldOpen: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0436\u0438\u0440\u043D\u044B\u0439 **",
    boldClose: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0436\u0438\u0440\u043D\u044B\u0439 **",
    italicOpen: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043A\u0443\u0440\u0441\u0438\u0432 *",
    italicClose: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u043A\u0443\u0440\u0441\u0438\u0432 *",
    inlineCodeOpen: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043A\u043E\u0434 `",
    inlineCodeClose: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u043A\u043E\u0434 `",
    tagOpen: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0442\u0435\u0433 #",
    tagClose: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0442\u0435\u0433",
    codeBlockOpen: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0431\u043B\u043E\u043A \u043A\u043E\u0434\u0430 ```",
    codeBlockClose: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0431\u043B\u043E\u043A \u043A\u043E\u0434\u0430 ```"
  },
  mishearings: [],
  phonetics: [],
  articles: [],
  fillers: []
};

// ../shared/src/languages/zh.json
var zh_default = {
  code: "zh",
  name: "\u4E2D\u6587",
  patterns: {
    newParagraph: ["\u65B0\u6BB5\u843D", "\u65B0\u7684\u6BB5\u843D"],
    newLine: ["\u6362\u884C", "\u65B0\u884C", "\u4E0B\u4E00\u884C"],
    heading1: ["\u6807\u9898\u4E00", "\u6807\u98981", "\u4E00\u7EA7\u6807\u9898"],
    heading2: ["\u6807\u9898\u4E8C", "\u6807\u98982", "\u4E8C\u7EA7\u6807\u9898"],
    heading3: ["\u6807\u9898\u4E09", "\u6807\u98983", "\u4E09\u7EA7\u6807\u9898"],
    bulletPoint: ["\u65B0\u9879\u76EE", "\u5217\u8868\u9879", "\u65B0\u7684\u9879\u76EE"],
    todoItem: ["\u65B0\u4EFB\u52A1", "\u65B0\u5F85\u529E", "\u5F85\u529E\u4E8B\u9879"],
    numberedItem: ["\u7F16\u53F7\u9879", "\u65B0\u7F16\u53F7", "\u4E0B\u4E00\u4E2A\u7F16\u53F7"],
    deleteLastParagraph: ["\u5220\u9664\u4E0A\u4E00\u6BB5", "\u5220\u9664\u6700\u540E\u4E00\u6BB5"],
    deleteLastLine: ["\u5220\u9664\u4E0A\u4E00\u884C", "\u5220\u9664\u4E0A\u4E00\u53E5"],
    undo: ["\u64A4\u9500", "\u64A4\u56DE"],
    stopRecording: ["\u505C\u6B62\u5F55\u97F3", "\u7ED3\u675F\u5F55\u97F3"],
    colon: ["\u5192\u53F7"],
    wikilink: ["\u7EF4\u57FA\u94FE\u63A5", "\u94FE\u63A5"],
    boldOpen: ["\u5F00\u59CB\u52A0\u7C97", "\u52A0\u7C97\u5F00\u59CB", "\u6253\u5F00\u7C97\u4F53"],
    boldClose: ["\u7ED3\u675F\u52A0\u7C97", "\u52A0\u7C97\u7ED3\u675F", "\u5173\u95ED\u7C97\u4F53"],
    italicOpen: ["\u5F00\u59CB\u659C\u4F53", "\u659C\u4F53\u5F00\u59CB", "\u6253\u5F00\u659C\u4F53"],
    italicClose: ["\u7ED3\u675F\u659C\u4F53", "\u659C\u4F53\u7ED3\u675F", "\u5173\u95ED\u659C\u4F53"],
    inlineCodeOpen: ["\u5F00\u59CB\u4EE3\u7801", "\u4EE3\u7801\u5F00\u59CB", "\u6253\u5F00\u4EE3\u7801"],
    inlineCodeClose: ["\u7ED3\u675F\u4EE3\u7801", "\u4EE3\u7801\u7ED3\u675F", "\u5173\u95ED\u4EE3\u7801"],
    tagOpen: ["\u5F00\u59CB\u6807\u7B7E", "\u6253\u5F00\u6807\u7B7E"],
    tagClose: ["\u7ED3\u675F\u6807\u7B7E", "\u5173\u95ED\u6807\u7B7E"],
    codeBlockOpen: ["\u5F00\u59CB\u4EE3\u7801\u5757", "\u6253\u5F00\u4EE3\u7801\u5757"],
    codeBlockClose: ["\u7ED3\u675F\u4EE3\u7801\u5757", "\u5173\u95ED\u4EE3\u7801\u5757"]
  },
  labels: {
    newParagraph: "\u65B0\u6BB5\u843D",
    newLine: "\u6362\u884C",
    heading1: "\u6807\u9898 1",
    heading2: "\u6807\u9898 2",
    heading3: "\u6807\u9898 3",
    bulletPoint: "\u5217\u8868\u9879",
    todoItem: "\u5F85\u529E\u4E8B\u9879",
    numberedItem: "\u7F16\u53F7\u9879",
    deleteLastParagraph: "\u5220\u9664\u4E0A\u4E00\u6BB5",
    deleteLastLine: "\u5220\u9664\u4E0A\u4E00\u884C",
    undo: "\u64A4\u9500",
    stopRecording: "\u505C\u6B62\u5F55\u97F3",
    colon: "\u5192\u53F7",
    wikilink: "\u7EF4\u57FA\u94FE\u63A5 [[\u2026]]",
    boldOpen: "\u5F00\u59CB\u52A0\u7C97 **",
    boldClose: "\u7ED3\u675F\u52A0\u7C97 **",
    italicOpen: "\u5F00\u59CB\u659C\u4F53 *",
    italicClose: "\u7ED3\u675F\u659C\u4F53 *",
    inlineCodeOpen: "\u5F00\u59CB\u4EE3\u7801 `",
    inlineCodeClose: "\u7ED3\u675F\u4EE3\u7801 `",
    tagOpen: "\u5F00\u59CB\u6807\u7B7E #",
    tagClose: "\u7ED3\u675F\u6807\u7B7E",
    codeBlockOpen: "\u5F00\u59CB\u4EE3\u7801\u5757 ```",
    codeBlockClose: "\u7ED3\u675F\u4EE3\u7801\u5757 ```"
  },
  mishearings: [],
  phonetics: [],
  articles: [],
  fillers: []
};

// ../shared/src/languages/hi.json
var hi_default = {
  code: "hi",
  name: "\u0939\u093F\u0928\u094D\u0926\u0940",
  patterns: {
    newParagraph: ["\u0928\u092F\u093E \u092A\u0948\u0930\u093E\u0917\u094D\u0930\u093E\u092B", "\u0928\u092F\u093E \u0905\u0928\u0941\u091A\u094D\u091B\u0947\u0926"],
    newLine: ["\u0928\u0908 \u0932\u093E\u0907\u0928", "\u0905\u0917\u0932\u0940 \u0932\u093E\u0907\u0928"],
    heading1: ["\u0936\u0940\u0930\u094D\u0937\u0915 \u090F\u0915", "\u0936\u0940\u0930\u094D\u0937\u0915 1", "\u0939\u0947\u0921\u093F\u0902\u0917 1"],
    heading2: ["\u0936\u0940\u0930\u094D\u0937\u0915 \u0926\u094B", "\u0936\u0940\u0930\u094D\u0937\u0915 2", "\u0939\u0947\u0921\u093F\u0902\u0917 2"],
    heading3: ["\u0936\u0940\u0930\u094D\u0937\u0915 \u0924\u0940\u0928", "\u0936\u0940\u0930\u094D\u0937\u0915 3", "\u0939\u0947\u0921\u093F\u0902\u0917 3"],
    bulletPoint: ["\u0928\u092F\u093E \u092C\u093F\u0902\u0926\u0941", "\u0928\u092F\u093E \u092A\u0949\u0907\u0902\u091F", "\u0905\u0917\u0932\u093E \u092A\u0949\u0907\u0902\u091F"],
    todoItem: ["\u0928\u092F\u093E \u0915\u093E\u0930\u094D\u092F", "\u0928\u092F\u093E \u091F\u0942\u0921\u0942"],
    numberedItem: ["\u0915\u094D\u0930\u092E\u093E\u0902\u0915\u093F\u0924 \u092C\u093F\u0902\u0926\u0941", "\u0905\u0917\u0932\u093E \u0928\u0902\u092C\u0930"],
    deleteLastParagraph: ["\u092A\u093F\u091B\u0932\u093E \u092A\u0948\u0930\u093E\u0917\u094D\u0930\u093E\u092B \u0939\u091F\u093E\u0913"],
    deleteLastLine: ["\u092A\u093F\u091B\u0932\u0940 \u0932\u093E\u0907\u0928 \u0939\u091F\u093E\u0913", "\u0905\u0902\u0924\u093F\u092E \u0932\u093E\u0907\u0928 \u0939\u091F\u093E\u0913"],
    undo: ["\u092A\u0942\u0930\u094D\u0935\u0935\u0924", "\u0905\u0928\u0921\u0942"],
    stopRecording: ["\u0930\u093F\u0915\u0949\u0930\u094D\u0921\u093F\u0902\u0917 \u092C\u0902\u0926 \u0915\u0930\u094B", "\u0930\u093F\u0915\u0949\u0930\u094D\u0921\u093F\u0902\u0917 \u0930\u094B\u0915\u094B"],
    colon: ["\u0915\u094B\u0932\u0928"],
    wikilink: ["\u0935\u093F\u0915\u093F \u0932\u093F\u0902\u0915", "\u0932\u093F\u0902\u0915"],
    boldOpen: ["\u092C\u094B\u0932\u094D\u0921 \u0916\u094B\u0932\u094B", "\u092E\u094B\u091F\u093E \u0916\u094B\u0932\u094B"],
    boldClose: ["\u092C\u094B\u0932\u094D\u0921 \u092C\u0902\u0926 \u0915\u0930\u094B", "\u092E\u094B\u091F\u093E \u092C\u0902\u0926 \u0915\u0930\u094B"],
    italicOpen: ["\u0907\u091F\u0948\u0932\u093F\u0915 \u0916\u094B\u0932\u094B", "\u0924\u093F\u0930\u091B\u093E \u0916\u094B\u0932\u094B"],
    italicClose: ["\u0907\u091F\u0948\u0932\u093F\u0915 \u092C\u0902\u0926 \u0915\u0930\u094B", "\u0924\u093F\u0930\u091B\u093E \u092C\u0902\u0926 \u0915\u0930\u094B"],
    inlineCodeOpen: ["\u0915\u094B\u0921 \u0916\u094B\u0932\u094B"],
    inlineCodeClose: ["\u0915\u094B\u0921 \u092C\u0902\u0926 \u0915\u0930\u094B"],
    tagOpen: ["\u091F\u0948\u0917 \u0916\u094B\u0932\u094B"],
    tagClose: ["\u091F\u0948\u0917 \u092C\u0902\u0926 \u0915\u0930\u094B"],
    codeBlockOpen: ["\u0915\u094B\u0921 \u092C\u094D\u0932\u0949\u0915 \u0916\u094B\u0932\u094B"],
    codeBlockClose: ["\u0915\u094B\u0921 \u092C\u094D\u0932\u0949\u0915 \u092C\u0902\u0926 \u0915\u0930\u094B"]
  },
  labels: {
    newParagraph: "\u0928\u092F\u093E \u092A\u0948\u0930\u093E\u0917\u094D\u0930\u093E\u092B",
    newLine: "\u0928\u0908 \u0932\u093E\u0907\u0928",
    heading1: "\u0936\u0940\u0930\u094D\u0937\u0915 1",
    heading2: "\u0936\u0940\u0930\u094D\u0937\u0915 2",
    heading3: "\u0936\u0940\u0930\u094D\u0937\u0915 3",
    bulletPoint: "\u0928\u092F\u093E \u092C\u093F\u0902\u0926\u0941",
    todoItem: "\u0928\u092F\u093E \u0915\u093E\u0930\u094D\u092F",
    numberedItem: "\u0915\u094D\u0930\u092E\u093E\u0902\u0915\u093F\u0924 \u092C\u093F\u0902\u0926\u0941",
    deleteLastParagraph: "\u092A\u093F\u091B\u0932\u093E \u092A\u0948\u0930\u093E\u0917\u094D\u0930\u093E\u092B \u0939\u091F\u093E\u0913",
    deleteLastLine: "\u092A\u093F\u091B\u0932\u0940 \u0932\u093E\u0907\u0928 \u0939\u091F\u093E\u0913",
    undo: "\u092A\u0942\u0930\u094D\u0935\u0935\u0924",
    stopRecording: "\u0930\u093F\u0915\u0949\u0930\u094D\u0921\u093F\u0902\u0917 \u092C\u0902\u0926 \u0915\u0930\u094B",
    colon: "\u0915\u094B\u0932\u0928",
    wikilink: "\u0935\u093F\u0915\u093F \u0932\u093F\u0902\u0915 [[\u2026]]",
    boldOpen: "\u092C\u094B\u0932\u094D\u0921 \u0916\u094B\u0932\u094B **",
    boldClose: "\u092C\u094B\u0932\u094D\u0921 \u092C\u0902\u0926 \u0915\u0930\u094B **",
    italicOpen: "\u0907\u091F\u0948\u0932\u093F\u0915 \u0916\u094B\u0932\u094B *",
    italicClose: "\u0907\u091F\u0948\u0932\u093F\u0915 \u092C\u0902\u0926 \u0915\u0930\u094B *",
    inlineCodeOpen: "\u0915\u094B\u0921 \u0916\u094B\u0932\u094B `",
    inlineCodeClose: "\u0915\u094B\u0921 \u092C\u0902\u0926 \u0915\u0930\u094B `",
    tagOpen: "\u091F\u0948\u0917 \u0916\u094B\u0932\u094B #",
    tagClose: "\u091F\u0948\u0917 \u092C\u0902\u0926 \u0915\u0930\u094B",
    codeBlockOpen: "\u0915\u094B\u0921 \u092C\u094D\u0932\u0949\u0915 \u0916\u094B\u0932\u094B ```",
    codeBlockClose: "\u0915\u094B\u0921 \u092C\u094D\u0932\u0949\u0915 \u092C\u0902\u0926 \u0915\u0930\u094B ```"
  },
  mishearings: [],
  phonetics: [],
  articles: [],
  fillers: []
};

// ../shared/src/languages/ar.json
var ar_default = {
  code: "ar",
  name: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629",
  patterns: {
    newParagraph: ["\u0641\u0642\u0631\u0629 \u062C\u062F\u064A\u062F\u0629"],
    newLine: ["\u0633\u0637\u0631 \u062C\u062F\u064A\u062F", "\u0627\u0644\u0633\u0637\u0631 \u0627\u0644\u062A\u0627\u0644\u064A"],
    heading1: ["\u0639\u0646\u0648\u0627\u0646 \u0648\u0627\u062D\u062F", "\u0639\u0646\u0648\u0627\u0646 1"],
    heading2: ["\u0639\u0646\u0648\u0627\u0646 \u0627\u062B\u0646\u064A\u0646", "\u0639\u0646\u0648\u0627\u0646 2"],
    heading3: ["\u0639\u0646\u0648\u0627\u0646 \u062B\u0644\u0627\u062B\u0629", "\u0639\u0646\u0648\u0627\u0646 3"],
    bulletPoint: ["\u0646\u0642\u0637\u0629 \u062C\u062F\u064A\u062F\u0629", "\u0639\u0646\u0635\u0631 \u062C\u062F\u064A\u062F"],
    todoItem: ["\u0645\u0647\u0645\u0629 \u062C\u062F\u064A\u062F\u0629"],
    numberedItem: ["\u0639\u0646\u0635\u0631 \u0645\u0631\u0642\u0645", "\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u062A\u0627\u0644\u064A"],
    deleteLastParagraph: ["\u0627\u062D\u0630\u0641 \u0627\u0644\u0641\u0642\u0631\u0629 \u0627\u0644\u0623\u062E\u064A\u0631\u0629"],
    deleteLastLine: ["\u0627\u062D\u0630\u0641 \u0627\u0644\u0633\u0637\u0631 \u0627\u0644\u0623\u062E\u064A\u0631", "\u0627\u062D\u0630\u0641 \u0627\u0644\u062C\u0645\u0644\u0629 \u0627\u0644\u0623\u062E\u064A\u0631\u0629"],
    undo: ["\u062A\u0631\u0627\u062C\u0639"],
    stopRecording: ["\u0623\u0648\u0642\u0641 \u0627\u0644\u062A\u0633\u062C\u064A\u0644", "\u0625\u064A\u0642\u0627\u0641 \u0627\u0644\u062A\u0633\u062C\u064A\u0644"],
    colon: ["\u0646\u0642\u0637\u062A\u0627\u0646"],
    wikilink: ["\u0631\u0627\u0628\u0637 \u0648\u064A\u0643\u064A", "\u0631\u0627\u0628\u0637"],
    boldOpen: ["\u0627\u0641\u062A\u062D \u063A\u0627\u0645\u0642", "\u063A\u0627\u0645\u0642 \u0627\u0641\u062A\u062D"],
    boldClose: ["\u0623\u063A\u0644\u0642 \u063A\u0627\u0645\u0642", "\u063A\u0627\u0645\u0642 \u0623\u063A\u0644\u0642"],
    italicOpen: ["\u0627\u0641\u062A\u062D \u0645\u0627\u0626\u0644", "\u0645\u0627\u0626\u0644 \u0627\u0641\u062A\u062D"],
    italicClose: ["\u0623\u063A\u0644\u0642 \u0645\u0627\u0626\u0644", "\u0645\u0627\u0626\u0644 \u0623\u063A\u0644\u0642"],
    inlineCodeOpen: ["\u0627\u0641\u062A\u062D \u0643\u0648\u062F", "\u0643\u0648\u062F \u0627\u0641\u062A\u062D"],
    inlineCodeClose: ["\u0623\u063A\u0644\u0642 \u0643\u0648\u062F", "\u0643\u0648\u062F \u0623\u063A\u0644\u0642"],
    tagOpen: ["\u0627\u0641\u062A\u062D \u0648\u0633\u0645", "\u0648\u0633\u0645 \u0627\u0641\u062A\u062D"],
    tagClose: ["\u0623\u063A\u0644\u0642 \u0648\u0633\u0645", "\u0648\u0633\u0645 \u0623\u063A\u0644\u0642"],
    codeBlockOpen: ["\u0627\u0641\u062A\u062D \u0643\u062A\u0644\u0629 \u0643\u0648\u062F"],
    codeBlockClose: ["\u0623\u063A\u0644\u0642 \u0643\u062A\u0644\u0629 \u0643\u0648\u062F"]
  },
  labels: {
    newParagraph: "\u0641\u0642\u0631\u0629 \u062C\u062F\u064A\u062F\u0629",
    newLine: "\u0633\u0637\u0631 \u062C\u062F\u064A\u062F",
    heading1: "\u0639\u0646\u0648\u0627\u0646 1",
    heading2: "\u0639\u0646\u0648\u0627\u0646 2",
    heading3: "\u0639\u0646\u0648\u0627\u0646 3",
    bulletPoint: "\u0646\u0642\u0637\u0629 \u062C\u062F\u064A\u062F\u0629",
    todoItem: "\u0645\u0647\u0645\u0629 \u062C\u062F\u064A\u062F\u0629",
    numberedItem: "\u0639\u0646\u0635\u0631 \u0645\u0631\u0642\u0645",
    deleteLastParagraph: "\u0627\u062D\u0630\u0641 \u0627\u0644\u0641\u0642\u0631\u0629 \u0627\u0644\u0623\u062E\u064A\u0631\u0629",
    deleteLastLine: "\u0627\u062D\u0630\u0641 \u0627\u0644\u0633\u0637\u0631 \u0627\u0644\u0623\u062E\u064A\u0631",
    undo: "\u062A\u0631\u0627\u062C\u0639",
    stopRecording: "\u0623\u0648\u0642\u0641 \u0627\u0644\u062A\u0633\u062C\u064A\u0644",
    colon: "\u0646\u0642\u0637\u062A\u0627\u0646",
    wikilink: "[[\u2026]] \u0631\u0627\u0628\u0637 \u0648\u064A\u0643\u064A",
    boldOpen: "** \u0627\u0641\u062A\u062D \u063A\u0627\u0645\u0642",
    boldClose: "** \u0623\u063A\u0644\u0642 \u063A\u0627\u0645\u0642",
    italicOpen: "* \u0627\u0641\u062A\u062D \u0645\u0627\u0626\u0644",
    italicClose: "* \u0623\u063A\u0644\u0642 \u0645\u0627\u0626\u0644",
    inlineCodeOpen: "` \u0627\u0641\u062A\u062D \u0643\u0648\u062F",
    inlineCodeClose: "` \u0623\u063A\u0644\u0642 \u0643\u0648\u062F",
    tagOpen: "# \u0627\u0641\u062A\u062D \u0648\u0633\u0645",
    tagClose: "\u0623\u063A\u0644\u0642 \u0648\u0633\u0645",
    codeBlockOpen: "``` \u0627\u0641\u062A\u062D \u0643\u062A\u0644\u0629 \u0643\u0648\u062F",
    codeBlockClose: "``` \u0623\u063A\u0644\u0642 \u0643\u062A\u0644\u0629 \u0643\u0648\u062F"
  },
  mishearings: [],
  phonetics: [],
  articles: ["\u0627\u0644"],
  fillers: []
};

// ../shared/src/languages/ja.json
var ja_default = {
  code: "ja",
  name: "\u65E5\u672C\u8A9E",
  patterns: {
    newParagraph: ["\u65B0\u3057\u3044\u6BB5\u843D", "\u65B0\u6BB5\u843D"],
    newLine: ["\u6539\u884C", "\u65B0\u3057\u3044\u884C", "\u6B21\u306E\u884C"],
    heading1: ["\u898B\u51FA\u30571", "\u898B\u51FA\u3057\u3044\u3061"],
    heading2: ["\u898B\u51FA\u30572", "\u898B\u51FA\u3057\u306B"],
    heading3: ["\u898B\u51FA\u30573", "\u898B\u51FA\u3057\u3055\u3093"],
    bulletPoint: ["\u7B87\u6761\u66F8\u304D", "\u65B0\u3057\u3044\u9805\u76EE", "\u6B21\u306E\u9805\u76EE"],
    todoItem: ["\u65B0\u3057\u3044\u30BF\u30B9\u30AF", "\u30BF\u30B9\u30AF\u8FFD\u52A0"],
    numberedItem: ["\u756A\u53F7\u4ED8\u304D", "\u6B21\u306E\u756A\u53F7"],
    deleteLastParagraph: ["\u6700\u5F8C\u306E\u6BB5\u843D\u3092\u524A\u9664"],
    deleteLastLine: ["\u6700\u5F8C\u306E\u884C\u3092\u524A\u9664", "\u6700\u5F8C\u306E\u6587\u3092\u524A\u9664"],
    undo: ["\u5143\u306B\u623B\u3059", "\u53D6\u308A\u6D88\u3057"],
    stopRecording: ["\u9332\u97F3\u505C\u6B62", "\u9332\u97F3\u3092\u6B62\u3081\u3066"],
    colon: ["\u30B3\u30ED\u30F3"],
    wikilink: ["\u30A6\u30A3\u30AD\u30EA\u30F3\u30AF", "\u30EA\u30F3\u30AF"],
    boldOpen: ["\u592A\u5B57\u958B\u59CB", "\u30DC\u30FC\u30EB\u30C9\u958B\u59CB", "\u592A\u5B57\u958B\u304F"],
    boldClose: ["\u592A\u5B57\u7D42\u4E86", "\u30DC\u30FC\u30EB\u30C9\u7D42\u4E86", "\u592A\u5B57\u9589\u3058\u308B"],
    italicOpen: ["\u659C\u4F53\u958B\u59CB", "\u30A4\u30BF\u30EA\u30C3\u30AF\u958B\u59CB", "\u659C\u4F53\u958B\u304F"],
    italicClose: ["\u659C\u4F53\u7D42\u4E86", "\u30A4\u30BF\u30EA\u30C3\u30AF\u7D42\u4E86", "\u659C\u4F53\u9589\u3058\u308B"],
    inlineCodeOpen: ["\u30B3\u30FC\u30C9\u958B\u59CB", "\u30B3\u30FC\u30C9\u958B\u304F"],
    inlineCodeClose: ["\u30B3\u30FC\u30C9\u7D42\u4E86", "\u30B3\u30FC\u30C9\u9589\u3058\u308B"],
    tagOpen: ["\u30BF\u30B0\u958B\u59CB", "\u30BF\u30B0\u958B\u304F"],
    tagClose: ["\u30BF\u30B0\u7D42\u4E86", "\u30BF\u30B0\u9589\u3058\u308B"],
    codeBlockOpen: ["\u30B3\u30FC\u30C9\u30D6\u30ED\u30C3\u30AF\u958B\u59CB", "\u30B3\u30FC\u30C9\u30D6\u30ED\u30C3\u30AF\u958B\u304F"],
    codeBlockClose: ["\u30B3\u30FC\u30C9\u30D6\u30ED\u30C3\u30AF\u7D42\u4E86", "\u30B3\u30FC\u30C9\u30D6\u30ED\u30C3\u30AF\u9589\u3058\u308B"]
  },
  labels: {
    newParagraph: "\u65B0\u3057\u3044\u6BB5\u843D",
    newLine: "\u6539\u884C",
    heading1: "\u898B\u51FA\u3057 1",
    heading2: "\u898B\u51FA\u3057 2",
    heading3: "\u898B\u51FA\u3057 3",
    bulletPoint: "\u7B87\u6761\u66F8\u304D",
    todoItem: "\u65B0\u3057\u3044\u30BF\u30B9\u30AF",
    numberedItem: "\u756A\u53F7\u4ED8\u304D",
    deleteLastParagraph: "\u6700\u5F8C\u306E\u6BB5\u843D\u3092\u524A\u9664",
    deleteLastLine: "\u6700\u5F8C\u306E\u884C\u3092\u524A\u9664",
    undo: "\u5143\u306B\u623B\u3059",
    stopRecording: "\u9332\u97F3\u505C\u6B62",
    colon: "\u30B3\u30ED\u30F3",
    wikilink: "\u30A6\u30A3\u30AD\u30EA\u30F3\u30AF [[\u2026]]",
    boldOpen: "\u592A\u5B57\u958B\u59CB **",
    boldClose: "\u592A\u5B57\u7D42\u4E86 **",
    italicOpen: "\u659C\u4F53\u958B\u59CB *",
    italicClose: "\u659C\u4F53\u7D42\u4E86 *",
    inlineCodeOpen: "\u30B3\u30FC\u30C9\u958B\u59CB `",
    inlineCodeClose: "\u30B3\u30FC\u30C9\u7D42\u4E86 `",
    tagOpen: "\u30BF\u30B0\u958B\u59CB #",
    tagClose: "\u30BF\u30B0\u7D42\u4E86",
    codeBlockOpen: "\u30B3\u30FC\u30C9\u30D6\u30ED\u30C3\u30AF\u958B\u59CB ```",
    codeBlockClose: "\u30B3\u30FC\u30C9\u30D6\u30ED\u30C3\u30AF\u7D42\u4E86 ```"
  },
  mishearings: [],
  phonetics: [],
  articles: [],
  fillers: []
};

// ../shared/src/languages/ko.json
var ko_default = {
  code: "ko",
  name: "\uD55C\uAD6D\uC5B4",
  patterns: {
    newParagraph: ["\uC0C8 \uB2E8\uB77D", "\uC0C8 \uBB38\uB2E8"],
    newLine: ["\uC0C8 \uC904", "\uB2E4\uC74C \uC904", "\uC904 \uBC14\uAFC8"],
    heading1: ["\uC81C\uBAA9 1", "\uC81C\uBAA9 \uD558\uB098"],
    heading2: ["\uC81C\uBAA9 2", "\uC81C\uBAA9 \uB458"],
    heading3: ["\uC81C\uBAA9 3", "\uC81C\uBAA9 \uC14B"],
    bulletPoint: ["\uC0C8 \uD56D\uBAA9", "\uB2E4\uC74C \uD56D\uBAA9", "\uAE00\uBA38\uB9AC \uAE30\uD638"],
    todoItem: ["\uC0C8 \uD560\uC77C", "\uD560\uC77C \uCD94\uAC00"],
    numberedItem: ["\uBC88\uD638 \uD56D\uBAA9", "\uB2E4\uC74C \uBC88\uD638"],
    deleteLastParagraph: ["\uB9C8\uC9C0\uB9C9 \uB2E8\uB77D \uC0AD\uC81C"],
    deleteLastLine: ["\uB9C8\uC9C0\uB9C9 \uC904 \uC0AD\uC81C", "\uB9C8\uC9C0\uB9C9 \uBB38\uC7A5 \uC0AD\uC81C"],
    undo: ["\uC2E4\uD589 \uCDE8\uC18C", "\uB418\uB3CC\uB9AC\uAE30"],
    stopRecording: ["\uB179\uC74C \uC911\uC9C0", "\uB179\uC74C \uBA48\uCDB0"],
    colon: ["\uCF5C\uB860"],
    wikilink: ["\uC704\uD0A4\uB9C1\uD06C", "\uB9C1\uD06C"],
    boldOpen: ["\uAD75\uAC8C \uC5F4\uAE30", "\uBCFC\uB4DC \uC5F4\uAE30"],
    boldClose: ["\uAD75\uAC8C \uB2EB\uAE30", "\uBCFC\uB4DC \uB2EB\uAE30"],
    italicOpen: ["\uAE30\uC6B8\uC784 \uC5F4\uAE30", "\uC774\uD0E4\uB9AD \uC5F4\uAE30"],
    italicClose: ["\uAE30\uC6B8\uC784 \uB2EB\uAE30", "\uC774\uD0E4\uB9AD \uB2EB\uAE30"],
    inlineCodeOpen: ["\uCF54\uB4DC \uC5F4\uAE30"],
    inlineCodeClose: ["\uCF54\uB4DC \uB2EB\uAE30"],
    tagOpen: ["\uD0DC\uADF8 \uC5F4\uAE30"],
    tagClose: ["\uD0DC\uADF8 \uB2EB\uAE30"],
    codeBlockOpen: ["\uCF54\uB4DC\uBE14\uB85D \uC5F4\uAE30", "\uCF54\uB4DC \uBE14\uB85D \uC5F4\uAE30"],
    codeBlockClose: ["\uCF54\uB4DC\uBE14\uB85D \uB2EB\uAE30", "\uCF54\uB4DC \uBE14\uB85D \uB2EB\uAE30"]
  },
  labels: {
    newParagraph: "\uC0C8 \uB2E8\uB77D",
    newLine: "\uC0C8 \uC904",
    heading1: "\uC81C\uBAA9 1",
    heading2: "\uC81C\uBAA9 2",
    heading3: "\uC81C\uBAA9 3",
    bulletPoint: "\uC0C8 \uD56D\uBAA9",
    todoItem: "\uC0C8 \uD560\uC77C",
    numberedItem: "\uBC88\uD638 \uD56D\uBAA9",
    deleteLastParagraph: "\uB9C8\uC9C0\uB9C9 \uB2E8\uB77D \uC0AD\uC81C",
    deleteLastLine: "\uB9C8\uC9C0\uB9C9 \uC904 \uC0AD\uC81C",
    undo: "\uC2E4\uD589 \uCDE8\uC18C",
    stopRecording: "\uB179\uC74C \uC911\uC9C0",
    colon: "\uCF5C\uB860",
    wikilink: "\uC704\uD0A4\uB9C1\uD06C [[\u2026]]",
    boldOpen: "\uAD75\uAC8C \uC5F4\uAE30 **",
    boldClose: "\uAD75\uAC8C \uB2EB\uAE30 **",
    italicOpen: "\uAE30\uC6B8\uC784 \uC5F4\uAE30 *",
    italicClose: "\uAE30\uC6B8\uC784 \uB2EB\uAE30 *",
    inlineCodeOpen: "\uCF54\uB4DC \uC5F4\uAE30 `",
    inlineCodeClose: "\uCF54\uB4DC \uB2EB\uAE30 `",
    tagOpen: "\uD0DC\uADF8 \uC5F4\uAE30 #",
    tagClose: "\uD0DC\uADF8 \uB2EB\uAE30",
    codeBlockOpen: "\uCF54\uB4DC\uBE14\uB85D \uC5F4\uAE30 ```",
    codeBlockClose: "\uCF54\uB4DC\uBE14\uB85D \uB2EB\uAE30 ```"
  },
  mishearings: [],
  phonetics: [],
  articles: [],
  fillers: []
};

// ../shared/src/lang.ts
var ALL_LANGS = {
  nl: nl_default,
  en: en_default,
  fr: fr_default,
  de: de_default,
  es: es_default,
  pt: pt_default,
  it: it_default,
  ru: ru_default,
  zh: zh_default,
  hi: hi_default,
  ar: ar_default,
  ja: ja_default,
  ko: ko_default
};
var SUPPORTED_LANGUAGES = [
  "nl",
  "en",
  "fr",
  "de",
  "es",
  "pt",
  "it",
  "ru",
  "zh",
  "hi",
  "ar",
  "ja",
  "ko"
];
var LANGUAGE_NAMES = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((code) => [code, ALL_LANGS[code].name])
);
var PATTERNS = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((code) => [code, ALL_LANGS[code].patterns])
);
var LABELS = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((code) => [code, ALL_LANGS[code].labels])
);
function compileMishearings(data) {
  return data.map(({ pattern, flags, replacement }) => [
    new RegExp(pattern, flags),
    replacement
  ]);
}
var MISHEARINGS = Object.fromEntries(
  SUPPORTED_LANGUAGES.filter((code) => ALL_LANGS[code].mishearings.length > 0).map((code) => [code, compileMishearings(ALL_LANGS[code].mishearings)])
);
function getPatternsForCommand(commandId, lang) {
  var _a, _b, _c, _d;
  const langPatterns = (_b = (_a = PATTERNS[lang]) == null ? void 0 : _a[commandId]) != null ? _b : [];
  const enPatterns = lang === "en" ? [] : (_d = (_c = PATTERNS.en) == null ? void 0 : _c[commandId]) != null ? _d : [];
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const p of [...langPatterns, ...enPatterns]) {
    if (!seen.has(p)) {
      seen.add(p);
      result.push(p);
    }
  }
  return result;
}
function getLabel(commandId, lang) {
  var _a, _b, _c, _d;
  return (_d = (_c = (_a = LABELS[lang]) == null ? void 0 : _a[commandId]) != null ? _c : (_b = LABELS.en) == null ? void 0 : _b[commandId]) != null ? _d : commandId;
}
function getMishearings(lang) {
  var _a;
  return (_a = MISHEARINGS[lang]) != null ? _a : [];
}

// ../shared/src/phonetics.ts
var ALL_LANGS2 = {
  nl: nl_default,
  en: en_default,
  fr: fr_default,
  de: de_default,
  es: es_default,
  pt: pt_default,
  it: it_default,
  ru: ru_default,
  zh: zh_default,
  hi: hi_default,
  ar: ar_default,
  ja: ja_default,
  ko: ko_default
};
function compileRules(data) {
  return data.map(({ pattern, flags, replacement }) => [
    new RegExp(pattern, flags),
    replacement
  ]);
}
var PHONETIC_RULES = Object.fromEntries(
  SUPPORTED_LANGUAGES.filter((code) => ALL_LANGS2[code].phonetics.length > 0).map((code) => [code, compileRules(ALL_LANGS2[code].phonetics)])
);
var ARTICLES = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((code) => [code, ALL_LANGS2[code].articles])
);
var TRAILING_FILLERS = Object.fromEntries(
  SUPPORTED_LANGUAGES.filter((code) => ALL_LANGS2[code].fillers.length > 0).map((code) => [code, ALL_LANGS2[code].fillers])
);
function phoneticNormalize(text, lang) {
  const rules = PHONETIC_RULES[lang];
  if (!rules) return text;
  let result = text;
  for (const [pattern, replacement] of rules) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
function stripArticles(text, lang) {
  const articles = ARTICLES[lang];
  if (!articles || articles.length === 0) return text;
  const words = text.split(/\s+/);
  let stripped = 0;
  while (stripped < Math.min(2, words.length - 1)) {
    if (articles.includes(words[stripped])) {
      stripped++;
    } else {
      break;
    }
  }
  return stripped > 0 ? words.slice(stripped).join(" ") : text;
}
function stripTrailingFillers(text, lang) {
  const fillers = TRAILING_FILLERS[lang];
  if (!fillers || fillers.length === 0) return text;
  let result = text;
  for (const filler of fillers.sort((a, b) => b.length - a.length)) {
    if (result.endsWith(" " + filler)) {
      result = result.slice(0, -(filler.length + 1)).trimEnd();
    }
  }
  return result;
}
function trySplitCompound(text, knownWords) {
  if (text.includes(" ") || text.length < 4) return text;
  for (const phrase of knownWords) {
    const words = phrase.split(/\s+/);
    if (words.length < 2) continue;
    const joined = words.join("");
    if (text === joined) {
      return phrase;
    }
  }
  return text;
}

// ../shared/src/plugin-logger.ts
var LOG_BUFFER_SIZE = 500;
var logBuffer = [];
var debugEnabled = false;
function setDebugLogging(enabled) {
  debugEnabled = enabled;
}
function pushLog(level, args) {
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  const msg = args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
  logBuffer.push(`[${ts}] [${level}] ${msg}`);
  if (logBuffer.length > LOG_BUFFER_SIZE) {
    logBuffer.shift();
  }
}
var vlog = {
  debug: (...args) => {
    if (!debugEnabled) return;
    pushLog("DEBUG", args);
    console.debug(...args);
  },
  warn: (...args) => {
    pushLog("WARN", args);
    console.warn(...args);
  },
  error: (...args) => {
    pushLog("ERROR", args);
    console.error(...args);
  }
};
function redactForExport(line) {
  let redacted = line.replace(/\b[A-Za-z0-9]{32,}\b/g, "[REDACTED]");
  redacted = redacted.replace(/"[^"]{20,}"/g, '"[text redacted]"');
  redacted = redacted.replace(
    /(full text:|Hallucination detected —|Discarding hallucinated) .+/gi,
    "$1 [redacted]"
  );
  return redacted;
}
function getLogText() {
  return logBuffer.map(redactForExport).join("\n");
}
function getLogCount() {
  return logBuffer.length;
}

// ../shared/src/authenticated-websocket.ts
var WS_OPEN = 1;
function loadNodeModule(name) {
  const r = globalThis["require"];
  if (!r) throw new Error(`Node.js require() not available (needed for ${name})`);
  return r(name);
}
function createAuthenticatedWebSocket(url, headers, callbacks) {
  const https = loadNodeModule("https");
  const crypto = loadNodeModule("crypto");
  const parsed = new URL(url);
  const wsKey = crypto.randomBytes(16).toString("base64");
  const conn = {
    readyState: 0,
    send: () => {
    },
    close: () => {
    }
  };
  const req = https.request(
    {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: {
        ...headers,
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": wsKey
      }
    },
    (res) => {
      callbacks.onError(
        new Error(`WebSocket upgrade failed: HTTP ${res.statusCode}`)
      );
      conn.readyState = 3;
      req.destroy();
    }
  );
  req.on("upgrade", (_res, socket) => {
    conn.readyState = WS_OPEN;
    conn.send = (data) => {
      const payload = Buffer.from(data, "utf-8");
      const mask = crypto.randomBytes(4);
      let header;
      if (payload.length < 126) {
        header = Buffer.alloc(6);
        header[0] = 129;
        header[1] = 128 | payload.length;
        mask.copy(header, 2);
      } else if (payload.length < 65536) {
        header = Buffer.alloc(8);
        header[0] = 129;
        header[1] = 128 | 126;
        header.writeUInt16BE(payload.length, 2);
        mask.copy(header, 4);
      } else {
        header = Buffer.alloc(14);
        header[0] = 129;
        header[1] = 128 | 127;
        header.writeBigUInt64BE(BigInt(payload.length), 2);
        mask.copy(header, 10);
      }
      const masked = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i++) {
        masked[i] = payload[i] ^ mask[i % 4];
      }
      socket.write(Buffer.concat([header, masked]));
    };
    conn.close = () => {
      conn.readyState = 3;
      const closeFrame = Buffer.alloc(6);
      closeFrame[0] = 136;
      closeFrame[1] = 128;
      const closeMask = crypto.randomBytes(4);
      closeMask.copy(closeFrame, 2);
      try {
        socket.write(closeFrame);
      } catch (e) {
      }
      socket.end();
    };
    const pingInterval = setInterval(() => {
      if (conn.readyState !== WS_OPEN) {
        clearInterval(pingInterval);
        return;
      }
      try {
        const pingFrame = Buffer.alloc(6);
        pingFrame[0] = 137;
        pingFrame[1] = 128;
        const pingMask = crypto.randomBytes(4);
        pingMask.copy(pingFrame, 2);
        socket.write(pingFrame);
      } catch (e) {
      }
    }, 15e3);
    callbacks.onOpen();
    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 2) {
        const firstByte = buffer[0];
        const secondByte = buffer[1];
        const opcode = firstByte & 15;
        const isMasked = (secondByte & 128) !== 0;
        let payloadLength = secondByte & 127;
        let offset = 2;
        if (payloadLength === 126) {
          if (buffer.length < 4) return;
          payloadLength = buffer.readUInt16BE(2);
          offset = 4;
        } else if (payloadLength === 127) {
          if (buffer.length < 10) return;
          payloadLength = Number(buffer.readBigUInt64BE(2));
          offset = 10;
        }
        if (isMasked) offset += 4;
        if (buffer.length < offset + payloadLength) return;
        let payload = buffer.subarray(offset, offset + payloadLength);
        if (isMasked) {
          const maskKey = buffer.subarray(offset - 4, offset);
          payload = Buffer.from(payload);
          for (let i = 0; i < payload.length; i++) {
            payload[i] ^= maskKey[i % 4];
          }
        }
        buffer = buffer.subarray(offset + payloadLength);
        if (opcode === 1) {
          callbacks.onMessage(payload.toString("utf-8"));
        } else if (opcode === 8) {
          conn.readyState = 3;
          clearInterval(pingInterval);
          socket.end();
          callbacks.onClose();
          return;
        } else if (opcode === 9) {
          const pongMask = crypto.randomBytes(4);
          const pongLen = payload.length;
          let pongHeader;
          if (pongLen < 126) {
            pongHeader = Buffer.alloc(6);
            pongHeader[0] = 138;
            pongHeader[1] = 128 | pongLen;
            pongMask.copy(pongHeader, 2);
          } else {
            pongHeader = Buffer.alloc(8);
            pongHeader[0] = 138;
            pongHeader[1] = 128 | 126;
            pongHeader.writeUInt16BE(pongLen, 2);
            pongMask.copy(pongHeader, 4);
          }
          const maskedPong = Buffer.from(payload);
          for (let i = 0; i < maskedPong.length; i++) {
            maskedPong[i] ^= pongMask[i % 4];
          }
          socket.write(Buffer.concat([pongHeader, maskedPong]));
        }
      }
    });
    socket.on("close", () => {
      conn.readyState = 3;
      clearInterval(pingInterval);
      callbacks.onClose();
    });
    socket.on("error", (err) => {
      conn.readyState = 3;
      clearInterval(pingInterval);
      callbacks.onError(err);
    });
  });
  req.on("error", (err) => {
    callbacks.onError(err);
  });
  req.end();
  return conn;
}

// ../shared/src/tts.ts
var TTS_MODEL = "voxtral-mini-tts-2603";
var TTS_RESPONSE_FORMAT = "wav";
var TTS_VOICES = [
  { id: "en_paul_neutral", label: "Paul \u2014 neutral (US English)" },
  { id: "gb_jane_neutral", label: "Jane \u2014 neutral (UK English)" }
];

// ../shared/src/retry.ts
var realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function retryWithBackoff(fn, options = {}) {
  var _a, _b, _c, _d;
  const attempts = Math.max(1, (_a = options.attempts) != null ? _a : 3);
  const baseDelayMs = (_b = options.baseDelayMs) != null ? _b : 1e3;
  const sleep = (_c = options.sleep) != null ? _c : realSleep;
  const shouldRetry = (_d = options.shouldRetry) != null ? _d : (() => true);
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const isLast = attempt === attempts - 1;
      if (isLast || !shouldRetry(error)) break;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}

// ../shared/src/mistral-api.ts
var DEFAULT_BASE_URL = "https://api.mistral.ai";
var HTTP_TIMEOUT_UPLOAD_MS = 6e4;
var HTTP_TIMEOUT_DEFAULT_MS = 3e4;
var HttpStatusError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = "HttpStatusError";
  }
};
function isRateLimitError(error) {
  return error instanceof HttpStatusError && error.status === 429;
}
function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1e3)}s`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
    promise.catch(() => {
    });
  });
}
function sanitizeApiError(status, rawBody) {
  var _a;
  try {
    const parsed = JSON.parse(rawBody);
    let msg = (parsed == null ? void 0 : parsed.message) || ((_a = parsed == null ? void 0 : parsed.error) == null ? void 0 : _a.message);
    if (!msg && (parsed == null ? void 0 : parsed.detail)) {
      const d = parsed.detail;
      msg = typeof d === "string" ? d : Array.isArray(d) ? d.map((e) => {
        var _a2;
        return (_a2 = e == null ? void 0 : e.msg) != null ? _a2 : JSON.stringify(e);
      }).join("; ") : void 0;
    }
    if (typeof msg === "string" && msg.length > 0 && msg.length < 300) {
      return `HTTP ${status}: ${msg}`;
    }
  } catch (e) {
  }
  switch (status) {
    case 401:
      return "HTTP 401: Invalid or expired API key";
    case 403:
      return "HTTP 403: Access denied";
    case 404:
      return "HTTP 404: API endpoint not found (check model name)";
    case 413:
      return "HTTP 413: Audio file too large";
    case 429:
      return "HTTP 429: Rate limit exceeded \u2014 try again later";
    case 500:
    case 502:
    case 503:
      return `HTTP ${status}: Mistral API server error \u2014 try again later`;
    default:
      return `HTTP ${status}: Request failed`;
  }
}
async function listModels(apiKey, httpRequest, baseUrl) {
  if (!apiKey || !apiKey.trim()) return [];
  const base = baseUrl || DEFAULT_BASE_URL;
  try {
    const response = await withTimeout(
      httpRequest({
        url: `${base}/v1/models`,
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      }),
      HTTP_TIMEOUT_DEFAULT_MS,
      "List models request"
    );
    if (response.status !== 200) {
      console.warn(
        `Voxtral: Failed to list models (${response.status})`
      );
      return [];
    }
    const data = response.json;
    const seen = /* @__PURE__ */ new Set();
    const models = (data.data || []).map(
      (m) => ({
        id: m.id,
        type: m.type,
        capabilities: m.capabilities
      })
    ).filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    models.sort((a, b) => a.id.localeCompare(b.id));
    return models;
  } catch (e) {
    console.warn("Voxtral: Could not fetch models", e);
    return [];
  }
}
async function listVoices(apiKey, httpRequest, baseUrl) {
  var _a, _b, _c, _d;
  if (!apiKey || !apiKey.trim()) return [];
  const base = baseUrl || DEFAULT_BASE_URL;
  try {
    const response = await withTimeout(
      httpRequest({
        url: `${base}/v1/audio/voices?limit=100`,
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` }
      }),
      HTTP_TIMEOUT_DEFAULT_MS,
      "List voices request"
    );
    if (response.status !== 200) {
      console.warn(`Voxtral: Failed to list voices (${response.status})`);
      return [];
    }
    const data = response.json;
    const arr = Array.isArray(data) ? data : (_d = (_c = (_b = (_a = data == null ? void 0 : data.data) != null ? _a : data == null ? void 0 : data.voices) != null ? _b : data == null ? void 0 : data.items) != null ? _c : data == null ? void 0 : data.results) != null ? _d : [];
    const seenIds = /* @__PURE__ */ new Set();
    return arr.map((v) => {
      var _a2, _b2, _c2, _d2;
      const voice = v;
      const id = (_b2 = (_a2 = voice.id) != null ? _a2 : voice.slug) != null ? _b2 : voice.name;
      return id ? { id, name: (_d2 = (_c2 = voice.name) != null ? _c2 : voice.slug) != null ? _d2 : id } : null;
    }).filter((v) => {
      if (v === null || seenIds.has(v.id)) return false;
      seenIds.add(v.id);
      return true;
    });
  } catch (e) {
    console.warn("Voxtral: Could not fetch voices", e);
    return [];
  }
}
async function transcribeBatchRaw(audioBlob, settings, httpRequest, diarize = false) {
  var _a, _b, _c;
  const t = audioBlob.type;
  const ext = t.includes("mp4") ? "m4a" : t.includes("ogg") ? "ogg" : t.includes("mpeg") || t.includes("mp3") ? "mp3" : t.includes("wav") ? "wav" : t.includes("flac") ? "flac" : t.includes("aac") ? "aac" : "webm";
  const mimeType = audioBlob.type || `audio/${ext}`;
  const boundary = `----VoxtralBoundary${Date.now()}`;
  const arrayBuf = await audioBlob.arrayBuffer();
  const fileBytes = new Uint8Array(arrayBuf);
  let textParts = "";
  textParts += `--${boundary}\r
`;
  textParts += `Content-Disposition: form-data; name="file"; filename="recording.${ext}"\r
`;
  textParts += `Content-Type: ${mimeType}\r
\r
`;
  const afterFile = `\r
--${boundary}\r
Content-Disposition: form-data; name="model"\r
\r
${settings.batchModel}\r
`;
  let extraFields = "";
  if (diarize) {
    extraFields += `--${boundary}\r
Content-Disposition: form-data; name="diarize"\r
\r
true\r
`;
    extraFields += `--${boundary}\r
Content-Disposition: form-data; name="timestamp_granularities"\r
\r
segment\r
`;
  } else if (settings.language) {
    extraFields += `--${boundary}\r
Content-Disposition: form-data; name="language"\r
\r
${settings.language}\r
`;
  }
  extraFields += `--${boundary}--\r
`;
  const enc = new TextEncoder();
  const headerBuf = enc.encode(textParts);
  const tailBuf = enc.encode(afterFile + extraFields);
  const body = new Uint8Array(headerBuf.length + fileBytes.length + tailBuf.length);
  body.set(headerBuf, 0);
  body.set(fileBytes, headerBuf.length);
  body.set(tailBuf, headerBuf.length + fileBytes.length);
  const base = settings.apiBaseUrl || DEFAULT_BASE_URL;
  const response = await withTimeout(
    httpRequest({
      url: `${base}/v1/audio/transcriptions`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`
      },
      body: body.buffer
    }),
    HTTP_TIMEOUT_UPLOAD_MS,
    "Transcription request"
  );
  if (response.status !== 200) {
    throw new Error(
      `Transcription failed: ${sanitizeApiError(response.status, response.text)}`
    );
  }
  return {
    text: ((_a = response.json) == null ? void 0 : _a.text) || "",
    segments: (_c = (_b = response.json) == null ? void 0 : _b.segments) != null ? _c : []
  };
}
async function transcribeBatch(audioBlob, settings, httpRequest, diarize = false) {
  return (await transcribeBatchRaw(audioBlob, settings, httpRequest, diarize)).text;
}
async function synthesizeSpeech(text, settings, httpRequest) {
  var _a, _b, _c, _d, _e;
  const base = settings.apiBaseUrl || DEFAULT_BASE_URL;
  const response = await retryWithBackoff(
    async () => {
      const resp = await withTimeout(
        httpRequest({
          url: `${base}/v1/audio/speech`,
          method: "POST",
          headers: {
            Authorization: `Bearer ${settings.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: TTS_MODEL,
            input: text,
            voice: settings.ttsVoice,
            response_format: TTS_RESPONSE_FORMAT
          })
        }),
        HTTP_TIMEOUT_DEFAULT_MS,
        "Speech synthesis request"
      );
      if (resp.status !== 200) {
        throw new HttpStatusError(
          `Speech synthesis failed: ${sanitizeApiError(resp.status, resp.text)}`,
          resp.status
        );
      }
      return resp;
    },
    { shouldRetry: isRateLimitError }
  );
  const json = response.json;
  if (json && typeof json === "object" && !Array.isArray(json)) {
    const candidate = (_e = (_d = (_c = (_b = (_a = json.audio_data) != null ? _a : (
      // confirmed field name returned by Mistral TTS
      json.audio
    )) != null ? _b : json.audio_base64) != null ? _c : json.b64_audio) != null ? _d : json.audio_content) != null ? _e : typeof json.data === "string" ? json.data : void 0;
    if (typeof candidate === "string" && candidate.length > 0) {
      return base64ToArrayBuffer(candidate);
    }
    throw new Error(
      `Speech synthesis returned JSON, not audio (fields: ${Object.keys(json).join(", ")})`
    );
  }
  if (!response.arrayBuffer || response.arrayBuffer.byteLength === 0) {
    throw new Error("Speech synthesis returned no audio.");
  }
  return response.arrayBuffer;
}
function base64ToArrayBuffer(b64) {
  const clean = b64.replace(/^data:[^;,]*;base64,/, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
function buildCustomCommandGuard2(settings) {
  var _a;
  return buildCustomCommandGuard((_a = settings.customCommands) != null ? _a : [], settings.language);
}
function buildVocabularyGuard2(settings) {
  var _a;
  return buildVocabularyGuard((_a = settings.vocabularyTerms) != null ? _a : []);
}
async function correctText(text, settings, httpRequest) {
  var _a, _b, _c, _d, _e, _f;
  const local = isLocalMode(settings);
  const localUrl = local ? (_a = settings.localCorrectionUrl) == null ? void 0 : _a.trim() : void 0;
  if (local && !localUrl) {
    console.debug(
      "Voxtral: correction skipped in local mode \u2014 no local correction endpoint configured"
    );
    return text;
  }
  const basePrompt = settings.systemPrompt || DEFAULT_CORRECT_PROMPT;
  const systemPrompt = basePrompt + buildCustomCommandGuard2(settings) + buildVocabularyGuard2(settings);
  const base = local && localUrl ? localUrl : settings.apiBaseUrl || DEFAULT_BASE_URL;
  const model = local ? ((_b = settings.localCorrectionModel) == null ? void 0 : _b.trim()) || "ministral-3:3b" : settings.correctModel;
  const headers = local ? { "Content-Type": "application/json" } : { Authorization: `Bearer ${settings.apiKey}`, "Content-Type": "application/json" };
  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text }
    ],
    temperature: 0.1
  };
  const response = await retryWithBackoff(
    async () => {
      const resp = await withTimeout(
        httpRequest({
          url: `${base}/v1/chat/completions`,
          method: "POST",
          headers,
          body: JSON.stringify(body)
        }),
        HTTP_TIMEOUT_DEFAULT_MS,
        "Correction request"
      );
      if (resp.status !== 200) {
        throw new HttpStatusError(
          `Correction failed: ${sanitizeApiError(resp.status, resp.text)}`,
          resp.status
        );
      }
      return resp;
    },
    { shouldRetry: isRateLimitError }
  );
  const data = response.json;
  let result = ((_f = (_e = (_d = (_c = data.choices) == null ? void 0 : _c[0]) == null ? void 0 : _d.message) == null ? void 0 : _e.content) == null ? void 0 : _f.trim()) || text;
  result = stripLlmCommentary(result, text);
  if (result.length > text.length * 1.5 + 50) {
    console.warn(
      "Voxtral: Correction rejected \u2014 output is suspiciously longer than input",
      { inputLen: text.length, outputLen: result.length }
    );
    return text;
  }
  return result;
}
function resolveRealtimeProtocol(settings) {
  if (settings.realtimeProtocol === "mistral" || settings.realtimeProtocol === "vllm") {
    return settings.realtimeProtocol;
  }
  try {
    const { hostname } = new URL(settings.apiBaseUrl || DEFAULT_BASE_URL);
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
    return isLocalhost ? "vllm" : "mistral";
  } catch (e) {
    return "mistral";
  }
}
function isLocalMode(settings) {
  return resolveRealtimeProtocol(settings) === "vllm";
}
var RealtimeTranscriber = class {
  constructor(settings, callbacks, delayOverrideMs) {
    this.ws = null;
    this.intentionallyClosed = false;
    this.delayOverrideMs = null;
    this.settings = settings;
    this.callbacks = callbacks;
    this.delayOverrideMs = delayOverrideMs != null ? delayOverrideMs : null;
  }
  async connect() {
    if (resolveRealtimeProtocol(this.settings) === "vllm") return this.connectVllm();
    this.intentionallyClosed = false;
    const params = new URLSearchParams({
      model: this.settings.realtimeModel
    });
    const httpBase = this.settings.apiBaseUrl || DEFAULT_BASE_URL;
    const wsBase = httpBase.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
    const url = `${wsBase}/v1/audio/transcriptions/realtime?${params}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        var _a;
        (_a = this.ws) == null ? void 0 : _a.close();
        reject(new Error("WebSocket connection timeout"));
      }, 1e4);
      this.ws = createAuthenticatedWebSocket(
        url,
        { Authorization: `Bearer ${this.settings.apiKey}` },
        {
          onOpen: () => {
          },
          onMessage: (data) => {
            var _a, _b, _c;
            try {
              const msg = JSON.parse(data);
              console.debug(
                `Voxtral WS \u2190 ${msg.type}`,
                msg.type === "transcription.text.delta" ? (_a = msg.text) == null ? void 0 : _a.slice(0, 50) : ""
              );
              switch (msg.type) {
                case "session.created":
                  clearTimeout(timeout);
                  this.sendSessionUpdate();
                  this.callbacks.onSessionCreated();
                  resolve();
                  break;
                case "session.updated":
                  console.debug(
                    "Voxtral WS: session updated",
                    JSON.stringify(msg.session || {})
                  );
                  break;
                case "transcription.text.delta":
                  this.callbacks.onDelta(msg.text || "");
                  break;
                case "transcription.done":
                  console.debug(
                    "Voxtral WS: transcription.done \u2014 full text:",
                    (_b = msg.text) == null ? void 0 : _b.slice(0, 200)
                  );
                  this.callbacks.onDone(msg.text || "");
                  break;
                case "error":
                  console.error(
                    "Voxtral WS: server error:",
                    JSON.stringify(msg.error)
                  );
                  this.callbacks.onError(
                    ((_c = msg.error) == null ? void 0 : _c.message) || "Unknown error"
                  );
                  break;
                default:
                  console.debug(
                    "Voxtral WS: unknown message type:",
                    msg.type,
                    data.slice(0, 300)
                  );
                  break;
              }
            } catch (e) {
              console.error(
                "Voxtral: failed to parse WS message",
                data.slice(0, 200),
                e
              );
            }
          },
          onError: (err) => {
            clearTimeout(timeout);
            console.error("Voxtral: WebSocket error", err);
            reject(
              new Error(
                `WebSocket connection failed: ${err.message}`
              )
            );
          },
          onClose: () => {
            console.debug(
              `Voxtral WS: connection closed (intentional=${this.intentionallyClosed})`
            );
            this.ws = null;
            if (!this.intentionallyClosed) {
              this.callbacks.onDisconnect();
            }
          }
        }
      );
    });
  }
  /**
   * Connect to a local vLLM `/v1/realtime` endpoint. Unlike the Mistral cloud
   * path, this is a plain (unauthenticated) WebSocket — no upgrade headers,
   * no model query param — so it uses the platform-native `WebSocket`
   * directly instead of authenticated-websocket.ts (which only speaks
   * https/443 and exists purely to inject the cloud Authorization header).
   * The native socket is wrapped in the same AuthenticatedWsConnection shape
   * so sendAudio/flush/endAudio/close/isConnected keep working unchanged.
   */
  connectVllm() {
    this.intentionallyClosed = false;
    const httpBase = this.settings.apiBaseUrl || DEFAULT_BASE_URL;
    const wsBase = httpBase.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
    const url = `${wsBase}/v1/realtime`;
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      let opened = false;
      let failedBeforeOpen = false;
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error("WebSocket connection timeout"));
      }, 1e4);
      this.ws = {
        send: (data) => socket.send(data),
        close: () => socket.close(),
        get readyState() {
          return socket.readyState;
        }
      };
      socket.onopen = () => {
        opened = true;
        clearTimeout(timeout);
        this.sendSessionUpdate();
        this.callbacks.onSessionCreated();
        resolve();
      };
      socket.onmessage = (event) => {
        var _a, _b, _c;
        const data = String(event.data);
        try {
          const msg = JSON.parse(data);
          console.debug(
            `Voxtral WS (vLLM) \u2190 ${msg.type}`,
            msg.type === "transcription.delta" || msg.type === "transcription.text.delta" ? (_a = msg.text) == null ? void 0 : _a.slice(0, 50) : ""
          );
          switch (msg.type) {
            // The docs call this "transcription.delta"; the deployed
            // adapter actually emits "transcription.text.delta" — accept both.
            case "transcription.delta":
            case "transcription.text.delta":
              this.callbacks.onDelta(msg.text || "");
              break;
            case "transcription.done":
              console.debug(
                "Voxtral WS (vLLM): transcription.done \u2014 full text:",
                (_b = msg.text) == null ? void 0 : _b.slice(0, 200)
              );
              this.callbacks.onDone(msg.text || "");
              break;
            case "error":
              console.error(
                "Voxtral WS (vLLM): server error:",
                JSON.stringify(msg.error)
              );
              this.callbacks.onError(
                ((_c = msg.error) == null ? void 0 : _c.message) || "Unknown error"
              );
              break;
            case "session.created":
            case "session.updated":
              console.debug("Voxtral WS (vLLM): session event", msg.type);
              break;
            default:
              console.debug(
                "Voxtral WS (vLLM): unknown message type:",
                msg.type,
                data.slice(0, 300)
              );
              break;
          }
        } catch (e) {
          console.error(
            "Voxtral: failed to parse vLLM WS message",
            data.slice(0, 200),
            e
          );
        }
      };
      socket.onerror = () => {
        if (!opened) {
          failedBeforeOpen = true;
          clearTimeout(timeout);
          reject(new Error("WebSocket connection failed"));
        } else {
          console.error("Voxtral: vLLM WebSocket error");
        }
      };
      socket.onclose = () => {
        console.debug(
          `Voxtral WS (vLLM): connection closed (intentional=${this.intentionallyClosed})`
        );
        this.ws = null;
        if (!this.intentionallyClosed && !failedBeforeOpen) {
          this.callbacks.onDisconnect();
        }
      };
    });
  }
  sendSessionUpdate() {
    var _a;
    if (!this.ws) return;
    const delayMs = (_a = this.delayOverrideMs) != null ? _a : this.settings.streamingDelayMs;
    const msg = {
      type: "session.update",
      session: {
        audio_format: {
          encoding: "pcm_s16le",
          sample_rate: 16e3
        },
        target_streaming_delay_ms: delayMs
      }
    };
    this.ws.send(JSON.stringify(msg));
  }
  sendAudio(pcmBytes) {
    if (!this.ws || this.ws.readyState !== WS_OPEN) return;
    const base64 = arrayBufferToBase64(pcmBytes);
    const msg = {
      type: "input_audio.append",
      audio: base64
    };
    this.ws.send(JSON.stringify(msg));
  }
  flush() {
    if (!this.ws || this.ws.readyState !== WS_OPEN) return;
    this.ws.send(JSON.stringify({ type: "input_audio.flush" }));
  }
  endAudio() {
    if (!this.ws || this.ws.readyState !== WS_OPEN) return;
    this.ws.send(JSON.stringify({ type: "input_audio.end" }));
  }
  close() {
    this.intentionallyClosed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  get isConnected() {
    var _a;
    return ((_a = this.ws) == null ? void 0 : _a.readyState) === WS_OPEN;
  }
};
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// src/default-commands.ts
function tableInsert(column) {
  return `

| ${column} 1 | ${column} 2 | ${column} 3 |
| --- | --- | --- |
| | | |
`;
}
function getDefaultBuiltInCommands() {
  return [
    {
      id: "builtin-table",
      builtIn: true,
      labels: {
        nl: "Tabel",
        en: "Table",
        fr: "Tableau",
        de: "Tabelle",
        es: "Tabla",
        pt: "Tabela",
        it: "Tabella",
        ru: "\u0422\u0430\u0431\u043B\u0438\u0446\u0430",
        zh: "\u8868\u683C",
        ja: "\u30C6\u30FC\u30D6\u30EB",
        ko: "\uD14C\uC774\uBE14",
        hi: "\u091F\u0947\u092C\u0932",
        ar: "\u062C\u062F\u0648\u0644"
      },
      type: "insert",
      // Fallback for languages without an insertTextByLang entry.
      insertText: tableInsert("Column"),
      insertTextByLang: {
        nl: tableInsert("Kolom"),
        en: tableInsert("Column"),
        fr: tableInsert("Colonne"),
        de: tableInsert("Spalte"),
        es: tableInsert("Columna"),
        pt: tableInsert("Coluna"),
        it: tableInsert("Colonna"),
        ru: tableInsert("\u0421\u0442\u043E\u043B\u0431\u0435\u0446"),
        zh: tableInsert("\u5217"),
        ja: tableInsert("\u5217"),
        ko: tableInsert("\uC5F4"),
        hi: tableInsert("\u0915\u0949\u0932\u092E"),
        ar: tableInsert("\u0639\u0645\u0648\u062F")
      },
      triggers: {
        nl: ["tabel", "nieuwe tabel"],
        en: ["table", "new table"],
        fr: ["tableau", "nouveau tableau"],
        de: ["tabelle", "neue tabelle"],
        es: ["tabla", "nueva tabla"],
        pt: ["tabela", "nova tabela"],
        it: ["tabella", "nuova tabella"],
        ru: ["\u0442\u0430\u0431\u043B\u0438\u0446\u0430", "\u043D\u043E\u0432\u0430\u044F \u0442\u0430\u0431\u043B\u0438\u0446\u0430"],
        zh: ["\u8868\u683C", "\u65B0\u8868\u683C"],
        ja: ["\u30C6\u30FC\u30D6\u30EB", "\u65B0\u3057\u3044\u30C6\u30FC\u30D6\u30EB"],
        ko: ["\uD14C\uC774\uBE14", "\uC0C8 \uD14C\uC774\uBE14"],
        hi: ["\u091F\u0947\u092C\u0932", "\u0928\u0908 \u091F\u0947\u092C\u0932"],
        ar: ["\u062C\u062F\u0648\u0644", "\u062C\u062F\u0648\u0644 \u062C\u062F\u064A\u062F"]
      }
    },
    {
      id: "builtin-callout",
      builtIn: true,
      labels: {
        nl: "Callout (opmerking)",
        en: "Callout (note)",
        fr: "Callout (note)",
        de: "Callout (Hinweis)",
        es: "Callout (nota)",
        pt: "Callout (nota)",
        it: "Callout (nota)",
        ru: "\u0417\u0430\u043C\u0435\u0442\u043A\u0430",
        zh: "\u6807\u6CE8\uFF08\u5907\u6CE8\uFF09",
        ja: "\u30B3\u30FC\u30EB\u30A2\u30A6\u30C8\uFF08\u6CE8\u91C8\uFF09",
        ko: "\uCF5C\uC544\uC6C3 (\uBA54\uBAA8)",
        hi: "\u0915\u0949\u0932\u0906\u0909\u091F (\u0928\u094B\u091F)",
        ar: "\u062A\u0646\u0628\u064A\u0647 (\u0645\u0644\u0627\u062D\u0638\u0629)"
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
        ru: ["\u0437\u0430\u043C\u0435\u0442\u043A\u0430", "\u0431\u043B\u043E\u043A \u0437\u0430\u043C\u0435\u0442\u043A\u0438"],
        zh: ["\u6807\u6CE8", "\u6CE8\u91CA\u5757"],
        ja: ["\u30B3\u30FC\u30EB\u30A2\u30A6\u30C8", "\u6CE8\u91C8"],
        ko: ["\uCF5C\uC544\uC6C3", "\uBA54\uBAA8 \uBE14\uB85D"],
        hi: ["\u0915\u0949\u0932\u0906\u0909\u091F", "\u0928\u094B\u091F \u092C\u094D\u0932\u0949\u0915"],
        ar: ["\u062A\u0646\u0628\u064A\u0647", "\u0643\u062A\u0644\u0629 \u0645\u0644\u0627\u062D\u0638\u0629"]
      }
    },
    {
      id: "builtin-warning",
      builtIn: true,
      labels: {
        nl: "Callout (waarschuwing)",
        en: "Callout (warning)",
        fr: "Callout (avertissement)",
        de: "Callout (Warnung)",
        es: "Callout (advertencia)",
        pt: "Callout (aviso)",
        it: "Callout (avviso)",
        ru: "\u041F\u0440\u0435\u0434\u0443\u043F\u0440\u0435\u0436\u0434\u0435\u043D\u0438\u0435",
        zh: "\u6807\u6CE8\uFF08\u8B66\u544A\uFF09",
        ja: "\u30B3\u30FC\u30EB\u30A2\u30A6\u30C8\uFF08\u8B66\u544A\uFF09",
        ko: "\uCF5C\uC544\uC6C3 (\uACBD\uACE0)",
        hi: "\u0915\u0949\u0932\u0906\u0909\u091F (\u091A\u0947\u0924\u093E\u0935\u0928\u0940)",
        ar: "\u062A\u0646\u0628\u064A\u0647 (\u062A\u062D\u0630\u064A\u0631)"
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
        ru: ["\u043F\u0440\u0435\u0434\u0443\u043F\u0440\u0435\u0436\u0434\u0435\u043D\u0438\u0435"],
        zh: ["\u8B66\u544A"],
        ja: ["\u8B66\u544A"],
        ko: ["\uACBD\uACE0"],
        hi: ["\u091A\u0947\u0924\u093E\u0935\u0928\u0940"],
        ar: ["\u062A\u062D\u0630\u064A\u0631"]
      }
    },
    {
      id: "builtin-tip",
      builtIn: true,
      labels: {
        nl: "Callout (tip)",
        en: "Callout (tip)",
        fr: "Callout (astuce)",
        de: "Callout (Tipp)",
        es: "Callout (consejo)",
        pt: "Callout (dica)",
        it: "Callout (suggerimento)",
        ru: "\u0421\u043E\u0432\u0435\u0442",
        zh: "\u6807\u6CE8\uFF08\u63D0\u793A\uFF09",
        ja: "\u30B3\u30FC\u30EB\u30A2\u30A6\u30C8\uFF08\u30D2\u30F3\u30C8\uFF09",
        ko: "\uCF5C\uC544\uC6C3 (\uD301)",
        hi: "\u0915\u0949\u0932\u0906\u0909\u091F (\u0938\u0941\u091D\u093E\u0935)",
        ar: "\u062A\u0646\u0628\u064A\u0647 (\u0646\u0635\u064A\u062D\u0629)"
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
        ru: ["\u0441\u043E\u0432\u0435\u0442"],
        zh: ["\u63D0\u793A"],
        ja: ["\u30D2\u30F3\u30C8"],
        ko: ["\uD301"],
        hi: ["\u0938\u0941\u091D\u093E\u0935"],
        ar: ["\u0646\u0635\u064A\u062D\u0629"]
      }
    }
  ];
}

// src/settings-migration.ts
var CURRENT_VERSION = 10;
var migrations = {
  // v1 → v2: add file-transcription output placement + correction toggle (E23_S3).
  1: (data) => {
    if (typeof data.fileTranscriptOutput !== "string") {
      data.fileTranscriptOutput = "cursor";
    }
    if (typeof data.fileTranscriptCorrect !== "boolean") {
      data.fileTranscriptCorrect = false;
    }
    return data;
  },
  // v2 → v3: add the file-transcription quality pre-flight toggle (E4_S2).
  2: (data) => {
    if (typeof data.fileTranscriptQualityWarnings !== "boolean") {
      data.fileTranscriptQualityWarnings = true;
    }
    return data;
  },
  // v3 → v4: add the long-recording chunk length (E24).
  3: (data) => {
    if (typeof data.chunkSeconds !== "number") {
      data.chunkSeconds = 600;
    }
    return data;
  },
  // v4 → v5: add the speaker-diarization toggle (E25_S1).
  4: (data) => {
    if (typeof data.fileTranscriptDiarize !== "boolean") {
      data.fileTranscriptDiarize = false;
    }
    return data;
  },
  // v5 → v6: add the experimental "listen back" TTS settings (E26).
  5: (data) => {
    if (typeof data.ttsEnabled !== "boolean") {
      data.ttsEnabled = false;
    }
    if (typeof data.ttsVoice !== "string") {
      data.ttsVoice = "en_paul_neutral";
    }
    return data;
  },
  // v6 → v7: add the voice-command feedback toggle (VX_E27_S4).
  6: (data) => {
    if (typeof data.commandFeedback !== "boolean") {
      data.commandFeedback = true;
    }
    return data;
  },
  // v7 → v8: add the file-transcription review/rename-speakers step toggle (VX_E27_S6).
  7: (data) => {
    if (typeof data.fileTranscriptReview !== "boolean") {
      data.fileTranscriptReview = false;
    }
    return data;
  },
  // v8 → v9: add the vault-aware correction toggles (VX_E27_S7). Both default
  // off — vaultVocabulary is a privacy-sensitive opt-in (sends vault term
  // names to the API); vaultWikilinks is local-only but reuses the same
  // collected term list, so it stays off by default too.
  8: (data) => {
    if (typeof data.vaultVocabulary !== "boolean") {
      data.vaultVocabulary = false;
    }
    if (typeof data.vaultWikilinks !== "boolean") {
      data.vaultWikilinks = false;
    }
    return data;
  },
  // v9 → v10: add the secret-storage id reference (VX_E28_S1). The plaintext
  // `apiKey` stays in the object here; the actual move into `app.secretStorage`
  // is a separate, Obsidian-only step in main.ts (migrateApiKeyToSecret), since
  // this pure migration has no access to the secret store.
  9: (data) => {
    if (typeof data.apiKeySecretId !== "string") {
      data.apiKeySecretId = "";
    }
    return data;
  }
  // NB: the localized insert text for built-ins (obsidian-voxtral#14) needs
  // no migration — loadSettings() refreshes every stored built-in's content
  // fields (labels, triggers, insertText, insertTextByLang, slot fields)
  // from getDefaultBuiltInCommands() on each load.
};
function migrateSettings(data) {
  if (!data) {
    return { ...DEFAULT_SETTINGS, settingsVersion: CURRENT_VERSION };
  }
  let version = typeof data.settingsVersion === "number" ? data.settingsVersion : 0;
  while (migrations[version]) {
    data = migrations[version](data);
    version++;
  }
  data.settingsVersion = CURRENT_VERSION;
  return { ...DEFAULT_SETTINGS, ...data };
}

// src/secrets.ts
var MISTRAL_SECRET_ID = "voxtral-transcribe-mistral-api";
function allocateSecretId(base, store) {
  if (store.getSecret(base) === null) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (store.getSecret(candidate) === null) return candidate;
  }
}
function migrateApiKeyToSecret(settings, store) {
  var _a;
  const plaintext = ((_a = settings.apiKey) == null ? void 0 : _a.trim()) ? settings.apiKey : "";
  if (!plaintext) return { changed: false };
  const id = settings.apiKeySecretId || allocateSecretId(MISTRAL_SECRET_ID, store);
  try {
    store.setSecret(id, plaintext);
    if (store.getSecret(id) !== plaintext) return { changed: false };
  } catch (e) {
    return { changed: false };
  }
  settings.apiKeySecretId = id;
  settings.apiKey = "";
  return { changed: true };
}
function readApiKey(settings, store) {
  var _a;
  return settings.apiKeySecretId ? (_a = store.getSecret(settings.apiKeySecretId)) != null ? _a : "" : "";
}
function stripApiKeyValue(settings) {
  return { ...settings, apiKey: "" };
}

// src/resolve-language.ts
function isSupportedLanguage(value) {
  return SUPPORTED_LANGUAGES.includes(value);
}
function describeValue(value) {
  var _a;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return (_a = JSON.stringify(value)) != null ? _a : "unknown value";
  } catch (e) {
    return "unknown value";
  }
}
function resolveLanguageOverride(frontmatterValue, globalLanguage) {
  if (frontmatterValue === void 0 || frontmatterValue === null) {
    return { language: globalLanguage };
  }
  if (typeof frontmatterValue !== "string") {
    return { language: globalLanguage, invalidValue: describeValue(frontmatterValue) };
  }
  const normalized = frontmatterValue.trim().toLowerCase();
  if (isSupportedLanguage(normalized)) {
    return { language: normalized };
  }
  return { language: globalLanguage, invalidValue: frontmatterValue };
}

// src/settings-tab.ts
var import_obsidian = require("obsidian");

// src/audio-recorder.ts
var WORKLET_SOURCE = `
class PcmProcessor extends AudioWorkletProcessor {
	process(inputs) {
		const input = inputs[0];
		if (!input || input.length === 0) return true;
		const channelData = input[0];
		if (!channelData || channelData.length === 0) return true;
		const pcm16 = new Int16Array(channelData.length);
		for (let i = 0; i < channelData.length; i++) {
			const s = Math.max(-1, Math.min(1, channelData[i]));
			pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
		}
		this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
		return true;
	}
}
registerProcessor("pcm-processor", PcmProcessor);
`;
var AudioRecorder = class {
  constructor() {
    this.stream = null;
    this.audioContext = null;
    this.sourceNode = null;
    this.workletNode = null;
    this.workletUrl = null;
    this.mediaRecorder = null;
    this.chunks = [];
    this.lastFlushTime = 0;
    this.onPcmChunk = null;
    /** The label of the currently active microphone */
    this.activeMicLabel = "";
    /** True if the selected mic failed and we fell back to default */
    this.fallbackUsed = false;
    /** Duration in seconds of the last flushed/stopped chunk */
    this.lastChunkDurationSec = 0;
  }
  /**
   * Enumerate available audio input devices.
   * Requires a prior getUserMedia call for labels to be populated.
   */
  static async enumerateMicrophones() {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });
      tempStream.getTracks().forEach((t) => t.stop());
    } catch (e) {
      return [];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput").map((d) => ({
      deviceId: d.deviceId,
      label: d.label || `Microfoon (${d.deviceId.slice(0, 8)}...)`
    }));
  }
  async start(deviceId, onPcmChunk, noiseSuppression) {
    this.onPcmChunk = onPcmChunk || null;
    const audioConstraints = { channelCount: 1 };
    if (noiseSuppression) {
      audioConstraints.noiseSuppression = { ideal: true };
      audioConstraints.echoCancellation = { ideal: true };
      audioConstraints.autoGainControl = { ideal: true };
    }
    if (deviceId) audioConstraints.deviceId = { exact: deviceId };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    } catch (err) {
      if (deviceId) {
        console.warn("Voxtral: Selected mic failed, falling back to default:", err);
        const fallbackConstraints = { channelCount: 1 };
        if (noiseSuppression) {
          fallbackConstraints.noiseSuppression = { ideal: true };
          fallbackConstraints.echoCancellation = { ideal: true };
          fallbackConstraints.autoGainControl = { ideal: true };
        }
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: fallbackConstraints });
        this.fallbackUsed = true;
      } else {
        throw err;
      }
    }
    try {
      const audioTrack = this.stream.getAudioTracks()[0];
      this.activeMicLabel = (audioTrack == null ? void 0 : audioTrack.label) || "Onbekende microfoon";
      this.audioContext = new AudioContext({ sampleRate: 16e3 });
      this.sourceNode = this.audioContext.createMediaStreamSource(
        this.stream
      );
      if (this.onPcmChunk) {
        const blob = new Blob([WORKLET_SOURCE], {
          type: "application/javascript"
        });
        this.workletUrl = URL.createObjectURL(blob);
        await this.audioContext.audioWorklet.addModule(this.workletUrl);
        this.workletNode = new AudioWorkletNode(
          this.audioContext,
          "pcm-processor"
        );
        this.workletNode.port.onmessage = (e) => {
          var _a;
          (_a = this.onPcmChunk) == null ? void 0 : _a.call(this, e.data);
        };
        this.sourceNode.connect(this.workletNode);
        this.workletNode.connect(this.audioContext.destination);
      }
      this.chunks = [];
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: this.getSupportedMimeType()
      });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.chunks.push(e.data);
        }
      };
      this.mediaRecorder.start(1e3);
      this.lastFlushTime = Date.now();
    } catch (e) {
      this.cleanup();
      throw e;
    }
  }
  /**
   * Flush current audio as a blob WITHOUT stopping the recording.
   * Stops and restarts MediaRecorder so each blob is a complete,
   * valid audio file with proper container headers.
   */
  async flushChunk() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state !== "recording") {
        resolve(new Blob([]));
        return;
      }
      const stalledRecorder = this.mediaRecorder;
      const timeout = window.setTimeout(() => {
        console.warn("Voxtral: flushChunk timed out after 5s");
        stalledRecorder.onstop = null;
        stalledRecorder.ondataavailable = null;
        const mimeType = this.getSupportedMimeType();
        const blob = new Blob(this.chunks, { type: mimeType });
        this.chunks = [];
        const now = Date.now();
        this.lastChunkDurationSec = (now - this.lastFlushTime) / 1e3;
        this.lastFlushTime = now;
        if (this.stream) {
          this.mediaRecorder = new MediaRecorder(this.stream, {
            mimeType
          });
          this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              this.chunks.push(e.data);
            }
          };
          this.mediaRecorder.start(1e3);
        } else {
          this.mediaRecorder = null;
        }
        resolve(blob);
      }, 5e3);
      stalledRecorder.onstop = () => {
        window.clearTimeout(timeout);
        const now = Date.now();
        this.lastChunkDurationSec = (now - this.lastFlushTime) / 1e3;
        this.lastFlushTime = now;
        const mimeType = this.getSupportedMimeType();
        const blob = new Blob(this.chunks, { type: mimeType });
        this.chunks = [];
        if (this.stream) {
          this.mediaRecorder = new MediaRecorder(this.stream, {
            mimeType
          });
          this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              this.chunks.push(e.data);
            }
          };
          this.mediaRecorder.start(1e3);
        }
        resolve(blob);
      };
      stalledRecorder.stop();
    });
  }
  async stop() {
    return new Promise((resolve) => {
      if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
        this.mediaRecorder.onstop = () => {
          this.lastChunkDurationSec = (Date.now() - this.lastFlushTime) / 1e3;
          const blob = new Blob(this.chunks, {
            type: this.getSupportedMimeType()
          });
          this.cleanup();
          resolve(blob);
        };
        this.mediaRecorder.stop();
      } else {
        this.cleanup();
        resolve(new Blob([]));
      }
    });
  }
  cleanup() {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.workletUrl) {
      URL.revokeObjectURL(this.workletUrl);
      this.workletUrl = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.chunks = [];
    this.activeMicLabel = "";
    this.fallbackUsed = false;
  }
  get isRecording() {
    return this.stream !== null;
  }
  get isPaused() {
    var _a;
    return ((_a = this.mediaRecorder) == null ? void 0 : _a.state) === "paused";
  }
  pause() {
    var _a, _b;
    if (((_a = this.mediaRecorder) == null ? void 0 : _a.state) === "recording") {
      this.mediaRecorder.pause();
    }
    (_b = this.stream) == null ? void 0 : _b.getAudioTracks().forEach((t) => t.enabled = false);
  }
  resume() {
    var _a, _b;
    (_a = this.stream) == null ? void 0 : _a.getAudioTracks().forEach((t) => t.enabled = true);
    if (((_b = this.mediaRecorder) == null ? void 0 : _b.state) === "paused") {
      this.mediaRecorder.resume();
    }
  }
  /** Silence the mic input without pausing the recorder */
  mute() {
    var _a;
    (_a = this.stream) == null ? void 0 : _a.getAudioTracks().forEach((t) => t.enabled = false);
  }
  /** Re-enable the mic input */
  unmute() {
    var _a;
    (_a = this.stream) == null ? void 0 : _a.getAudioTracks().forEach((t) => t.enabled = true);
  }
  getSupportedMimeType() {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4"
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return "audio/webm";
  }
};

// src/api-key-test.ts
var DEFAULT_BASE_URL2 = "https://api.mistral.ai";
var API_KEY_TEST_TIMEOUT_MS = 15e3;
var QUOTA_MESSAGE_MAX_LEN = 120;
function extractQuotaMessage(json) {
  var _a, _b;
  const obj = json;
  const msg = (_b = obj == null ? void 0 : obj.message) != null ? _b : (_a = obj == null ? void 0 : obj.error) == null ? void 0 : _a.message;
  if (typeof msg === "string" && msg.trim().length > 0) {
    const trimmed = msg.trim();
    return trimmed.length > QUOTA_MESSAGE_MAX_LEN ? `${trimmed.slice(0, QUOTA_MESSAGE_MAX_LEN)}\u2026` : trimmed;
  }
  return "Rate limit or billing issue \u2014 check your Mistral account.";
}
function classifyApiKeyTest(status, json) {
  if (status === 200) {
    const data = json;
    const modelCount = Array.isArray(data == null ? void 0 : data.data) ? data.data.length : 0;
    return { kind: "ok", modelCount };
  }
  if (status === 401 || status === 403) {
    return { kind: "invalid-key" };
  }
  if (status === 429 || status === 402) {
    return { kind: "quota", message: extractQuotaMessage(json) };
  }
  return { kind: "error", status };
}
function withTimeout2(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error(`Connection test timed out after ${Math.round(timeoutMs / 1e3)}s`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timer);
    promise.catch(() => {
    });
  });
}
async function testApiKey(apiKey, baseUrl, httpRequest) {
  const base = baseUrl || DEFAULT_BASE_URL2;
  try {
    const response = await withTimeout2(
      httpRequest({
        url: `${base}/v1/models`,
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` }
      }),
      API_KEY_TEST_TIMEOUT_MS
    );
    return classifyApiKeyTest(response.status, response.json);
  } catch (e) {
    return { kind: "unreachable" };
  }
}

// src/settings-sections.ts
function connectionAttention(settings) {
  if (isLocalMode(settings)) return null;
  if (!settings.apiKey.trim()) return "API key missing";
  return null;
}

// src/settings-tab.ts
var LOCAL_SERVER_CHECK_TIMEOUT_MS = 3e3;
var VoxtralSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.cachedModels = null;
    /** Separate from cachedModels so an empty (but real) result is memoized too — VX_E18_S4 §3. */
    this.fetchedModels = false;
    this.cachedVoices = null;
    this.fetchedVoices = false;
    /** Session-scoped open/collapsed state: survives in-tab re-renders, reset in display(). */
    this.openState = /* @__PURE__ */ new Map();
    /** Rebuilt per render; lets predicate-input fields refresh badges without a re-render. */
    this.badgeRefreshers = [];
    /**
     * Rebuilt per render (VX_E18_S4 §1-2); one entry per section holding its body
     * element and render function, so (a) a collapsed section's body can be
     * rendered lazily on first open and (b) a single section can be rebuilt in
     * place (rerenderSection) without tearing down the other 7.
     */
    this.sectionRuntimes = /* @__PURE__ */ new Map();
    /**
     * Bumped every time the "Local server status" row is (re)rendered, so an
     * in-flight healthcheck from a since-replaced row (e.g. the Connection
     * section rerendered while a check was running) can tell it's stale and
     * skip writing to its now-orphaned status element.
     */
    this.localServerCheckToken = 0;
    this.plugin = plugin;
  }
  display() {
    this.openState.clear();
    this.render();
  }
  // Full (re)render of the tab. Extracted from display() so in-tab refreshes can
  // re-render without calling the deprecated-typed display() entrypoint (Obsidian
  // 1.13 marks it deprecated in favour of the declarative settings API; Obsidian
  // itself still invokes display() when opening the tab).
  render() {
    const { containerEl } = this;
    containerEl.empty();
    this.badgeRefreshers = [];
    this.sectionRuntimes = /* @__PURE__ */ new Map();
    const sections = [
      {
        id: "connection",
        title: "Connection",
        tier: 1,
        needsAttention: () => connectionAttention(this.plugin.settings),
        render: (body) => this.renderConnection(body)
      },
      { id: "recording", title: "Recording & dictation", tier: 2, render: (body) => this.renderRecording(body) },
      {
        id: "file-transcription",
        title: "File transcription",
        tier: 2,
        render: (body) => this.renderFileTranscription(body)
      },
      { id: "listen-back", title: "Listen back (experimental)", tier: 2, render: (body) => this.renderListenBack(body) },
      {
        id: "voice-commands",
        title: "Voice commands",
        tier: 2,
        render: (body) => {
          this.renderCommandFeedback(body);
          this.renderTemplates(body);
          new import_obsidian.Setting(body).setName("Custom voice commands").setHeading();
          this.renderCustomCommands(body);
        }
      },
      {
        id: "help-shortcuts",
        title: "Help & shortcuts",
        tier: 2,
        render: (body) => {
          this.renderHelpPanel(body);
          this.renderHotkeys(body);
        }
      },
      { id: "advanced", title: "Advanced", tier: 3, render: (body) => this.renderAdvancedSection(body) },
      { id: "support", title: "Support this project", tier: 3, render: (body) => this.renderSupport(body) }
    ];
    for (const section of sections) this.renderSection(containerEl, section);
  }
  /**
   * Render one collapsible section per the shared settings-accordion pattern.
   * The body (everything section.render() adds) is lazy (VX_E18_S4 §1): a
   * section that starts collapsed doesn't render its body — and doesn't fire
   * whatever fetches/enumerations that body's controls trigger — until it's
   * opened for the first time. A section that starts open renders immediately.
   */
  renderSection(containerEl, section) {
    var _a, _b, _c;
    const details = containerEl.createEl("details", { cls: "voxtral-settings-section" });
    const reason = (_b = (_a = section.needsAttention) == null ? void 0 : _a.call(section)) != null ? _b : null;
    const initialOpen = (_c = this.openState.get(section.id)) != null ? _c : section.tier !== 3 && reason !== null;
    details.open = initialOpen;
    const summary = details.createEl("summary", { cls: "voxtral-settings-summary" });
    summary.createSpan({ text: section.title });
    const badge = summary.createSpan({ cls: "voxtral-settings-badge" });
    const refreshBadge = () => {
      var _a2, _b2;
      const r = (_b2 = (_a2 = section.needsAttention) == null ? void 0 : _a2.call(section)) != null ? _b2 : null;
      badge.setText(r ? `\u26A0 ${r}` : "");
      badge.hidden = r === null;
    };
    refreshBadge();
    this.badgeRefreshers.push(refreshBadge);
    const body = details.createDiv({ cls: "voxtral-settings-section-body" });
    this.sectionRuntimes.set(section.id, { bodyEl: body, renderFn: section.render });
    let rendered = false;
    const renderBody = () => {
      if (rendered) return;
      rendered = true;
      section.render(body);
    };
    if (initialOpen) renderBody();
    summary.addEventListener("click", () => {
      const opening = !details.open;
      this.openState.set(section.id, opening);
      if (opening) renderBody();
    });
  }
  /** Recompute the summary badges; called from fields the needsAttention predicates read. */
  refreshBadges() {
    for (const refresh of this.badgeRefreshers) refresh();
  }
  /**
   * Rebuild a single section's body in place (VX_E18_S4 §2): empties just that
   * section's body element and re-invokes its render function, instead of
   * `this.render()` tearing down and re-rendering all 8 sections (which also
   * resets scroll position and re-fires every other open section's fetches).
   * Used by the "recording" section's mode/focus-behavior/dual-delay rows,
   * whose show/hide-dependent siblings all live in that same section.
   */
  rerenderSection(id) {
    const runtime = this.sectionRuntimes.get(id);
    if (!runtime) return;
    runtime.bodyEl.empty();
    runtime.renderFn(runtime.bodyEl);
  }
  renderConnection(containerEl) {
    if (!import_obsidian.Platform.isMobile) {
      this.renderLocalServerToggle(containerEl);
      if (isLocalMode(this.plugin.settings)) {
        this.renderLocalServerStatus(containerEl);
        this.renderLocalCorrectionSettings(containerEl);
      }
    }
    new import_obsidian.Setting(containerEl).setName("Mistral API key").setDesc("Your API key from platform.mistral.ai. Stored in Obsidian\u2019s secret storage on this device (kept by your operating system), not in your vault, so it does not sync between devices; enter it once per device. Rotate the key if it was previously synced.").addComponent(
      (el) => new import_obsidian.SecretComponent(this.app, el).setValue(this.plugin.settings.apiKeySecretId).onChange(async (id) => {
        this.plugin.settings.apiKeySecretId = id != null ? id : "";
        this.plugin.settings.apiKey = readApiKey(
          this.plugin.settings,
          this.app.secretStorage
        );
        this.invalidateModelCache();
        this.invalidateVoiceCache();
        await this.plugin.saveSettings();
        this.refreshBadges();
      })
    );
    this.renderApiKeyTest(containerEl);
    new import_obsidian.Setting(containerEl).setName("API base URL").setDesc(createFragment((frag) => {
      const exampleUrl = "http://localhost:8000";
      frag.appendText("Base URL for Mistral-compatible API. Use ");
      frag.createEl("code", { text: exampleUrl });
      frag.appendText(" for local vLLM.");
    })).addText(
      (text) => text.setPlaceholder("https://api.mistral.ai").setValue(this.plugin.settings.apiBaseUrl).onChange(async (value) => {
        this.plugin.settings.apiBaseUrl = value.trim();
        this.invalidateModelCache();
        this.invalidateVoiceCache();
        await this.plugin.saveSettings();
      })
    );
  }
  /**
   * "Local server mode" toggle (VX_E17_S5). Doesn't introduce its own mode
   * field — the shown value and the write-back both go through
   * realtimeProtocol/isLocalMode, the single source of truth for local
   * mode, so an explicit OFF here always beats "auto" + a localhost base
   * URL (otherwise the toggle couldn't be switched off in that case).
   */
  renderLocalServerToggle(containerEl) {
    new import_obsidian.Setting(containerEl).setName("Local server mode (experimental)").setDesc(
      "Connect to a local vLLM server at the API base URL below instead of Mistral's cloud. Realtime dictation only, no API key needed. Requires a GPU-class machine running vLLM \u2014 see the local server guide. Experimental."
    ).addToggle(
      (toggle) => toggle.setValue(isLocalMode(this.plugin.settings)).onChange(async (value) => {
        this.plugin.settings.realtimeProtocol = value ? "vllm" : "mistral";
        await this.plugin.saveSettings();
        this.rerenderSection("connection");
      })
    );
  }
  /**
   * "Local server status" row: an unauthenticated GET /v1/models against the
   * configured base URL, so a local vLLM/Ollama-style server that's actually
   * running is visibly distinguishable from a misconfigured base URL. Runs
   * once on render and again on the refresh button.
   */
  renderLocalServerStatus(containerEl) {
    const token = ++this.localServerCheckToken;
    let checking = false;
    let statusEl;
    const setStatus = (text, kind) => {
      if (token !== this.localServerCheckToken) return;
      statusEl.classList.remove("voxtral-keytest-ok", "voxtral-keytest-fail", "voxtral-keytest-pending");
      statusEl.classList.add(`voxtral-keytest-${kind}`);
      statusEl.setText(text);
    };
    const runCheck = async () => {
      var _a, _b, _c;
      if (checking) return;
      checking = true;
      setStatus("Checking\u2026", "pending");
      try {
        const base = this.plugin.settings.apiBaseUrl || "https://api.mistral.ai";
        const response = await withTimeout(
          this.plugin.httpRequest({ url: `${base}/v1/models`, method: "GET", headers: {} }),
          LOCAL_SERVER_CHECK_TIMEOUT_MS,
          "Local server status check"
        );
        if (response.status === 200) {
          const modelId = (_c = (_b = (_a = response.json) == null ? void 0 : _a.data) == null ? void 0 : _b[0]) == null ? void 0 : _c.id;
          setStatus(modelId ? `Reachable \u2014 model: ${modelId}` : "Reachable", "ok");
        } else {
          setStatus("Not reachable \u2014 is the local server running?", "fail");
        }
      } catch (e) {
        setStatus("Not reachable \u2014 is the local server running?", "fail");
      } finally {
        checking = false;
      }
    };
    const setting = new import_obsidian.Setting(containerEl).setName("Local server status").setDesc("Checks whether the server at the API base URL above responds.").addExtraButton(
      (btn) => btn.setIcon("refresh-cw").setTooltip("Check now").onClick(() => {
        void runCheck();
      })
    );
    statusEl = setting.controlEl.createSpan({ cls: "voxtral-keytest-status" });
    void runCheck();
  }
  /** Local correction endpoint + model (VX_E17_S5) — only shown in local server mode. */
  renderLocalCorrectionSettings(containerEl) {
    const endpointPlaceholder = "http://localhost:11434";
    new import_obsidian.Setting(containerEl).setName("Local correction endpoint (advanced)").setDesc(
      "OpenAI-compatible server for the correction step (e.g. Ollama). Leave empty to skip correction in local mode \u2014 nothing is sent to the cloud either way."
    ).addText(
      (text) => text.setPlaceholder(endpointPlaceholder).setValue(this.plugin.settings.localCorrectionUrl).onChange(async (value) => {
        this.plugin.settings.localCorrectionUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
    const modelPlaceholder = "ministral-3:3b";
    new import_obsidian.Setting(containerEl).setName("Local correction model").setDesc("Model name sent to the local correction server above.").addText(
      (text) => text.setPlaceholder(modelPlaceholder).setValue(this.plugin.settings.localCorrectionModel).onChange(async (value) => {
        this.plugin.settings.localCorrectionModel = value.trim();
        await this.plugin.saveSettings();
      })
    );
  }
  renderRecording(containerEl) {
    const micSetting = new import_obsidian.Setting(containerEl).setName("Microphone").setDesc("Select which microphone to use");
    micSetting.addDropdown((drop) => {
      drop.addOption("", "System default");
      drop.setValue(this.plugin.settings.microphoneDeviceId);
      AudioRecorder.enumerateMicrophones().then((mics) => {
        for (const mic of mics) {
          drop.addOption(mic.deviceId, mic.label);
        }
        drop.setValue(this.plugin.settings.microphoneDeviceId);
      }).catch((err) => {
        console.error("Voxtral: Failed to enumerate microphones", err);
      });
      drop.onChange(async (value) => {
        this.plugin.settings.microphoneDeviceId = value;
        await this.plugin.saveSettings();
      });
    });
    const modeDesc = import_obsidian.Platform.isMobile ? "Only batch mode is available on mobile. Use tap-to-send to submit chunks while you keep talking." : "Realtime: text appears as you speak. Batch: audio is transcribed after you stop recording.";
    const modeSetting = new import_obsidian.Setting(containerEl).setName("Mode").setDesc(modeDesc);
    if (import_obsidian.Platform.isMobile) {
      modeSetting.addDropdown(
        (drop) => drop.addOption("batch", "Batch (after recording)").setValue("batch").setDisabled(true)
      );
    } else {
      modeSetting.addDropdown(
        (drop) => drop.addOption("realtime", "Realtime (streaming)").addOption("batch", "Batch (after recording)").setValue(this.plugin.settings.mode).onChange(async (value) => {
          this.plugin.settings.mode = value;
          await this.plugin.saveSettings();
          this.rerenderSection("recording");
        })
      );
    }
    const isBatch = this.plugin.settings.mode === "batch" || import_obsidian.Platform.isMobile;
    new import_obsidian.Setting(containerEl).setName("Enter = tap-to-send").setDesc(
      isBatch ? "In batch mode, pressing Enter sends the current audio chunk when the mic is live. While typing, Enter inserts a normal newline." : "Only available in batch mode. Switch to batch mode to change this setting."
    ).addToggle(
      (toggle) => toggle.setValue(isBatch ? this.plugin.settings.enterToSend : false).setDisabled(!isBatch).onChange(async (value) => {
        this.plugin.settings.enterToSend = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Typing cooldown").setDesc(
      "How long after you stop typing before the mic unmutes again"
    ).addDropdown((drop) => {
      const options = {
        "400": "400 ms (fast)",
        "800": "800 ms (default)",
        "1200": "1.2 sec",
        "1500": "1.5 sec",
        "2000": "2 sec",
        "3000": "3 sec"
      };
      for (const [value, label] of Object.entries(options)) {
        drop.addOption(value, label);
      }
      drop.setValue(
        String(this.plugin.settings.typingCooldownMs)
      ).onChange(async (value) => {
        this.plugin.settings.typingCooldownMs = Number(value);
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("On focus loss").setDesc(
      "What should happen when you switch apps while recording?"
    ).addDropdown((drop) => {
      drop.addOption("pause", "Pause immediately");
      drop.addOption(
        "pause-after-delay",
        "Pause after delay"
      );
      drop.addOption("keep-recording", "Keep recording");
      drop.setValue(this.plugin.settings.focusBehavior).onChange(
        async (value) => {
          this.plugin.settings.focusBehavior = value;
          await this.plugin.saveSettings();
          this.rerenderSection("recording");
        }
      );
    });
    if (this.plugin.settings.focusBehavior === "pause-after-delay") {
      new import_obsidian.Setting(containerEl).setName("Pause delay (seconds)").setDesc(
        "How long to wait in the background before pausing the recording"
      ).addDropdown((drop) => {
        const options = {
          "10": "10 sec",
          "30": "30 sec (default)",
          "60": "1 minute",
          "120": "2 minutes",
          "300": "5 minutes"
        };
        for (const [value, label] of Object.entries(options)) {
          drop.addOption(value, label);
        }
        drop.setValue(
          String(this.plugin.settings.focusPauseDelaySec)
        ).onChange(async (value) => {
          this.plugin.settings.focusPauseDelaySec = Number(value);
          await this.plugin.saveSettings();
        });
      });
    }
    new import_obsidian.Setting(containerEl).setName("Language").setDesc("Language for transcription and voice commands").addDropdown((dropdown) => {
      for (const code of SUPPORTED_LANGUAGES) {
        dropdown.addOption(code, `${LANGUAGE_NAMES[code]} (${code})`);
      }
      dropdown.setValue(this.plugin.settings.language);
      dropdown.onChange(async (value) => {
        this.plugin.settings.language = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Auto-correct").setDesc(
      "Automatically correct spelling, capitalization, and punctuation after recording"
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoCorrect).onChange(async (value) => {
        this.plugin.settings.autoCorrect = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Noise suppression").setDesc(
      "Enable browser-level noise suppression, echo cancellation, and auto gain control. Useful in noisy environments."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.noiseSuppression).onChange(async (value) => {
        this.plugin.settings.noiseSuppression = value;
        await this.plugin.saveSettings();
      })
    );
    const isRealtime = !isBatch && !import_obsidian.Platform.isMobile;
    new import_obsidian.Setting(containerEl).setName("Dual-delay mode (experimental)").setDesc(
      import_obsidian.Platform.isMobile ? "Not available on mobile (requires realtime streaming)." : !isRealtime ? "Only available in realtime mode." : "Experimental: run two parallel streams (fast preview + slow accuracy). Uses 2x API bandwidth and may produce unexpected results. Overrides the streaming delay setting."
    ).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.dualDelay).setDisabled(!isRealtime).onChange(async (value) => {
        this.plugin.settings.dualDelay = value;
        await this.plugin.saveSettings();
        this.rerenderSection("recording");
      });
    });
    if (isRealtime && !this.plugin.settings.dualDelay) {
      new import_obsidian.Setting(containerEl).setName("Streaming delay").setDesc(
        "Delay in ms for realtime mode. Lower = faster but less accurate."
      ).addDropdown((drop) => {
        const options = {
          "240": "240 ms (fastest)",
          "480": "480 ms (default)",
          "640": "640 ms",
          "800": "800 ms",
          "1200": "1200 ms",
          "1600": "1600 ms",
          "2400": "2400 ms (most accurate)"
        };
        for (const [value, label] of Object.entries(options)) {
          drop.addOption(value, label);
        }
        drop.setValue(
          String(this.plugin.settings.streamingDelayMs)
        ).onChange(async (value) => {
          this.plugin.settings.streamingDelayMs = Number(value);
          await this.plugin.saveSettings();
        });
      });
    }
  }
  renderFileTranscription(containerEl) {
    new import_obsidian.Setting(containerEl).setName("Transcript destination").setDesc(
      "Where the text goes when you transcribe an audio file (right-click the file)."
    ).addDropdown((drop) => {
      drop.addOption("cursor", "Insert into the active note");
      drop.addOption("newNote", "New note linked to the audio file");
      drop.setValue(this.plugin.settings.fileTranscriptOutput);
      drop.onChange(async (value) => {
        this.plugin.settings.fileTranscriptOutput = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Correct file transcripts").setDesc(
      "Run a transcribed file through the correction layer (spelling, punctuation). Off by default \u2014 file transcripts can be long, so this adds extra API cost."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.fileTranscriptCorrect).onChange(async (value) => {
        this.plugin.settings.fileTranscriptCorrect = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Warn about low-quality or oversized files").setDesc(
      "Before transcribing an audio file, check it and warn if it looks too large or low-quality (clipping, very quiet, mostly silent), so you can fix it before spending an API call. You can still transcribe anyway."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.fileTranscriptQualityWarnings).onChange(async (value) => {
        this.plugin.settings.fileTranscriptQualityWarnings = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Chunk length for long recordings").setDesc(
      "Recordings over the single-request size limit are split into parts and transcribed one part at a time. Shorter parts use less memory; longer parts mean fewer requests. Desktop only."
    ).addDropdown((drop) => {
      const options = {
        "300": "5 minutes",
        "600": "10 minutes",
        "900": "15 minutes",
        "1200": "20 minutes",
        "1800": "30 minutes"
      };
      for (const [value, label] of Object.entries(options)) {
        drop.addOption(value, label);
      }
      drop.setValue(String(this.plugin.settings.chunkSeconds));
      drop.onChange(async (value) => {
        this.plugin.settings.chunkSeconds = Number(value);
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Speaker labels (diarization)").setDesc(
      "Label different speakers in a transcribed file (uses the diarization API). Off by default. Speaker numbers are detected per request, so for a long file that's split into parts they are not consistent across the whole transcript \u2014 a note at the top says so."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.fileTranscriptDiarize).onChange(async (value) => {
        this.plugin.settings.fileTranscriptDiarize = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Review before inserting").setDesc(
      "Pause after transcribing to preview the transcript and rename detected speakers before anything lands in the note. Off by default \u2014 the transcript is inserted directly, as before."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.fileTranscriptReview).onChange(async (value) => {
        this.plugin.settings.fileTranscriptReview = value;
        await this.plugin.saveSettings();
      })
    );
  }
  // Listen back (E26, experimental)
  renderListenBack(containerEl) {
    new import_obsidian.Setting(containerEl).setName("Read text aloud").setDesc(
      "Add commands to read the selected text or current paragraph aloud using Voxtral text-to-speech. Experimental and off by default; each listen makes an API call."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.ttsEnabled).onChange(async (value) => {
        this.plugin.settings.ttsEnabled = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Voice").setDesc(
      "Which voice to use when reading text aloud. The list is fetched from your account (presets and any cloned voices); voices are multilingual, so an English voice still reads Dutch text in its own accent."
    ).addDropdown((drop) => {
      const current = this.plugin.settings.ttsVoice;
      for (const voice of TTS_VOICES) {
        drop.addOption(voice.id, voice.label);
      }
      if (current && !TTS_VOICES.some((v) => v.id === current)) {
        drop.addOption(current, current);
      }
      drop.setValue(current);
      drop.onChange(async (value) => {
        this.plugin.settings.ttsVoice = value;
        await this.plugin.saveSettings();
      });
      this.getVoices().then((voices) => {
        if (voices.length === 0) return;
        drop.selectEl.empty();
        const liveCurrent = this.plugin.settings.ttsVoice;
        const ids = voices.map((v) => v.id);
        if (liveCurrent && !ids.includes(liveCurrent)) {
          drop.addOption(liveCurrent, `${liveCurrent} (current)`);
        }
        for (const voice of voices) {
          drop.addOption(voice.id, voice.name || voice.id);
        }
        drop.setValue(liveCurrent);
      }).catch((err) => {
        console.error("Voxtral: Failed to fetch voices", err);
      });
    }).addExtraButton(
      (btn) => btn.setIcon("refresh-cw").setTooltip("Refresh voices (pull newly cloned voices from your account)").onClick(async () => {
        this.invalidateVoiceCache();
        const voices = await this.getVoices();
        if (voices.length > 0) {
          new import_obsidian.Notice(`Voxtral: ${voices.length} voice(s) available`);
          this.render();
          return;
        }
        try {
          const base = this.plugin.settings.apiBaseUrl || "https://api.mistral.ai";
          const r = await this.plugin.httpRequest({
            url: `${base}/v1/audio/voices?limit=100`,
            method: "GET",
            headers: { Authorization: `Bearer ${this.plugin.settings.apiKey}` }
          });
          const shape = r.json && typeof r.json === "object" ? `keys: ${Object.keys(r.json).join(", ") || "(none)"}` : `text: ${(r.text || "").slice(0, 80)}`;
          new import_obsidian.Notice(`Voxtral voices: HTTP ${r.status}; ${shape}`, 1e4);
        } catch (err) {
          new import_obsidian.Notice(`Voxtral voices fetch error: ${String(err)}`, 1e4);
        }
        this.render();
      })
    );
  }
  renderCommandFeedback(containerEl) {
    new import_obsidian.Setting(containerEl).setName("Show voice command feedback").setDesc(
      "Briefly show which command just ran (status-bar flash on desktop, a short notice on mobile). Helps catch a false-positive command before it's buried in the text."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.commandFeedback).onChange(async (value) => {
        this.plugin.settings.commandFeedback = value;
        await this.plugin.saveSettings();
      })
    );
  }
  renderHelpPanel(containerEl) {
    new import_obsidian.Setting(containerEl).setName("Auto-open on desktop").setDesc(
      "Open the voice help panel in the right sidebar when recording starts on desktop."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoOpenHelpDesktop).onChange(async (value) => {
        this.plugin.settings.autoOpenHelpDesktop = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Auto-open on mobile").setDesc(
      `Open the voice help panel when recording starts on mobile. Off by default so the panel doesn't slide over your note. You can still open it manually via the "Show voice help panel" command or by swiping from the right.`
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoOpenHelpMobile).onChange(async (value) => {
        this.plugin.settings.autoOpenHelpMobile = value;
        await this.plugin.saveSettings();
      })
    );
  }
  // Hotkeys hint
  renderHotkeys(containerEl) {
    new import_obsidian.Setting(containerEl).setName("Customize hotkeys").setDesc(
      `You can assign keyboard shortcuts to all Voxtral commands (start/stop recording, correct selection, correct note, etc.) via Obsidian's Settings \u2192 Hotkeys. Search for "Voxtral".`
    ).addButton(
      (btn) => btn.setButtonText("Open hotkeys").onClick(() => {
        var _a, _b;
        const appSetting = this.app.setting;
        (_a = appSetting == null ? void 0 : appSetting.openTabById) == null ? void 0 : _a.call(appSetting, "hotkeys");
        const tab = appSetting == null ? void 0 : appSetting.activeTab;
        if (tab == null ? void 0 : tab.searchComponent) {
          tab.searchComponent.setValue("Voxtral");
          (_b = tab.updateHotkeyVisibility) == null ? void 0 : _b.call(tab);
        }
      })
    );
  }
  renderSupport(containerEl) {
    new import_obsidian.Setting(containerEl).setName("Buy me a coffee").setDesc("Find this plugin useful? Consider a donation!").addButton(
      (btn) => btn.setButtonText("Buy me a coffee").onClick(() => {
        window.open("https://buymeacoffee.com/maxonamission");
      })
    );
  }
  renderTemplates(containerEl) {
    new import_obsidian.Setting(containerEl).setName("Templates folder").setDesc(
      'Path to your templates folder (e.g. "Templates"). Say "template {name}" or "sjabloon {name}" to insert. Leave empty to disable.'
    ).addText(
      (text) => text.setPlaceholder("Templates").setValue(this.plugin.settings.templatesFolder).onChange(async (value) => {
        this.plugin.settings.templatesFolder = value.trim();
        await this.plugin.saveSettings();
      })
    );
  }
  // Advanced: models, vault-aware correction, prompt override and diagnostics.
  renderAdvancedSection(containerEl) {
    const isRealtimeModel = (m) => m.id.includes("realtime");
    const isBatchModel = (m) => {
      var _a;
      return !!((_a = m.capabilities) == null ? void 0 : _a.audio_transcription) && !m.id.includes("realtime");
    };
    const isTextChatModel = (m) => {
      var _a, _b;
      return !!((_a = m.capabilities) == null ? void 0 : _a.completion_chat) && !((_b = m.capabilities) == null ? void 0 : _b.audio_transcription) && !m.id.startsWith("voxtral");
    };
    this.addModelDropdown(
      containerEl,
      "Realtime model",
      "Model for real-time streaming transcription",
      this.plugin.settings.realtimeModel,
      async (value) => {
        this.plugin.settings.realtimeModel = value.trim();
        await this.plugin.saveSettings();
      },
      isRealtimeModel,
      () => this.plugin.settings.realtimeModel
    );
    this.addModelDropdown(
      containerEl,
      "Batch model",
      "Model for batch transcription",
      this.plugin.settings.batchModel,
      async (value) => {
        this.plugin.settings.batchModel = value.trim();
        await this.plugin.saveSettings();
      },
      isBatchModel,
      () => this.plugin.settings.batchModel
    );
    this.addModelDropdown(
      containerEl,
      "Correction model",
      "Model for text correction",
      this.plugin.settings.correctModel,
      async (value) => {
        this.plugin.settings.correctModel = value.trim();
        await this.plugin.saveSettings();
      },
      isTextChatModel,
      () => this.plugin.settings.correctModel
    );
    new import_obsidian.Setting(containerEl).setName("Vault vocabulary").setDesc(
      "When enabled, vault term names (headings, link texts, note titles, aliases, and tags \u2014 never note contents) from the active note's own headings and links, notes it links to, notes linking back to it, and its own tags are sent to the Mistral API together with the dictated text, so a misheard or misspelled vault term can be corrected toward its exact spelling. Off by default: this shares vault term names with an external API on every correction call."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.vaultVocabulary).onChange(async (value) => {
        this.plugin.settings.vaultVocabulary = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Auto-link vault terms (experimental)").setDesc(
      'After a correction pass, wrap exact (case-insensitive, whole-phrase) matches of vault terms in [[wikilinks]]. No partial or fuzzy matching. Local text processing only \u2014 nothing extra is sent to the API \u2014 but requires "Vault vocabulary" above to be on, since it reuses that same collected term list.'
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.vaultWikilinks).setDisabled(!this.plugin.settings.vaultVocabulary).onChange(async (value) => {
        this.plugin.settings.vaultWikilinks = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Correction system prompt").setDesc("Leave empty to use the default prompt").addTextArea(
      (text) => text.setPlaceholder("Default correction prompt will be used...").setValue(this.plugin.settings.systemPrompt).onChange(async (value) => {
        this.plugin.settings.systemPrompt = value;
        await this.plugin.saveSettings();
      })
    ).then((setting) => {
      const textarea = setting.controlEl.querySelector("textarea");
      if (textarea) {
        textarea.rows = 6;
        textarea.classList.add("voxtral-textarea-full");
      }
    });
    new import_obsidian.Setting(containerEl).setName("Debug logging").setDesc(
      `Record verbose diagnostic logs for the "export logs to file" command. Leave off unless you're troubleshooting.`
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.debugLogging).onChange(async (value) => {
        this.plugin.settings.debugLogging = value;
        setDebugLogging(value);
        await this.plugin.saveSettings();
      })
    );
  }
  /**
   * "Test connection" row: one cheap authenticated call (GET /v1/models)
   * against the configured API key + base URL, reported inline (no Notice
   * spam). See VX_E27_S5.
   */
  renderApiKeyTest(containerEl) {
    let statusEl;
    const setting = new import_obsidian.Setting(containerEl).setName("Test connection").setDesc("Send one request to confirm the API key and base URL work.").addButton((btn) => {
      btn.setButtonText("Test connection").onClick(async () => {
        const apiKey = this.plugin.settings.apiKey;
        if (!apiKey || !apiKey.trim()) {
          this.setApiKeyTestStatus(statusEl, "fail", "Enter an API key first");
          return;
        }
        btn.setDisabled(true);
        const originalLabel = "Test connection";
        btn.setButtonText("Testing\u2026");
        this.setApiKeyTestStatus(statusEl, "pending", "Testing\u2026");
        try {
          const result = await testApiKey(
            apiKey,
            this.plugin.settings.apiBaseUrl,
            this.plugin.httpRequest
          );
          this.renderApiKeyTestResult(statusEl, result);
        } finally {
          btn.setDisabled(false);
          btn.setButtonText(originalLabel);
        }
      });
    });
    statusEl = setting.controlEl.createSpan({ cls: "voxtral-keytest-status" });
  }
  /** Render a plain pending/failure message (used for the empty-key guard and the spinner state). */
  setApiKeyTestStatus(el, kind, text) {
    el.classList.remove("voxtral-keytest-ok", "voxtral-keytest-fail", "voxtral-keytest-pending");
    el.classList.add(kind === "pending" ? "voxtral-keytest-pending" : "voxtral-keytest-fail");
    el.setText(text);
  }
  /** Render the classified outcome of a connection test with per-kind copy and styling. */
  renderApiKeyTestResult(el, result) {
    el.classList.remove("voxtral-keytest-ok", "voxtral-keytest-fail", "voxtral-keytest-pending");
    switch (result.kind) {
      case "ok":
        el.classList.add("voxtral-keytest-ok");
        el.setText(
          `\u2713 Connected \u2014 ${result.modelCount} model${result.modelCount === 1 ? "" : "s"} available`
        );
        break;
      case "invalid-key":
        el.classList.add("voxtral-keytest-fail");
        el.setText("\u2717 invalid or revoked API key");
        break;
      case "quota":
        el.classList.add("voxtral-keytest-fail");
        el.setText(`\u2717 Quota or billing issue: ${result.message}`);
        break;
      case "unreachable":
        el.classList.add("voxtral-keytest-fail");
        el.setText("\u2717 could not reach the API endpoint \u2014 check the base URL and your network");
        break;
      case "error":
        el.classList.add("voxtral-keytest-fail");
        el.setText(`\u2717 Request failed (HTTP ${result.status})`);
        break;
    }
  }
  renderCustomCommands(containerEl) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
    const commands = this.plugin.settings.customCommands;
    const lang = this.plugin.settings.language;
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      const triggers = (_b = (_a = cmd.triggers[lang]) != null ? _a : cmd.triggers["en"]) != null ? _b : [];
      const typeLabel = cmd.type === "slot" ? `${(_c = cmd.slotPrefix) != null ? _c : ""}\u2026${(_d = cmd.slotSuffix) != null ? _d : ""}` : ((_g = (_f = (_e = cmd.insertTextByLang) == null ? void 0 : _e[lang]) != null ? _f : cmd.insertText) != null ? _g : "").replace(/\n/g, "\u21B5").slice(0, 30);
      const namePrefix = cmd.builtIn ? "\u2699 " : "";
      const displayLabel = (_k = (_j = (_h = cmd.labels) == null ? void 0 : _h[lang]) != null ? _j : (_i = cmd.labels) == null ? void 0 : _i["en"]) != null ? _k : "";
      const displayName = displayLabel || triggers.join(", ") || cmd.id;
      new import_obsidian.Setting(containerEl).setName(namePrefix + displayName).setDesc(`${cmd.type === "slot" ? "Slot" : "Insert"}: ${typeLabel}`).addButton(
        (btn) => btn.setButtonText("Edit").onClick(() => {
          if (commands.indexOf(cmd) === -1) return;
          this.openCommandEditor(cmd, false);
        })
      ).addButton((btn) => {
        btn.setButtonText("Delete").onClick(async () => {
          const liveIndex = commands.indexOf(cmd);
          if (liveIndex === -1) return;
          commands.splice(liveIndex, 1);
          await this.plugin.saveSettings();
          this.render();
        });
        btn.buttonEl.addClass("mod-warning");
      });
    }
    new import_obsidian.Setting(containerEl).setDesc("Add a custom voice command for inserting text or opening a slot").addButton(
      (btn) => btn.setButtonText("Add command").setCta().onClick(() => {
        const newCmd = {
          id: `custom-${Date.now()}`,
          triggers: { [lang]: [""] },
          type: "insert",
          insertText: ""
        };
        this.openCommandEditor(newCmd, true);
      })
    );
    new import_obsidian.Setting(containerEl).setDesc(
      "Restore the built-in commands (table, callout, etc.) to their defaults. Your own custom commands are not affected."
    ).addButton(
      (btn) => btn.setButtonText("Reset built-ins").onClick(async () => {
        const userCommands = commands.filter((c) => !c.builtIn);
        this.plugin.settings.customCommands = [
          ...getDefaultBuiltInCommands(),
          ...userCommands
        ];
        await this.plugin.saveSettings();
        this.render();
      })
    );
  }
  /**
   * @param isNew Whether `cmd` has not yet been pushed into
   * `plugin.settings.customCommands` (VX_E18_S4 §5) — the "Add command" flow
   * builds the object and opens this editor before it exists in settings, so
   * Cancel can leave settings untouched. Save either pushes it (isNew) or
   * re-locates its live index by identity and assigns in place (existing).
   */
  openCommandEditor(cmd, isNew) {
    const { plugin } = this;
    const redisplay = () => this.render();
    const lang = this.plugin.settings.language;
    let removeVVListener;
    const editorModal = new class extends import_obsidian.Modal {
      onOpen() {
        var _a;
        const { contentEl } = this;
        this.containerEl.addClass("voxtral-cmd-editor-overlay");
        this.modalEl.addClass("voxtral-cmd-editor-modal");
        if (import_obsidian.Platform.isMobile && window.visualViewport) {
          const vv = window.visualViewport;
          const adjustHeight = () => {
            this.modalEl.style.maxHeight = `${vv.height - 32}px`;
          };
          adjustHeight();
          vv.addEventListener("resize", adjustHeight);
          removeVVListener = () => vv.removeEventListener("resize", adjustHeight);
        }
        const stopLeak = (e) => e.stopPropagation();
        contentEl.addEventListener("input", stopLeak, true);
        contentEl.addEventListener("keydown", stopLeak, true);
        contentEl.addEventListener("keyup", stopLeak, true);
        contentEl.addEventListener("keypress", stopLeak, true);
        new import_obsidian.Setting(contentEl).setName("Custom voice command").setHeading();
        let triggerInput;
        new import_obsidian.Setting(contentEl).setName("Trigger phrases (comma-separated)").addText((text) => {
          var _a2;
          triggerInput = text.inputEl;
          text.setValue(((_a2 = cmd.triggers[lang]) != null ? _a2 : []).join(", "));
        });
        let labelInput;
        new import_obsidian.Setting(contentEl).setName("Label (name in help panel)").setDesc("Leave empty to use trigger phrase").addText((text) => {
          var _a2, _b;
          labelInput = text.inputEl;
          text.setValue((_b = (_a2 = cmd.labels) == null ? void 0 : _a2[lang]) != null ? _b : "");
        });
        let typeValue = cmd.type;
        new import_obsidian.Setting(contentEl).setName("Type").addDropdown((drop) => {
          drop.addOption("insert", "Insert text");
          drop.addOption("slot", "Slot (type between prefix/suffix)");
          drop.setValue(cmd.type);
          drop.onChange((value) => {
            typeValue = value;
            updateVisibility();
          });
        });
        const insertContainer = contentEl.createDiv();
        let insertInput;
        new import_obsidian.Setting(insertContainer).setName("Text to insert").setDesc("Use \\n for newline").addText((text) => {
          var _a2, _b, _c;
          insertInput = text.inputEl;
          const effective = (_c = (_b = (_a2 = cmd.insertTextByLang) == null ? void 0 : _a2[lang]) != null ? _b : cmd.insertText) != null ? _c : "";
          text.setValue(effective.replace(/\n/g, "\\n"));
        });
        const slotContainer = contentEl.createDiv();
        let prefixInput;
        let suffixInput;
        let exitValue = (_a = cmd.slotExit) != null ? _a : "enter";
        new import_obsidian.Setting(slotContainer).setName("Prefix (e.g. [[ or **)").addText((text) => {
          var _a2;
          prefixInput = text.inputEl;
          text.setValue((_a2 = cmd.slotPrefix) != null ? _a2 : "");
        });
        new import_obsidian.Setting(slotContainer).setName("Suffix (e.g. ]] or **)").addText((text) => {
          var _a2;
          suffixInput = text.inputEl;
          text.setValue((_a2 = cmd.slotSuffix) != null ? _a2 : "");
        });
        new import_obsidian.Setting(slotContainer).setName("Close slot on").addDropdown((drop) => {
          drop.addOption("voice", "Voice command only");
          drop.addOption("enter", "Enter");
          drop.addOption("space", "Space");
          drop.addOption("enter-or-space", "Enter or space");
          drop.setValue(exitValue);
          drop.onChange((value) => {
            exitValue = value;
          });
        });
        const updateVisibility = () => {
          insertContainer.toggle(typeValue === "insert");
          slotContainer.toggle(typeValue === "slot");
        };
        updateVisibility();
        if (import_obsidian.Platform.isMobile) {
          window.setTimeout(() => triggerInput == null ? void 0 : triggerInput.focus(), 100);
        }
        new import_obsidian.Setting(contentEl).addButton(
          (btn) => btn.setButtonText("Cancel").onClick(() => {
            this.close();
          })
        ).addButton(
          (btn) => btn.setButtonText("Save").setCta().onClick(() => {
            var _a2, _b, _c;
            const triggers = triggerInput.value.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
            if (triggers.length === 0) {
              triggerInput.classList.add("voxtral-cmd-error");
              return;
            }
            triggerInput.classList.remove("voxtral-cmd-error");
            cmd.triggers[lang] = triggers;
            const labelVal = labelInput.value.trim();
            if (labelVal) {
              if (!cmd.labels) cmd.labels = {};
              cmd.labels[lang] = labelVal;
            } else if (cmd.labels) {
              delete cmd.labels[lang];
            }
            cmd.type = typeValue;
            if (cmd.type === "insert") {
              const newInsertText = insertInput.value.replace(/\\n/g, "\n");
              const effective = (_c = (_b = (_a2 = cmd.insertTextByLang) == null ? void 0 : _a2[lang]) != null ? _b : cmd.insertText) != null ? _c : "";
              if (newInsertText !== effective) {
                cmd.insertText = newInsertText;
                cmd.insertTextByLang = void 0;
              }
              cmd.slotPrefix = void 0;
              cmd.slotSuffix = void 0;
              cmd.slotExit = void 0;
            } else {
              cmd.slotPrefix = prefixInput.value;
              cmd.slotSuffix = suffixInput.value;
              cmd.slotExit = exitValue;
              cmd.insertText = void 0;
              cmd.insertTextByLang = void 0;
            }
            if (isNew) {
              plugin.settings.customCommands.push(cmd);
            } else {
              const liveIndex = plugin.settings.customCommands.indexOf(cmd);
              if (liveIndex !== -1) {
                plugin.settings.customCommands[liveIndex] = cmd;
              }
            }
            void plugin.saveSettings();
            this.close();
            redisplay();
          })
        );
      }
      onClose() {
        removeVVListener == null ? void 0 : removeVVListener();
        this.contentEl.empty();
      }
    }(this.app);
    editorModal.open();
  }
  /**
   * Add a model dropdown that fetches options from the Mistral API.
   * Falls back to a text field if no API key is set or the fetch fails.
   * The current value is always shown, even if not in the fetched list.
   *
   * @param getCurrentValue Reads the live settings value at fetch-resolve time
   * (VX_E18_S4 §7) — the repopulation below must augment/select against
   * whatever is *currently* selected, not the value captured when this row
   * was first rendered, otherwise a selection made while the fetch was in
   * flight gets visibly reverted. Defaults to the render-time `currentValue`
   * for callers that don't have a live source to read from.
   */
  addModelDropdown(containerEl, name, desc, currentValue, onChange, filter, getCurrentValue) {
    const setting = new import_obsidian.Setting(containerEl).setName(name).setDesc(desc);
    const readCurrent = getCurrentValue != null ? getCurrentValue : (() => currentValue);
    setting.addDropdown((drop) => {
      if (currentValue) {
        drop.addOption(currentValue, currentValue);
      }
      drop.setValue(currentValue);
      drop.onChange(async (value) => {
        await onChange(value);
      });
      this.getModels().then((models) => {
        if (models.length === 0) return;
        const filtered = filter ? models.filter(filter) : models;
        const selectEl = drop.selectEl;
        selectEl.empty();
        const liveValue = readCurrent();
        const ids = filtered.map((m) => m.id);
        if (liveValue && !ids.includes(liveValue)) {
          drop.addOption(liveValue, `${liveValue} (current)`);
        }
        for (const model of filtered) {
          drop.addOption(model.id, model.id);
        }
        drop.setValue(liveValue);
      }).catch((err) => {
        console.error("Voxtral: Failed to fetch models", err);
      });
    });
  }
  /** Drops the model cache (VX_E18_S4 §3): called on apiKey/apiBaseUrl change. */
  invalidateModelCache() {
    this.cachedModels = null;
    this.fetchedModels = false;
  }
  /** Drops the voice cache (VX_E18_S4 §3): called on apiKey/apiBaseUrl change and manual refresh. */
  invalidateVoiceCache() {
    this.cachedVoices = null;
    this.fetchedVoices = false;
  }
  async getModels() {
    var _a;
    if (this.fetchedModels) return (_a = this.cachedModels) != null ? _a : [];
    const models = await listModels(this.plugin.settings.apiKey, this.plugin.httpRequest, this.plugin.settings.apiBaseUrl);
    this.cachedModels = models;
    this.fetchedModels = true;
    return models;
  }
  async getVoices() {
    var _a;
    if (this.fetchedVoices) return (_a = this.cachedVoices) != null ? _a : [];
    const voices = await listVoices(this.plugin.settings.apiKey, this.plugin.httpRequest, this.plugin.settings.apiBaseUrl);
    this.cachedVoices = voices;
    this.fetchedVoices = true;
    return voices;
  }
};

// src/help-view.ts
var import_obsidian2 = require("obsidian");

// ../shared/src/voice-commands.ts
var activeLang = "nl";
function setLanguage(lang) {
  activeLang = lang;
}
var activeSlot = null;
function isSlotActive() {
  return activeSlot !== null;
}
function getActiveSlot() {
  return activeSlot;
}
function closeSlot(editor) {
  if (!activeSlot) return false;
  let pos = editor.getCursor();
  const suffix = activeSlot.def.suffix;
  if (suffix && activeSlot.startPos) {
    const textSinceOpen = editor.getRange(activeSlot.startPos, pos);
    if (textSinceOpen.includes(suffix)) {
      activeSlot = null;
      return true;
    }
  }
  if (suffix) {
    const line2 = editor.getLine(pos.line);
    const before = line2.substring(0, pos.ch);
    const trimmed = before.replace(/\s+$/, "");
    if (trimmed.length < before.length) {
      const trimFrom = { line: pos.line, ch: trimmed.length };
      editor.replaceRange("", trimFrom, pos);
      pos = { line: pos.line, ch: trimmed.length };
    }
  }
  const line = editor.getLine(pos.line);
  const afterCursor = line.substring(pos.ch, pos.ch + suffix.length);
  if (afterCursor === suffix) {
    editor.setCursor({ line: pos.line, ch: pos.ch + suffix.length });
  } else {
    editor.replaceRange(suffix, pos);
    editor.setCursor({ line: pos.line, ch: pos.ch + suffix.length });
  }
  activeSlot = null;
  return true;
}
function cancelSlot() {
  activeSlot = null;
}
function fixMishearings(text) {
  for (const [pattern, replacement] of getMishearings(activeLang)) {
    text = text.replace(pattern, replacement);
  }
  return text;
}
function insertAtCursor(editor, text, posOverride) {
  const cursor = posOverride != null ? posOverride : editor.getCursor();
  const context = cursor.ch === 0 ? "new-line" : detectContext(editor.getRange({ line: cursor.line, ch: 0 }, cursor));
  if (cursor.ch === 0) {
    text = text.replace(/^ +/, "");
  }
  if (cursor.ch > 0 && text.length > 0 && !/^[\s\n]/.test(text) && !isSlotActive()) {
    const charBefore = editor.getRange(
      { line: cursor.line, ch: cursor.ch - 1 },
      cursor
    );
    if (charBefore && /\S/.test(charBefore)) {
      text = " " + text;
    }
  }
  if (shouldLowercase(context)) {
    text = lowercaseFirstLetter(text);
  }
  if (shouldStripTrailingPunctuation(context)) {
    text = stripTrailingPunctuation(text);
  }
  if (text.length > 0 && !/[\s\n]$/.test(text) && !isSlotActive()) {
    const charAfter = editor.getRange(cursor, {
      line: cursor.line,
      ch: cursor.ch + 1
    });
    if (charAfter && /\S/.test(charAfter)) {
      text = text + " ";
    }
  }
  editor.replaceRange(text, cursor);
  const lines = text.split("\n");
  const lastLine = lines[lines.length - 1];
  const newLine = cursor.line + lines.length - 1;
  const newCh = lines.length === 1 ? cursor.ch + lastLine.length : lastLine.length;
  editor.setCursor({ line: newLine, ch: newCh });
}
function deleteLastParagraph(editor) {
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
function deleteLastSentence(editor) {
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
function colonAction(editor) {
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
function closeSlotAndSpace(editor, expectedOpenId) {
  if ((activeSlot == null ? void 0 : activeSlot.commandId) === expectedOpenId) {
    closeSlot(editor);
  } else {
    return;
  }
  const pos = editor.getCursor();
  editor.replaceRange(" ", pos);
  editor.setCursor({ line: pos.line, ch: pos.ch + 1 });
}
var COMMAND_DEFS = [
  { id: "newParagraph", action: (editor) => insertAtCursor(editor, "\n\n") },
  { id: "newLine", action: (editor) => insertAtCursor(editor, "\n") },
  { id: "heading1", action: (editor) => insertAtCursor(editor, "\n\n# ") },
  { id: "heading2", action: (editor) => insertAtCursor(editor, "\n\n## ") },
  { id: "heading3", action: (editor) => insertAtCursor(editor, "\n\n### ") },
  {
    id: "bulletPoint",
    action: (editor) => {
      var _a, _b;
      const cursor = editor.getCursor();
      const lineText = editor.getLine(cursor.line);
      if (/^(\d+)\.\s/.test(lineText)) {
        const num = parseInt((_b = (_a = lineText.match(/^(\d+)/)) == null ? void 0 : _a[1]) != null ? _b : "0", 10);
        insertAtCursor(editor, `
${num + 1}. `);
      } else if (/^\s*- \[[ x]\]\s/.test(lineText)) {
        insertAtCursor(editor, "\n- [ ] ");
      } else {
        insertAtCursor(editor, "\n- ");
      }
    }
  },
  { id: "todoItem", action: (editor) => insertAtCursor(editor, "\n- [ ] ") },
  {
    id: "numberedItem",
    action: (editor) => {
      const cursor = editor.getCursor();
      const lineText = editor.getLine(cursor.line);
      const match = lineText.match(/^(\d+)\.\s/);
      const nextNum = match ? parseInt(match[1], 10) + 1 : 1;
      insertAtCursor(editor, `
${nextNum}. `);
    }
  },
  { id: "deleteLastParagraph", action: (editor) => deleteLastParagraph(editor) },
  { id: "deleteLastLine", action: (editor) => deleteLastSentence(editor) },
  {
    id: "undo",
    action: (editor) => {
      editor.undo();
    }
  },
  {
    id: "stopRecording",
    action: () => {
    }
  },
  {
    // The actual revert runs in the plugin layer (main.ts), triggered by the
    // onCommandExecuted callback — see undoLastCommand() below. The action
    // itself is a no-op so executeCommand()'s before/after diff sees no
    // change and never records THIS command as undoable (undoing an undo
    // is not supported).
    id: "undoLastVoiceCommand",
    action: () => {
    }
  },
  { id: "colon", punctuation: true, action: colonAction },
  // ── Wikilink: just insert [[, Obsidian handles ]] via autocomplete ──
  {
    id: "wikilink",
    action: (editor) => {
      const cursor = editor.getCursor();
      const line = editor.getLine(cursor.line);
      const before = line.substring(0, cursor.ch);
      const needsSpace = before.length > 0 && !/\s$/.test(before);
      const insert = needsSpace ? " [[" : "[[";
      editor.replaceRange(insert, cursor);
      editor.setCursor({ line: cursor.line, ch: cursor.ch + insert.length });
    }
  },
  // ── Open/close commands: voice command opens, voice command closes ──
  {
    id: "boldOpen",
    slot: { prefix: "**", suffix: "**", exitTrigger: "voice" },
    action: (editor) => {
      const cursor = editor.getCursor();
      const line = editor.getLine(cursor.line);
      const before = line.substring(0, cursor.ch);
      const needsSpace = before.length > 0 && !/\s$/.test(before);
      const insert = needsSpace ? " **" : "**";
      editor.replaceRange(insert, cursor);
      const endCh = cursor.ch + insert.length;
      editor.setCursor({ line: cursor.line, ch: endCh });
      activeSlot = {
        def: { prefix: "**", suffix: "**", exitTrigger: "voice" },
        commandId: "boldOpen",
        startPos: { line: cursor.line, ch: endCh }
      };
    }
  },
  {
    id: "boldClose",
    action: (editor) => {
      closeSlotAndSpace(editor, "boldOpen");
    }
  },
  {
    id: "italicOpen",
    slot: { prefix: "*", suffix: "*", exitTrigger: "voice" },
    action: (editor) => {
      const cursor = editor.getCursor();
      const line = editor.getLine(cursor.line);
      const before = line.substring(0, cursor.ch);
      const needsSpace = before.length > 0 && !/\s$/.test(before);
      const insert = needsSpace ? " *" : "*";
      editor.replaceRange(insert, cursor);
      const endCh = cursor.ch + insert.length;
      editor.setCursor({ line: cursor.line, ch: endCh });
      activeSlot = {
        def: { prefix: "*", suffix: "*", exitTrigger: "voice" },
        commandId: "italicOpen",
        startPos: { line: cursor.line, ch: endCh }
      };
    }
  },
  {
    id: "italicClose",
    action: (editor) => {
      closeSlotAndSpace(editor, "italicOpen");
    }
  },
  {
    id: "inlineCodeOpen",
    slot: { prefix: "`", suffix: "`", exitTrigger: "voice" },
    action: (editor) => {
      const cursor = editor.getCursor();
      const line = editor.getLine(cursor.line);
      const before = line.substring(0, cursor.ch);
      const needsSpace = before.length > 0 && !/\s$/.test(before);
      const insert = needsSpace ? " `" : "`";
      editor.replaceRange(insert, cursor);
      const endCh = cursor.ch + insert.length;
      editor.setCursor({ line: cursor.line, ch: endCh });
      activeSlot = {
        def: { prefix: "`", suffix: "`", exitTrigger: "voice" },
        commandId: "inlineCodeOpen",
        startPos: { line: cursor.line, ch: endCh }
      };
    }
  },
  {
    id: "inlineCodeClose",
    action: (editor) => {
      closeSlotAndSpace(editor, "inlineCodeOpen");
    }
  },
  {
    id: "tagOpen",
    slot: { prefix: "#", suffix: "", exitTrigger: "voice" },
    action: (editor) => {
      const cursor = editor.getCursor();
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
      const endCh = cursor.ch + prefix.length;
      editor.setCursor({ line: cursor.line, ch: endCh });
      activeSlot = {
        def: { prefix: "#", suffix: "", exitTrigger: "voice" },
        commandId: "tagOpen",
        startPos: { line: cursor.line, ch: endCh }
      };
    }
  },
  {
    id: "tagClose",
    action: (editor) => {
      closeSlotAndSpace(editor, "tagOpen");
    }
  },
  {
    id: "codeBlockOpen",
    slot: { prefix: "```", suffix: "\n```", exitTrigger: "voice" },
    action: (editor) => {
      const cursor = editor.getCursor();
      editor.replaceRange("\n```\n", cursor);
      const endLine = cursor.line + 2;
      editor.setCursor({ line: endLine, ch: 0 });
      activeSlot = {
        def: { prefix: "```", suffix: "\n```", exitTrigger: "voice" },
        commandId: "codeBlockOpen",
        startPos: { line: endLine, ch: 0 }
      };
    }
  },
  {
    id: "codeBlockClose",
    action: (editor) => {
      closeSlotAndSpace(editor, "codeBlockOpen");
    }
  }
];
function computeEditDiff(before, after) {
  if (before === after) return null;
  const maxCommon = Math.min(before.length, after.length);
  let start = 0;
  while (start < maxCommon && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  return {
    from: start,
    removed: before.slice(start, endBefore),
    inserted: after.slice(start, endAfter)
  };
}
var NON_UNDOABLE_COMMANDS = /* @__PURE__ */ new Set([
  "undo",
  "undoLastVoiceCommand",
  "stopRecording"
]);
var pendingUndo = null;
function executeCommand(editor, command) {
  const before = editor.getValue();
  const cursorBeforeOffset = editor.posToOffset(editor.getCursor());
  const slotBefore = activeSlot;
  command.action(editor);
  if (NON_UNDOABLE_COMMANDS.has(command.id)) return;
  const after = editor.getValue();
  const diff = computeEditDiff(before, after);
  if (!diff) return;
  pendingUndo = {
    commandId: command.id,
    snapshotAfter: after,
    revert: (ed) => {
      const from = ed.offsetToPos(diff.from);
      const to = ed.offsetToPos(diff.from + diff.inserted.length);
      ed.replaceRange(diff.removed, from, to);
      ed.setCursor(ed.offsetToPos(cursorBeforeOffset));
      activeSlot = slotBefore;
    }
  };
}
function undoLastCommand(editor) {
  if (!pendingUndo) return "none";
  const pending = pendingUndo;
  pendingUndo = null;
  if (editor.getValue() !== pending.snapshotAfter) return "stale";
  pending.revert(editor);
  return "reverted";
}
function resetCommandUndo() {
  pendingUndo = null;
}
var customCommandDefs = [];
function loadCustomCommands(commands) {
  customCommandLabelSources.clear();
  customCommandDefs = commands.map((cmd) => {
    var _a, _b, _c;
    if (cmd.type === "slot" && cmd.slotPrefix !== void 0) {
      const prefix = cmd.slotPrefix;
      const suffix = (_a = cmd.slotSuffix) != null ? _a : "";
      const exit = (_b = cmd.slotExit) != null ? _b : "enter";
      customCommandLabelSources.set(cmd.id, {
        labels: cmd.labels,
        fallback: `${prefix}\u2026${suffix}`
      });
      return {
        id: cmd.id,
        slot: { prefix, suffix, exitTrigger: exit },
        action: (editor) => {
          const cursor = editor.getCursor();
          editor.replaceRange(prefix, cursor);
          editor.setCursor({ line: cursor.line, ch: cursor.ch + prefix.length });
          activeSlot = {
            def: { prefix, suffix, exitTrigger: exit },
            commandId: cmd.id,
            startPos: { line: cursor.line, ch: cursor.ch + prefix.length }
          };
        }
      };
    }
    const fallbackLabel = ((_c = cmd.insertText) != null ? _c : "").replace(/\n/g, "\u21B5").slice(0, 30);
    customCommandLabelSources.set(cmd.id, {
      labels: cmd.labels,
      fallback: fallbackLabel || cmd.id
    });
    return {
      id: cmd.id,
      action: (editor) => insertAtCursor(editor, resolveInsertText(cmd))
    };
  });
}
function resolveInsertText(cmd) {
  var _a, _b, _c, _d, _e;
  return (_e = (_d = (_c = (_a = cmd.insertTextByLang) == null ? void 0 : _a[activeLang]) != null ? _c : (_b = cmd.insertTextByLang) == null ? void 0 : _b.en) != null ? _d : cmd.insertText) != null ? _e : "";
}
function getAllCommands() {
  return [...COMMAND_DEFS, ...customCommandDefs];
}
function getCustomPatterns(cmdId, lang) {
  var _a, _b, _c, _d;
  return (_d = (_c = (_a = customCommandTriggers.get(cmdId)) == null ? void 0 : _a.get(lang)) != null ? _c : (_b = customCommandTriggers.get(cmdId)) == null ? void 0 : _b.get("en")) != null ? _d : [];
}
var customCommandTriggers = /* @__PURE__ */ new Map();
var customCommandLabelSources = /* @__PURE__ */ new Map();
function getCustomLabel(cmdId) {
  var _a, _b, _c, _d;
  const src = customCommandLabelSources.get(cmdId);
  if (!src) return cmdId;
  return (_d = (_c = (_a = src.labels) == null ? void 0 : _a[activeLang]) != null ? _c : (_b = src.labels) == null ? void 0 : _b.en) != null ? _d : src.fallback;
}
function loadCustomCommandTriggers(commands) {
  customCommandTriggers.clear();
  for (const cmd of commands) {
    const langMap = /* @__PURE__ */ new Map();
    for (const [lang, phrases] of Object.entries(cmd.triggers)) {
      langMap.set(lang, phrases);
    }
    customCommandTriggers.set(cmd.id, langMap);
  }
}
function getPatternsForAnyCommand(cmdId, lang) {
  const builtinPatterns = getPatternsForCommand(cmdId, lang);
  if (builtinPatterns.length > 0) return builtinPatterns;
  return getCustomPatterns(cmdId, lang);
}
function getAllCommandPhrases() {
  const phrases = [];
  for (const cmd of getAllCommands()) {
    for (const pattern of getPatternsForAnyCommand(cmd.id, activeLang)) {
      phrases.push(normalizeCommand(pattern));
    }
  }
  return phrases;
}
function trailingWords(text, n) {
  const words = text.trimEnd().split(/\s+/);
  return words.slice(-n).join(" ");
}
function matchCommand(rawText) {
  var _a;
  const normalized = fixMishearings(normalizeCommand(rawText));
  const allCmds = getAllCommands();
  for (const cmd of allCmds) {
    const patterns = getPatternsForAnyCommand(cmd.id, activeLang);
    for (const pattern of patterns) {
      const normPattern = normalizeCommand(pattern);
      if (normalized.endsWith(normPattern)) {
        const patternWordCount = pattern.split(/\s+/).length;
        const rawWords = rawText.trimEnd().split(/\s+/);
        const textBefore = rawWords.slice(0, -patternWordCount).join(" ").trimEnd();
        return { command: cmd, textBefore };
      }
    }
  }
  const strippedFillers = stripTrailingFillers(normalized, activeLang);
  if (strippedFillers !== normalized) {
    for (const cmd of allCmds) {
      const patterns = getPatternsForAnyCommand(cmd.id, activeLang);
      for (const pattern of patterns) {
        const normPattern = normalizeCommand(pattern);
        if (strippedFillers.endsWith(normPattern)) {
          const patternWordCount = pattern.split(/\s+/).length;
          const rawWords = rawText.trimEnd().split(/\s+/);
          const fillerWordCount = normalized.split(/\s+/).length - strippedFillers.split(/\s+/).length;
          const textBefore = rawWords.slice(0, -(patternWordCount + fillerWordCount)).join(" ").trimEnd();
          return { command: cmd, textBefore };
        }
      }
    }
  }
  for (const cmd of allCmds) {
    const patterns = getPatternsForAnyCommand(cmd.id, activeLang);
    for (const pattern of patterns) {
      const normPattern = normalizeCommand(pattern);
      const patternWordCount = normPattern.split(/\s+/).length;
      const tail = trailingWords(normalized, patternWordCount + 1);
      const stripped = stripArticles(tail, activeLang);
      if (stripped === normPattern) {
        const tailWordCount = tail.split(/\s+/).length;
        const rawWords = rawText.trimEnd().split(/\s+/);
        const textBefore = rawWords.slice(0, -tailWordCount).join(" ").trimEnd();
        return { command: cmd, textBefore };
      }
    }
  }
  const phoneticText = phoneticNormalize(normalized, activeLang);
  for (const cmd of allCmds) {
    const patterns = getPatternsForAnyCommand(cmd.id, activeLang);
    for (const pattern of patterns) {
      const phoneticPattern = phoneticNormalize(normalizeCommand(pattern), activeLang);
      if (phoneticPattern !== normalizeCommand(pattern) || phoneticText !== normalized) {
        if (phoneticText.endsWith(phoneticPattern)) {
          const patternWordCount = pattern.split(/\s+/).length;
          const rawWords = rawText.trimEnd().split(/\s+/);
          const textBefore = rawWords.slice(0, -patternWordCount).join(" ").trimEnd();
          return { command: cmd, textBefore };
        }
      }
    }
  }
  const lastWord = (_a = normalized.split(/\s+/).pop()) != null ? _a : "";
  if (lastWord.length >= 4 && !lastWord.includes(" ")) {
    const allPhrases = getAllCommandPhrases();
    const split = trySplitCompound(lastWord, allPhrases);
    if (split !== lastWord) {
      const words = normalized.split(/\s+/);
      words[words.length - 1] = split;
      const resplit = words.join(" ");
      for (const cmd of allCmds) {
        const patterns = getPatternsForAnyCommand(cmd.id, activeLang);
        for (const pattern of patterns) {
          const normPattern = normalizeCommand(pattern);
          if (resplit.endsWith(normPattern)) {
            const rawWords = rawText.trimEnd().split(/\s+/);
            const textBefore = rawWords.slice(0, -1).join(" ").trimEnd();
            return { command: cmd, textBefore };
          }
        }
      }
    }
  }
  let bestMatch = null;
  let bestDist = 3;
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
var preMatchHook = null;
function setPreMatchHook(hook) {
  preMatchHook = hook;
}
function processText(editor, text, posOverride, onCommand) {
  let stopRequested = false;
  const segments = text.match(/[^.!?]+[.!?]+\s*/g);
  if (!segments) {
    stopRequested = processSegment(editor, text, posOverride, onCommand);
    return stopRequested;
  }
  const joined = segments.join("");
  const remainder = text.slice(joined.length);
  let first = true;
  for (const segment of segments) {
    if (processSegment(editor, segment, first ? posOverride : void 0, onCommand)) {
      stopRequested = true;
    }
    first = false;
  }
  if (remainder.trim()) {
    if (processSegment(editor, remainder, first ? posOverride : void 0, onCommand)) {
      stopRequested = true;
    }
  }
  return stopRequested;
}
function processSegment(editor, text, posOverride, onCommand) {
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
      insertAtCursor(editor, before, posOverride);
    }
    executeCommand(editor, match.command);
    onCommand == null ? void 0 : onCommand(match.command.id);
    return match.command.id === "stopRecording";
  } else {
    insertAtCursor(editor, text, posOverride);
  }
  return false;
}
var OPEN_CLOSE_PAIRS = [
  ["boldOpen", "boldClose"],
  ["italicOpen", "italicClose"],
  ["inlineCodeOpen", "inlineCodeClose"],
  ["tagOpen", "tagClose"],
  ["codeBlockOpen", "codeBlockClose"]
];
function getCommandList() {
  const closeIds = new Set(OPEN_CLOSE_PAIRS.map(([, c]) => c));
  const openMap = new Map(OPEN_CLOSE_PAIRS);
  const builtIn = [];
  for (const c of COMMAND_DEFS) {
    if (closeIds.has(c.id)) continue;
    const closeId = openMap.get(c.id);
    if (closeId) {
      const openPatterns = getPatternsForCommand(c.id, activeLang);
      const closePatterns = getPatternsForCommand(closeId, activeLang);
      builtIn.push({
        label: getLabel(c.id, activeLang) + " / " + getLabel(closeId, activeLang),
        patterns: [...openPatterns.slice(0, 1), ...closePatterns.slice(0, 1)]
      });
    } else {
      builtIn.push({
        label: getLabel(c.id, activeLang),
        patterns: getPatternsForCommand(c.id, activeLang)
      });
    }
  }
  const custom = customCommandDefs.map((c) => ({
    label: getCustomLabel(c.id),
    patterns: getPatternsForAnyCommand(c.id, activeLang)
  }));
  return [...builtIn, ...custom];
}

// src/help-view.ts
var VIEW_TYPE_VOXTRAL_HELP = "voxtral-help";
var UI_STRINGS = {
  nl: {
    title: "Voxtral Stemcommando's",
    command: "Commando",
    say: "Zeg...",
    tips: "Tips",
    tipItems: [
      "Commando's worden herkend aan het einde van een zin.",
      'Zeg "voor de correctie: ..." om instructies aan de corrector te geven.',
      "Gespelde woorden (V-O-X-T-R-A-L) worden automatisch samengevoegd.",
      'Zelfcorrecties ("nee niet X maar Y") worden herkend.'
    ],
    privacy: "Privacy",
    privacyItems: [
      "Audio wordt via HTTPS/WSS naar de Mistral API gestuurd en niet lokaal opgeslagen.",
      "Instellingen (incl. API-sleutel) staan in data.json in de Obsidian plugin-map.",
      "Logexport bevat geen getranscribeerde tekst of API-sleutels."
    ]
  },
  en: {
    title: "Voxtral Voice Commands",
    command: "Command",
    say: "Say...",
    tips: "Tips",
    tipItems: [
      "Commands are recognized at the end of a sentence.",
      'Say "for the correction: ..." to give inline instructions to the corrector.',
      "Spelled-out words (V-O-X-T-R-A-L) are merged automatically.",
      'Self-corrections ("no not X but Y") are recognized.'
    ],
    privacy: "Privacy",
    privacyItems: [
      "Audio is sent to the Mistral API over HTTPS/WSS and is not stored locally.",
      "Settings (including your API key) are stored in data.json in the plugin folder.",
      "Log export does not contain transcribed text or API keys."
    ]
  },
  fr: {
    title: "Commandes vocales Voxtral",
    command: "Commande",
    say: "Dites...",
    tips: "Conseils",
    tipItems: [
      "Les commandes sont reconnues \xE0 la fin d'une phrase.",
      'Dites "pour la correction : ..." pour donner des instructions au correcteur.',
      "Les mots \xE9pel\xE9s (V-O-X-T-R-A-L) sont fusionn\xE9s automatiquement.",
      'Les auto-corrections ("non pas X mais Y") sont reconnues.'
    ],
    privacy: "Confidentialit\xE9",
    privacyItems: [
      "L'audio est envoy\xE9 \xE0 l'API Mistral via HTTPS/WSS et n'est pas stock\xE9 localement.",
      "Les param\xE8tres (y compris la cl\xE9 API) sont stock\xE9s dans data.json.",
      "L'export des logs ne contient ni texte transcrit ni cl\xE9s API."
    ]
  },
  de: {
    title: "Voxtral Sprachbefehle",
    command: "Befehl",
    say: "Sagen Sie...",
    tips: "Tipps",
    tipItems: [
      "Befehle werden am Ende eines Satzes erkannt.",
      'Sagen Sie "f\xFCr die Korrektur: ..." um dem Korrektor Anweisungen zu geben.',
      "Buchstabierte W\xF6rter (V-O-X-T-R-A-L) werden automatisch zusammengef\xFChrt.",
      'Selbstkorrekturen ("nein nicht X sondern Y") werden erkannt.'
    ],
    privacy: "Datenschutz",
    privacyItems: [
      "Audio wird \xFCber HTTPS/WSS an die Mistral-API gesendet und nicht lokal gespeichert.",
      "Einstellungen (inkl. API-Schl\xFCssel) werden in data.json gespeichert.",
      "Der Log-Export enth\xE4lt weder transkribierten Text noch API-Schl\xFCssel."
    ]
  },
  es: {
    title: "Comandos de voz Voxtral",
    command: "Comando",
    say: "Diga...",
    tips: "Consejos",
    tipItems: [
      "Los comandos se reconocen al final de una oraci\xF3n.",
      'Diga "para la correcci\xF3n: ..." para dar instrucciones al corrector.',
      "Las palabras deletreadas (V-O-X-T-R-A-L) se fusionan autom\xE1ticamente.",
      'Las autocorrecciones ("no, no X sino Y") se reconocen.'
    ],
    privacy: "Privacidad",
    privacyItems: [
      "El audio se env\xEDa a la API de Mistral por HTTPS/WSS y no se almacena localmente.",
      "La configuraci\xF3n (incluida la clave API) se almacena en data.json.",
      "La exportaci\xF3n de registros no contiene texto transcrito ni claves API."
    ]
  },
  pt: {
    title: "Comandos de voz Voxtral",
    command: "Comando",
    say: "Diga...",
    tips: "Dicas",
    tipItems: [
      "Os comandos s\xE3o reconhecidos no final de uma frase.",
      'Diga "para a corre\xE7\xE3o: ..." para dar instru\xE7\xF5es ao corretor.',
      "Palavras soletradas (V-O-X-T-R-A-L) s\xE3o mescladas automaticamente.",
      'Autocorre\xE7\xF5es ("n\xE3o, n\xE3o X mas Y") s\xE3o reconhecidas.'
    ],
    privacy: "Privacidade",
    privacyItems: [
      "O \xE1udio \xE9 enviado \xE0 API Mistral via HTTPS/WSS e n\xE3o \xE9 armazenado localmente.",
      "As configura\xE7\xF5es (incluindo a chave API) s\xE3o armazenadas em data.json.",
      "A exporta\xE7\xE3o de logs n\xE3o cont\xE9m texto transcrito nem chaves API."
    ]
  },
  it: {
    title: "Comandi vocali Voxtral",
    command: "Comando",
    say: "D\xEC...",
    tips: "Suggerimenti",
    tipItems: [
      "I comandi vengono riconosciuti alla fine di una frase.",
      'D\xEC "per la correzione: ..." per dare istruzioni al correttore.',
      "Le parole compitate (V-O-X-T-R-A-L) vengono unite automaticamente.",
      'Le autocorrezioni ("no non X ma Y") vengono riconosciute.'
    ],
    privacy: "Privacy",
    privacyItems: [
      "L'audio viene inviato all'API Mistral tramite HTTPS/WSS e non viene salvato localmente.",
      "Le impostazioni (inclusa la chiave API) sono memorizzate in data.json.",
      "L'esportazione dei log non contiene testo trascritto n\xE9 chiavi API."
    ]
  },
  ru: {
    title: "\u0413\u043E\u043B\u043E\u0441\u043E\u0432\u044B\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u044B Voxtral",
    command: "\u041A\u043E\u043C\u0430\u043D\u0434\u0430",
    say: "\u0421\u043A\u0430\u0436\u0438\u0442\u0435...",
    tips: "\u0421\u043E\u0432\u0435\u0442\u044B",
    tipItems: [
      "\u041A\u043E\u043C\u0430\u043D\u0434\u044B \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u044E\u0442\u0441\u044F \u0432 \u043A\u043E\u043D\u0446\u0435 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F.",
      "\u0421\u043A\u0430\u0436\u0438\u0442\u0435 \xAB\u0434\u043B\u044F \u043A\u043E\u0440\u0440\u0435\u043A\u0446\u0438\u0438: ...\xBB, \u0447\u0442\u043E\u0431\u044B \u0434\u0430\u0442\u044C \u0443\u043A\u0430\u0437\u0430\u043D\u0438\u044F \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043E\u0440\u0443.",
      "\u0421\u043B\u043E\u0432\u0430, \u043F\u0440\u043E\u0438\u0437\u043D\u0435\u0441\u0451\u043D\u043D\u044B\u0435 \u043F\u043E \u0431\u0443\u043A\u0432\u0430\u043C (V-O-X-T-R-A-L), \u043E\u0431\u044A\u0435\u0434\u0438\u043D\u044F\u044E\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438.",
      "\u0421\u0430\u043C\u043E\u0438\u0441\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F (\xAB\u043D\u0435\u0442, \u043D\u0435 X, \u0430 Y\xBB) \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u044E\u0442\u0441\u044F."
    ],
    privacy: "\u041A\u043E\u043D\u0444\u0438\u0434\u0435\u043D\u0446\u0438\u0430\u043B\u044C\u043D\u043E\u0441\u0442\u044C",
    privacyItems: [
      "\u0410\u0443\u0434\u0438\u043E \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0432 API Mistral \u043F\u043E HTTPS/WSS \u0438 \u043D\u0435 \u0445\u0440\u0430\u043D\u0438\u0442\u0441\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E.",
      "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 (\u0432\u043A\u043B\u044E\u0447\u0430\u044F \u043A\u043B\u044E\u0447 API) \u0445\u0440\u0430\u043D\u044F\u0442\u0441\u044F \u0432 \u0444\u0430\u0439\u043B\u0435 data.json \u0432 \u043F\u0430\u043F\u043A\u0435 \u043F\u043B\u0430\u0433\u0438\u043D\u0430.",
      "\u042D\u043A\u0441\u043F\u043E\u0440\u0442 \u0436\u0443\u0440\u043D\u0430\u043B\u043E\u0432 \u043D\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u0440\u0430\u0441\u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u043D\u043E\u0433\u043E \u0442\u0435\u043A\u0441\u0442\u0430 \u0438\u043B\u0438 \u043A\u043B\u044E\u0447\u0435\u0439 API."
    ]
  },
  zh: {
    title: "Voxtral \u8BED\u97F3\u547D\u4EE4",
    command: "\u547D\u4EE4",
    say: "\u8BF4\u2026\u2026",
    tips: "\u63D0\u793A",
    tipItems: [
      "\u547D\u4EE4\u5728\u53E5\u5B50\u7ED3\u5C3E\u5904\u88AB\u8BC6\u522B\u3002",
      "\u8BF4\u201C\u7528\u4E8E\u66F4\u6B63\uFF1A\u2026\u2026\u201D\u53EF\u5411\u6821\u6B63\u5668\u63D0\u4F9B\u5185\u8054\u6307\u4EE4\u3002",
      "\u9010\u5B57\u6BCD\u62FC\u51FA\u7684\u5355\u8BCD\uFF08V-O-X-T-R-A-L\uFF09\u4F1A\u81EA\u52A8\u5408\u5E76\u3002",
      "\u81EA\u6211\u66F4\u6B63\uFF08\u201C\u4E0D\uFF0C\u4E0D\u662F X \u800C\u662F Y\u201D\uFF09\u4F1A\u88AB\u8BC6\u522B\u3002"
    ],
    privacy: "\u9690\u79C1",
    privacyItems: [
      "\u97F3\u9891\u901A\u8FC7 HTTPS/WSS \u53D1\u9001\u5230 Mistral API\uFF0C\u4E0D\u4F1A\u5728\u672C\u5730\u5B58\u50A8\u3002",
      "\u8BBE\u7F6E\uFF08\u5305\u62EC API \u5BC6\u94A5\uFF09\u5B58\u50A8\u5728\u63D2\u4EF6\u6587\u4EF6\u5939\u7684 data.json \u4E2D\u3002",
      "\u65E5\u5FD7\u5BFC\u51FA\u4E0D\u5305\u542B\u8F6C\u5F55\u6587\u672C\u6216 API \u5BC6\u94A5\u3002"
    ]
  },
  hi: {
    title: "Voxtral \u0935\u0949\u0907\u0938 \u0915\u092E\u093E\u0902\u0921",
    command: "\u0915\u092E\u093E\u0902\u0921",
    say: "\u0915\u0939\u0947\u0902...",
    tips: "\u0938\u0941\u091D\u093E\u0935",
    tipItems: [
      "\u0915\u092E\u093E\u0902\u0921 \u0935\u093E\u0915\u094D\u092F \u0915\u0947 \u0905\u0902\u0924 \u092E\u0947\u0902 \u092A\u0939\u091A\u093E\u0928\u0947 \u091C\u093E\u0924\u0947 \u0939\u0948\u0902\u0964",
      "\u0915\u0930\u0947\u0915\u094D\u091F\u0930 \u0915\u094B \u0928\u093F\u0930\u094D\u0926\u0947\u0936 \u0926\u0947\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F '\u0938\u0941\u0927\u093E\u0930 \u0915\u0947 \u0932\u093F\u090F: ...' \u0915\u0939\u0947\u0902\u0964",
      "\u0935\u0930\u094D\u0924\u0928\u0940 \u092E\u0947\u0902 \u092C\u094B\u0932\u0947 \u0917\u090F \u0936\u092C\u094D\u0926 (V-O-X-T-R-A-L) \u0938\u094D\u0935\u0924\u0903 \u091C\u0941\u0921\u093C \u091C\u093E\u0924\u0947 \u0939\u0948\u0902\u0964",
      "\u0938\u094D\u0935-\u0938\u0941\u0927\u093E\u0930 ('\u0928\u0939\u0940\u0902, X \u0928\u0939\u0940\u0902 \u092C\u0932\u094D\u0915\u093F Y') \u092A\u0939\u091A\u093E\u0928\u0947 \u091C\u093E\u0924\u0947 \u0939\u0948\u0902\u0964"
    ],
    privacy: "\u0917\u094B\u092A\u0928\u0940\u092F\u0924\u093E",
    privacyItems: [
      "\u0911\u0921\u093F\u092F\u094B HTTPS/WSS \u0915\u0947 \u092E\u093E\u0927\u094D\u092F\u092E \u0938\u0947 Mistral API \u0915\u094B \u092D\u0947\u091C\u093E \u091C\u093E\u0924\u093E \u0939\u0948 \u0914\u0930 \u0938\u094D\u0925\u093E\u0928\u0940\u092F \u0930\u0942\u092A \u0938\u0947 \u0938\u0902\u0917\u094D\u0930\u0939\u0940\u0924 \u0928\u0939\u0940\u0902 \u0939\u094B\u0924\u093E\u0964",
      "\u0938\u0947\u091F\u093F\u0902\u0917\u094D\u0938 (API \u0915\u0941\u0902\u091C\u0940 \u0938\u0939\u093F\u0924) \u092A\u094D\u0932\u0917\u0907\u0928 \u092B\u093C\u094B\u0932\u094D\u0921\u0930 \u0915\u0940 data.json \u092E\u0947\u0902 \u0938\u0902\u0917\u094D\u0930\u0939\u0940\u0924 \u0939\u094B\u0924\u0940 \u0939\u0948\u0902\u0964",
      "\u0932\u0949\u0917 \u0928\u093F\u0930\u094D\u092F\u093E\u0924 \u092E\u0947\u0902 \u091F\u094D\u0930\u093E\u0902\u0938\u0915\u094D\u0930\u093E\u0907\u092C \u0915\u093F\u092F\u093E \u0917\u092F\u093E \u091F\u0947\u0915\u094D\u0938\u094D\u091F \u092F\u093E API \u0915\u0941\u0902\u091C\u093F\u092F\u093E\u0901 \u0928\u0939\u0940\u0902 \u0939\u094B\u0924\u0940\u0902\u0964"
    ]
  },
  ar: {
    title: "\u0623\u0648\u0627\u0645\u0631 Voxtral \u0627\u0644\u0635\u0648\u062A\u064A\u0629",
    command: "\u0627\u0644\u0623\u0645\u0631",
    say: "\u0642\u0644...",
    tips: "\u0646\u0635\u0627\u0626\u062D",
    tipItems: [
      "\u064A\u062A\u0645 \u0627\u0644\u062A\u0639\u0631\u0651\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0648\u0627\u0645\u0631 \u0641\u064A \u0646\u0647\u0627\u064A\u0629 \u0627\u0644\u062C\u0645\u0644\u0629.",
      "\u0642\u0644 \xAB\u0644\u0644\u062A\u0635\u062D\u064A\u062D: ...\xBB \u0644\u0625\u0639\u0637\u0627\u0621 \u062A\u0639\u0644\u064A\u0645\u0627\u062A \u0645\u0628\u0627\u0634\u0631\u0629 \u0644\u0644\u0645\u0635\u062D\u0651\u062D.",
      "\u062A\u064F\u062F\u0645\u062C \u0627\u0644\u0643\u0644\u0645\u0627\u062A \u0627\u0644\u0645\u062A\u0647\u062C\u0651\u0627\u0629 (V-O-X-T-R-A-L) \u062A\u0644\u0642\u0627\u0626\u064A\u064B\u0627.",
      "\u062A\u064F\u0645\u064A\u064E\u0651\u0632 \u0627\u0644\u062A\u0635\u062D\u064A\u062D\u0627\u062A \u0627\u0644\u0630\u0627\u062A\u064A\u0629 (\xAB\u0644\u0627\u060C \u0644\u064A\u0633 X \u0628\u0644 Y\xBB)."
    ],
    privacy: "\u0627\u0644\u062E\u0635\u0648\u0635\u064A\u0629",
    privacyItems: [
      "\u064A\u064F\u0631\u0633\u064E\u0644 \u0627\u0644\u0635\u0648\u062A \u0625\u0644\u0649 \u0648\u0627\u062C\u0647\u0629 Mistral \u0639\u0628\u0631 HTTPS/WSS \u0648\u0644\u0627 \u064A\u064F\u062E\u0632\u064E\u0651\u0646 \u0645\u062D\u0644\u064A\u064B\u0627.",
      "\u062A\u064F\u062E\u0632\u064E\u0651\u0646 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A (\u0628\u0645\u0627 \u0641\u064A \u0630\u0644\u0643 \u0645\u0641\u062A\u0627\u062D API) \u0641\u064A \u0645\u0644\u0641 data.json \u062F\u0627\u062E\u0644 \u0645\u062C\u0644\u062F \u0627\u0644\u0625\u0636\u0627\u0641\u0629.",
      "\u0644\u0627 \u064A\u062D\u062A\u0648\u064A \u062A\u0635\u062F\u064A\u0631 \u0627\u0644\u0633\u062C\u0644\u0651\u0627\u062A \u0639\u0644\u0649 \u0646\u0635 \u0645\u064F\u0641\u0631\u064E\u0651\u063A \u0623\u0648 \u0645\u0641\u0627\u062A\u064A\u062D API."
    ]
  },
  ja: {
    title: "Voxtral \u97F3\u58F0\u30B3\u30DE\u30F3\u30C9",
    command: "\u30B3\u30DE\u30F3\u30C9",
    say: "\u8A00\u3044\u65B9",
    tips: "\u30D2\u30F3\u30C8",
    tipItems: [
      "\u30B3\u30DE\u30F3\u30C9\u306F\u6587\u306E\u7D42\u308F\u308A\u3067\u8A8D\u8B58\u3055\u308C\u307E\u3059\u3002",
      "\u300C\u4FEE\u6B63\u306E\u305F\u3081\u306B: \u2026\u300D\u3068\u8A00\u3046\u3068\u3001\u6821\u6B63\u62C5\u5F53\u306B\u6307\u793A\u3092\u51FA\u305B\u307E\u3059\u3002",
      "\u4E00\u6587\u5B57\u305A\u3064\u7DB4\u3063\u305F\u5358\u8A9E\uFF08V-O-X-T-R-A-L\uFF09\u306F\u81EA\u52D5\u7684\u306B\u7D50\u5408\u3055\u308C\u307E\u3059\u3002",
      "\u81EA\u5DF1\u4FEE\u6B63\uFF08\u300C\u3044\u3044\u3048\u3001X\u3067\u306F\u306A\u304FY\u300D\uFF09\u306F\u8A8D\u8B58\u3055\u308C\u307E\u3059\u3002"
    ],
    privacy: "\u30D7\u30E9\u30A4\u30D0\u30B7\u30FC",
    privacyItems: [
      "\u97F3\u58F0\u306F HTTPS/WSS \u3067 Mistral API \u306B\u9001\u4FE1\u3055\u308C\u3001\u30ED\u30FC\u30AB\u30EB\u306B\u306F\u4FDD\u5B58\u3055\u308C\u307E\u305B\u3093\u3002",
      "\u8A2D\u5B9A\uFF08API \u30AD\u30FC\u3092\u542B\u3080\uFF09\u306F\u30D7\u30E9\u30B0\u30A4\u30F3\u30D5\u30A9\u30EB\u30C0\u30FC\u306E data.json \u306B\u4FDD\u5B58\u3055\u308C\u307E\u3059\u3002",
      "\u30ED\u30B0\u306E\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u306B\u306F\u6587\u5B57\u8D77\u3053\u3057\u30C6\u30AD\u30B9\u30C8\u3084 API \u30AD\u30FC\u306F\u542B\u307E\u308C\u307E\u305B\u3093\u3002"
    ]
  },
  ko: {
    title: "Voxtral \uC74C\uC131 \uBA85\uB839",
    command: "\uBA85\uB839",
    say: "\uB9D0\uD558\uAE30...",
    tips: "\uD301",
    tipItems: [
      "\uBA85\uB839\uC740 \uBB38\uC7A5 \uB05D\uC5D0\uC11C \uC778\uC2DD\uB429\uB2C8\uB2E4.",
      "\uAD50\uC815\uAE30\uC5D0 \uC9C0\uC2DC\uD558\uB824\uBA74 '\uAD50\uC815\uC744 \uC704\uD574: ...'\uB77C\uACE0 \uB9D0\uD558\uC138\uC694.",
      "\uCCA0\uC790\uB85C \uB9D0\uD55C \uB2E8\uC5B4(V-O-X-T-R-A-L)\uB294 \uC790\uB3D9\uC73C\uB85C \uD569\uCCD0\uC9D1\uB2C8\uB2E4.",
      "\uC790\uAE30 \uC218\uC815('\uC544\uB2C8, X\uAC00 \uC544\uB2C8\uB77C Y')\uC774 \uC778\uC2DD\uB429\uB2C8\uB2E4."
    ],
    privacy: "\uAC1C\uC778\uC815\uBCF4 \uBCF4\uD638",
    privacyItems: [
      "\uC624\uB514\uC624\uB294 HTTPS/WSS\uB97C \uD1B5\uD574 Mistral API\uB85C \uC804\uC1A1\uB418\uBA70 \uB85C\uCEEC\uC5D0 \uC800\uC7A5\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
      "\uC124\uC815(API \uD0A4 \uD3EC\uD568)\uC740 \uD50C\uB7EC\uADF8\uC778 \uD3F4\uB354\uC758 data.json\uC5D0 \uC800\uC7A5\uB429\uB2C8\uB2E4.",
      "\uB85C\uADF8 \uB0B4\uBCF4\uB0B4\uAE30\uC5D0\uB294 \uC804\uC0AC\uB41C \uD14D\uC2A4\uD2B8\uB098 API \uD0A4\uAC00 \uD3EC\uD568\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4."
    ]
  }
};
function getStrings(lang) {
  var _a;
  return (_a = UI_STRINGS[lang]) != null ? _a : UI_STRINGS.en;
}
var AUTO_OPEN_STRINGS = {
  en: { heading: "Help panel in the way?", label: "Don't open it automatically when recording starts", helper: "You can turn it back on in settings." },
  nl: { heading: "Hulppaneel in de weg?", label: "Niet automatisch openen bij het starten van een opname", helper: "Je kunt dit altijd weer aanzetten in de instellingen." },
  fr: { heading: "Le panneau d'aide vous g\xEAne ?", label: "Ne pas l'ouvrir automatiquement au d\xE9marrage de l'enregistrement", helper: "Vous pouvez le r\xE9activer dans les param\xE8tres." },
  de: { heading: "Hilfe-Panel im Weg?", label: "Beim Start einer Aufnahme nicht automatisch \xF6ffnen", helper: "Du kannst es in den Einstellungen wieder aktivieren." },
  es: { heading: "\xBFEl panel de ayuda te estorba?", label: "No abrirlo autom\xE1ticamente al iniciar la grabaci\xF3n", helper: "Puedes volver a activarlo en los ajustes." },
  pt: { heading: "O painel de ajuda atrapalha?", label: "N\xE3o abrir automaticamente ao iniciar a grava\xE7\xE3o", helper: "Voc\xEA pode reativ\xE1-lo nas configura\xE7\xF5es." },
  it: { heading: "Il pannello di aiuto \xE8 d'intralcio?", label: "Non aprirlo automaticamente all'avvio della registrazione", helper: "Puoi riattivarlo nelle impostazioni." },
  ru: { heading: "\u041F\u0430\u043D\u0435\u043B\u044C \u043F\u043E\u043C\u043E\u0449\u0438 \u043C\u0435\u0448\u0430\u0435\u0442?", label: "\u041D\u0435 \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u0442\u044C \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043F\u0440\u0438 \u043D\u0430\u0447\u0430\u043B\u0435 \u0437\u0430\u043F\u0438\u0441\u0438", helper: "\u0412\u044B \u043C\u043E\u0436\u0435\u0442\u0435 \u0441\u043D\u043E\u0432\u0430 \u0432\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u044D\u0442\u043E \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445." },
  zh: { heading: "\u5E2E\u52A9\u9762\u677F\u6321\u8DEF\u4E86\uFF1F", label: "\u5F55\u97F3\u5F00\u59CB\u65F6\u4E0D\u81EA\u52A8\u6253\u5F00", helper: "\u60A8\u53EF\u4EE5\u5728\u8BBE\u7F6E\u4E2D\u91CD\u65B0\u5F00\u542F\u3002" },
  hi: { heading: "\u0915\u094D\u092F\u093E \u0938\u0939\u093E\u092F\u0924\u093E \u092A\u0948\u0928\u0932 \u092C\u0940\u091A \u092E\u0947\u0902 \u0906 \u0930\u0939\u093E \u0939\u0948?", label: "\u0930\u093F\u0915\u0949\u0930\u094D\u0921\u093F\u0902\u0917 \u0936\u0941\u0930\u0942 \u0939\u094B\u0928\u0947 \u092A\u0930 \u0938\u094D\u0935\u0924\u0903 \u0928 \u0916\u094B\u0932\u0947\u0902", helper: "\u0906\u092A \u0907\u0938\u0947 \u0938\u0947\u091F\u093F\u0902\u0917\u094D\u0938 \u092E\u0947\u0902 \u092B\u093F\u0930 \u0938\u0947 \u091A\u093E\u0932\u0942 \u0915\u0930 \u0938\u0915\u0924\u0947 \u0939\u0948\u0902\u0964" },
  ar: { heading: "\u0647\u0644 \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0633\u0627\u0639\u062F\u0629 \u062A\u0639\u062A\u0631\u0636 \u0637\u0631\u064A\u0642\u0643\u061F", label: "\u0639\u062F\u0645 \u0641\u062A\u062D\u0647\u0627 \u062A\u0644\u0642\u0627\u0626\u064A\u064B\u0627 \u0639\u0646\u062F \u0628\u062F\u0621 \u0627\u0644\u062A\u0633\u062C\u064A\u0644", helper: "\u064A\u0645\u0643\u0646\u0643 \u0625\u0639\u0627\u062F\u0629 \u062A\u0641\u0639\u064A\u0644\u0647\u0627 \u0645\u0646 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A." },
  ja: { heading: "\u30D8\u30EB\u30D7\u30D1\u30CD\u30EB\u304C\u90AA\u9B54\u3067\u3059\u304B\uFF1F", label: "\u9332\u97F3\u958B\u59CB\u6642\u306B\u81EA\u52D5\u7684\u306B\u958B\u304B\u306A\u3044", helper: "\u8A2D\u5B9A\u3067\u3044\u3064\u3067\u3082\u518D\u5EA6\u6709\u52B9\u306B\u3067\u304D\u307E\u3059\u3002" },
  ko: { heading: "\uB3C4\uC6C0\uB9D0 \uD328\uB110\uC774 \uBC29\uD574\uB418\uB098\uC694?", label: "\uB179\uC74C \uC2DC\uC791 \uC2DC \uC790\uB3D9\uC73C\uB85C \uC5F4\uC9C0 \uC54A\uAE30", helper: "\uC124\uC815\uC5D0\uC11C \uB2E4\uC2DC \uCF24 \uC218 \uC788\uC2B5\uB2C8\uB2E4." }
};
function getAutoOpenStrings(lang) {
  var _a;
  return (_a = AUTO_OPEN_STRINGS[lang]) != null ? _a : AUTO_OPEN_STRINGS.en;
}
var VoxtralHelpView = class extends import_obsidian2.ItemView {
  constructor(leaf, host) {
    super(leaf);
    /**
     * Explicit language override, set via setLanguage(). While null (a fresh
     * or workspace-restored view that nothing refreshed yet), render pulls
     * the live language from the host instead of assuming a default —
     * a hardcoded "nl" here left half the panel Dutch for non-Dutch users
     * until the next language-affecting event (issue obsidian-voxtral#14).
     */
    this.lang = null;
    this.host = host;
  }
  getViewType() {
    return VIEW_TYPE_VOXTRAL_HELP;
  }
  getDisplayText() {
    return "Voice commands";
  }
  getIcon() {
    return "mic";
  }
  /** Call this to update the language and re-render. */
  setLanguage(lang) {
    this.lang = lang;
    this.render();
  }
  async onOpen() {
    this.render();
  }
  render() {
    var _a, _b;
    const container = this.contentEl;
    container.empty();
    const host = this.host;
    const control = host ? { enabled: host.getAutoOpen(), onChange: (enabled) => host.setAutoOpen(enabled) } : void 0;
    const lang = (_b = (_a = this.lang) != null ? _a : host == null ? void 0 : host.getLanguage()) != null ? _b : "en";
    renderHelpContent(container, lang, control);
  }
  async onClose() {
    this.contentEl.empty();
  }
};
function renderHelpContent(container, lang, control) {
  container.addClass("voxtral-help-view");
  const strings = getStrings(lang);
  container.createEl("h3", { text: strings.title });
  const commands = getCommandList();
  const table = container.createEl("table", {
    cls: "voxtral-help-table"
  });
  const thead = table.createEl("thead");
  const headerRow = thead.createEl("tr");
  headerRow.createEl("th", { text: strings.command });
  headerRow.createEl("th", { text: strings.say });
  const tbody = table.createEl("tbody");
  for (const cmd of commands) {
    const row = tbody.createEl("tr");
    row.createEl("td", {
      text: cmd.label,
      cls: "voxtral-help-label"
    });
    row.createEl("td", {
      text: cmd.patterns.slice(0, 2).map((p) => `"${p}"`).join(" / "),
      cls: "voxtral-help-patterns"
    });
  }
  container.createEl("h4", { text: strings.tips });
  const tips = container.createEl("ul", { cls: "voxtral-help-tips" });
  for (const tip of strings.tipItems) {
    tips.createEl("li", { text: tip });
  }
  container.createEl("h4", { text: strings.privacy });
  const privacyList = container.createEl("ul", { cls: "voxtral-help-privacy" });
  for (const item of strings.privacyItems) {
    privacyList.createEl("li", { text: item });
  }
  if (control) {
    const auto = getAutoOpenStrings(lang);
    const box = container.createDiv({ cls: "voxtral-help-autoopen" });
    box.createEl("h4", { text: auto.heading });
    const label = box.createEl("label", { cls: "voxtral-help-autoopen-label" });
    const checkbox = label.createEl("input", { type: "checkbox" });
    checkbox.checked = !control.enabled;
    const text = label.createDiv({ cls: "voxtral-help-autoopen-text" });
    text.createSpan({ text: auto.label });
    text.createDiv({ text: auto.helper, cls: "voxtral-help-autoopen-helper" });
    checkbox.addEventListener("change", () => {
      void control.onChange(!checkbox.checked);
    });
  }
}

// src/file-transcription.ts
var AUDIO_EXTENSIONS = /* @__PURE__ */ new Set([
  "m4a",
  "mp4",
  "aac",
  "mp3",
  "wav",
  "ogg",
  "oga",
  "opus",
  "webm",
  "flac"
]);
function isAudioFile(extension) {
  return AUDIO_EXTENSIONS.has(extension.toLowerCase());
}
var MIME_BY_EXTENSION = {
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  webm: "audio/webm",
  flac: "audio/flac"
};
function mimeForExtension(extension) {
  var _a;
  return (_a = MIME_BY_EXTENSION[extension.toLowerCase()]) != null ? _a : "application/octet-stream";
}
function isTooLargeError(message) {
  return /\b413\b|too large/i.test(message);
}
function findRefAtLine(refs, line) {
  for (const ref of refs) {
    if (line >= ref.position.start.line && line <= ref.position.end.line) {
      return ref;
    }
  }
  return null;
}

// src/vault-vocabulary.ts
var import_obsidian3 = require("obsidian");
var MAX_TERMS = 50;
var MAX_CHARS = 1500;
var MIN_TERM_LENGTH = 3;
function isLikelyCommonWord(term) {
  if (term.includes(" ")) return false;
  if (/[0-9]/.test(term)) return false;
  if (term !== term.toLowerCase()) return false;
  return term.length <= 4;
}
function capByChars(terms, maxChars) {
  const result = [];
  let used = 0;
  for (const term of terms) {
    const additional = term.length + (result.length > 0 ? 2 : 0);
    if (used + additional > maxChars) break;
    result.push(term);
    used += additional;
  }
  return result;
}
function collectVaultVocabulary(app, activeFile) {
  var _a, _b, _c;
  const terms = [];
  const seen = /* @__PURE__ */ new Set();
  const addTerm = (raw) => {
    if (terms.length >= MAX_TERMS) return;
    if (!raw) return;
    const term = raw.trim();
    if (term.length < MIN_TERM_LENGTH) return;
    if (isLikelyCommonWord(term)) return;
    const key = term.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    terms.push(term);
  };
  const addFileTerms = (file) => {
    addTerm(file.basename);
    const cache = app.metadataCache.getFileCache(file);
    const aliases = (cache == null ? void 0 : cache.frontmatter) ? (0, import_obsidian3.parseFrontMatterAliases)(cache.frontmatter) : null;
    if (aliases) {
      for (const alias of aliases) addTerm(alias);
    }
  };
  const activeCache = activeFile ? app.metadataCache.getFileCache(activeFile) : null;
  if (activeCache && terms.length < MAX_TERMS) {
    for (const heading of (_a = activeCache.headings) != null ? _a : []) {
      if (terms.length >= MAX_TERMS) break;
      addTerm(heading.heading);
    }
    for (const link of (_b = activeCache.links) != null ? _b : []) {
      if (terms.length >= MAX_TERMS) break;
      addTerm(link.displayText);
    }
    const ownAliases = activeCache.frontmatter ? (0, import_obsidian3.parseFrontMatterAliases)(activeCache.frontmatter) : null;
    if (ownAliases) {
      for (const alias of ownAliases) {
        if (terms.length >= MAX_TERMS) break;
        addTerm(alias);
      }
    }
  }
  if (activeFile && terms.length < MAX_TERMS) {
    const resolved = (_c = app.metadataCache.resolvedLinks[activeFile.path]) != null ? _c : {};
    for (const linkedPath of Object.keys(resolved)) {
      if (terms.length >= MAX_TERMS) break;
      const linked = app.vault.getAbstractFileByPath(linkedPath);
      if (linked instanceof import_obsidian3.TFile) addFileTerms(linked);
    }
  }
  if (activeFile && terms.length < MAX_TERMS) {
    const allLinks = app.metadataCache.resolvedLinks;
    for (const sourcePath of Object.keys(allLinks)) {
      if (terms.length >= MAX_TERMS) break;
      if (sourcePath === activeFile.path) continue;
      if (!(activeFile.path in allLinks[sourcePath])) continue;
      const source = app.vault.getAbstractFileByPath(sourcePath);
      if (source instanceof import_obsidian3.TFile) addFileTerms(source);
    }
  }
  if (activeCache && terms.length < MAX_TERMS) {
    const tags = (0, import_obsidian3.getAllTags)(activeCache);
    if (tags) {
      for (const tag of tags) {
        if (terms.length >= MAX_TERMS) break;
        addTerm(tag.replace(/^#/, ""));
      }
    }
  }
  return capByChars(terms, MAX_CHARS);
}

// src/tts-text.ts
function flattenForSpeech(markdown) {
  let t = markdown;
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/~~~[\s\S]*?~~~/g, " ");
  t = t.replace(/!\[\[[^\]]*?\]\]/g, " ");
  t = t.replace(/!\[[^\]]*?\]\([^)]*?\)/g, " ");
  t = t.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  t = t.replace(/\[\[([^\]]+)\]\]/g, "$1");
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.split("\n").map(
    (line) => line.replace(/^\s{0,3}#{1,6}\s+/, "").replace(/^\s*>+\s?/, "").replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, "").replace(/^\s*[-*+]\s+/, "").replace(/^\s*\d+[.)]\s+/, "")
    // ordered list items
  ).join("\n");
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/\*([^*]+)\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1");
  t = t.replace(/~~([^~]+)~~/g, "$1");
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

// src/file-transcription-service.ts
var import_obsidian6 = require("obsidian");

// src/audio-quality.ts
var LIKELY_TOO_LARGE_MB = 90;
var LOW_BITRATE_KBPS = 24;
var CLIPPING_FRACTION_WARN = 5e-3;
var CLIP_LEVEL = 0.98;
var LOW_LEVEL_DBFS_WARN = -45;
var SILENCE_FRACTION_WARN = 0.6;
var SILENCE_WINDOW_DBFS = -50;
var SIGNAL_ANALYSIS_MAX_MB_DESKTOP = 60;
var SIGNAL_ANALYSIS_MAX_MB_MOBILE = 20;
var MB = 1024 * 1024;
function bitrateKbps(meta) {
  if (!meta.durationSec || meta.durationSec <= 0) return null;
  return meta.sizeBytes * 8 / 1e3 / meta.durationSec;
}
function shouldAnalyzeSignal(meta, isMobile) {
  const capMb = isMobile ? SIGNAL_ANALYSIS_MAX_MB_MOBILE : SIGNAL_ANALYSIS_MAX_MB_DESKTOP;
  return meta.sizeBytes <= capMb * MB;
}
function exceedsUploadLimit(sizeBytes) {
  return sizeBytes > LIKELY_TOO_LARGE_MB * MB;
}
function toDbfs(linear) {
  if (linear <= 0) return -100;
  return Math.max(-100, 20 * Math.log10(linear));
}
function computeSignalStats(channels, sampleRate) {
  var _a;
  const data = (_a = channels[0]) != null ? _a : new Float32Array(0);
  const n = data.length;
  if (n === 0) {
    return { peak: 0, rmsDbfs: -100, clippedFraction: 0, silentFraction: 1 };
  }
  let peak = 0;
  let sumSquares = 0;
  let clipped = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
    sumSquares += data[i] * data[i];
    if (a >= CLIP_LEVEL) clipped++;
  }
  const rms = Math.sqrt(sumSquares / n);
  const windowSize = Math.max(1, Math.floor(sampleRate * 0.1));
  const silenceFloor = Math.pow(10, SILENCE_WINDOW_DBFS / 20);
  let windows = 0;
  let silentWindows = 0;
  for (let start = 0; start < n; start += windowSize) {
    const end = Math.min(n, start + windowSize);
    let ws = 0;
    for (let i = start; i < end; i++) ws += data[i] * data[i];
    const wrms = Math.sqrt(ws / (end - start));
    windows++;
    if (wrms < silenceFloor) silentWindows++;
  }
  return {
    peak,
    rmsDbfs: toDbfs(rms),
    clippedFraction: clipped / n,
    silentFraction: windows > 0 ? silentWindows / windows : 1
  };
}
function assessAudioQuality(meta, signal) {
  const warnings = [];
  const kbps = bitrateKbps(meta);
  if (kbps !== null && kbps < LOW_BITRATE_KBPS) {
    warnings.push({
      key: "low-bitrate",
      severity: "info",
      message: `This recording is heavily compressed (~${Math.round(kbps)} kbps), which can reduce transcription accuracy.`
    });
  }
  if (signal) {
    if (signal.clippedFraction > CLIPPING_FRACTION_WARN) {
      warnings.push({
        key: "clipping",
        severity: "warning",
        message: "The audio is clipping (distorted by being too loud), which can garble words."
      });
    }
    if (signal.rmsDbfs < LOW_LEVEL_DBFS_WARN) {
      warnings.push({
        key: "low-level",
        severity: "warning",
        message: "The recording is very quiet, which can reduce accuracy. Speech far from the mic is the usual cause."
      });
    }
    if (signal.silentFraction > SILENCE_FRACTION_WARN) {
      warnings.push({
        key: "mostly-silent",
        severity: "info",
        message: "Most of this recording is near-silent \u2014 double-check it captured the audio you expect."
      });
    }
  }
  return warnings;
}

// src/audio-chunking.ts
var MB2 = 1024 * 1024;
var CHUNK_TARGET_SECONDS = 600;
var CHUNK_MAX_BYTES = 80 * MB2;
var WAV_HEADER_BYTES = 44;
function maxSafeChunkSeconds(sampleRate) {
  if (sampleRate <= 0) return CHUNK_TARGET_SECONDS;
  return Math.max(1, Math.floor((CHUNK_MAX_BYTES - WAV_HEADER_BYTES) / (sampleRate * 2)));
}
function planChunks(totalFrames, sampleRate, chunkSeconds) {
  if (totalFrames <= 0 || sampleRate <= 0) return [];
  const safeSeconds = Math.min(chunkSeconds, maxSafeChunkSeconds(sampleRate));
  const framesPerChunk = Math.max(1, Math.floor(safeSeconds * sampleRate));
  const spans = [];
  let start = 0;
  let index = 0;
  while (start < totalFrames) {
    const end = Math.min(totalFrames, start + framesPerChunk);
    spans.push({
      index,
      startFrame: start,
      endFrame: end,
      startSec: start / sampleRate,
      endSec: end / sampleRate
    });
    start = end;
    index++;
  }
  return spans;
}
function mixToMono(channels, startFrame, endFrame) {
  const len = Math.max(0, endFrame - startFrame);
  const out = new Float32Array(len);
  const nCh = channels.length;
  if (nCh === 0 || len === 0) return out;
  for (let ch = 0; ch < nCh; ch++) {
    const data = channels[ch];
    for (let i = 0; i < len; i++) {
      out[i] += data[startFrame + i] / nCh;
    }
  }
  return out;
}
function encodeWavMono(samples, sampleRate) {
  const nSamples = samples.length;
  const dataBytes = nSamples * 2;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  const writeStr = (offset2, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset2 + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataBytes, true);
  let offset = WAV_HEADER_BYTES;
  for (let i = 0; i < nSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 32768 : clamped * 32767, true);
    offset += 2;
  }
  return buffer;
}

// src/transcript-format.ts
var DEFAULT_MAX_PARAGRAPH_CHARS = 350;
function splitIntoParagraphs(text, opts = {}) {
  var _a;
  const max = (_a = opts.maxParagraphChars) != null ? _a : DEFAULT_MAX_PARAGRAPH_CHARS;
  const trimmed = text.trim();
  if (!trimmed) return "";
  const SEP = "\0";
  const marked = trimmed.replace(/([.!?…]['"”’)\]]?)\s+(?=[\p{Lu}"'“([])/gu, `$1${SEP}`);
  const sentences = marked.split(SEP);
  if (sentences.length <= 1) return trimmed;
  const paragraphs = [];
  let current = "";
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    current = current ? `${current} ${sentence}` : sentence;
    if (current.length >= max) {
      paragraphs.push(current);
      current = "";
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs.join("\n\n");
}

// src/diarization.ts
var DEFAULT_LABEL_PREFIX = "Speaker";
var DEFAULT_MINOR_THRESHOLD = 0.02;
var DEFAULT_MINOR_MIN_SEGMENTS = 3;
function mergeMinorSpeakers(turns, threshold = DEFAULT_MINOR_THRESHOLD, minSegments = DEFAULT_MINOR_MIN_SEGMENTS) {
  var _a;
  if (turns.length <= 1) return turns;
  const stats = /* @__PURE__ */ new Map();
  for (const t of turns) {
    const s = (_a = stats.get(t.speaker)) != null ? _a : { time: 0, count: 0 };
    s.time += Math.max(0, t.end - t.start);
    s.count += 1;
    stats.set(t.speaker, s);
  }
  let total = 0;
  for (const s of stats.values()) total += s.time;
  if (total === 0) return turns;
  const minor = /* @__PURE__ */ new Set();
  for (const [spk, s] of stats) {
    if (s.time / total < threshold && s.count < minSegments) minor.add(spk);
  }
  if (minor.size === 0) return turns;
  const major = turns.filter((t) => !minor.has(t.speaker));
  if (major.length === 0) return turns;
  return turns.map((t) => {
    if (!minor.has(t.speaker)) return t;
    const mid = (t.start + t.end) / 2;
    let nearest = major[0];
    let best = Infinity;
    for (const m of major) {
      const d = Math.abs((m.start + m.end) / 2 - mid);
      if (d < best) {
        best = d;
        nearest = m;
      }
    }
    return { ...t, speaker: nearest.speaker };
  });
}
function mergeConsecutiveSpeakers(turns) {
  const sorted = [...turns].sort((a, b) => a.start - b.start);
  const merged = [];
  let current = null;
  for (const seg of sorted) {
    if (!current || seg.speaker !== current.speaker) {
      if (current) merged.push(current);
      current = { ...seg };
    } else {
      current.end = seg.end;
      current.text = `${current.text} ${seg.text}`.trim();
    }
  }
  if (current) merged.push(current);
  return merged;
}
function segmentsToTurns(segments, opts = {}) {
  var _a, _b, _c, _d, _e;
  if (!segments || segments.length === 0) return [];
  const prefix = (_a = opts.labelPrefix) != null ? _a : DEFAULT_LABEL_PREFIX;
  const labels = /* @__PURE__ */ new Map();
  let counter = 1;
  const converted = [];
  for (const seg of segments) {
    const raw = (_b = seg.speaker_id) != null ? _b : seg.speaker;
    let label;
    if (raw !== null && raw !== void 0) {
      const key = String(raw);
      if (!labels.has(key)) {
        labels.set(key, `${prefix} ${counter}`);
        counter += 1;
      }
      label = labels.get(key);
    } else {
      label = `${prefix} 1`;
    }
    converted.push({
      speaker: label,
      start: typeof seg.start === "number" ? seg.start : 0,
      end: typeof seg.end === "number" ? seg.end : 0,
      text: ((_c = seg.text) != null ? _c : "").trim()
    });
  }
  const deghosted = mergeMinorSpeakers(
    converted,
    (_d = opts.minorThreshold) != null ? _d : DEFAULT_MINOR_THRESHOLD,
    (_e = opts.minorMinSegments) != null ? _e : DEFAULT_MINOR_MIN_SEGMENTS
  );
  return mergeConsecutiveSpeakers(deghosted);
}
function formatDiarizedTranscript(turns) {
  return turns.filter((t) => t.text).map((t) => `**${t.speaker}:** ${splitIntoParagraphs(t.text)}`).join("\n\n");
}
function diarizationNotice(perPart) {
  return perPart ? "> [!warning] Speaker labels are detected per part and are not consistent across the whole transcript \u2014 the same label in different parts may be a different person." : "> [!note] Speaker labels are detected automatically and may not be perfect.";
}

// src/audio-quality-modal.ts
var import_obsidian4 = require("obsidian");
var QualityWarningModal = class extends import_obsidian4.Modal {
  constructor(app, fileName, warnings, resolveResult) {
    super(app);
    this.resolved = false;
    this.dontWarnAgain = false;
    this.fileName = fileName;
    this.warnings = warnings;
    this.resolveResult = resolveResult;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Transcribe this recording?" });
    contentEl.createEl("p", {
      text: `A quick check of "${this.fileName}" found something that may affect the result:`
    });
    const list = contentEl.createEl("ul");
    for (const w of this.warnings) {
      list.createEl("li", { text: w.message });
    }
    new import_obsidian4.Setting(contentEl).setName("Don't warn me again").setDesc(
      "Skip this check for future file transcriptions. You can re-enable it in settings."
    ).addToggle(
      (toggle) => toggle.setValue(false).onChange((value) => {
        this.dontWarnAgain = value;
      })
    );
    new import_obsidian4.Setting(contentEl).addButton(
      (btn) => btn.setButtonText("Cancel").onClick(() => this.finish(false))
    ).addButton(
      (btn) => btn.setButtonText("Transcribe anyway").setCta().onClick(() => this.finish(true))
    );
  }
  finish(proceed) {
    this.resolved = true;
    this.resolveResult({ proceed, dontWarnAgain: this.dontWarnAgain });
    this.close();
  }
  onClose() {
    this.contentEl.empty();
    if (!this.resolved) {
      this.resolveResult({ proceed: false, dontWarnAgain: this.dontWarnAgain });
    }
  }
};
function confirmQualityWarnings(app, fileName, warnings) {
  return new Promise((resolve) => {
    new QualityWarningModal(app, fileName, warnings, resolve).open();
  });
}

// src/transcript-review.ts
function partKey(partNumber) {
  return partNumber != null ? partNumber : 0;
}
function renameTurns(turns, renames) {
  if (!renames || renames.size === 0) return turns;
  return turns.map((t) => {
    const renamed = renames.get(t.speaker);
    return renamed ? { ...t, speaker: renamed } : t;
  });
}
function renderReviewChunks(chunks, renames) {
  return chunks.map((c) => {
    if (c.kind === "text") return c.text;
    const scoped = renames.get(partKey(c.partNumber));
    return formatDiarizedTranscript(renameTurns(c.turns, scoped));
  }).join("");
}
function reviewRenameGroups(chunks) {
  const groups = [];
  for (const c of chunks) {
    if (c.kind !== "diarized") continue;
    const seen = /* @__PURE__ */ new Set();
    const labels = [];
    for (const t of c.turns) {
      if (!seen.has(t.speaker)) {
        seen.add(t.speaker);
        labels.push(t.speaker);
      }
    }
    if (labels.length > 0) groups.push({ partNumber: c.partNumber, labels });
  }
  return groups;
}

// src/transcript-review-modal.ts
var import_obsidian5 = require("obsidian");
var TranscriptReviewModal = class extends import_obsidian5.Modal {
  constructor(app, params, resolveDone) {
    super(app);
    this.params = params;
    this.resolveDone = resolveDone;
    this.renames = /* @__PURE__ */ new Map();
    this.resolved = false;
  }
  onOpen() {
    const { contentEl } = this;
    this.containerEl.addClass("voxtral-review-overlay");
    this.modalEl.addClass("voxtral-review-modal");
    if (import_obsidian5.Platform.isMobile && window.visualViewport) {
      const vv = window.visualViewport;
      const adjustHeight = () => {
        this.modalEl.style.maxHeight = `${vv.height - 32}px`;
      };
      adjustHeight();
      vv.addEventListener("resize", adjustHeight);
      this.removeVVListener = () => vv.removeEventListener("resize", adjustHeight);
    }
    new import_obsidian5.Setting(contentEl).setName(`Review transcript: ${this.params.fileName}`).setHeading();
    this.previewEl = contentEl.createDiv({ cls: "voxtral-review-preview" });
    this.renderPreview();
    const groups = reviewRenameGroups(this.params.chunks);
    if (groups.length > 0) {
      new import_obsidian5.Setting(contentEl).setName("Rename speakers").setDesc(
        groups.length > 1 ? "Each part's speaker numbers were detected independently \u2014 a rename only applies within its own part." : ""
      ).setHeading();
      for (const group of groups) {
        const partSuffix = group.partNumber != null ? ` (part ${group.partNumber})` : "";
        for (const label of group.labels) {
          new import_obsidian5.Setting(contentEl).setName(`${label}${partSuffix}`).addText(
            (text) => text.setValue(label).onChange((value) => {
              this.setRename(group.partNumber, label, value);
            })
          );
        }
      }
    }
    new import_obsidian5.Setting(contentEl).addButton(
      (btn) => btn.setButtonText("Discard").onClick(() => void this.finish("discard"))
    ).addButton(
      (btn) => btn.setButtonText("Insert").setCta().onClick(() => void this.finish("insert"))
    );
  }
  setRename(partNumber, label, value) {
    const key = partNumber != null ? partNumber : 0;
    let scoped = this.renames.get(key);
    if (!scoped) {
      scoped = /* @__PURE__ */ new Map();
      this.renames.set(key, scoped);
    }
    const trimmed = value.trim();
    if (trimmed && trimmed !== label) {
      scoped.set(label, trimmed);
    } else {
      scoped.delete(label);
    }
    this.renderPreview();
  }
  renderPreview() {
    this.previewEl.empty();
    const text = renderReviewChunks(this.params.chunks, this.renames);
    this.previewEl.createEl("pre", { text, cls: "voxtral-review-preview-text" });
  }
  async finish(action) {
    if (this.resolved) return;
    this.resolved = true;
    if (action === "insert") {
      const text = renderReviewChunks(this.params.chunks, this.renames);
      await this.params.onInsert(text);
    } else {
      this.params.onDiscard();
    }
    this.close();
  }
  onClose() {
    var _a;
    (_a = this.removeVVListener) == null ? void 0 : _a.call(this);
    this.contentEl.empty();
    if (!this.resolved) {
      this.resolved = true;
      this.params.onDiscard();
    }
    this.resolveDone();
  }
};
function openTranscriptReviewModal(app, params) {
  return new Promise((resolve) => {
    new TranscriptReviewModal(app, params, resolve).open();
  });
}

// src/file-transcription-service.ts
var _FileTranscriptionService = class _FileTranscriptionService {
  constructor(deps) {
    this.deps = deps;
  }
  get app() {
    return this.deps.app;
  }
  get settings() {
    return this.deps.getSettings();
  }
  get httpRequest() {
    return this.deps.httpRequest;
  }
  updateStatusBar(state) {
    this.deps.updateStatusBar(state);
  }
  async saveSettings() {
    await this.deps.saveSettings();
  }
  // ── Crash-proof logging ──
  /**
   * On-disk log that survives a hard native crash (mobile OOM, WebView kill),
   * which destroys the in-memory `vlog` ring buffer — leaving "logging on but no
   * logs". Each call appends one line and is awaited, so the write is flushed
   * before the next step runs: after a crash, the LAST line on disk pinpoints the
   * step that was executing when the app died. Lives in the vault root so it's
   * easy to open. Gated by debug logging; never throws into the caller.
   */
  async crashLog(msg) {
    if (!this.settings.debugLogging) return;
    try {
      const now = /* @__PURE__ */ new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const ts = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${String(now.getMilliseconds()).padStart(3, "0")}`;
      await this.app.vault.adapter.append(
        _FileTranscriptionService.CRASH_LOG_PATH,
        `${ts}  ${msg}
`
      );
    } catch (e) {
    }
  }
  /** Record a step in BOTH the in-memory log and the crash-proof on-disk log. */
  async logStep(msg) {
    vlog.debug(`Voxtral: ${msg}`);
    await this.crashLog(msg);
  }
  // ── File transcription (batch) ──
  /**
   * Read a vault audio file, run the pre-flight check, transcribe it (batch),
   * and hand the result to `insert` (when given) or write it to a new linked
   * note. One code path for every entry point (command, file menu, embed).
   */
  async transcribe(file, insert) {
    try {
      const needsChunking = exceedsUploadLimit(file.stat.size);
      const bytes = await this.app.vault.readBinary(file);
      await this.crashLog(
        `
=== ${(/* @__PURE__ */ new Date()).toISOString()} transcribe ${file.name} (${(file.stat.size / (1024 * 1024)).toFixed(1)} MB) chunked=${needsChunking} diarize=${this.settings.fileTranscriptDiarize} mobile=${import_obsidian6.Platform.isMobile} ===`
      );
      if (this.settings.fileTranscriptQualityWarnings) {
        const proceed = await this.preflightQualityGate(file, bytes);
        if (!proceed) {
          new import_obsidian6.Notice(`Transcription of ${file.name} cancelled.`);
          return;
        }
      }
      this.updateStatusBar("processing");
      if (needsChunking) {
        await this.transcribeInChunks(file, bytes, insert);
        this.updateStatusBar("idle");
        return;
      }
      new import_obsidian6.Notice(`Transcribing ${file.name}\u2026`);
      const blob = new Blob([bytes], { type: mimeForExtension(file.extension) });
      let chunks = [];
      if (this.settings.fileTranscriptDiarize) {
        await this.logStep("single-call: sending diarized request");
        const result = await this.transcribeDiarized(blob);
        await this.logStep(
          `single-call: response text=${result.text.length} chars, ${result.segments.length} segments; building body`
        );
        const turns = segmentsToTurns(result.segments);
        if (turns.length > 0) {
          chunks = [
            { kind: "text", text: `${diarizationNotice(false)}

` },
            { kind: "diarized", turns }
          ];
        } else {
          const fallback = splitIntoParagraphs(result.text.trim());
          if (fallback) {
            chunks = [{ kind: "text", text: `${diarizationNotice(false)}

${fallback}` }];
          }
        }
        await this.logStep(`single-call: built ${chunks.length} review chunk(s)`);
      } else {
        let text2 = (await transcribeBatch(blob, this.settings, this.httpRequest)).trim();
        if (text2 && this.settings.fileTranscriptCorrect) {
          text2 = (await correctText(text2, this.settings, this.httpRequest)).trim();
        }
        if (text2) text2 = splitIntoParagraphs(text2);
        if (text2) chunks = [{ kind: "text", text: text2 }];
      }
      this.updateStatusBar("idle");
      if (chunks.length === 0) {
        new import_obsidian6.Notice(`No speech detected in ${file.name}.`);
        return;
      }
      if (this.settings.fileTranscriptReview) {
        await this.openReviewAndPlace(file, chunks, insert, `Inserted transcript of ${file.name}.`);
        return;
      }
      const text = renderReviewChunks(chunks, /* @__PURE__ */ new Map());
      if (insert) {
        insert(text);
        new import_obsidian6.Notice(`Inserted transcript of ${file.name}.`);
      } else {
        await this.createTranscriptNote(file, text);
      }
    } catch (e) {
      this.updateStatusBar("idle");
      const msg = String(e);
      if (isTooLargeError(msg)) {
        new import_obsidian6.Notice(
          `${file.name} was rejected as too large by the transcription service, even after splitting. Try a smaller or shorter recording.`,
          8e3
        );
      } else {
        new import_obsidian6.Notice(`Transcription failed: ${msg}`);
      }
      vlog.error("Voxtral: File transcription failed", e);
    }
  }
  /**
   * Run the pre-flight quality check for a file. Returns true to proceed with
   * transcription, false to abort. Never throws — a failed check proceeds.
   */
  async preflightQualityGate(file, bytes) {
    let warnings = [];
    try {
      const baseMeta = {
        sizeBytes: file.stat.size,
        extension: file.extension,
        durationSec: null
      };
      let signal = null;
      let durationSec = null;
      if (shouldAnalyzeSignal(baseMeta, import_obsidian6.Platform.isMobile)) {
        const analysis = await this.analyzeAudio(bytes);
        if (analysis) {
          signal = analysis.signal;
          durationSec = analysis.durationSec;
        }
      }
      warnings = assessAudioQuality({ ...baseMeta, durationSec }, signal);
    } catch (e) {
      vlog.error("Voxtral: pre-flight quality check failed", e);
      return true;
    }
    if (warnings.length === 0) return true;
    const result = await confirmQualityWarnings(this.app, file.name, warnings);
    if (result.dontWarnAgain) {
      this.settings.fileTranscriptQualityWarnings = false;
      await this.saveSettings();
    }
    return result.proceed;
  }
  /**
   * Decode an audio file in the browser to its raw PCM channels. Returns null if
   * decoding fails (unsupported codec, out of memory, …) — callers treat that as
   * "couldn't decode", not a hard error. NOTE: decodeAudioData decodes the whole
   * file into memory, so callers must size-guard before using this on big files.
   */
  async decodeToChannels(bytes) {
    try {
      const ctx = new AudioContext();
      try {
        const buf = await ctx.decodeAudioData(bytes.slice(0));
        const channels = [];
        for (let c = 0; c < buf.numberOfChannels; c++) {
          channels.push(buf.getChannelData(c));
        }
        return {
          channels,
          sampleRate: buf.sampleRate,
          totalFrames: buf.length,
          durationSec: buf.duration
        };
      } finally {
        void ctx.close();
      }
    } catch (e) {
      vlog.error("Voxtral: audio decode failed", e);
      return null;
    }
  }
  /**
   * Derive duration + signal stats from a decoded file (pre-flight, E4_S2).
   * Returns null if decoding fails.
   */
  async analyzeAudio(bytes) {
    const decoded = await this.decodeToChannels(bytes);
    if (!decoded) return null;
    const d = decoded.durationSec;
    return {
      durationSec: Number.isFinite(d) && d > 0 ? d : null,
      signal: computeSignalStats(decoded.channels, decoded.sampleRate)
    };
  }
  /**
   * Transcribe a blob with diarization (E25_S1). The diarized request shape
   * (diarize=true + timestamp_granularities=segment, language omitted) is built
   * in transcribeBatchRaw — the API requires segment timestamps for diarization
   * and rejects them alongside `language`, so the language hint is dropped there.
   */
  async transcribeDiarized(blob) {
    return transcribeBatchRaw(blob, this.settings, this.httpRequest, true);
  }
  /**
   * Decode an audio file and resample it to 16 kHz mono (the rate the speech model
   * uses), returning just that small buffer so the full-resolution decode can be
   * freed immediately. This keeps the chunking loop's held memory low — a long
   * recording at the source rate is hundreds of MB and can OOM-crash the app on
   * mobile. Returns null on failure; the caller falls back to the source-rate path.
   */
  async decodeToMono16k(bytes) {
    try {
      const ctx = new AudioContext();
      let buf;
      try {
        buf = await ctx.decodeAudioData(bytes.slice(0));
      } finally {
        void ctx.close();
      }
      const targetRate = 16e3;
      const frames = Math.max(1, Math.ceil(buf.duration * targetRate));
      const offline = new OfflineAudioContext(1, frames, targetRate);
      const source = offline.createBufferSource();
      source.buffer = buf;
      source.connect(offline.destination);
      source.start();
      const rendered = await offline.startRendering();
      return { samples: rendered.getChannelData(0), sampleRate: targetRate };
    } catch (e) {
      vlog.error("Voxtral: 16 kHz mono decode failed", e);
      return null;
    }
  }
  /**
   * Open the review modal (VX_E27_S6) and place the (possibly renamed) transcript
   * exactly where the direct path would have: `insert` reuses the same
   * cursor/editor closure the direct path calls (main.ts captures it at command
   * time), and the new-note path reuses `createTranscriptNote`. This is the single
   * placement seam shared by the single-call and chunked callers below — review is
   * a pause in the middle of the existing flow, not a separate one.
   */
  async openReviewAndPlace(file, chunks, insert, insertedNotice) {
    await openTranscriptReviewModal(this.app, {
      fileName: file.name,
      chunks,
      onInsert: async (finalText) => {
        if (insert) {
          insert(finalText);
          new import_obsidian6.Notice(insertedNotice);
        } else {
          await this.createTranscriptNote(file, finalText);
        }
      },
      onDiscard: () => {
        new import_obsidian6.Notice(`Discarded transcript of ${file.name}.`);
      }
    });
  }
  /**
   * Transcribe a long recording (over the single-request limit) by decoding it
   * once, splitting the PCM into time-based chunks — each a small mono WAV under
   * the upload limit — and transcribing them sequentially. Each part's transcript
   * is inserted as soon as it returns (E24_S2), so the text grows in the document
   * part by part. A progress notice shows "part k/N" with a Cancel button that
   * stops further parts and leaves the already-inserted text in place.
   */
  async transcribeInChunks(file, bytes, insert) {
    let totalFrames;
    let sampleRate;
    let chunkWav;
    await this.logStep("chunked: decoding to 16 kHz mono");
    const mono = await this.decodeToMono16k(bytes);
    if (mono) {
      totalFrames = mono.samples.length;
      sampleRate = mono.sampleRate;
      chunkWav = (span) => encodeWavMono(mono.samples.subarray(span.startFrame, span.endFrame), sampleRate);
      await this.logStep(`chunked: decoded 16k mono, ${totalFrames} frames`);
    } else {
      await this.logStep("chunked: 16k decode failed, trying source-rate decode");
      const decoded = await this.decodeToChannels(bytes);
      if (!decoded) {
        throw new Error(
          `Could not decode ${file.name} \u2014 it may be too large to split in memory on this device. Try a smaller/compressed file, or transcribe on desktop.`
        );
      }
      totalFrames = decoded.totalFrames;
      sampleRate = decoded.sampleRate;
      chunkWav = (span) => encodeWavMono(
        mixToMono(decoded.channels, span.startFrame, span.endFrame),
        sampleRate
      );
      await this.logStep(
        `chunked: decoded source-rate ${totalFrames} frames @ ${sampleRate}Hz`
      );
    }
    const spans = planChunks(totalFrames, sampleRate, this.settings.chunkSeconds);
    await this.logStep(`chunked: planned ${spans.length} chunk(s) @ ${sampleRate}Hz`);
    const review = this.settings.fileTranscriptReview;
    const reviewChunks = [];
    let append;
    if (review) {
      append = (text) => reviewChunks.push({ kind: "text", text });
    } else if (insert) {
      append = insert;
    } else {
      const note = await this.createLinkedNote(file, "");
      const leaf = this.app.workspace.getLeaf(true);
      await leaf.openFile(note);
      const view = leaf.view instanceof import_obsidian6.MarkdownView ? leaf.view : null;
      if (!view) {
        throw new Error(`Could not open a note for ${file.name}.`);
      }
      const editor = view.editor;
      editor.setCursor({ line: editor.lastLine(), ch: editor.getLine(editor.lastLine()).length });
      append = (text) => editor.replaceSelection(`${text}
`);
    }
    const appendDiarizedPart = (header, partNumber, turns, trailer) => {
      if (review) {
        reviewChunks.push({ kind: "text", text: header });
        reviewChunks.push({ kind: "diarized", partNumber, turns });
        reviewChunks.push({ kind: "text", text: trailer });
      } else {
        append(`${header}${formatDiarizedTranscript(turns)}${trailer}`);
      }
    };
    let cancelled = false;
    const progress = new import_obsidian6.Notice("", 0);
    const renderProgress = (part) => {
      progress.setMessage(
        createFragment((frag) => {
          frag.createSpan({
            text: `Transcribing ${file.name}: part ${part}/${spans.length}\u2026 `
          });
          const btn = frag.createEl("button", { text: "Cancel" });
          btn.addEventListener("click", () => {
            cancelled = true;
            progress.setMessage("Stopping after the current part\u2026");
          });
        })
      );
    };
    const diarize = this.settings.fileTranscriptDiarize;
    const correct = this.settings.fileTranscriptCorrect && !diarize;
    const rawParts = [];
    const failed = [];
    let anyText = false;
    if (diarize) {
      append(`${diarizationNotice(true)}
`);
      await this.logStep("chunked: diarization banner appended");
    }
    try {
      for (const span of spans) {
        if (cancelled) break;
        renderProgress(span.index + 1);
        await this.logStep(`chunk ${span.index + 1}/${spans.length}: encoding WAV`);
        const wav = chunkWav(span);
        const blob = new Blob([wav], { type: "audio/wav" });
        await this.logStep(
          `chunk ${span.index + 1}/${spans.length}: ${(wav.byteLength / (1024 * 1024)).toFixed(1)} MB WAV, ${Math.round(span.endSec - span.startSec)}s; sending (diarize=${diarize})`
        );
        let result = null;
        try {
          result = await retryWithBackoff(
            (attempt) => {
              if (attempt > 0) {
                vlog.debug(
                  `Voxtral: retry ${attempt} for chunk ${span.index + 1}/${spans.length}`
                );
              }
              return diarize ? this.transcribeDiarized(blob) : transcribeBatchRaw(blob, this.settings, this.httpRequest, false);
            },
            {
              attempts: 5,
              baseDelayMs: 1500,
              shouldRetry: (e) => !isTooLargeError(String(e))
            }
          );
          await this.logStep(
            `chunk ${span.index + 1}/${spans.length}: response text=${result.text.length} chars, ${result.segments.length} segments`
          );
        } catch (e) {
          failed.push(span.index + 1);
          await this.logStep(
            `chunk ${span.index + 1}/${spans.length} failed: ${String(e)}`
          );
        }
        if (!result) {
          if (diarize) {
            append(`### Part ${span.index + 1}

[This part could not be transcribed]
`);
          } else if (!correct) {
            append(`[Part ${span.index + 1} could not be transcribed]
`);
          }
          continue;
        }
        if (diarize) {
          await this.logStep(
            `chunk ${span.index + 1}/${spans.length}: building diarized body from ${result.segments.length} segments`
          );
          const turns = segmentsToTurns(result.segments);
          if (turns.length > 0) {
            appendDiarizedPart(`### Part ${span.index + 1}

`, span.index + 1, turns, "\n");
            anyText = true;
          } else {
            const fallback = splitIntoParagraphs(result.text.trim());
            if (fallback) {
              append(`### Part ${span.index + 1}

${fallback}
`);
              anyText = true;
            }
          }
          await this.logStep(`chunk ${span.index + 1}/${spans.length}: appended`);
        } else {
          const part = result.text.trim();
          if (part) {
            rawParts.push(part);
            if (!correct) {
              append(splitIntoParagraphs(part) + "\n");
              anyText = true;
            }
          }
        }
      }
      if (correct && rawParts.length > 0) {
        progress.setMessage(`Correcting ${file.name}\u2026`);
        const corrected = (await correctText(rawParts.join("\n"), this.settings, this.httpRequest)).trim();
        if (corrected) {
          append(splitIntoParagraphs(corrected));
          anyText = true;
        }
      }
    } finally {
      progress.hide();
    }
    const done = spans.length - failed.length;
    const failNote = failed.length ? ` ${failed.length} part(s) failed (${failed.join(", ")}); the rest was kept.` : "";
    if (review && anyText) {
      const summary = cancelled ? `Stopped ${file.name}: ${done} of ${spans.length} parts done.${failNote}` : `Transcribed ${file.name} in ${spans.length} parts.${failNote}`;
      await this.openReviewAndPlace(file, reviewChunks, insert, summary);
      return;
    }
    if (cancelled) {
      new import_obsidian6.Notice(`Stopped ${file.name}: ${done} of ${spans.length} parts done.${failNote}`);
    } else if (!anyText && failed.length) {
      new import_obsidian6.Notice(`Could not transcribe ${file.name}: all ${spans.length} parts failed.`);
    } else if (!anyText) {
      new import_obsidian6.Notice(`No speech detected in ${file.name}.`);
    } else {
      new import_obsidian6.Notice(`Transcribed ${file.name} in ${spans.length} parts.${failNote}`);
    }
  }
  /**
   * Create a new note holding `body`, linked to the source audio. Returns the
   * note without opening it or notifying — callers decide how to surface it.
   */
  async createLinkedNote(file, body) {
    const folder = file.parent && file.parent.path !== "/" ? file.parent.path : "";
    const path = this.uniqueNotePath(folder, `${file.basename} (transcript)`);
    let link = this.app.fileManager.generateMarkdownLink(file, path);
    if (link.startsWith("!")) {
      link = link.slice(1);
    }
    return this.app.vault.create(path, `Source: ${link}

${body}
`);
  }
  /** Create a new transcript note, open it, and notify (single-shot path). */
  async createTranscriptNote(file, text) {
    const note = await this.createLinkedNote(file, text);
    await this.app.workspace.getLeaf(true).openFile(note);
    new import_obsidian6.Notice(`Transcript saved to ${note.path}.`);
  }
  /** A note path under `folder` based on `base`, suffixed with a number if taken. */
  uniqueNotePath(folder, base) {
    const dir = folder ? `${folder}/` : "";
    let candidate = `${dir}${base}.md`;
    let i = 2;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = `${dir}${base} ${i}.md`;
      i++;
    }
    return candidate;
  }
};
_FileTranscriptionService.CRASH_LOG_PATH = "voxtral-crash-log.md";
var FileTranscriptionService = _FileTranscriptionService;

// src/playback-controller.ts
var import_obsidian7 = require("obsidian");
var PlaybackController = class {
  constructor() {
    this.ttsCtx = null;
    this.ttsSource = null;
  }
  async playAudioBytes(bytes) {
    this.stopPlayback();
    const ctx = new AudioContext();
    this.ttsCtx = ctx;
    try {
      const buffer = await ctx.decodeAudioData(bytes.slice(0));
      if (this.ttsCtx !== ctx) {
        void ctx.close();
        return;
      }
      if (ctx.state === "suspended") await ctx.resume();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.addEventListener("ended", () => {
        if (this.ttsSource === source) this.stopPlayback();
      });
      this.ttsSource = source;
      source.start();
    } catch (e) {
      vlog.error("Voxtral: audio playback failed", e);
      const head = Array.from(new Uint8Array(bytes.slice(0, 8))).map((b) => b.toString(16).padStart(2, "0")).join(" ");
      new import_obsidian7.Notice(`Could not play audio: ${String(e)} [${bytes.byteLength}B head=${head}]`);
      this.stopPlayback();
    }
  }
  /** Stop "listen back" playback and release the audio context. */
  stopPlayback() {
    if (this.ttsSource) {
      try {
        this.ttsSource.stop();
      } catch (e) {
      }
      this.ttsSource.disconnect();
      this.ttsSource = null;
    }
    if (this.ttsCtx) {
      void this.ttsCtx.close();
      this.ttsCtx = null;
    }
  }
};

// src/templates.ts
var import_obsidian8 = require("obsidian");
var templateCommands = [];
function scanTemplates(app, folderPath) {
  templateCommands = [];
  if (!folderPath) return;
  const folder = app.vault.getFolderByPath(folderPath);
  if (!folder) return;
  scanFolder(folder);
}
function scanFolder(folder) {
  for (const child of folder.children) {
    if (child instanceof import_obsidian8.TFile && child.extension === "md") {
      const displayName = child.basename;
      templateCommands.push({
        name: normalizeCommand(displayName),
        displayName,
        path: child.path
      });
    } else if (child instanceof import_obsidian8.TFolder) {
      scanFolder(child);
    }
  }
}
function matchTemplate(normalizedText, lang) {
  if (templateCommands.length === 0) return null;
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
function getTemplatePrefixes(lang) {
  switch (lang) {
    case "nl":
      return ["sjabloon", "template"];
    case "en":
      return ["template"];
    case "fr":
      return ["modele", "template"];
    case "de":
      return ["vorlage", "template"];
    case "es":
      return ["plantilla", "template"];
    case "pt":
      return ["modelo", "template"];
    case "it":
      return ["modello", "template"];
    case "ru":
      return ["\u0448\u0430\u0431\u043B\u043E\u043D", "template"];
    case "zh":
      return ["\u6A21\u677F", "template"];
    case "hi":
      return ["\u091F\u0947\u092E\u094D\u092A\u0932\u0947\u091F", "template"];
    case "ar":
      return ["\u0642\u0627\u0644\u0628", "template"];
    case "ja":
      return ["\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8", "template"];
    case "ko":
      return ["\uD15C\uD50C\uB9BF", "template"];
    default:
      return ["template"];
  }
}
async function insertTemplate(app, editor, template) {
  var _a;
  const file = app.vault.getFileByPath(template.path);
  if (!file) return;
  let content = await app.vault.cachedRead(file);
  const now = /* @__PURE__ */ new Date();
  const activeFile = app.workspace.getActiveFile();
  const title = (_a = activeFile == null ? void 0 : activeFile.basename) != null ? _a : "";
  content = content.replace(/\{\{date\}\}/gi, now.toISOString().split("T")[0]).replace(/\{\{time\}\}/gi, now.toTimeString().split(" ")[0].substring(0, 5)).replace(/\{\{title\}\}/gi, title);
  const cursor = editor.getCursor();
  if (cursor.ch > 0) {
    content = "\n" + content;
  }
  editor.replaceRange(content, cursor);
  const lines = content.split("\n");
  const lastLine = lines[lines.length - 1];
  const newLine = cursor.line + lines.length - 1;
  const newCh = lines.length === 1 ? cursor.ch + lastLine.length : lastLine.length;
  editor.setCursor({ line: newLine, ch: newCh });
}

// ../shared/src/dictation-tracker.ts
var DictationTracker = class _DictationTracker {
  constructor() {
    this.dictatedRanges = [];
  }
  /** Clear all tracked ranges (call when recording starts/stops). */
  reset() {
    this.dictatedRanges = [];
  }
  /**
   * Wrap processText to track what was inserted in the editor.
   * Records the cursor offset before and after to determine the
   * range of inserted text, and adjusts existing ranges when an
   * insertion shifts them.
   *
   * @param onSlotActive — optional callback when a slot becomes active
   * @param posOverride — explicit insertion point. When supplied, the
   *   insertion point and resulting end are derived from it and the document
   *   length delta rather than editor.getCursor(), which Obsidian resets to
   *   the cell start after an async table re-render.
   * @param onCommand — optional callback invoked with the matched command's
   *   id whenever a voice command executes (drives command-feedback UI).
   * @returns the resulting end offset (so a caller can keep tracking it across
   *   turns) and whether a stop-recording command was hit.
   */
  trackProcessText(editor, text, onSlotActive, posOverride, onCommand) {
    const offsetBefore = posOverride ? editor.posToOffset(posOverride) : editor.posToOffset(editor.getCursor());
    const lenBefore = posOverride ? editor.getValue().length : 0;
    const stop = processText(editor, text, posOverride, onCommand);
    if (isSlotActive() && onSlotActive) {
      onSlotActive();
    }
    const offsetAfter = posOverride ? offsetBefore + (editor.getValue().length - lenBefore) : editor.posToOffset(editor.getCursor());
    const delta = offsetAfter - offsetBefore;
    if (delta > 0) {
      for (const range of this.dictatedRanges) {
        if (range.from >= offsetBefore) {
          range.from += delta;
          range.to += delta;
        } else if (range.to > offsetBefore) {
          range.to += delta;
        }
      }
      this.dictatedRanges.push({ from: offsetBefore, to: offsetAfter });
    } else if (delta < 0) {
      const deletedLen = -delta;
      const deletedFrom = offsetAfter;
      const deletedTo = offsetBefore;
      for (const range of this.dictatedRanges) {
        if (range.from >= deletedTo) {
          range.from -= deletedLen;
          range.to -= deletedLen;
        } else if (range.from >= deletedFrom) {
          range.from = deletedFrom;
          range.to = range.to <= deletedTo ? deletedFrom : range.to - deletedLen;
        } else if (range.to > deletedFrom) {
          range.to = range.to <= deletedTo ? deletedFrom : range.to - deletedLen;
        }
      }
      this.dictatedRanges = this.dictatedRanges.filter(
        (r) => r.to > r.from
      );
    }
    return { end: offsetAfter, stop };
  }
  /**
   * Insert text at cursor and track the range for auto-correct.
   * Handles auto-spacing between existing text and new text.
   */
  trackInsertAtCursor(editor, text) {
    const cursor = editor.getCursor();
    if (cursor.ch === 0) {
      text = text.replace(/^ +/, "");
    }
    if (cursor.ch > 0 && text.length > 0 && !/^[\s\n]/.test(text) && !isSlotActive()) {
      const charBefore = editor.getRange(
        { line: cursor.line, ch: cursor.ch - 1 },
        cursor
      );
      if (charBefore && /\S/.test(charBefore)) {
        text = " " + text;
      }
    }
    const offsetBefore = editor.posToOffset(cursor);
    editor.replaceRange(text, cursor);
    const lines = text.split("\n");
    const lastLine = lines[lines.length - 1];
    const newLine = cursor.line + lines.length - 1;
    const newCh = lines.length === 1 ? cursor.ch + lastLine.length : lastLine.length;
    editor.setCursor({ line: newLine, ch: newCh });
    const offsetAfter = editor.posToOffset(editor.getCursor());
    const delta = offsetAfter - offsetBefore;
    if (delta > 0) {
      for (const range of this.dictatedRanges) {
        if (range.from >= offsetBefore) {
          range.from += delta;
          range.to += delta;
        } else if (range.to > offsetBefore) {
          range.to += delta;
        }
      }
      this.dictatedRanges.push({ from: offsetBefore, to: offsetAfter });
    }
  }
  /** True when at least one dictated range has been recorded. */
  hasRanges() {
    return this.dictatedRanges.length > 0;
  }
  /** Record a range directly (for dual-delay finalization). */
  addRange(from, to) {
    this.dictatedRanges.push({ from, to });
  }
  /**
   * After stopping realtime recording, correct only the text
   * that was actually dictated.  Each tracked range is corrected
   * independently, processed from end to start so that earlier
   * offsets remain valid after replacements.
   */
  async autoCorrectAfterStop(editor, settings, httpRequest) {
    var _a;
    if (this.dictatedRanges.length === 0) return;
    const merged = _DictationTracker.mergeRanges(this.dictatedRanges);
    const fullText = editor.getValue();
    const corrections = [];
    for (const range of merged) {
      if (range.from >= fullText.length || range.to > fullText.length) {
        continue;
      }
      for (const span of this.splitAroundTables(
        editor,
        range.from,
        range.to
      )) {
        const text = fullText.substring(span.from, span.to);
        if (!text.trim()) continue;
        corrections.push({
          from: editor.offsetToPos(span.from),
          to: editor.offsetToPos(span.to),
          text
        });
      }
    }
    corrections.sort(
      (a, b) => editor.posToOffset(b.from) - editor.posToOffset(a.from)
    );
    for (const c of corrections) {
      try {
        let corrected = await correctText(c.text, settings, httpRequest);
        if (settings.vaultWikilinks && ((_a = settings.vocabularyTerms) == null ? void 0 : _a.length)) {
          corrected = applyVaultWikilinks(corrected, settings.vocabularyTerms);
        }
        if (corrected && corrected !== c.text) {
          editor.replaceRange(corrected, c.from, c.to);
        }
      } catch (e) {
        vlog.error("Voxtral: Auto-correct failed", e);
      }
    }
  }
  /**
   * Split an offset range into the sub-spans that do NOT fall on markdown
   * table lines. Contiguous non-table lines are kept together (so multi-line
   * prose is corrected with full context); each table line acts as a barrier
   * that ends the current span and is itself excluded from correction.
   */
  splitAroundTables(editor, from, to) {
    const result = [];
    const fromPos = editor.offsetToPos(from);
    const toPos = editor.offsetToPos(to);
    let groupFrom = null;
    let groupTo = from;
    for (let line = fromPos.line; line <= toPos.line; line++) {
      const lineText = editor.getLine(line);
      const lineStart = editor.posToOffset({ line, ch: 0 });
      const lineEnd = lineStart + lineText.length;
      const segStart = Math.max(from, lineStart);
      const segEnd = Math.min(to, lineEnd);
      if (isTableLine(lineText)) {
        if (groupFrom !== null) {
          result.push({ from: groupFrom, to: groupTo });
          groupFrom = null;
        }
        continue;
      }
      if (groupFrom === null) groupFrom = segStart;
      groupTo = segEnd;
    }
    if (groupFrom !== null) {
      result.push({ from: groupFrom, to: groupTo });
    }
    return result;
  }
  /**
   * Merge overlapping or adjacent dictated ranges into a minimal set.
   */
  static mergeRanges(ranges) {
    if (ranges.length === 0) return [];
    const sorted = [...ranges].sort((a, b) => a.from - b.from);
    const merged = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const prev = merged[merged.length - 1];
      const cur = sorted[i];
      if (cur.from <= prev.to) {
        prev.to = Math.max(prev.to, cur.to);
      } else {
        merged.push({ ...cur });
      }
    }
    return merged;
  }
};

// ../shared/src/table-insert.ts
function cellIndexOf(line, ch) {
  let count = 0;
  for (let i = 0; i < ch && i < line.length; i++) {
    if (line[i] === "|") count++;
  }
  return count;
}
function cellStartCh(line, col) {
  if (col - 1 < 0) return 0;
  let seen = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "|" && ++seen === col) return i + 1;
  }
  return 0;
}
function cellTextEndCh(line, col) {
  var _a;
  const pipes = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "|") pipes.push(i);
  }
  const cellStart = col - 1 >= 0 ? ((_a = pipes[col - 1]) != null ? _a : -1) + 1 : 0;
  const cellEnd = col < pipes.length ? pipes[col] : line.length;
  if (cellStart > cellEnd || cellStart < 0) return null;
  const content = line.substring(cellStart, cellEnd);
  return cellStart + content.replace(/\s+$/, "").length;
}
var TableInsertTracker = class {
  /** No state is kept; provided for call-site symmetry with recording start. */
  reset() {
  }
  /**
   * Insert committed dictation text, table-aware.
   * @param onCommand — optional callback invoked with a voice command's id
   *   whenever one executes (drives command-feedback UI).
   * @returns whether a stop-recording command was hit.
   */
  commit(editor, tracker, text, onSlotActive, onCommand) {
    const selectionText = editor.getSelection();
    if (selectionText.length > 0) {
      const replacement = text.trim();
      if (!replacement) return false;
      const selLine = editor.getLine(editor.getCursor().line);
      if (isTableLine(selLine)) {
        vlog.debug(
          `Voxtral[table] replace-selection atomic line=${JSON.stringify(selLine)}`
        );
        editor.replaceSelection(replacement);
        return false;
      }
      editor.replaceSelection("");
    }
    const curPos = editor.getCursor();
    const line = editor.getLine(curPos.line);
    if (!isTableLine(line)) {
      vlog.debug(
        `Voxtral[table] off-table cur=${curPos.line}:${curPos.ch}`
      );
      return tracker.trackProcessText(editor, text, onSlotActive, void 0, onCommand).stop;
    }
    if (matchCommand(text)) {
      const col2 = cellIndexOf(line, curPos.ch);
      const insertCh = cellTextEndCh(line, col2);
      const posOverride = insertCh !== null ? { line: curPos.line, ch: insertCh } : void 0;
      vlog.debug(
        `Voxtral[table] command-append cell=${curPos.line}:col${col2} insertCh=${insertCh} line=${JSON.stringify(line)}`
      );
      const result = tracker.trackProcessText(
        editor,
        text,
        onSlotActive,
        posOverride,
        onCommand
      );
      this.reassertCursor(editor, curPos.line, col2);
      return result.stop;
    }
    const col = cellIndexOf(line, curPos.ch);
    const cStart = cellStartCh(line, col);
    const context = detectContext(line.substring(cStart, curPos.ch));
    let out = text;
    if (shouldLowercase(context)) out = lowercaseFirstLetter(out);
    if (shouldStripTrailingPunctuation(context)) {
      out = stripTrailingPunctuation(out);
    }
    const before = curPos.ch > 0 ? editor.getRange({ line: curPos.line, ch: curPos.ch - 1 }, curPos) : "";
    if (before && /\S/.test(before) && !/^[\s\n|]/.test(out)) out = " " + out;
    const charAfter = editor.getRange(curPos, {
      line: curPos.line,
      ch: curPos.ch + 1
    });
    if (charAfter && /\S/.test(charAfter) && /\S$/.test(out)) out = out + " ";
    vlog.debug(
      `Voxtral[table] cursor-insert PRE cur=${curPos.line}:${curPos.ch} ctx=${context} line=${JSON.stringify(line)}`
    );
    editor.replaceSelection(out);
    const after = editor.getCursor();
    vlog.debug(
      `Voxtral[table] cursor-insert POST cur=${after.line}:${after.ch}`
    );
    return false;
  }
  /**
   * Best-effort cosmetic: after the async reflow, drop the caret at the end of
   * the cell's text. Correctness no longer depends on this.
   */
  reassertCursor(editor, line, col) {
    setTimeout(() => {
      const l = editor.getLine(line);
      if (!isTableLine(l)) return;
      const ch = cellTextEndCh(l, col);
      if (ch !== null) editor.setCursor({ line, ch });
    }, 0);
  }
};

// ../shared/src/realtime-session.ts
var _RealtimeSession = class _RealtimeSession {
  constructor(settings, tracker, callbacks) {
    this.settings = settings;
    this.tracker = tracker;
    this.callbacks = callbacks;
    this.transcriber = null;
    this.pendingText = "";
    this.prevRaw = "";
    this.turnDelta = 0;
    this.turnProcessed = 0;
    this.consecutiveFailures = 0;
    this.maxConsecutiveFailures = 5;
    // Debounce for flushing on a trailing voice command that has no
    // sentence-ending punctuation (e.g. "nieuwe alinea"). Waiting briefly
    // lets cumulative deltas finish (e.g. "nieuw todo" → "nieuw todo item")
    // before we match and execute the command.
    this.commandFlushTimer = null;
    // Audio captured while the WebSocket is (re)connecting is buffered here
    // and flushed once the new session is ready. The Mistral realtime API
    // closes the connection after each utterance (silence), so without this
    // the first words spoken when resuming after a pause would be dropped.
    this.audioBuffer = [];
    this.audioBufferBytes = 0;
    // Warn once per disconnected episode (not per chunk) when audio starts
    // piling up in the buffer instead of reaching the transcriber — a long
    // disconnect eventually overflows MAX_AUDIO_BUFFER_BYTES and genuinely
    // loses audio, so this is a useful early signal without being spammy.
    this.disconnectedAudioWarned = false;
    // Keeps dictation appending in the right table cell despite Obsidian
    // resetting the cursor after its async table re-render.
    this.tableInserter = new TableInsertTracker();
    // Resolved by handleDone() as soon as the final "done" event for the
    // current turn arrives after stop() calls endAudio(). stop() races this
    // against a fixed ceiling so it doesn't wait the full ceiling when the
    // API responds promptly (VX_E27_S1 item 6).
    this.pendingDoneResolve = null;
  }
  /** Connect the WebSocket and start receiving transcription. */
  async start(editor) {
    this.pendingText = "";
    this.prevRaw = "";
    this.turnDelta = 0;
    this.turnProcessed = 0;
    this.consecutiveFailures = 0;
    this.clearCommandFlushTimer();
    this.audioBuffer = [];
    this.audioBufferBytes = 0;
    this.disconnectedAudioWarned = false;
    this.tableInserter.reset();
    await this.connectWebSocket(editor);
  }
  /** Insert committed dictation text (table-aware; see TableInsertTracker). */
  commit(editor, text) {
    this.tableInserter.commit(
      editor,
      this.tracker,
      text,
      () => this.callbacks.updateStatusBar("slot"),
      (commandId) => {
        var _a, _b;
        return (_b = (_a = this.callbacks).onCommandExecuted) == null ? void 0 : _b.call(_a, commandId);
      }
    );
  }
  clearCommandFlushTimer() {
    if (this.commandFlushTimer) {
      clearTimeout(this.commandFlushTimer);
      this.commandFlushTimer = null;
    }
  }
  /** Send PCM audio data to the transcriber. */
  sendAudio(pcmData) {
    var _a;
    if ((_a = this.transcriber) == null ? void 0 : _a.isConnected) {
      this.disconnectedAudioWarned = false;
      this.transcriber.sendAudio(pcmData);
    } else {
      if (!this.disconnectedAudioWarned) {
        this.disconnectedAudioWarned = true;
        vlog.warn(
          "Voxtral: audio arriving while transcriber is disconnected \u2014 buffering until reconnect"
        );
      }
      this.bufferAudio(pcmData);
    }
  }
  /** Buffer audio during a (re)connect, capped to bound memory. */
  bufferAudio(pcmData) {
    this.audioBuffer.push(pcmData);
    this.audioBufferBytes += pcmData.byteLength;
    while (this.audioBufferBytes > _RealtimeSession.MAX_AUDIO_BUFFER_BYTES && this.audioBuffer.length > 1) {
      const dropped = this.audioBuffer.shift();
      if (dropped) this.audioBufferBytes -= dropped.byteLength;
    }
  }
  /** Send any buffered audio once the (new) session is connected. */
  flushAudioBuffer() {
    var _a;
    if (!((_a = this.transcriber) == null ? void 0 : _a.isConnected) || this.audioBuffer.length === 0) {
      return;
    }
    const buffered = this.audioBuffer;
    this.audioBuffer = [];
    this.audioBufferBytes = 0;
    for (const chunk of buffered) {
      this.transcriber.sendAudio(chunk);
    }
  }
  /** Signal end of audio and finalize any pending text. */
  async stop(editor) {
    var _a, _b;
    (_a = this.transcriber) == null ? void 0 : _a.endAudio();
    this.clearCommandFlushTimer();
    const doneSignal = new Promise((resolve) => {
      this.pendingDoneResolve = resolve;
    });
    const ceiling = new Promise((resolve) => setTimeout(resolve, 1e3));
    await Promise.race([doneSignal, ceiling]);
    this.pendingDoneResolve = null;
    if (this.pendingText.trim()) {
      this.commit(editor, this.pendingText.trim());
      this.pendingText = "";
    }
    (_b = this.transcriber) == null ? void 0 : _b.close();
    this.transcriber = null;
    this.audioBuffer = [];
    this.audioBufferBytes = 0;
  }
  /** Flush any remaining pending text (called after slot close). */
  flushAfterSlot(editor) {
    if (this.pendingText.trim()) {
      this.commit(editor, this.pendingText.trim() + " ");
      this.pendingText = "";
    }
  }
  // ── WebSocket lifecycle ──
  async connectWebSocket(editor) {
    this.transcriber = new RealtimeTranscriber(this.settings, {
      onSessionCreated: () => {
        vlog.debug("Voxtral: Realtime session created");
      },
      onDelta: (text) => {
        this.handleDelta(editor, text);
      },
      onDone: (text) => {
        this.handleDone(editor, text);
      },
      onError: (message) => {
        vlog.error("Voxtral: Realtime error:", message);
        this.callbacks.notify(`Streaming error: ${message}`);
      },
      onDisconnect: () => {
        void this.handleDisconnect();
      }
    });
    await this.transcriber.connect();
    this.flushAudioBuffer();
  }
  /**
   * Handle WebSocket closure during recording.
   *
   * The Mistral realtime API closes the connection after each
   * transcription.done event (end of utterance / silence detected).
   * This is NORMAL — not an error. We silently reconnect so the
   * user can keep talking without interruption.
   *
   * Only shows a warning if reconnection fails repeatedly.
   */
  async handleDisconnect() {
    if (!this.callbacks.isRecording()) return;
    const editor = this.callbacks.getEditor();
    if (!editor) {
      this.callbacks.stopRecording();
      return;
    }
    vlog.debug("Voxtral: Session ended, reconnecting silently...");
    this.prevRaw = "";
    this.turnDelta = 0;
    this.turnProcessed = 0;
    this.clearCommandFlushTimer();
    try {
      await this.connectWebSocket(editor);
      this.consecutiveFailures = 0;
      vlog.debug("Voxtral: Session reconnected");
    } catch (e) {
      this.consecutiveFailures++;
      console.error(
        `Voxtral: Reconnect failed (${this.consecutiveFailures}/${this.maxConsecutiveFailures})`,
        e
      );
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        this.callbacks.notify(
          "Cannot connect to the API. Recording stopped.",
          6e3
        );
        this.callbacks.stopRecording();
        return;
      }
      const delay = Math.min(
        500 * this.consecutiveFailures,
        3e3
      );
      await new Promise(
        (resolve) => setTimeout(resolve, delay)
      );
      if (this.callbacks.isRecording()) {
        void this.handleDisconnect();
      }
    }
  }
  // ── Delta / Done text processing ──
  handleDelta(editor, text) {
    const isCumulative = this.prevRaw && text.startsWith(this.prevRaw);
    const newText = isCumulative ? text.substring(this.prevRaw.length) : text;
    this.prevRaw = isCumulative ? text : this.prevRaw + text;
    if (!newText) return;
    this.pendingText += newText;
    this.turnDelta += newText.length;
    const sentenceEnd = /[.!?]\s*$/;
    const longEnough = this.pendingText.length > 120;
    if (sentenceEnd.test(this.pendingText) || longEnough) {
      this.clearCommandFlushTimer();
      this.flushPending(editor);
      return;
    }
    if (matchCommand(this.pendingText.trim())) {
      this.clearCommandFlushTimer();
      this.commandFlushTimer = setTimeout(() => {
        this.commandFlushTimer = null;
        this.flushPending(editor);
      }, _RealtimeSession.COMMAND_FLUSH_DEBOUNCE_MS);
    }
  }
  /**
   * Process and commit the accumulated pending text. Recognizes the
   * "stop recording" voice command; otherwise hands the text to the
   * tracker for command matching and insertion.
   */
  flushPending(editor) {
    const sentence = this.pendingText.trim();
    if (!sentence) {
      this.pendingText = "";
      return;
    }
    this.turnProcessed += this.pendingText.length;
    this.pendingText = "";
    const normalized = normalizeCommand(sentence);
    const stopPatterns = [
      "beeindig opname",
      "beeindig de opname",
      "beeindigt opname",
      "beeindigt de opname",
      "beeindigde opname",
      "beeindigde de opname",
      "stop opname",
      "stopopname",
      "stop de opname",
      "stop recording"
    ];
    if (stopPatterns.some((p) => normalized.includes(p))) {
      this.callbacks.stopRecording();
      return;
    }
    this.commit(editor, sentence + " ");
  }
  handleDone(editor, doneText) {
    if (doneText && doneText.length > this.turnDelta) {
      this.pendingText += doneText.substring(this.turnDelta);
    }
    this.clearCommandFlushTimer();
    const trimmed = this.pendingText.trim();
    if (trimmed) {
      let textToCommit = trimmed;
      if (!/[.!?:,]$/.test(trimmed) && !matchCommand(trimmed)) {
        textToCommit = trimmed + ".";
      }
      this.commit(editor, textToCommit + " ");
      this.pendingText = "";
    }
    this.turnDelta = 0;
    this.turnProcessed = 0;
    if (this.pendingDoneResolve) {
      const resolve = this.pendingDoneResolve;
      this.pendingDoneResolve = null;
      resolve();
    }
  }
};
_RealtimeSession.COMMAND_FLUSH_DEBOUNCE_MS = 400;
// Cap the buffer so a long disconnect can't grow memory without bound.
// 16kHz · 16-bit · mono = 32000 bytes/s, so this holds ~10s of audio.
_RealtimeSession.MAX_AUDIO_BUFFER_BYTES = 32e4;
var RealtimeSession = _RealtimeSession;

// ../shared/src/dual-delay-session.ts
var _DualDelaySession = class _DualDelaySession {
  constructor(settings, tracker, callbacks) {
    this.settings = settings;
    this.tracker = tracker;
    this.callbacks = callbacks;
    this.fastTranscriber = null;
    this.slowTranscriber = null;
    // Session state
    this.state = "idle" /* Idle */;
    // Text accumulators
    this.fastText = "";
    this.slowText = "";
    this.fastPrevRaw = "";
    this.slowPrevRaw = "";
    this.slowTurnDelta = 0;
    // Editor state
    this.insertOffset = 0;
    this.displayLen = 0;
    this.slowCommitted = 0;
    this.commandJustRan = false;
    // Remainder command debounce — prevents premature matching when
    // cumulative deltas haven't finished (e.g. "nieuw todo" matching
    // before the full "nieuw todo item" arrives)
    this.remainderTimer = null;
    // Reconnection
    this.consecutiveFailures = 0;
    this.maxConsecutiveFailures = 5;
    // Unlike RealtimeSession, this session has no reconnect audio buffer —
    // audio sent while a stream is down is genuinely lost. Warn once per
    // disconnected episode per stream (not per chunk) so this is visible
    // without spamming the log.
    this.fastAudioDropWarned = false;
    this.slowAudioDropWarned = false;
    // Resolved as soon as the slow stream's "done" event for the current
    // turn arrives after stop() calls endAudio() — slow is the accuracy
    // source of truth used for finalization. stop() races this against a
    // fixed ceiling (VX_E27_S1 item 6).
    this.pendingDoneResolve = null;
  }
  /** Resolve a pending stop() waiting on the slow stream's final done event. */
  signalDone() {
    if (this.pendingDoneResolve) {
      const resolve = this.pendingDoneResolve;
      this.pendingDoneResolve = null;
      resolve();
    }
  }
  /** Transition to a new state with debug logging. */
  setState(newState) {
    const prev = this.state;
    this.state = newState;
    vlog.debug(`Voxtral: DualDelay state: ${prev} \u2192 ${newState}`);
  }
  /** Connect both WebSocket streams and initialize state. */
  async start(editor) {
    this.setState("connecting" /* Connecting */);
    this.fastText = "";
    this.slowText = "";
    this.insertOffset = editor.posToOffset(editor.getCursor());
    this.displayLen = 0;
    this.slowCommitted = 0;
    this.slowTurnDelta = 0;
    this.fastPrevRaw = "";
    this.slowPrevRaw = "";
    this.commandJustRan = false;
    this.consecutiveFailures = 0;
    this.fastAudioDropWarned = false;
    this.slowAudioDropWarned = false;
    if (this.remainderTimer) {
      clearTimeout(this.remainderTimer);
      this.remainderTimer = null;
    }
    await this.connectWebSockets(editor);
    this.setState("streaming" /* Streaming */);
  }
  /** Update insert offset after a slot closes so subsequent text
   *  continues at the correct cursor position. */
  flushAfterSlot(editor) {
    this.insertOffset = editor.posToOffset(editor.getCursor());
  }
  /** Send PCM audio data to both transcribers. */
  sendAudio(pcmData) {
    var _a, _b;
    if ((_a = this.fastTranscriber) == null ? void 0 : _a.isConnected) {
      this.fastAudioDropWarned = false;
      this.fastTranscriber.sendAudio(pcmData);
    } else if (!this.fastAudioDropWarned) {
      this.fastAudioDropWarned = true;
      vlog.warn(
        "Voxtral: dropping audio \u2014 fast stream not connected (no reconnect buffer)"
      );
    }
    if ((_b = this.slowTranscriber) == null ? void 0 : _b.isConnected) {
      this.slowAudioDropWarned = false;
      this.slowTranscriber.sendAudio(pcmData);
    } else if (!this.slowAudioDropWarned) {
      this.slowAudioDropWarned = true;
      vlog.warn(
        "Voxtral: dropping audio \u2014 slow stream not connected (no reconnect buffer)"
      );
    }
  }
  /** Finalize the session: flush remaining text and close streams. */
  async stop() {
    var _a, _b, _c, _d;
    this.setState("finalizing" /* Finalizing */);
    (_a = this.fastTranscriber) == null ? void 0 : _a.endAudio();
    (_b = this.slowTranscriber) == null ? void 0 : _b.endAudio();
    if (this.remainderTimer) {
      clearTimeout(this.remainderTimer);
      this.remainderTimer = null;
    }
    const doneSignal = new Promise((resolve) => {
      this.pendingDoneResolve = resolve;
    });
    const ceiling = new Promise((resolve) => setTimeout(resolve, 1e3));
    await Promise.race([doneSignal, ceiling]);
    this.pendingDoneResolve = null;
    const editor = this.callbacks.getEditor();
    if (editor) {
      this.executeRemainderCommand(editor);
      this.processSlowCommands(editor);
      const finalText = this.slowText || this.fastText;
      if (finalText) {
        const from = editor.offsetToPos(this.insertOffset);
        const to = editor.offsetToPos(
          this.insertOffset + this.displayLen
        );
        editor.replaceRange(finalText, from, to);
        const endOffset = this.insertOffset + finalText.length;
        editor.setCursor(editor.offsetToPos(endOffset));
        this.tracker.addRange(
          this.insertOffset,
          this.insertOffset + finalText.length
        );
      }
    }
    (_c = this.fastTranscriber) == null ? void 0 : _c.close();
    (_d = this.slowTranscriber) == null ? void 0 : _d.close();
    this.fastTranscriber = null;
    this.slowTranscriber = null;
    this.fastText = "";
    this.slowText = "";
    this.displayLen = 0;
    this.slowCommitted = 0;
    this.slowTurnDelta = 0;
    this.setState("idle" /* Idle */);
  }
  // ── WebSocket lifecycle ──
  async connectWebSockets(editor) {
    const fastDelay = this.settings.dualDelayFastMs;
    const slowDelay = this.settings.dualDelaySlowMs;
    this.fastTranscriber = new RealtimeTranscriber(
      this.settings,
      {
        onSessionCreated: () => {
          vlog.debug(
            "Voxtral: Fast stream session created"
          );
        },
        onDelta: (text) => {
          this.handleFastDelta(text);
          this.renderText(editor);
        },
        onDone: () => {
          this.renderText(editor);
        },
        onError: (message) => {
          vlog.error(
            "Voxtral: Fast stream error:",
            message
          );
        },
        onDisconnect: () => {
          void this.handleStreamDisconnect("fast");
        }
      },
      fastDelay
    );
    this.slowTranscriber = new RealtimeTranscriber(
      this.settings,
      {
        onSessionCreated: () => {
          vlog.debug(
            "Voxtral: Slow stream session created"
          );
        },
        onDelta: (text) => {
          this.handleSlowDelta(text);
          this.renderText(editor);
          this.processSlowCommands(editor);
        },
        onDone: () => {
          this.renderText(editor);
          this.processSlowCommands(editor);
          this.signalDone();
        },
        onError: (message) => {
          vlog.error(
            "Voxtral: Slow stream error:",
            message
          );
        },
        onDisconnect: () => {
          void this.handleStreamDisconnect("slow");
        }
      },
      slowDelay
    );
    await Promise.all([
      this.fastTranscriber.connect(),
      this.slowTranscriber.connect()
    ]);
  }
  async handleStreamDisconnect(stream) {
    if (!this.callbacks.isRecording()) return;
    const editor = this.callbacks.getEditor();
    if (!editor) {
      this.callbacks.stopRecording();
      return;
    }
    this.setState("reconnecting" /* Reconnecting */);
    vlog.debug(
      `Voxtral: ${stream} stream ended, reconnecting...`
    );
    try {
      if (stream === "fast") {
        await this.reconnectFastStream(editor);
      } else {
        await this.reconnectSlowStream(editor);
      }
      this.consecutiveFailures = 0;
      this.setState("streaming" /* Streaming */);
    } catch (e) {
      this.consecutiveFailures++;
      vlog.error(
        `Voxtral: ${stream} stream reconnect failed (${this.consecutiveFailures})`,
        e
      );
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        this.callbacks.notify(
          "Cannot reconnect. Recording stopped.",
          6e3
        );
        this.callbacks.stopRecording();
        return;
      }
      const delay = Math.min(
        500 * this.consecutiveFailures,
        3e3
      );
      await new Promise(
        (resolve) => setTimeout(resolve, delay)
      );
      if (this.callbacks.isRecording()) {
        void this.handleStreamDisconnect(stream);
      }
    }
  }
  async reconnectFastStream(editor) {
    const fastDelay = this.settings.dualDelayFastMs;
    this.fastPrevRaw = "";
    this.fastTranscriber = new RealtimeTranscriber(
      this.settings,
      {
        onSessionCreated: () => vlog.debug(
          "Voxtral: Fast stream reconnected"
        ),
        onDelta: (text) => {
          this.handleFastDelta(text);
          this.renderText(editor);
        },
        onDone: () => this.renderText(editor),
        onError: (message) => vlog.error(
          "Voxtral: Fast stream error:",
          message
        ),
        onDisconnect: () => void this.handleStreamDisconnect("fast")
      },
      fastDelay
    );
    await this.fastTranscriber.connect();
  }
  async reconnectSlowStream(editor) {
    if (this.remainderTimer) {
      clearTimeout(this.remainderTimer);
      this.remainderTimer = null;
    }
    this.executeRemainderCommand(editor);
    if (this.slowText.trim()) {
      const from = editor.offsetToPos(this.insertOffset);
      const to = editor.offsetToPos(
        this.insertOffset + this.displayLen
      );
      editor.replaceRange("", from, to);
      editor.setCursor(from);
      this.displayLen = 0;
      this.tracker.trackInsertAtCursor(editor, this.slowText);
      this.insertOffset = editor.posToOffset(
        editor.getCursor()
      );
    }
    this.slowCommitted = 0;
    this.slowText = "";
    this.fastText = "";
    this.slowTurnDelta = 0;
    this.slowPrevRaw = "";
    this.fastPrevRaw = "";
    const slowDelay = this.settings.dualDelaySlowMs;
    this.slowTranscriber = new RealtimeTranscriber(
      this.settings,
      {
        onSessionCreated: () => vlog.debug(
          "Voxtral: Slow stream reconnected"
        ),
        onDelta: (text) => {
          this.handleSlowDelta(text);
          this.renderText(editor);
          this.processSlowCommands(editor);
        },
        onDone: () => {
          this.renderText(editor);
          this.processSlowCommands(editor);
          this.signalDone();
        },
        onError: (message) => vlog.error(
          "Voxtral: Slow stream error:",
          message
        ),
        onDisconnect: () => void this.handleStreamDisconnect("slow")
      },
      slowDelay
    );
    await this.slowTranscriber.connect();
  }
  // ── Delta handlers ──
  handleFastDelta(text) {
    const isCumulative = this.fastPrevRaw && text.startsWith(this.fastPrevRaw);
    let newPart = isCumulative ? text.substring(this.fastPrevRaw.length) : text;
    this.fastPrevRaw = isCumulative ? text : this.fastPrevRaw + text;
    if (!newPart) return;
    if (isSlotActive() && this.fastText === "") {
      newPart = newPart.replace(/^\s+/, "");
      if (!newPart) return;
    }
    this.fastText += newPart;
  }
  handleSlowDelta(text) {
    const isCumulative = this.slowPrevRaw && text.startsWith(this.slowPrevRaw);
    let newPart = isCumulative ? text.substring(this.slowPrevRaw.length) : text;
    this.slowPrevRaw = isCumulative ? text : this.slowPrevRaw + text;
    if (!newPart) return;
    if (isSlotActive() && this.slowText === "") {
      newPart = newPart.replace(/^\s+/, "");
      if (!newPart) return;
    }
    this.slowText += newPart;
    this.slowTurnDelta += newPart.length;
  }
  // ── Editor rendering ──
  /**
   * Update the editor with the current dual-delay text.
   * Shows slow (confirmed) text + any fast text beyond slow.
   */
  renderText(editor) {
    const cursorOffset = editor.posToOffset(editor.getCursor());
    const expectedEnd = this.insertOffset + this.displayLen;
    if (cursorOffset !== expectedEnd) {
      if (this.displayLen > 0) {
        const slowText = this.slowText;
        const from2 = editor.offsetToPos(this.insertOffset);
        const to2 = editor.offsetToPos(expectedEnd);
        editor.replaceRange(slowText, from2, to2);
        const shift = slowText.length - this.displayLen;
        const newCursor = cursorOffset >= expectedEnd ? cursorOffset + shift : cursorOffset;
        editor.setCursor(editor.offsetToPos(newCursor));
        this.slowCommitted += slowText.length;
        this.slowText = "";
        this.fastText = "";
        this.displayLen = 0;
        this.insertOffset = newCursor;
        return;
      }
      this.insertOffset = cursorOffset;
    }
    const slowLen = this.slowText.length;
    const fastLen = this.fastText.length;
    let displayText;
    if (fastLen > slowLen) {
      displayText = this.slowText + this.fastText.substring(slowLen);
    } else {
      displayText = this.slowText;
    }
    const from = editor.offsetToPos(this.insertOffset);
    const to = editor.offsetToPos(
      this.insertOffset + this.displayLen
    );
    if (this.displayLen === 0 && /^\s/.test(displayText)) {
      const charBefore = from.ch > 0 ? editor.getRange(
        { line: from.line, ch: from.ch - 1 },
        from
      ) : "";
      if (from.ch === 0 || charBefore === " " || charBefore === "	") {
        displayText = displayText.replace(/^\s+/, "");
        this.slowText = this.slowText.replace(/^\s+/, "");
        this.fastText = this.fastText.replace(/^\s+/, "");
      }
    }
    editor.replaceRange(displayText, from, to);
    this.displayLen = displayText.length;
    const endOffset = this.insertOffset + this.displayLen;
    editor.setCursor(editor.offsetToPos(endOffset));
  }
  // ── Voice command processing ──
  /**
   * Process voice commands from the slow stream (more accurate).
   * Checks completed sentences in slowText for voice commands.
   */
  processSlowCommands(editor) {
    var _a, _b;
    if (!this.slowText) return;
    if (this.commandJustRan && /^[\s.!?,;:]*$/.test(this.slowText)) {
      this.commandJustRan = false;
      if (this.displayLen > 0) {
        const from2 = editor.offsetToPos(this.insertOffset);
        const to2 = editor.offsetToPos(
          this.insertOffset + this.displayLen
        );
        editor.replaceRange("", from2, to2);
        editor.setCursor(from2);
        this.displayLen = 0;
      }
      this.slowCommitted += this.slowText.length;
      this.slowText = "";
      this.fastText = "";
      this.insertOffset = editor.posToOffset(
        editor.getCursor()
      );
      return;
    }
    this.commandJustRan = false;
    const segments = this.slowText.match(
      /[^.!?]+[.!?]+\s*/g
    );
    const segmentText = segments ? segments.join("") : "";
    const remainder = this.slowText.substring(segmentText.length);
    if (!segments && remainder.trim()) {
      const cmdMatch = matchCommand(remainder.trim());
      if (cmdMatch && !cmdMatch.textBefore) {
        if (this.remainderTimer) clearTimeout(this.remainderTimer);
        this.remainderTimer = setTimeout(() => {
          this.remainderTimer = null;
          this.executeRemainderCommand(editor);
        }, _DualDelaySession.REMAINDER_DEBOUNCE_MS);
        return;
      }
      return;
    }
    if (this.remainderTimer) {
      clearTimeout(this.remainderTimer);
      this.remainderTimer = null;
    }
    if (!segments) return;
    const matchedLength = segmentText.length;
    const from = editor.offsetToPos(this.insertOffset);
    const to = editor.offsetToPos(
      this.insertOffset + this.displayLen
    );
    editor.replaceRange("", from, to);
    editor.setCursor(from);
    this.displayLen = 0;
    for (const segment of segments) {
      const match = matchCommand(segment);
      if (match) {
        if (match.textBefore) {
          let before = match.textBefore;
          if (match.command.punctuation) {
            before = before.replace(
              /[,;.!?]+\s*$/,
              ""
            );
          }
          this.tracker.trackInsertAtCursor(
            editor,
            before
          );
        }
        executeCommand(editor, match.command);
        (_b = (_a = this.callbacks).onCommandExecuted) == null ? void 0 : _b.call(_a, match.command.id);
        this.commandJustRan = true;
        if (match.command.id === "stopRecording") {
          setTimeout(
            () => this.callbacks.stopRecording(),
            0
          );
        }
        if (isSlotActive()) {
          this.callbacks.updateStatusBar("slot");
        }
      } else {
        this.tracker.trackInsertAtCursor(editor, segment);
      }
    }
    this.slowCommitted += matchedLength;
    this.slowText = remainder;
    this.fastText = "";
    this.insertOffset = editor.posToOffset(editor.getCursor());
    this.displayLen = 0;
    if (this.slowText || this.fastText) {
      this.renderText(editor);
    }
  }
  /**
   * Execute a standalone voice command from the remainder text.
   * Called after the debounce timer fires (no new deltas arrived).
   * Re-checks the match in case text changed before the timer fired.
   */
  executeRemainderCommand(editor) {
    var _a, _b;
    if (!this.slowText) return;
    const segments = this.slowText.match(/[^.!?]+[.!?]+\s*/g);
    if (segments) {
      this.processSlowCommands(editor);
      return;
    }
    const cmdMatch = matchCommand(this.slowText.trim());
    if (!cmdMatch || cmdMatch.textBefore) return;
    const from = editor.offsetToPos(this.insertOffset);
    const to = editor.offsetToPos(
      this.insertOffset + this.displayLen
    );
    editor.replaceRange("", from, to);
    editor.setCursor(from);
    this.displayLen = 0;
    executeCommand(editor, cmdMatch.command);
    (_b = (_a = this.callbacks).onCommandExecuted) == null ? void 0 : _b.call(_a, cmdMatch.command.id);
    if (cmdMatch.command.id === "stopRecording") {
      setTimeout(
        () => this.callbacks.stopRecording(),
        0
      );
    }
    if (isSlotActive()) {
      this.callbacks.updateStatusBar("slot");
    }
    this.commandJustRan = true;
    this.slowCommitted += this.slowText.length;
    this.slowText = "";
    this.fastText = "";
    this.insertOffset = editor.posToOffset(
      editor.getCursor()
    );
  }
};
_DualDelaySession.REMAINDER_DEBOUNCE_MS = 400;
var DualDelaySession = _DualDelaySession;

// src/recording-indicator.ts
var BASE_CLASS = "voxtral-rec-indicator";
var STATE_CLASSES = {
  recording: "voxtral-rec-indicator--recording",
  paused: "voxtral-rec-indicator--paused",
  reconnecting: "voxtral-rec-indicator--reconnecting"
};
var ALL_STATE_CLASSES = Object.values(STATE_CLASSES);
var RecordingIndicator = class {
  constructor() {
    this.el = null;
  }
  /** Whether the dot is currently in the DOM. */
  get isAttached() {
    return this.el !== null;
  }
  /**
   * Create the dot inside `host` and set its initial state. Idempotent —
   * detaches any previous dot first (mirrors addSendButton's own
   * removeSendButton()-first pattern).
   */
  attach(host, initialState) {
    this.detach();
    this.el = host.createDiv({ cls: BASE_CLASS });
    this.setState(initialState);
  }
  /**
   * Update the visual state. No-op when not attached (e.g. desktop, or
   * after stop/unload) — safe to call unconditionally from the same
   * switchboard that drives the status bar.
   */
  setState(state) {
    if (!this.el) return;
    this.el.removeClass(...ALL_STATE_CLASSES);
    this.el.addClass(STATE_CLASSES[state]);
  }
  /** Remove the dot from the DOM, if present. Safe to call repeatedly. */
  detach() {
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
  }
};

// src/main.ts
var INDICATOR_STATE_MAP = {
  idle: "recording",
  recording: "recording",
  slot: "recording",
  processing: "recording",
  paused: "paused",
  reconnecting: "reconnecting"
};
var VoxtralPlugin = class extends import_obsidian9.Plugin {
  constructor() {
    super(...arguments);
    this.realtimeSession = null;
    this.dualDelaySession = null;
    this.tracker = new DictationTracker();
    // Table-aware insertion for the batch/chunk path (used on mobile, where
    // realtime streaming is unavailable). Keeps dictation appending in the
    // right table cell despite Obsidian's async table-widget cursor reset.
    this.batchInserter = new TableInsertTracker();
    this.isRecording = false;
    this.isPaused = false;
    this.isTypingMuted = false;
    // `window.setTimeout` (Obsidian/DOM runtime) returns a numeric handle.
    this.typingResumeTimer = null;
    this.focusPauseTimer = null;
    this.statusBarEl = null;
    // Handle for the transient command-feedback flash (status bar text reverts
    // to the recording display once this fires) — kept so an overlapping
    // command resets the timer cleanly instead of stacking reverts.
    this.commandFeedbackTimer = null;
    this.sendRibbonEl = null;
    this.mobileActionEl = null;
    // Persistent recording/paused/reconnecting dot in the mobile view header
    // (VX_E27_S9) — the only always-visible recording cue on mobile, since
    // there's no status bar there. Lifecycle shares addSendButton/
    // removeSendButton (see below) so cleanup can't be forgotten.
    this.recordingIndicator = new RecordingIndicator();
    this.chunkIndex = 0;
    // "Listen back" playback (E26): play decoded audio via the Web Audio API. A
    // blob: URL in an HTMLAudioElement fails on the mobile WebView ("no supported
    // source"), so we decode the bytes and play a buffer source instead — a single
    // context/source so Stop and a new read just replace the current one.
    // Owned by PlaybackController (VX_E27_S2) — see playback-controller.ts.
    this.playback = new PlaybackController();
    this.consecutiveFailures = 0;
    this.maxConsecutiveFailures = 5;
    this.currentEditor = null;
    // Per-note language override (VX_E27_S8): resolved once at recording
    // start from the active note's `voxtral-language` frontmatter and held
    // fixed for the session (mid-recording note/frontmatter changes are out
    // of scope). `null` while not recording, so every other read of language
    // keeps falling through to `settings.language` unchanged.
    this.activeLanguage = null;
    // Vault vocabulary (VX_E27_S7): collected once at recording start (from the
    // active note) and held for the session, mirroring `activeLanguage`'s
    // lifecycle — see `recordingSettings`. Empty when `vaultVocabulary` is off.
    this.sessionVocabularyTerms = [];
    // Same idea for file transcription (VX_E27_S2 pipeline), collected once per
    // `.transcribe()` call from the output-target note (if any) — see
    // `fileTranscriptSettings`.
    this.fileTranscriptVocabularyTerms = [];
    /** Platform adapter: wraps Obsidian's requestUrl as HttpRequestFn */
    this.httpRequest = async (options) => {
      const response = await (0, import_obsidian9.requestUrl)({
        url: options.url,
        method: options.method,
        headers: options.headers,
        body: options.body,
        throw: false
      });
      let json = void 0;
      try {
        json = response.json;
      } catch (e) {
        json = void 0;
      }
      return {
        status: response.status,
        json,
        text: response.text,
        // Binary endpoints (TTS audio, E26) read this instead of json/text.
        arrayBuffer: response.arrayBuffer
      };
    };
  }
  /** Whether realtime mode is available on this platform */
  get canRealtime() {
    return !import_obsidian9.Platform.isMobile;
  }
  /** Effective mode: fall back to batch on mobile */
  get effectiveMode() {
    if (this.settings.mode === "realtime" && this.canRealtime) {
      return "realtime";
    }
    return "batch";
  }
  /**
   * Settings for the current recording session (VX_E27_S8): a shallow copy
   * with `language` swapped for the resolved per-note override, or
   * `this.settings` unchanged when there's no active override. Every
   * transcription/correction call tied to a recording session should read
   * through this getter (not `this.settings` directly) so the override
   * reaches the API without ever mutating the persisted settings object.
   */
  get recordingSettings() {
    const base = this.activeLanguage !== null ? { ...this.settings, language: this.activeLanguage } : this.settings;
    return this.withVocabulary(base, this.sessionVocabularyTerms);
  }
  /**
   * Settings for the current file-transcription call (VX_E27_S7): same
   * shallow-copy-overlay pattern as `recordingSettings`, but scoped to
   * `fileTranscriptVocabularyTerms` (collected per `.transcribe()` call, not
   * per recording session — file transcription has no "session").
   */
  get fileTranscriptSettings() {
    return this.withVocabulary(this.settings, this.fileTranscriptVocabularyTerms);
  }
  /**
   * Overlay `vocabularyTerms` onto a shallow copy of `settings` when there
   * are terms to add (VX_E27_S7) — `settings` is returned unchanged
   * otherwise, so callers with no active vault-vocabulary session never pay
   * for a copy. `vocabularyTerms` is never set on `this.settings` itself, so
   * it's never persisted by `saveSettings()`.
   */
  withVocabulary(settings, terms) {
    return terms.length > 0 ? { ...settings, vocabularyTerms: terms } : settings;
  }
  /**
   * Spoken wikilinks (VX_E27_S7, stage 2): after a correction pass, wrap
   * exact vault-term matches in `[[...]]`. Local-only string post-processing
   * (nothing extra is sent to the API) — a no-op unless both `vaultWikilinks`
   * is on and vocabulary terms were actually collected for this call.
   */
  applyWikilinksIfEnabled(text, settings) {
    var _a;
    return settings.vaultWikilinks && ((_a = settings.vocabularyTerms) == null ? void 0 : _a.length) ? applyVaultWikilinks(text, settings.vocabularyTerms) : text;
  }
  /**
   * Resolve the effective language for `file`'s `voxtral-language`
   * frontmatter (VX_E27_S8), falling back to the global setting when the
   * note has none, isn't a markdown file, or the value isn't a supported
   * language code. Reads via `metadataCache` only — no parsing of our own.
   */
  resolveEffectiveLanguageForFile(file) {
    var _a, _b;
    const raw = file ? (_b = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter) == null ? void 0 : _b["voxtral-language"] : void 0;
    return resolveLanguageOverride(raw, this.settings.language);
  }
  /** Callbacks shared by realtime and dual-delay sessions. */
  get sessionCallbacks() {
    return {
      updateStatusBar: (state) => this.updateStatusBar(state),
      stopRecording: () => {
        void this.stopRecording();
      },
      isRecording: () => this.isRecording,
      getEditor: () => {
        var _a;
        return this.currentEditor || ((_a = this.app.workspace.getActiveViewOfType(import_obsidian9.MarkdownView)) == null ? void 0 : _a.editor) || null;
      },
      notify: (msg, dur) => new import_obsidian9.Notice(msg, dur),
      onCommandExecuted: (commandId) => this.handleCommandExecuted(commandId)
    };
  }
  async onload() {
    await this.loadSettings();
    setDebugLogging(this.settings.debugLogging);
    vlog.debug(
      `Voxtral: plugin loaded (debug logging on), mode=${this.settings.mode}`
    );
    this.recorder = new AudioRecorder();
    this.fileTranscriptionService = new FileTranscriptionService({
      app: this.app,
      getSettings: () => this.fileTranscriptSettings,
      httpRequest: this.httpRequest,
      updateStatusBar: (state) => this.updateStatusBar(state),
      saveSettings: () => this.saveSettings()
    });
    this.registerView(
      VIEW_TYPE_VOXTRAL_HELP,
      (leaf) => new VoxtralHelpView(leaf, this)
    );
    this.addRibbonIcon("mic", "Voxtral: start/stop recording", () => {
      void this.toggleRecording();
    });
    if (!import_obsidian9.Platform.isMobile) {
      this.statusBarEl = this.addStatusBarItem();
      this.statusBarEl.addClass("mod-clickable");
      this.statusBarEl.setAttribute("aria-label", "Voxtral \u2014 open the voice help panel");
      this.registerDomEvent(this.statusBarEl, "click", () => {
        void this.openHelpPanel({ keepEditorFocus: true });
      });
      this.updateStatusBar("idle");
    }
    this.addCommand({
      id: "toggle-recording",
      name: "Start/stop recording",
      icon: "mic",
      callback: () => {
        void this.toggleRecording();
      }
    });
    this.addCommand({
      id: "send-chunk",
      name: "Send audio chunk (tap-to-send)",
      icon: "send",
      callback: () => {
        void this.sendChunk();
      }
    });
    this.addCommand({
      id: "open-help-panel",
      name: "Show voice help panel",
      icon: "help-circle",
      callback: () => {
        void this.openHelpPanel();
      }
    });
    this.addCommand({
      id: "export-logs",
      name: "Export logs to file",
      icon: "file-text",
      callback: () => {
        void this.exportLogs();
      }
    });
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof import_obsidian9.TFile) || !isAudioFile(file.extension)) {
          return;
        }
        menu.addItem(
          (item) => item.setTitle("Transcribe audio file").setIcon("file-audio").onClick(() => {
            void this.transcribeFileFromMenu(file);
          })
        );
      })
    );
    this.addCommand({
      id: "correct-selection",
      name: "Correct selected text",
      icon: "spell-check",
      editorCallback: (editor) => {
        void this.correctSelection(editor);
      }
    });
    this.addCommand({
      id: "correct-all",
      name: "Correct dictated text",
      icon: "file-check",
      editorCallback: (editor) => {
        void this.correctAll(editor);
      }
    });
    this.addCommand({
      id: "undo-last-voice-action",
      name: "Undo last voice action",
      icon: "undo-2",
      editorCallback: (editor) => {
        this.performVoiceUndo(editor);
      }
    });
    this.addCommand({
      id: "transcribe-embedded-audio",
      name: "Transcribe the audio embed on the current line",
      icon: "file-audio",
      editorCallback: (editor) => {
        void this.transcribeEmbeddedAudio(editor);
      }
    });
    this.addCommand({
      id: "read-selection-aloud",
      name: "Read selection aloud",
      icon: "volume-2",
      editorCallback: (editor) => {
        void this.readSelectionAloud(editor);
      }
    });
    this.addCommand({
      id: "read-paragraph-aloud",
      name: "Read current paragraph aloud",
      icon: "volume-2",
      editorCallback: (editor) => {
        void this.readParagraphAloud(editor);
      }
    });
    this.addCommand({
      id: "stop-playback",
      name: "Stop playback",
      icon: "square",
      callback: () => {
        this.playback.stopPlayback();
      }
    });
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        if (!this.settings.ttsEnabled || !editor.getSelection()) return;
        menu.addItem(
          (item) => item.setTitle("Read selection aloud").setIcon("volume-2").onClick(() => {
            void this.readSelectionAloud(editor);
          })
        );
      })
    );
    this.addSettingTab(new VoxtralSettingTab(this.app, this));
    this.registerDomEvent(activeDocument, "visibilitychange", () => {
      this.handleVisibilityChange();
    });
    this.registerDomEvent(
      activeDocument,
      "keydown",
      (e) => this.handleTypingMute(e),
      { capture: true }
    );
  }
  onunload() {
    if (this.isRecording) {
      void this.stopRecording();
    }
    this.playback.stopPlayback();
    this.removeSendButton();
    if (this.commandFeedbackTimer !== null) {
      window.clearTimeout(this.commandFeedbackTimer);
      this.commandFeedbackTimer = null;
    }
  }
  async loadSettings() {
    this.settings = migrateSettings(await this.loadData());
    let apiKeyMigrated = false;
    const store = this.app.secretStorage;
    if (store && typeof store.setSecret === "function") {
      apiKeyMigrated = migrateApiKeyToSecret(this.settings, store).changed;
      this.settings.apiKey = readApiKey(this.settings, store);
    }
    const defaults = getDefaultBuiltInCommands();
    const defaultMap = new Map(defaults.map((d) => [d.id, d]));
    const existingIds = new Set(this.settings.customCommands.map((c) => c.id));
    for (const cmd of this.settings.customCommands) {
      if (cmd.builtIn && defaultMap.has(cmd.id)) {
        const def = defaultMap.get(cmd.id);
        cmd.labels = def.labels;
        cmd.triggers = def.triggers;
        cmd.insertText = def.insertText;
        cmd.insertTextByLang = def.insertTextByLang;
        cmd.slotPrefix = def.slotPrefix;
        cmd.slotSuffix = def.slotSuffix;
      }
    }
    const newBuiltIns = defaults.filter((d) => !existingIds.has(d.id));
    if (newBuiltIns.length > 0) {
      this.settings.customCommands = [
        ...newBuiltIns,
        ...this.settings.customCommands
      ];
    }
    setLanguage(this.settings.language);
    loadCustomCommands(this.settings.customCommands);
    loadCustomCommandTriggers(this.settings.customCommands);
    this.setupTemplates();
    if (apiKeyMigrated) {
      await this.saveSettings();
      new import_obsidian9.Notice(
        "Voxtral moved your API key into Obsidian's secret storage. It's now stored per device and no longer syncs \u2014 enter it once on each other device you use.",
        12e3
      );
    }
  }
  async saveSettings() {
    await this.saveData(stripApiKeyValue(this.settings));
    setLanguage(this.settings.language);
    loadCustomCommands(this.settings.customCommands);
    loadCustomCommandTriggers(this.settings.customCommands);
    this.setupTemplates();
    this.refreshHelpView();
  }
  // ── Templates ──
  /** Scan templates folder and register the pre-match hook */
  setupTemplates() {
    scanTemplates(this.app, this.settings.templatesFolder);
    setPreMatchHook((editor, normalizedText, rawText) => {
      const lang = this.recordingSettings.language;
      const tmplMatch = matchTemplate(normalizedText, lang);
      if (tmplMatch) {
        if (tmplMatch.textBefore) {
          const cmdWords = normalizedText.length - tmplMatch.textBefore.length;
          const before = rawText.substring(0, rawText.length - cmdWords).trimEnd();
          if (before) {
            const cursor = editor.getCursor();
            editor.replaceRange(before, cursor);
            const newCh = cursor.ch + before.length;
            editor.setCursor({ line: cursor.line, ch: newCh });
          }
        }
        void insertTemplate(this.app, editor, tmplMatch.template);
        return true;
      }
      return false;
    });
  }
  /**
   * Re-render the help panel with the given language, or the global
   * setting when none is passed. `lang` lets recording start/stop
   * (VX_E27_S8) push the per-note override in and the global language
   * back out, without help-view needing to know about frontmatter at all.
   */
  refreshHelpView(lang) {
    const target = lang != null ? lang : this.settings.language;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_VOXTRAL_HELP)) {
      const view = leaf.view;
      if (view instanceof VoxtralHelpView) {
        view.setLanguage(target);
      }
    }
  }
  // ── Send button (shown during batch recording) ──
  addSendButton() {
    this.removeSendButton();
    this.sendRibbonEl = this.addRibbonIcon(
      "send",
      "Send chunk",
      () => {
        void this.sendChunk();
      }
    );
    this.sendRibbonEl.addClass("voxtral-send-button");
    if (import_obsidian9.Platform.isMobile) {
      const view = this.app.workspace.getActiveViewOfType(import_obsidian9.MarkdownView);
      if (view) {
        this.mobileActionEl = view.addAction(
          "send",
          "Send chunk",
          () => {
            void this.sendChunk();
          }
        );
        this.mobileActionEl.addClass("voxtral-mobile-send");
        const headerActions = this.mobileActionEl.parentElement;
        if (headerActions) {
          this.recordingIndicator.attach(headerActions, "recording");
        }
      }
    }
  }
  removeSendButton() {
    if (this.sendRibbonEl) {
      this.sendRibbonEl.remove();
      this.sendRibbonEl = null;
    }
    if (this.mobileActionEl) {
      this.mobileActionEl.remove();
      this.mobileActionEl = null;
    }
    this.recordingIndicator.detach();
  }
  // ── Visibility (auto-pause on background) ──
  handleVisibilityChange() {
    if (!this.isRecording) return;
    const behavior = this.settings.focusBehavior;
    if (activeDocument.hidden) {
      this.clearFocusPauseTimer();
      if (behavior === "keep-recording") {
        vlog.debug("Voxtral: App backgrounded, recording continues");
      } else if (behavior === "pause-after-delay") {
        const delaySec = this.settings.focusPauseDelaySec;
        console.debug(
          `Voxtral: App backgrounded, pausing in ${delaySec}s`
        );
        this.focusPauseTimer = window.setTimeout(() => {
          if (this.isRecording && activeDocument.hidden) {
            this.pauseRecording();
          }
        }, delaySec * 1e3);
      } else {
        this.pauseRecording();
      }
    } else {
      this.clearFocusPauseTimer();
      if (this.isPaused) {
        this.resumeRecording();
      }
    }
  }
  pauseRecording() {
    this.isPaused = true;
    this.recorder.pause();
    this.updateStatusBar("paused");
    vlog.debug("Voxtral: Recording paused (app backgrounded)");
  }
  resumeRecording() {
    this.isPaused = false;
    this.recorder.resume();
    this.updateStatusBar("recording");
    new import_obsidian9.Notice("Recording resumed");
    vlog.debug("Voxtral: Recording resumed (app foregrounded)");
  }
  clearFocusPauseTimer() {
    if (this.focusPauseTimer) {
      window.clearTimeout(this.focusPauseTimer);
      this.focusPauseTimer = null;
    }
  }
  // ── Typing mute (prevent keyboard noise from being transcribed) ──
  handleTypingMute(e) {
    if (isSlotActive()) {
      const slot = getActiveSlot();
      if (e.key === "Escape") {
        e.preventDefault();
        cancelSlot();
        this.updateStatusBar("recording");
        return;
      }
      if ((slot == null ? void 0 : slot.def.exitTrigger) === "voice") {
        return;
      }
      const isEnterExit = (slot == null ? void 0 : slot.def.exitTrigger) === "enter" || (slot == null ? void 0 : slot.def.exitTrigger) === "enter-or-space";
      const isSpaceExit = (slot == null ? void 0 : slot.def.exitTrigger) === "space" || (slot == null ? void 0 : slot.def.exitTrigger) === "enter-or-space";
      if (e.key === "Enter" && isEnterExit || e.key === " " && isSpaceExit) {
        e.preventDefault();
        const view = this.app.workspace.getActiveViewOfType(import_obsidian9.MarkdownView);
        if (view) {
          closeSlot(view.editor);
          if (this.realtimeSession) {
            this.realtimeSession.flushAfterSlot(view.editor);
          }
          if (this.dualDelaySession) {
            this.dualDelaySession.flushAfterSlot(view.editor);
          }
        }
        this.updateStatusBar("recording");
        return;
      }
      return;
    }
    if (!this.isRecording || this.isPaused) return;
    if (e.key === "Control" || e.key === "Alt" || e.key === "Shift" || e.key === "Meta" || e.ctrlKey || e.metaKey) {
      return;
    }
    if (e.key === "Enter" && this.settings.enterToSend && this.effectiveMode === "batch" && !this.isTypingMuted && !this.typingResumeTimer) {
      e.preventDefault();
      void this.sendChunk();
      return;
    }
    if (e.key === "Escape" || e.key === "Tab" || e.key === "Enter" || e.key === "Backspace" || e.key === "Delete" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End" || e.key === "PageUp" || e.key === "PageDown" || e.key.startsWith("F") && e.key.length <= 3) {
      if (this.isTypingMuted && this.typingResumeTimer) {
        window.clearTimeout(this.typingResumeTimer);
        this.typingResumeTimer = window.setTimeout(() => {
          this.typingResumeTimer = null;
          if (this.isRecording && this.isTypingMuted && !this.isPaused) {
            this.isTypingMuted = false;
            this.recorder.unmute();
            this.recordingIndicator.setState("recording");
          }
        }, this.settings.typingCooldownMs);
      }
      return;
    }
    if (!this.isTypingMuted) {
      this.isTypingMuted = true;
      this.recorder.mute();
      this.recordingIndicator.setState("paused");
    }
    if (this.typingResumeTimer) {
      window.clearTimeout(this.typingResumeTimer);
    }
    this.typingResumeTimer = window.setTimeout(() => {
      this.typingResumeTimer = null;
      if (this.isRecording && this.isTypingMuted && !this.isPaused) {
        this.isTypingMuted = false;
        this.recorder.unmute();
        this.recordingIndicator.setState("recording");
      }
    }, this.settings.typingCooldownMs);
  }
  // ── Recording toggle ──
  async toggleRecording() {
    if (this.isRecording) {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }
  /**
   * If text is selected when dictation starts, delete it and collapse the
   * cursor to where the selection began — mirroring how typing replaces a
   * selection. Transcribed text then lands in place of the old selection
   * instead of being appended after it.
   */
  replaceSelectionBeforeDictation(editor) {
    if (!editor.getSelection()) return;
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    editor.replaceRange("", from, to);
    editor.setCursor(from);
  }
  async startRecording() {
    if (!this.settings.apiKey && !isLocalMode(this.settings)) {
      new import_obsidian9.Notice("Please set your API key in the plugin settings.");
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(import_obsidian9.MarkdownView);
    if (!view) {
      new import_obsidian9.Notice("Open a note first to start dictating.");
      return;
    }
    const editor = view.editor;
    this.currentEditor = editor;
    this.replaceSelectionBeforeDictation(editor);
    const resolved = this.resolveEffectiveLanguageForFile(view.file);
    this.activeLanguage = resolved.language;
    if (resolved.invalidValue !== void 0) {
      new import_obsidian9.Notice(
        `Unknown voxtral-language '${resolved.invalidValue}' \u2014 using ${this.settings.language}`
      );
    }
    setLanguage(this.activeLanguage);
    this.refreshHelpView(this.activeLanguage);
    this.sessionVocabularyTerms = this.settings.vaultVocabulary ? collectVaultVocabulary(this.app, view.file) : [];
    try {
      if (this.effectiveMode === "realtime") {
        await this.startRealtimeRecording(editor);
      } else {
        await this.startBatchRecording();
        this.addSendButton();
      }
      this.isRecording = true;
      this.chunkIndex = 0;
      this.consecutiveFailures = 0;
      this.updateStatusBar("recording");
      const shouldAutoOpenHelp = import_obsidian9.Platform.isMobile ? this.settings.autoOpenHelpMobile : this.settings.autoOpenHelpDesktop;
      if (shouldAutoOpenHelp) {
        void this.openHelpPanel({ keepEditorFocus: true, skipIfOpen: true });
      }
      const micName = this.recorder.activeMicLabel;
      if (this.effectiveMode === "batch") {
        const enterHint = this.settings.enterToSend ? " Press Enter (when not typing) or tap send to transcribe chunks." : " Tap send to transcribe chunks while you keep talking.";
        if (import_obsidian9.Platform.isMobile && !this.settings.dismissMobileBatchNotice) {
          const frag = activeDocument.createDocumentFragment();
          frag.createSpan({
            text: `Recording started (${micName}). Tap the send button (\u2191) to transcribe chunks while you keep talking.`
          });
          frag.createEl("br");
          const dismiss = frag.createEl("a", {
            text: "Don\u2019t show again",
            href: "#",
            cls: "voxtral-dismiss-link"
          });
          dismiss.addEventListener("click", (e) => {
            e.preventDefault();
            this.settings.dismissMobileBatchNotice = true;
            void this.saveSettings();
          });
          new import_obsidian9.Notice(frag, 8e3);
        } else {
          new import_obsidian9.Notice(
            `Voxtral: Recording started (${micName})
` + enterHint.trim(),
            6e3
          );
        }
      } else {
        new import_obsidian9.Notice(`Recording started (${micName})`);
      }
    } catch (e) {
      vlog.error("Voxtral: Failed to start recording", e);
      new import_obsidian9.Notice(`Could not start recording: ${String(e)}`);
      this.updateStatusBar("idle");
      this.restoreGlobalLanguage();
    }
  }
  /**
   * Restore command matching and the help panel to the global language
   * setting (VX_E27_S8), clearing the per-note override. Called once the
   * session's own transcription/correction calls (which still need the
   * override — see `recordingSettings`) have run, or when a recording
   * fails to start.
   */
  restoreGlobalLanguage() {
    setLanguage(this.settings.language);
    this.refreshHelpView();
    this.activeLanguage = null;
    this.sessionVocabularyTerms = [];
  }
  async stopRecording() {
    this.isRecording = false;
    this.isPaused = false;
    this.isTypingMuted = false;
    if (this.typingResumeTimer) {
      window.clearTimeout(this.typingResumeTimer);
      this.typingResumeTimer = null;
    }
    this.clearFocusPauseTimer();
    this.updateStatusBar("processing");
    this.removeSendButton();
    try {
      if (this.effectiveMode === "realtime") {
        await this.stopRealtimeRecording();
      } else {
        await this.stopBatchRecording();
      }
    } catch (e) {
      vlog.error("Voxtral: Failed to stop recording", e);
      new import_obsidian9.Notice(`Error stopping recording: ${String(e)}`);
    }
    this.restoreGlobalLanguage();
    this.currentEditor = null;
    if (this.settings.autoCorrect) {
      this.tracker.reset();
    }
    this.updateStatusBar("idle");
    new import_obsidian9.Notice("Recording stopped");
  }
  // ── Tap-to-send: flush current audio chunk without stopping ──
  async sendChunk() {
    if (!this.isRecording || this.effectiveMode !== "batch") {
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(import_obsidian9.MarkdownView);
    if (!view) return;
    const editor = view.editor;
    this.chunkIndex++;
    try {
      this.updateStatusBar("processing");
      const blob = await this.recorder.flushChunk();
      if (blob.size === 0) {
        this.updateStatusBar("recording");
        return;
      }
      let text = await transcribeBatch(blob, this.recordingSettings, this.httpRequest);
      if (text && isLikelyHallucination(
        text,
        this.recorder.lastChunkDurationSec
      )) {
        vlog.warn("Voxtral: Discarding hallucinated chunk");
        this.updateStatusBar("recording");
        return;
      }
      const hasCommand = text ? matchCommand(text) !== null : false;
      if (this.settings.autoCorrect && text && !hasCommand) {
        text = await correctText(text, this.recordingSettings, this.httpRequest);
        text = this.applyWikilinksIfEnabled(text, this.recordingSettings);
      }
      this.updateStatusBar("recording");
      if (text) {
        const stopRequested = this.batchInserter.commit(
          editor,
          this.tracker,
          text,
          void 0,
          (commandId) => this.handleCommandExecuted(commandId)
        );
        if (stopRequested) {
          await this.stopRecording();
          return;
        }
      }
    } catch (e) {
      vlog.error("Voxtral: Chunk transcription failed", e);
      this.updateStatusBar("recording");
      new import_obsidian9.Notice(`Chunk failed: ${String(e)}`);
    }
  }
  // ── Realtime recording (delegates to session classes) ──
  async startRealtimeRecording(editor) {
    var _a, _b;
    this.tracker.reset();
    resetCommandUndo();
    try {
      if (this.settings.dualDelay) {
        this.dualDelaySession = new DualDelaySession(
          this.recordingSettings,
          this.tracker,
          this.sessionCallbacks
        );
        await this.dualDelaySession.start(editor);
      } else {
        this.realtimeSession = new RealtimeSession(
          this.recordingSettings,
          this.tracker,
          this.sessionCallbacks
        );
        await this.realtimeSession.start(editor);
      }
      const deviceId = this.settings.microphoneDeviceId || void 0;
      await this.recorder.start(deviceId, (pcmData) => {
        if (this.dualDelaySession) {
          this.dualDelaySession.sendAudio(pcmData);
        } else if (this.realtimeSession) {
          this.realtimeSession.sendAudio(pcmData);
        }
      }, this.settings.noiseSuppression);
    } catch (e) {
      try {
        await ((_a = this.dualDelaySession) == null ? void 0 : _a.stop());
        await ((_b = this.realtimeSession) == null ? void 0 : _b.stop(editor));
      } catch (cleanupError) {
        vlog.error(
          "Voxtral: cleanup after failed start failed",
          cleanupError
        );
      }
      this.dualDelaySession = null;
      this.realtimeSession = null;
      await this.recorder.stop();
      throw e;
    }
    if (this.recorder.fallbackUsed) {
      new import_obsidian9.Notice("Selected mic unavailable \u2014 using default");
    }
  }
  async stopRealtimeRecording() {
    const view = this.app.workspace.getActiveViewOfType(import_obsidian9.MarkdownView);
    if (this.dualDelaySession) {
      await this.dualDelaySession.stop();
      this.dualDelaySession = null;
    } else if (this.realtimeSession) {
      const editor = view == null ? void 0 : view.editor;
      if (editor) {
        await this.realtimeSession.stop(editor);
      }
      this.realtimeSession = null;
    }
    await this.recorder.stop();
    if (this.settings.autoCorrect && view) {
      await this.tracker.autoCorrectAfterStop(view.editor, this.recordingSettings, this.httpRequest);
    }
  }
  // ── Batch recording ──
  async startBatchRecording() {
    this.batchInserter.reset();
    resetCommandUndo();
    const deviceId = this.settings.microphoneDeviceId || void 0;
    await this.recorder.start(deviceId, void 0, this.settings.noiseSuppression);
    if (this.recorder.fallbackUsed) {
      new import_obsidian9.Notice("Selected mic unavailable \u2014 using default");
    }
  }
  async stopBatchRecording() {
    const blob = await this.recorder.stop();
    if (blob.size === 0) {
      new import_obsidian9.Notice("No audio recorded");
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(import_obsidian9.MarkdownView);
    if (!view) {
      new import_obsidian9.Notice("No active note found");
      return;
    }
    const editor = view.editor;
    try {
      let text = await transcribeBatch(blob, this.recordingSettings, this.httpRequest);
      if (text && isLikelyHallucination(
        text,
        this.recorder.lastChunkDurationSec
      )) {
        vlog.warn("Voxtral: Discarding hallucinated batch");
        return;
      }
      const hasCommand = text ? matchCommand(text) !== null : false;
      if (this.settings.autoCorrect && text && !hasCommand) {
        text = await correctText(text, this.recordingSettings, this.httpRequest);
        text = this.applyWikilinksIfEnabled(text, this.recordingSettings);
      }
      if (text) {
        this.batchInserter.commit(
          editor,
          this.tracker,
          text,
          void 0,
          (commandId) => this.handleCommandExecuted(commandId)
        );
      }
    } catch (e) {
      vlog.error("Voxtral: Batch transcription failed", e);
      new import_obsidian9.Notice(`Transcription failed: ${String(e)}`);
    }
  }
  // ── Text correction ──
  async correctSelection(editor) {
    var _a;
    const selection = editor.getSelection();
    if (!selection) {
      new import_obsidian9.Notice("Select text first to correct it");
      return;
    }
    if (isLocalMode(this.settings)) {
      if (!((_a = this.settings.localCorrectionUrl) == null ? void 0 : _a.trim())) {
        new import_obsidian9.Notice("Correction is off in local server mode \u2014 configure a local correction endpoint in settings.");
        return;
      }
    } else if (!this.settings.apiKey) {
      new import_obsidian9.Notice("Please set your API key first");
      return;
    }
    try {
      new import_obsidian9.Notice("Correcting...");
      const corrected = await correctText(selection, this.settings, this.httpRequest);
      if (corrected) {
        editor.replaceSelection(corrected);
        new import_obsidian9.Notice("Selection corrected");
      }
    } catch (e) {
      new import_obsidian9.Notice(`Correction failed: ${String(e)}`);
    }
  }
  async correctAll(editor) {
    var _a;
    if (!this.tracker.hasRanges()) {
      new import_obsidian9.Notice("No dictated text to correct");
      return;
    }
    if (isLocalMode(this.settings)) {
      if (!((_a = this.settings.localCorrectionUrl) == null ? void 0 : _a.trim())) {
        new import_obsidian9.Notice("Correction is off in local server mode \u2014 configure a local correction endpoint in settings.");
        return;
      }
    } else if (!this.settings.apiKey) {
      new import_obsidian9.Notice("Please set your API key first");
      return;
    }
    try {
      new import_obsidian9.Notice("Correcting...");
      await this.tracker.autoCorrectAfterStop(editor, this.settings, this.httpRequest);
      this.tracker.reset();
      new import_obsidian9.Notice("Dictated text corrected");
    } catch (e) {
      new import_obsidian9.Notice(`Correction failed: ${String(e)}`);
    }
  }
  // ── Listen back (TTS, E26 — experimental) ──
  async readSelectionAloud(editor) {
    const selection = editor.getSelection();
    if (!selection) {
      new import_obsidian9.Notice("Select some text to read aloud.");
      return;
    }
    await this.readTextAloud(selection);
  }
  async readParagraphAloud(editor) {
    const paragraph = this.getCurrentParagraph(editor);
    if (!paragraph.trim()) {
      new import_obsidian9.Notice("No paragraph on the current line to read aloud.");
      return;
    }
    await this.readTextAloud(paragraph);
  }
  /** The contiguous block of non-blank lines containing the cursor. */
  getCurrentParagraph(editor) {
    const cur = editor.getCursor().line;
    if (editor.getLine(cur).trim() === "") return "";
    const last = editor.lastLine();
    let start = cur;
    while (start > 0 && editor.getLine(start - 1).trim() !== "") start--;
    let end = cur;
    while (end < last && editor.getLine(end + 1).trim() !== "") end++;
    const lines = [];
    for (let i = start; i <= end; i++) lines.push(editor.getLine(i));
    return lines.join("\n");
  }
  /** Synthesize `rawText` (markdown flattened to prose) and play it. */
  async readTextAloud(rawText) {
    if (!this.settings.ttsEnabled) {
      new import_obsidian9.Notice("Listen back is off \u2014 enable it in the plugin settings.");
      return;
    }
    if (!this.settings.apiKey) {
      new import_obsidian9.Notice("Please set your API key in the plugin settings.");
      return;
    }
    const text = flattenForSpeech(rawText);
    if (!text) {
      new import_obsidian9.Notice("Nothing to read aloud.");
      return;
    }
    const progress = new import_obsidian9.Notice("Generating audio\u2026", 0);
    try {
      const audio = await synthesizeSpeech(text, this.settings, this.httpRequest);
      await this.playback.playAudioBytes(audio);
    } catch (e) {
      vlog.error("Voxtral: speech synthesis failed", e);
      new import_obsidian9.Notice(`Listen back failed: ${String(e)}`);
    } finally {
      progress.hide();
    }
  }
  // ── Logs ──
  async exportLogs() {
    const count = getLogCount();
    if (count === 0) {
      new import_obsidian9.Notice("No logs to export");
      return;
    }
    const now = /* @__PURE__ */ new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const fileName = `voxtral-logs-${ts}.md`;
    const content = `# Voxtral Transcribe \u2014 Log Export

Exported: ${now.toISOString()}
Entries: ${count}

\`\`\`
${getLogText()}
\`\`\`
`;
    const file = await this.app.vault.create(fileName, content);
    await this.app.workspace.getLeaf(true).openFile(file);
    new import_obsidian9.Notice(`${count} log entries saved to ${file.path}`);
  }
  // ── File transcription (batch) ──
  // Pipeline (decode/chunk/retry/progress/output placement) lives in
  // FileTranscriptionService (VX_E27_S2); these entry points resolve the
  // editor/view from the Obsidian context and delegate.
  /** Transcribe a vault audio file (chosen via its right-click menu). */
  async transcribeFileFromMenu(file) {
    let editor = null;
    let noteFile = null;
    if (this.settings.fileTranscriptOutput === "cursor") {
      let view = this.app.workspace.getActiveViewOfType(import_obsidian9.MarkdownView);
      if (!view) {
        const recent = this.app.workspace.getMostRecentLeaf();
        if ((recent == null ? void 0 : recent.view) instanceof import_obsidian9.MarkdownView) {
          view = recent.view;
        }
      }
      if (!view) {
        new import_obsidian9.Notice("Open a note first to insert the transcript.");
        return;
      }
      this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
      if (import_obsidian9.Platform.isMobile) {
        this.app.workspace.leftSplit.collapse();
      }
      editor = view.editor;
      noteFile = view.file;
    }
    this.fileTranscriptVocabularyTerms = this.settings.vaultVocabulary && noteFile ? collectVaultVocabulary(this.app, noteFile) : [];
    const target = editor;
    await this.fileTranscriptionService.transcribe(
      file,
      target ? (text) => target.replaceSelection(text + "\n") : null
    );
  }
  /**
   * Transcribe the audio file embedded/linked at the cursor and insert the
   * transcript directly below the embed. Reuses the E23_S1 engine.
   */
  async transcribeEmbeddedAudio(editor) {
    var _a, _b;
    const note = this.app.workspace.getActiveFile();
    if (!note) {
      new import_obsidian9.Notice("Open a note with an audio embed first.");
      return;
    }
    const cache = this.app.metadataCache.getFileCache(note);
    const refs = [
      ...(_a = cache == null ? void 0 : cache.embeds) != null ? _a : [],
      ...(_b = cache == null ? void 0 : cache.links) != null ? _b : []
    ];
    const ref = findRefAtLine(refs, editor.getCursor().line);
    if (!ref) {
      new import_obsidian9.Notice("No audio embed on the current line (e.g. ![[recording.m4a]]).");
      return;
    }
    const target = this.app.metadataCache.getFirstLinkpathDest(ref.link, note.path);
    if (!(target instanceof import_obsidian9.TFile) || !isAudioFile(target.extension)) {
      new import_obsidian9.Notice("The embed on this line isn't an audio file.");
      return;
    }
    const endLine = ref.position.end.line;
    editor.setCursor({ line: endLine, ch: editor.getLine(endLine).length });
    this.fileTranscriptVocabularyTerms = this.settings.vaultVocabulary ? collectVaultVocabulary(this.app, note) : [];
    await this.fileTranscriptionService.transcribe(target, (text) => {
      editor.replaceSelection(`
${text}`);
    });
  }
  // ── Help panel host (read/write the per-platform auto-open setting) ──
  /** HelpPanelHost: effective language — per-note override during recording, else the global setting. */
  getLanguage() {
    var _a;
    return (_a = this.activeLanguage) != null ? _a : this.settings.language;
  }
  /** HelpPanelHost: current auto-open value for the active platform. */
  getAutoOpen() {
    return import_obsidian9.Platform.isMobile ? this.settings.autoOpenHelpMobile : this.settings.autoOpenHelpDesktop;
  }
  /** HelpPanelHost: persist a new auto-open value for the active platform. */
  async setAutoOpen(enabled) {
    if (import_obsidian9.Platform.isMobile) {
      this.settings.autoOpenHelpMobile = enabled;
    } else {
      this.settings.autoOpenHelpDesktop = enabled;
    }
    await this.saveSettings();
  }
  // ── Help panel ──
  async openHelpPanel(opts = {}) {
    var _a, _b;
    const existing = this.app.workspace.getLeavesOfType(
      VIEW_TYPE_VOXTRAL_HELP
    );
    if (existing.length > 0) {
      if (opts.skipIfOpen) return;
      const editor2 = opts.keepEditorFocus && !import_obsidian9.Platform.isMobile ? (_a = this.app.workspace.getActiveViewOfType(import_obsidian9.MarkdownView)) == null ? void 0 : _a.editor : void 0;
      await this.app.workspace.revealLeaf(existing[0]);
      editor2 == null ? void 0 : editor2.focus();
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({
      type: VIEW_TYPE_VOXTRAL_HELP,
      active: !opts.keepEditorFocus
    });
    if (import_obsidian9.Platform.isMobile) return;
    const editor = opts.keepEditorFocus ? (_b = this.app.workspace.getActiveViewOfType(import_obsidian9.MarkdownView)) == null ? void 0 : _b.editor : void 0;
    await this.app.workspace.revealLeaf(leaf);
    editor == null ? void 0 : editor.focus();
  }
  // ── Voice-command feedback + undo (VX_E27_S4) ──
  /** Called whenever a voice command executes, realtime or batch. */
  handleCommandExecuted(commandId) {
    this.showCommandFeedback(commandId);
    if (commandId === "undoLastVoiceCommand") {
      this.performVoiceUndo();
    }
  }
  /**
   * Briefly show which command just ran: a status-bar flash on desktop
   * (reverts to the normal recording display after ~1.5s via
   * updateStatusBar), a short Notice on mobile. Gated by the
   * "commandFeedback" setting.
   */
  showCommandFeedback(commandId) {
    if (!this.settings.commandFeedback) return;
    const label = getLabel(commandId, this.recordingSettings.language);
    if (import_obsidian9.Platform.isMobile) {
      new import_obsidian9.Notice(`\u2192 ${label}`, 1500);
      return;
    }
    if (!this.statusBarEl) return;
    if (this.commandFeedbackTimer !== null) {
      window.clearTimeout(this.commandFeedbackTimer);
      this.commandFeedbackTimer = null;
    }
    this.statusBarEl.setText(`\u2192 ${label}`);
    this.statusBarEl.addClass("voxtral-recording");
    this.statusBarEl.removeClass("voxtral-processing", "voxtral-paused");
    this.commandFeedbackTimer = window.setTimeout(() => {
      this.commandFeedbackTimer = null;
      this.updateStatusBar(this.isRecording ? "recording" : "idle");
    }, 1500);
  }
  /**
   * Revert the last executed voice command's edit (structural change only —
   * dictated text committed after it is never touched). Restrictive by
   * design: if anything changed the document since the command ran, this
   * refuses rather than guess at what to remove.
   */
  performVoiceUndo(editorOverride) {
    var _a, _b, _c;
    const editor = (_c = (_b = editorOverride != null ? editorOverride : this.currentEditor) != null ? _b : (_a = this.app.workspace.getActiveViewOfType(import_obsidian9.MarkdownView)) == null ? void 0 : _a.editor) != null ? _c : null;
    if (!editor) return;
    const result = undoLastCommand(editor);
    switch (result) {
      case "reverted":
        new import_obsidian9.Notice("Undid last voice command");
        break;
      case "stale":
        new import_obsidian9.Notice("Can't undo \u2014 text was added after the command.");
        break;
      case "none":
        new import_obsidian9.Notice("No voice command to undo.");
        break;
    }
  }
  // ── Status bar ──
  updateStatusBar(state) {
    var _a, _b;
    this.recordingIndicator.setState(INDICATOR_STATE_MAP[state]);
    if (!this.statusBarEl) return;
    switch (state) {
      case "idle":
        this.statusBarEl.empty();
        (0, import_obsidian9.setIcon)(this.statusBarEl, "mic");
        this.statusBarEl.removeClass(
          "voxtral-recording",
          "voxtral-processing",
          "voxtral-paused",
          "voxtral-reconnecting"
        );
        break;
      case "recording": {
        if (isSlotActive()) {
          const slot = getActiveSlot();
          const label = (_a = slot == null ? void 0 : slot.commandId) != null ? _a : "slot";
          this.statusBarEl.setText(`\u25CF ${label} \u2014 type, then Enter`);
          this.statusBarEl.addClass("voxtral-recording");
          this.statusBarEl.removeClass(
            "voxtral-processing",
            "voxtral-paused",
            "voxtral-reconnecting"
          );
          break;
        }
        const mic = this.recorder.activeMicLabel;
        const short = mic.length > 25 ? mic.slice(0, 22) + "..." : mic;
        this.statusBarEl.setText(`\u25CF ${short}`);
        this.statusBarEl.addClass("voxtral-recording");
        this.statusBarEl.removeClass(
          "voxtral-processing",
          "voxtral-paused",
          "voxtral-reconnecting"
        );
        break;
      }
      case "slot": {
        const slot = getActiveSlot();
        const label = (_b = slot == null ? void 0 : slot.commandId) != null ? _b : "slot";
        this.statusBarEl.setText(`\u25CF ${label} \u2014 type, then Enter`);
        this.statusBarEl.addClass("voxtral-recording");
        this.statusBarEl.removeClass(
          "voxtral-processing",
          "voxtral-paused",
          "voxtral-reconnecting"
        );
        break;
      }
      case "paused":
        this.statusBarEl.setText("\u23F8 Paused");
        this.statusBarEl.addClass("voxtral-paused");
        this.statusBarEl.removeClass(
          "voxtral-recording",
          "voxtral-processing",
          "voxtral-reconnecting"
        );
        break;
      case "processing":
        this.statusBarEl.setText("\u23F3 Processing...");
        this.statusBarEl.addClass("voxtral-processing");
        this.statusBarEl.removeClass(
          "voxtral-recording",
          "voxtral-paused",
          "voxtral-reconnecting"
        );
        break;
      case "reconnecting":
        this.statusBarEl.setText("\u27F3 reconnecting...");
        this.statusBarEl.addClass("voxtral-reconnecting");
        this.statusBarEl.removeClass(
          "voxtral-recording",
          "voxtral-processing",
          "voxtral-paused"
        );
        break;
    }
  }
};
