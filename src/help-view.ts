import { ItemView, WorkspaceLeaf } from "obsidian";
import { getCommandList } from "./voice-commands";

export const VIEW_TYPE_VOXTRAL_HELP = "voxtral-help";

export class VoxtralHelpView extends ItemView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_VOXTRAL_HELP;
	}

	getDisplayText(): string {
		return "Stemcommando's";
	}

	getIcon(): string {
		return "mic";
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("voxtral-help-view");

		container.createEl("h3", { text: "Voxtral Stemcommando's" });

		const commands = getCommandList();

		const table = container.createEl("table", {
			cls: "voxtral-help-table",
		});

		// Header
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		headerRow.createEl("th", { text: "Commando" });
		headerRow.createEl("th", { text: "Zeg..." });

		// Body
		const tbody = table.createEl("tbody");
		for (const cmd of commands) {
			const row = tbody.createEl("tr");
			row.createEl("td", {
				text: cmd.label,
				cls: "voxtral-help-label",
			});
			row.createEl("td", {
				text: cmd.patterns.slice(0, 2).map((p) => `"${p}"`).join(" of "),
				cls: "voxtral-help-patterns",
			});
		}

		// Tips section
		container.createEl("h4", { text: "Tips" });
		const tips = container.createEl("ul", { cls: "voxtral-help-tips" });
		tips.createEl("li", {
			text: "Commando's worden herkend aan het einde van een zin.",
		});
		tips.createEl("li", {
			text: 'Zeg "voor de correctie: ..." om inline instructies mee te geven.',
		});
		tips.createEl("li", {
			text: "Gespelde woorden (V-O-X-T-R-A-L) worden samengevoegd.",
		});
		tips.createEl("li", {
			text: 'Zelfcorrecties ("nee niet X maar Y") worden herkend.',
		});
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}
}
