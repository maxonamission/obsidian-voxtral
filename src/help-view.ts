// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe
import { App, ItemView, Modal, WorkspaceLeaf } from "obsidian";
import { getCommandList } from "./voice-commands";

export const VIEW_TYPE_VOXTRAL_HELP = "voxtral-help";

/** Localized UI strings for the help panel */
const UI_STRINGS: Record<string, {
	title: string; command: string; say: string;
	tips: string; tipItems: string[];
	privacy: string; privacyItems: string[];
}> = {
	nl: {
		title: "Voxtral Stemcommando's",
		command: "Commando",
		say: "Zeg...",
		tips: "Tips",
		tipItems: [
			"Commando's worden herkend aan het einde van een zin.",
			"Zeg \"voor de correctie: ...\" om instructies aan de corrector te geven.",
			"Gespelde woorden (V-O-X-T-R-A-L) worden automatisch samengevoegd.",
			"Zelfcorrecties (\"nee niet X maar Y\") worden herkend.",
		],
		privacy: "Privacy",
		privacyItems: [
			"Audio wordt via HTTPS/WSS naar de Mistral API gestuurd en niet lokaal opgeslagen.",
			"Instellingen (incl. API-sleutel) staan in data.json in de Obsidian plugin-map.",
			"Logexport bevat geen getranscribeerde tekst of API-sleutels.",
		],
	},
	en: {
		title: "Voxtral Voice Commands",
		command: "Command",
		say: "Say...",
		tips: "Tips",
		tipItems: [
			"Commands are recognized at the end of a sentence.",
			"Say \"for the correction: ...\" to give inline instructions to the corrector.",
			"Spelled-out words (V-O-X-T-R-A-L) are merged automatically.",
			"Self-corrections (\"no not X but Y\") are recognized.",
		],
		privacy: "Privacy",
		privacyItems: [
			"Audio is sent to the Mistral API over HTTPS/WSS and is not stored locally.",
			"Settings (including your API key) are stored in data.json in the plugin folder.",
			"Log export does not contain transcribed text or API keys.",
		],
	},
	fr: {
		title: "Commandes vocales Voxtral",
		command: "Commande",
		say: "Dites...",
		tips: "Conseils",
		tipItems: [
			"Les commandes sont reconnues à la fin d'une phrase.",
			"Dites \"pour la correction : ...\" pour donner des instructions au correcteur.",
			"Les mots épelés (V-O-X-T-R-A-L) sont fusionnés automatiquement.",
			"Les auto-corrections (\"non pas X mais Y\") sont reconnues.",
		],
		privacy: "Confidentialité",
		privacyItems: [
			"L'audio est envoyé à l'API Mistral via HTTPS/WSS et n'est pas stocké localement.",
			"Les paramètres (y compris la clé API) sont stockés dans data.json.",
			"L'export des logs ne contient ni texte transcrit ni clés API.",
		],
	},
	de: {
		title: "Voxtral Sprachbefehle",
		command: "Befehl",
		say: "Sagen Sie...",
		tips: "Tipps",
		tipItems: [
			"Befehle werden am Ende eines Satzes erkannt.",
			"Sagen Sie \"für die Korrektur: ...\" um dem Korrektor Anweisungen zu geben.",
			"Buchstabierte Wörter (V-O-X-T-R-A-L) werden automatisch zusammengeführt.",
			"Selbstkorrekturen (\"nein nicht X sondern Y\") werden erkannt.",
		],
		privacy: "Datenschutz",
		privacyItems: [
			"Audio wird über HTTPS/WSS an die Mistral-API gesendet und nicht lokal gespeichert.",
			"Einstellungen (inkl. API-Schlüssel) werden in data.json gespeichert.",
			"Der Log-Export enthält weder transkribierten Text noch API-Schlüssel.",
		],
	},
	es: {
		title: "Comandos de voz Voxtral",
		command: "Comando",
		say: "Diga...",
		tips: "Consejos",
		tipItems: [
			"Los comandos se reconocen al final de una oración.",
			"Diga \"para la corrección: ...\" para dar instrucciones al corrector.",
			"Las palabras deletreadas (V-O-X-T-R-A-L) se fusionan automáticamente.",
			"Las autocorrecciones (\"no, no X sino Y\") se reconocen.",
		],
		privacy: "Privacidad",
		privacyItems: [
			"El audio se envía a la API de Mistral por HTTPS/WSS y no se almacena localmente.",
			"La configuración (incluida la clave API) se almacena en data.json.",
			"La exportación de registros no contiene texto transcrito ni claves API.",
		],
	},
	pt: {
		title: "Comandos de voz Voxtral",
		command: "Comando",
		say: "Diga...",
		tips: "Dicas",
		tipItems: [
			"Os comandos são reconhecidos no final de uma frase.",
			"Diga \"para a correção: ...\" para dar instruções ao corretor.",
			"Palavras soletradas (V-O-X-T-R-A-L) são mescladas automaticamente.",
			"Autocorreções (\"não, não X mas Y\") são reconhecidas.",
		],
		privacy: "Privacidade",
		privacyItems: [
			"O áudio é enviado à API Mistral via HTTPS/WSS e não é armazenado localmente.",
			"As configurações (incluindo a chave API) são armazenadas em data.json.",
			"A exportação de logs não contém texto transcrito nem chaves API.",
		],
	},
	it: {
		title: "Comandi vocali Voxtral",
		command: "Comando",
		say: "Dì...",
		tips: "Suggerimenti",
		tipItems: [
			"I comandi vengono riconosciuti alla fine di una frase.",
			"Dì \"per la correzione: ...\" per dare istruzioni al correttore.",
			"Le parole compitate (V-O-X-T-R-A-L) vengono unite automaticamente.",
			"Le autocorrezioni (\"no non X ma Y\") vengono riconosciute.",
		],
		privacy: "Privacy",
		privacyItems: [
			"L'audio viene inviato all'API Mistral tramite HTTPS/WSS e non viene salvato localmente.",
			"Le impostazioni (inclusa la chiave API) sono memorizzate in data.json.",
			"L'esportazione dei log non contiene testo trascritto né chiavi API.",
		],
	},
};

function getStrings(lang: string) {
	return UI_STRINGS[lang] ?? UI_STRINGS.en;
}

export class VoxtralHelpView extends ItemView {
	private lang = "nl";

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_VOXTRAL_HELP;
	}

	getDisplayText(): string {
		return "Voice commands";
	}

	getIcon(): string {
		return "mic";
	}

	/** Call this to update the language and re-render. */
	setLanguage(lang: string): void {
		this.lang = lang;
		this.render();
	}

	// eslint-disable-next-line @typescript-eslint/require-await -- base class requires async signature
	async onOpen(): Promise<void> {
		this.render();
	}

	private render(): void {
		const container = this.contentEl;
		container.empty();
		renderHelpContent(container, this.lang);
	}

	// eslint-disable-next-line @typescript-eslint/require-await -- base class requires async signature
	async onClose(): Promise<void> {
		this.contentEl.empty();
	}
}

/** Shared render logic used by both the sidebar view and the mobile modal. */
function renderHelpContent(container: HTMLElement, lang: string): void {
	container.addClass("voxtral-help-view");

	const strings = getStrings(lang);
	container.createEl("h3", { text: strings.title });

	const commands = getCommandList();

	const table = container.createEl("table", {
		cls: "voxtral-help-table",
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
			cls: "voxtral-help-label",
		});
		row.createEl("td", {
			text: cmd.patterns
				.slice(0, 2)
				.map((p) => `"${p}"`)
				.join(" / "),
			cls: "voxtral-help-patterns",
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
}

/** Modal variant of the help panel for mobile use. */
export class VoxtralHelpModal extends Modal {
	constructor(app: App, private lang: string) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("voxtral-help-modal");
		renderHelpContent(this.contentEl, this.lang);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
