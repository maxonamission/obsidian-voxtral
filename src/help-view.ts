// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe
import { ItemView, WorkspaceLeaf } from "obsidian";
import { getCommandList } from "./voice-commands";

export const VIEW_TYPE_VOXTRAL_HELP = "voxtral-help";

/** Localized UI strings for the help panel */
const UI_STRINGS: Record<string, { title: string; command: string; say: string; tips: string; tipItems: string[] }> = {
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
		return "Voice Commands";
	}

	getIcon(): string {
		return "mic";
	}

	/** Call this to update the language and re-render. */
	setLanguage(lang: string): void {
		this.lang = lang;
		this.render();
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	private render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass("voxtral-help-view");

		const strings = getStrings(this.lang);
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
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}
}
