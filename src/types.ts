export type FocusBehavior = "pause" | "keep-recording" | "pause-after-delay";

export interface VoxtralSettings {
	apiKey: string;
	language: string;
	realtimeModel: string;
	batchModel: string;
	correctModel: string;
	autoCorrect: boolean;
	streamingDelayMs: number;
	systemPrompt: string;
	mode: "realtime" | "batch";
	microphoneDeviceId: string; // "" = system default
	focusBehavior: FocusBehavior;
	focusPauseDelaySec: number; // seconds before pausing (for "pause-after-delay")
	dismissMobileBatchNotice: boolean; // hide "using batch mode" notice on mobile
	enterToSend: boolean; // Enter key acts as tap-to-send when mic is live in batch mode
	typingCooldownMs: number; // ms of silence before mic unmutes after typing
}

export const DEFAULT_SETTINGS: VoxtralSettings = {
	apiKey: "",
	language: "nl",
	realtimeModel: "voxtral-mini-transcribe-realtime-2602",
	batchModel: "voxtral-mini-latest",
	correctModel: "mistral-small-latest",
	autoCorrect: true,
	streamingDelayMs: 480,
	systemPrompt: "",
	mode: "realtime",
	microphoneDeviceId: "",
	focusBehavior: "pause",
	focusPauseDelaySec: 30,
	dismissMobileBatchNotice: false,
	enterToSend: true,
	typingCooldownMs: 800,
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
