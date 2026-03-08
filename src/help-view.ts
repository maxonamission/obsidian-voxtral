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
		return "Voice Commands";
	}

	getIcon(): string {
		return "mic";
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("voxtral-help-view");

		container.createEl("h3", { text: "Voxtral Voice Commands" });

		const commands = getCommandList();

		const table = container.createEl("table", {
			cls: "voxtral-help-table",
		});

		// Header
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		headerRow.createEl("th", { text: "Command" });
		headerRow.createEl("th", { text: "Say..." });

		// Body
		const tbody = table.createEl("tbody");
		for (const cmd of commands) {
			const row = tbody.createEl("tr");
			row.createEl("td", {
				text: cmd.label,
				cls: "voxtral-help-label",
			});
			row.createEl("td", {
				text: cmd.patterns.slice(0, 2).map((p) => `"${p}"`).join(" or "),
				cls: "voxtral-help-patterns",
			});
		}

		// Tips section
		container.createEl("h4", { text: "Tips" });
		const tips = container.createEl("ul", { cls: "voxtral-help-tips" });
		tips.createEl("li", {
			text: "Commands are recognized at the end of a sentence.",
		});
		tips.createEl("li", {
			text: 'Say "for the correction: ..." to give inline instructions to the corrector.',
		});
		tips.createEl("li", {
			text: "Spelled-out words (V-O-X-T-R-A-L) are merged automatically.",
		});
		tips.createEl("li", {
			text: 'Self-corrections ("no not X but Y") are recognized.',
		});
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}
}
