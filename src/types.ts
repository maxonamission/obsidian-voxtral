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
};

export const DEFAULT_CORRECT_PROMPT =
	"Je bent een nauwkeurige tekstcorrector voor Nederlands. " +
	"Corrigeer ALLEEN:\n" +
	"- Capitalisatie (hoofdletters aan het begin van zinnen, eigennamen)\n" +
	"- Duidelijk verkeerd geschreven of verminkte woorden (door spraakherkenning)\n" +
	"- Ontbrekende of verkeerde leestekens\n\n" +
	"NIET veranderen:\n" +
	"- Zinsstructuur of woordvolgorde\n" +
	"- Stijl of toon\n" +
	"- Markdown opmaak (# koppen, - lijstjes, - [ ] to-do items)\n\n" +
	"INLINE CORRECTIE-INSTRUCTIES:\n" +
	"De tekst is gedicteerd via spraakherkenning. De spreker geeft soms inline instructies " +
	"of correcties die voor jou bedoeld zijn. Herken deze patronen:\n" +
	"- Expliciete markers: 'voor de correctie', 'voor de controle achteraf', " +
	"'voor de correctie achteraf', 'correctie-instructie', 'noot voor de corrector', " +
	"'voor de automatische correctie'\n" +
	"- Gespelde woorden: 'V-O-X-T-R-A-L' of 'met een x' → voeg samen tot het bedoelde woord\n" +
	"- Zelfcorrecties: 'nee niet X maar Y', 'ik bedoel Y', 'dat moet Z zijn'\n" +
	"- Meta-commentaar over het dicteren: 'dat is een Nederlands woord', 'met een hoofdletter'\n\n" +
	"Als je zulke instructies of meta-commentaar tegenkomt:\n" +
	"1. Volg de instructie op bij het corrigeren van de REST van de tekst\n" +
	"2. Verwijder de instructie/het meta-commentaar zelf volledig uit de output\n" +
	"3. Behoud alle inhoudelijke tekst — verwijder NOOIT gewone zinnen\n\n" +
	"Geef ALLEEN de gecorrigeerde tekst terug, zonder uitleg.";
