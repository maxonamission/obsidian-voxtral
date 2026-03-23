/**
 * Minimal mock of the Obsidian API for unit testing.
 * Only stubs the parts used by tested modules.
 */

// Editor mock — voice-commands.ts uses Editor as a type + some methods
export class Editor {
	private content = "";
	private cursor = { line: 0, ch: 0 };

	getCursor() { return { ...this.cursor }; }
	setCursor(pos: { line: number; ch: number }) { this.cursor = { ...pos }; }
	getLine(_line: number) { return ""; }
	getValue() { return this.content; }
	replaceRange(_text: string, _from: unknown, _to?: unknown) {}
	posToOffset(_pos: unknown) { return 0; }
	offsetToPos(_offset: number) { return { line: 0, ch: 0 }; }
	undo() {}
	getRange(_from: unknown, _to: unknown) { return ""; }
}

// requestUrl mock — mistral-api.ts uses this for API calls
export function requestUrl(_options: unknown) {
	return Promise.resolve({ json: {}, text: "", status: 200 });
}

// Notice mock
export class Notice {
	constructor(_message: string, _timeout?: number) {}
}

// Other stubs that may be transitively imported
export class Plugin {}
export class PluginSettingTab {}
export class App {}
export class Modal {}
export class Setting {}
export class ItemView {}
export class WorkspaceLeaf {}
export class TFile {}
export class TFolder {}
export const Platform = { isMobile: false, isDesktop: true };
