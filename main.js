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
var import_obsidian4 = require("obsidian");

// src/types.ts
var DEFAULT_SETTINGS = {
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
  dismissMobileBatchNotice: false
};
var DEFAULT_CORRECT_PROMPT = "You are a precise text corrector for dictated text. The input language may vary (commonly Dutch, but follow whatever language the text is in).\n\nCORRECT ONLY:\n- Capitalization (sentence starts, proper nouns)\n- Clearly misspelled or garbled words (from speech recognition)\n- Missing or wrong punctuation\n\nDO NOT CHANGE:\n- Sentence structure or word order\n- Style or tone\n- Markdown formatting (# headings, - lists, - [ ] to-do items)\n\nINLINE CORRECTION INSTRUCTIONS:\nThe text was dictated via speech recognition. The speaker sometimes gives inline instructions meant for you. Recognize these patterns:\n- Explicit markers: 'voor de correctie', 'voor de correctie achteraf', 'for the correction', 'correction note'\n- Spelled-out words: 'V-O-X-T-R-A-L' or 'with an x' \u2192 merge into the intended word\n- Self-corrections: 'no not X but Y', 'nee niet X maar Y', 'I mean Y', 'ik bedoel Y'\n- Meta-commentary: 'that's a Dutch word', 'with a capital letter', 'met een hoofdletter'\n\nWhen you encounter such instructions:\n1. Apply the instruction to the REST of the text\n2. Remove the instruction/meta-commentary itself from the output\n3. Keep all content text \u2014 NEVER remove normal sentences\n\nCRITICAL RULES:\n- Your output must be SHORTER than or equal to the input (after removing meta-instructions)\n- NEVER add your own text, commentary, explanations, or notes\n- NEVER add parenthesized text like '(text missing)' or '(no corrections needed)'\n- NEVER continue, elaborate, or expand on the content\n- NEVER invent or hallucinate text that wasn't in the input\n- If the input is short (even one word), just return it corrected\n- Your output must contain ONLY the corrected version of the input text, NOTHING else";

// src/settings-tab.ts
var import_obsidian = require("obsidian");

// src/audio-recorder.ts
var AudioRecorder = class {
  constructor() {
    this.stream = null;
    this.audioContext = null;
    this.sourceNode = null;
    this.processorNode = null;
    this.mediaRecorder = null;
    this.chunks = [];
    this.lastFlushTime = 0;
    this.onPcmChunk = null;
    /** The label of the currently active microphone */
    this.activeMicLabel = "";
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
  async start(deviceId, onPcmChunk) {
    this.onPcmChunk = onPcmChunk || null;
    const constraints = {
      audio: deviceId ? { deviceId: { exact: deviceId } } : true
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    const audioTrack = this.stream.getAudioTracks()[0];
    this.activeMicLabel = (audioTrack == null ? void 0 : audioTrack.label) || "Onbekende microfoon";
    this.audioContext = new AudioContext({ sampleRate: 16e3 });
    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
    if (this.onPcmChunk) {
      this.processorNode = this.audioContext.createScriptProcessor(
        4096,
        1,
        1
      );
      this.processorNode.onaudioprocess = (e) => {
        this.processAudio(e);
      };
      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);
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
  }
  processAudio(e) {
    var _a;
    const inputData = e.inputBuffer.getChannelData(0);
    const pcm16 = new Int16Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) {
      const s = Math.max(-1, Math.min(1, inputData[i]));
      pcm16[i] = s < 0 ? s * 32768 : s * 32767;
    }
    (_a = this.onPcmChunk) == null ? void 0 : _a.call(this, pcm16.buffer);
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
      this.mediaRecorder.onstop = () => {
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
      this.mediaRecorder.stop();
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
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.chunks = [];
    this.activeMicLabel = "";
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

// src/settings-tab.ts
var VoxtralSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Voxtral Transcribe" });
    new import_obsidian.Setting(containerEl).setName("Mistral API key").setDesc("Your API key from platform.mistral.ai").addText(
      (text) => text.setPlaceholder("sk-...").setValue(this.plugin.settings.apiKey).onChange(async (value) => {
        this.plugin.settings.apiKey = value.trim();
        await this.plugin.saveSettings();
      })
    ).then((setting) => {
      const input = setting.controlEl.querySelector("input");
      if (input) input.type = "password";
    });
    const micSetting = new import_obsidian.Setting(containerEl).setName("Microphone").setDesc("Select which microphone to use");
    micSetting.addDropdown((drop) => {
      drop.addOption("", "System default");
      drop.setValue(this.plugin.settings.microphoneDeviceId);
      AudioRecorder.enumerateMicrophones().then((mics) => {
        for (const mic of mics) {
          drop.addOption(mic.deviceId, mic.label);
        }
        drop.setValue(this.plugin.settings.microphoneDeviceId);
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
        })
      );
    }
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
          this.display();
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
    new import_obsidian.Setting(containerEl).setName("Language").setDesc("Language for transcription (ISO 639-1 code, e.g. 'en', 'nl', 'de')").addText(
      (text) => text.setPlaceholder("nl").setValue(this.plugin.settings.language).onChange(async (value) => {
        this.plugin.settings.language = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Auto-correct").setDesc(
      "Automatically correct spelling, capitalization, and punctuation after recording"
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoCorrect).onChange(async (value) => {
        this.plugin.settings.autoCorrect = value;
        await this.plugin.saveSettings();
      })
    );
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
    containerEl.createEl("h3", { text: "Support this project" });
    new import_obsidian.Setting(containerEl).setName("Buy Me a Coffee").setDesc("Find this plugin useful? Consider a donation!").addButton(
      (btn) => btn.setButtonText("Buy Me a Coffee").onClick(() => {
        window.open("https://buymeacoffee.com/maxonamission");
      })
    );
    containerEl.createEl("h3", { text: "Advanced" });
    new import_obsidian.Setting(containerEl).setName("Realtime model").addText(
      (text) => text.setValue(this.plugin.settings.realtimeModel).onChange(async (value) => {
        this.plugin.settings.realtimeModel = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Batch model").addText(
      (text) => text.setValue(this.plugin.settings.batchModel).onChange(async (value) => {
        this.plugin.settings.batchModel = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Correction model").addText(
      (text) => text.setValue(this.plugin.settings.correctModel).onChange(async (value) => {
        this.plugin.settings.correctModel = value.trim();
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
        textarea.style.width = "100%";
      }
    });
  }
};

// src/help-view.ts
var import_obsidian2 = require("obsidian");

// src/voice-commands.ts
function normalizeCommand(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/-/g, " ").replace(/[.,!?;:'"()[\]{}]/g, "").toLowerCase().trim();
}
function fixMishearings(text) {
  return text.replace(/\bniveau\b/g, "nieuwe").replace(/\bnieuw alinea\b/g, "nieuwe alinea").replace(/\bnieuw regel\b/g, "nieuwe regel").replace(/\bnieuw punt\b/g, "nieuw punt");
}
function insertAtCursor(editor, text) {
  const cursor = editor.getCursor();
  if (cursor.ch > 0 && text.length > 0 && !/^[\s\n]/.test(text)) {
    const charBefore = editor.getRange(
      { line: cursor.line, ch: cursor.ch - 1 },
      cursor
    );
    if (charBefore && /\S/.test(charBefore)) {
      text = " " + text;
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
var COMMANDS = [
  {
    label: "New paragraph",
    patterns: [
      "nieuwe alinea",
      "nieuw alinea",
      "nieuwe paragraaf",
      "nieuw paragraaf",
      "nieuwe linie",
      "new paragraph"
    ],
    action: (editor) => insertAtCursor(editor, "\n\n")
  },
  {
    label: "New line",
    patterns: ["nieuwe regel", "nieuwe lijn", "new line", "volgende regel"],
    action: (editor) => insertAtCursor(editor, "\n")
  },
  {
    label: "Heading 1",
    patterns: ["kop een", "kop 1", "kop een", "heading one", "heading 1"],
    action: (editor) => insertAtCursor(editor, "\n\n# ")
  },
  {
    label: "Heading 2",
    patterns: ["kop twee", "kop 2", "heading two", "heading 2"],
    action: (editor) => insertAtCursor(editor, "\n\n## ")
  },
  {
    label: "Heading 3",
    patterns: ["kop drie", "kop 3", "heading three", "heading 3"],
    action: (editor) => insertAtCursor(editor, "\n\n### ")
  },
  {
    label: "Bullet point",
    patterns: [
      "nieuw punt",
      "nieuw lijstpunt",
      "nieuw lijstitem",
      "lijst punt",
      "nieuw bullet",
      "nieuw item",
      "nieuwe item",
      "volgend item",
      "new item",
      "next item",
      "bullet",
      "bullet point",
      "volgend punt"
    ],
    action: (editor) => insertAtCursor(editor, "\n- ")
  },
  {
    label: "To-do item",
    patterns: [
      "nieuw to do item",
      "nieuw todo item",
      "nieuw todo",
      "nieuwe to do",
      "nieuwe todo",
      "nieuw taak",
      "nieuwe taak",
      "new todo",
      "new to do",
      "to do item",
      "todo item"
    ],
    action: (editor) => insertAtCursor(editor, "\n- [ ] ")
  },
  {
    label: "Numbered item",
    patterns: [
      "nieuw genummerd item",
      "nieuw genummerd punt",
      "genummerd punt",
      "genummerd item",
      "volgend nummer",
      "nummer punt",
      "numbered item",
      "new numbered item"
    ],
    action: (editor) => {
      const cursor = editor.getCursor();
      const lineText = editor.getLine(cursor.line);
      const match = lineText.match(/^(\d+)\.\s/);
      const nextNum = match ? parseInt(match[1], 10) + 1 : 1;
      insertAtCursor(editor, `
${nextNum}. `);
    }
  },
  {
    label: "Delete last paragraph",
    patterns: [
      "verwijder laatste alinea",
      "verwijder laatste paragraaf",
      "wis laatste alinea",
      "delete last paragraph"
    ],
    action: (editor) => deleteLastParagraph(editor)
  },
  {
    label: "Delete last line",
    patterns: [
      "verwijder laatste regel",
      "verwijder laatste zin",
      "wis laatste regel",
      "wist laatste regel",
      "delete last line"
    ],
    action: (editor) => deleteLastSentence(editor)
  },
  {
    label: "Undo",
    patterns: ["herstel", "ongedaan maken", "undo"],
    action: (editor) => {
      editor.undo();
    }
  }
];
function matchCommand(rawText) {
  const normalized = fixMishearings(normalizeCommand(rawText));
  for (const cmd of COMMANDS) {
    for (const pattern of cmd.patterns) {
      if (normalized.endsWith(pattern)) {
        const patternWordCount = pattern.split(/\s+/).length;
        const rawWords = rawText.trimEnd().split(/\s+/);
        const textBefore = rawWords.slice(0, -patternWordCount).join(" ").trimEnd();
        return { command: cmd, textBefore };
      }
    }
  }
  return null;
}
function processText(editor, text) {
  const segments = text.match(/[^.!?]+[.!?]+\s*/g);
  if (!segments) {
    processSegment(editor, text);
    return;
  }
  const joined = segments.join("");
  const remainder = text.slice(joined.length);
  for (const segment of segments) {
    processSegment(editor, segment);
  }
  if (remainder.trim()) {
    processSegment(editor, remainder);
  }
}
function processSegment(editor, text) {
  const match = matchCommand(text);
  if (match) {
    if (match.textBefore) {
      insertAtCursor(editor, match.textBefore);
    }
    match.command.action(editor);
  } else {
    insertAtCursor(editor, text);
  }
}
function getCommandList() {
  return COMMANDS.map((c) => ({
    label: c.label,
    patterns: c.patterns
  }));
}

// src/help-view.ts
var VIEW_TYPE_VOXTRAL_HELP = "voxtral-help";
var VoxtralHelpView = class extends import_obsidian2.ItemView {
  constructor(leaf) {
    super(leaf);
  }
  getViewType() {
    return VIEW_TYPE_VOXTRAL_HELP;
  }
  getDisplayText() {
    return "Voice Commands";
  }
  getIcon() {
    return "mic";
  }
  async onOpen() {
    const container = this.contentEl;
    container.empty();
    container.addClass("voxtral-help-view");
    container.createEl("h3", { text: "Voxtral Voice Commands" });
    const commands = getCommandList();
    const table = container.createEl("table", {
      cls: "voxtral-help-table"
    });
    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    headerRow.createEl("th", { text: "Command" });
    headerRow.createEl("th", { text: "Say..." });
    const tbody = table.createEl("tbody");
    for (const cmd of commands) {
      const row = tbody.createEl("tr");
      row.createEl("td", {
        text: cmd.label,
        cls: "voxtral-help-label"
      });
      row.createEl("td", {
        text: cmd.patterns.slice(0, 2).map((p) => `"${p}"`).join(" or "),
        cls: "voxtral-help-patterns"
      });
    }
    container.createEl("h4", { text: "Tips" });
    const tips = container.createEl("ul", { cls: "voxtral-help-tips" });
    tips.createEl("li", {
      text: "Commands are recognized at the end of a sentence."
    });
    tips.createEl("li", {
      text: 'Say "for the correction: ..." to give inline instructions to the corrector.'
    });
    tips.createEl("li", {
      text: "Spelled-out words (V-O-X-T-R-A-L) are merged automatically."
    });
    tips.createEl("li", {
      text: 'Self-corrections ("no not X but Y") are recognized.'
    });
  }
  async onClose() {
    this.contentEl.empty();
  }
};

// src/mistral-api.ts
var import_obsidian3 = require("obsidian");
var BASE_URL = "https://api.mistral.ai";
function isLikelyHallucination(text, audioDurationSec) {
  if (!text.trim()) return false;
  const words = text.trim().split(/\s+/).length;
  const wordsPerSec = audioDurationSec > 0 ? words / audioDurationSec : words;
  if (wordsPerSec > 5 && words > 20) {
    console.warn(
      `Voxtral: Hallucination detected \u2014 ${words} words in ${audioDurationSec.toFixed(1)}s (${wordsPerSec.toFixed(1)} w/s)`
    );
    return true;
  }
  const blocks = text.split(/\n---\n|^---$/m).filter((b) => b.trim());
  if (blocks.length >= 3) {
    console.warn(
      `Voxtral: Hallucination detected \u2014 ${blocks.length} repeated blocks separated by ---`
    );
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
        console.warn(
          "Voxtral: Hallucination detected \u2014 repeated sentences"
        );
        return true;
      }
    }
  }
  return false;
}
async function transcribeBatch(audioBlob, settings, diarize = false) {
  const ext = audioBlob.type.includes("mp4") ? "m4a" : audioBlob.type.includes("ogg") ? "ogg" : "webm";
  const formData = new FormData();
  formData.append("file", audioBlob, `recording.${ext}`);
  formData.append("model", settings.batchModel);
  if (settings.language) {
    formData.append("language", settings.language);
  }
  if (diarize) {
    formData.append("diarize", "true");
  }
  const response = await fetch(`${BASE_URL}/v1/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: formData
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Transcription failed (${response.status}): ${err}`);
  }
  const data = await response.json();
  return data.text || "";
}
async function correctText(text, settings) {
  var _a, _b, _c, _d;
  const systemPrompt = settings.systemPrompt || DEFAULT_CORRECT_PROMPT;
  const body = {
    model: settings.correctModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text }
    ],
    temperature: 0.1
  };
  const response = await (0, import_obsidian3.requestUrl)({
    url: `${BASE_URL}/v1/chat/completions`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (response.status !== 200) {
    throw new Error(
      `Correction failed (${response.status}): ${response.text}`
    );
  }
  const data = response.json;
  let result = ((_d = (_c = (_b = (_a = data.choices) == null ? void 0 : _a[0]) == null ? void 0 : _b.message) == null ? void 0 : _c.content) == null ? void 0 : _d.trim()) || text;
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
var WS_OPEN = 1;
function createNodeWebSocket(url, headers, callbacks) {
  const https = require("https");
  const crypto = require("crypto");
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
    }
  );
  req.on("upgrade", (res, socket) => {
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
      const mask = crypto.randomBytes(4);
      mask.copy(closeFrame, 2);
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
          let closeCode = 0;
          let closeReason = "";
          if (payload.length >= 2) {
            closeCode = payload.readUInt16BE(0);
            if (payload.length > 2) {
              closeReason = payload.subarray(2).toString("utf-8");
            }
          }
          console.log(
            `Voxtral: WebSocket close frame received \u2014 code=${closeCode} reason="${closeReason}"`
          );
          conn.readyState = 3;
          clearInterval(pingInterval);
          socket.end();
          callbacks.onClose();
          return;
        } else if (opcode === 9) {
          const pong = Buffer.alloc(6);
          pong[0] = 138;
          pong[1] = 128;
          const pongMask = crypto.randomBytes(4);
          pongMask.copy(pong, 2);
          socket.write(pong);
        }
      }
    });
    socket.on("close", () => {
      conn.readyState = 3;
      clearInterval(pingInterval);
      callbacks.onClose();
    });
    socket.on("error", (err) => {
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
var RealtimeTranscriber = class {
  constructor(settings, callbacks) {
    this.ws = null;
    this.intentionallyClosed = false;
    this.settings = settings;
    this.callbacks = callbacks;
  }
  async connect() {
    this.intentionallyClosed = false;
    const params = new URLSearchParams({
      model: this.settings.realtimeModel
    });
    const url = `https://api.mistral.ai/v1/audio/transcriptions/realtime?${params}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        var _a;
        (_a = this.ws) == null ? void 0 : _a.close();
        reject(new Error("WebSocket connection timeout"));
      }, 1e4);
      this.ws = createNodeWebSocket(
        url,
        {
          Authorization: `Bearer ${this.settings.apiKey}`
        },
        {
          onOpen: () => {
          },
          onMessage: (data) => {
            var _a, _b, _c;
            try {
              const msg = JSON.parse(data);
              console.log(
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
                  console.log(
                    "Voxtral WS: session updated",
                    JSON.stringify(msg.session || {})
                  );
                  break;
                case "transcription.text.delta":
                  this.callbacks.onDelta(msg.text || "");
                  break;
                case "transcription.done":
                  console.log(
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
                  console.log(
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
            console.log(
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
  sendSessionUpdate() {
    if (!this.ws) return;
    const msg = {
      type: "session.update",
      session: {
        audio_format: {
          encoding: "pcm_s16le",
          sample_rate: 16e3
        },
        target_streaming_delay_ms: this.settings.streamingDelayMs
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

// src/main.ts
function hasNodeJs() {
  try {
    require("https");
    return true;
  } catch (e) {
    return false;
  }
}
var VoxtralPlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.realtimeTranscriber = null;
    this.isRecording = false;
    this.isPaused = false;
    this.isTypingMuted = false;
    this.typingResumeTimer = null;
    this.focusPauseTimer = null;
    this.statusBarEl = null;
    this.sendRibbonEl = null;
    this.mobileActionEl = null;
    this.pendingText = "";
    this.chunkIndex = 0;
    this.consecutiveFailures = 0;
    this.maxConsecutiveFailures = 5;
    this.currentEditor = null;
  }
  /** Whether realtime mode is available on this platform */
  get canRealtime() {
    return !import_obsidian4.Platform.isMobile && hasNodeJs();
  }
  /** Effective mode: fall back to batch on mobile */
  get effectiveMode() {
    if (this.settings.mode === "realtime" && this.canRealtime) {
      return "realtime";
    }
    return "batch";
  }
  async onload() {
    await this.loadSettings();
    this.recorder = new AudioRecorder();
    this.registerView(
      VIEW_TYPE_VOXTRAL_HELP,
      (leaf) => new VoxtralHelpView(leaf)
    );
    this.addRibbonIcon("mic", "Voxtral: Start/stop recording", () => {
      this.toggleRecording();
    });
    if (!import_obsidian4.Platform.isMobile) {
      this.statusBarEl = this.addStatusBarItem();
      this.updateStatusBar("idle");
    }
    this.addCommand({
      id: "toggle-recording",
      name: "Start/stop recording",
      icon: "mic",
      callback: () => this.toggleRecording(),
      hotkeys: [{ modifiers: ["Ctrl"], key: " " }]
    });
    this.addCommand({
      id: "send-chunk",
      name: "Send audio chunk (tap-to-send)",
      icon: "send",
      callback: () => this.sendChunk()
    });
    this.addCommand({
      id: "open-help-panel",
      name: "Show voice commands (side panel)",
      icon: "help-circle",
      callback: () => this.openHelpPanel()
    });
    this.addCommand({
      id: "correct-selection",
      name: "Correct selected text",
      icon: "spell-check",
      editorCallback: (editor) => this.correctSelection(editor)
    });
    this.addCommand({
      id: "correct-all",
      name: "Correct entire note",
      icon: "file-check",
      editorCallback: (editor) => this.correctAll(editor)
    });
    this.addSettingTab(new VoxtralSettingTab(this.app, this));
    this.registerDomEvent(document, "visibilitychange", () => {
      this.handleVisibilityChange();
    });
    this.registerDomEvent(document, "keydown", (e) => {
      this.handleTypingMute(e);
    });
  }
  onunload() {
    if (this.isRecording) {
      this.stopRecording();
    }
    this.removeSendButton();
  }
  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  // ── Send button (shown during batch recording) ──
  addSendButton() {
    this.removeSendButton();
    this.sendRibbonEl = this.addRibbonIcon(
      "send",
      "Voxtral: Send chunk",
      () => this.sendChunk()
    );
    this.sendRibbonEl.addClass("voxtral-send-button");
    if (import_obsidian4.Platform.isMobile) {
      const view = this.app.workspace.getActiveViewOfType(import_obsidian4.MarkdownView);
      if (view) {
        this.mobileActionEl = view.addAction(
          "send",
          "Voxtral: Send chunk",
          () => this.sendChunk()
        );
        this.mobileActionEl.addClass("voxtral-mobile-send");
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
  }
  // ── Visibility (auto-pause on background) ──
  handleVisibilityChange() {
    if (!this.isRecording) return;
    const behavior = this.settings.focusBehavior;
    if (document.hidden) {
      this.clearFocusPauseTimer();
      if (behavior === "keep-recording") {
        console.log("Voxtral: App backgrounded, recording continues");
      } else if (behavior === "pause-after-delay") {
        const delaySec = this.settings.focusPauseDelaySec;
        console.log(
          `Voxtral: App backgrounded, pausing in ${delaySec}s`
        );
        this.focusPauseTimer = setTimeout(() => {
          if (this.isRecording && document.hidden) {
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
    console.log("Voxtral: Recording paused (app backgrounded)");
  }
  resumeRecording() {
    this.isPaused = false;
    this.recorder.resume();
    this.updateStatusBar("recording");
    new import_obsidian4.Notice("Voxtral: Recording resumed");
    console.log("Voxtral: Recording resumed (app foregrounded)");
  }
  clearFocusPauseTimer() {
    if (this.focusPauseTimer) {
      clearTimeout(this.focusPauseTimer);
      this.focusPauseTimer = null;
    }
  }
  // ── Typing mute (prevent keyboard noise from being transcribed) ──
  handleTypingMute(e) {
    if (!this.isRecording || this.isPaused) return;
    if (e.key === "Control" || e.key === "Alt" || e.key === "Shift" || e.key === "Meta" || e.ctrlKey || e.metaKey) {
      return;
    }
    if (e.key === "Escape" || e.key === "Tab" || e.key === "Enter" || e.key === "Backspace" || e.key === "Delete" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End" || e.key === "PageUp" || e.key === "PageDown" || e.key.startsWith("F") && e.key.length <= 3) {
      return;
    }
    if (!this.isTypingMuted) {
      this.isTypingMuted = true;
      this.recorder.mute();
    }
    if (this.typingResumeTimer) {
      clearTimeout(this.typingResumeTimer);
    }
    this.typingResumeTimer = setTimeout(() => {
      if (this.isRecording && this.isTypingMuted && !this.isPaused) {
        this.isTypingMuted = false;
        this.recorder.unmute();
      }
    }, 800);
  }
  // ── Recording toggle ──
  async toggleRecording() {
    if (this.isRecording) {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }
  async startRecording() {
    if (!this.settings.apiKey) {
      new import_obsidian4.Notice(
        "Voxtral: Please set your Mistral API key in the plugin settings."
      );
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(import_obsidian4.MarkdownView);
    if (!view) {
      new import_obsidian4.Notice("Voxtral: Open a note first to start dictating.");
      return;
    }
    const editor = view.editor;
    this.currentEditor = editor;
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
      if (!import_obsidian4.Platform.isMobile) {
        this.openHelpPanel();
      }
      const micName = this.recorder.activeMicLabel;
      if (this.effectiveMode === "batch") {
        if (import_obsidian4.Platform.isMobile && !this.settings.dismissMobileBatchNotice) {
          const frag = document.createDocumentFragment();
          frag.createSpan({
            text: `Recording started (${micName}). Tap the send button (\u2191) to transcribe chunks while you keep talking.`
          });
          frag.createEl("br");
          const dismiss = frag.createEl("a", {
            text: "Don\u2019t show again",
            href: "#"
          });
          dismiss.style.opacity = "0.7";
          dismiss.style.fontSize = "0.85em";
          dismiss.addEventListener("click", (e) => {
            e.preventDefault();
            this.settings.dismissMobileBatchNotice = true;
            this.saveSettings();
          });
          new import_obsidian4.Notice(frag, 8e3);
        } else {
          new import_obsidian4.Notice(
            `Voxtral: Recording started (${micName})
Tap send to transcribe while you keep talking.`,
            6e3
          );
        }
      } else {
        new import_obsidian4.Notice(`Voxtral: Recording started (${micName})`);
      }
    } catch (e) {
      console.error("Voxtral: Failed to start recording", e);
      new import_obsidian4.Notice(`Voxtral: Could not start recording: ${e}`);
      this.updateStatusBar("idle");
    }
  }
  async stopRecording() {
    this.isRecording = false;
    this.isPaused = false;
    this.isTypingMuted = false;
    if (this.typingResumeTimer) {
      clearTimeout(this.typingResumeTimer);
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
      console.error("Voxtral: Failed to stop recording", e);
      new import_obsidian4.Notice(`Voxtral: Error stopping recording: ${e}`);
    }
    this.currentEditor = null;
    this.updateStatusBar("idle");
    new import_obsidian4.Notice("Voxtral: Recording stopped");
  }
  // ── Tap-to-send: flush current audio chunk without stopping ──
  async sendChunk() {
    if (!this.isRecording || this.effectiveMode !== "batch") {
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(import_obsidian4.MarkdownView);
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
      let text = await transcribeBatch(blob, this.settings);
      if (text && isLikelyHallucination(
        text,
        this.recorder.lastChunkDurationSec
      )) {
        console.warn("Voxtral: Discarding hallucinated chunk");
        this.updateStatusBar("recording");
        return;
      }
      const hasCommand = text ? matchCommand(text) !== null : false;
      if (this.settings.autoCorrect && text && !hasCommand) {
        text = await correctText(text, this.settings);
      }
      this.updateStatusBar("recording");
      if (text) {
        processText(editor, text);
      }
    } catch (e) {
      console.error("Voxtral: Chunk transcription failed", e);
      this.updateStatusBar("recording");
      new import_obsidian4.Notice(`Voxtral: Chunk failed: ${e}`);
    }
  }
  // ── Realtime recording ──
  async startRealtimeRecording(editor) {
    this.pendingText = "";
    await this.connectRealtimeWebSocket(editor);
    const deviceId = this.settings.microphoneDeviceId || void 0;
    await this.recorder.start(deviceId, (pcmData) => {
      var _a;
      (_a = this.realtimeTranscriber) == null ? void 0 : _a.sendAudio(pcmData);
    });
  }
  async connectRealtimeWebSocket(editor) {
    this.realtimeTranscriber = new RealtimeTranscriber(this.settings, {
      onSessionCreated: () => {
        console.log("Voxtral: Realtime session created");
      },
      onDelta: (text) => {
        this.handleRealtimeDelta(editor, text);
      },
      onDone: (text) => {
        this.handleRealtimeDone(editor, text);
      },
      onError: (message) => {
        console.error("Voxtral: Realtime error:", message);
        new import_obsidian4.Notice(`Voxtral: Streaming error: ${message}`);
      },
      onDisconnect: () => {
        this.handleRealtimeDisconnect();
      }
    });
    await this.realtimeTranscriber.connect();
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
  async handleRealtimeDisconnect() {
    var _a;
    if (!this.isRecording) return;
    const editor = this.currentEditor || ((_a = this.app.workspace.getActiveViewOfType(import_obsidian4.MarkdownView)) == null ? void 0 : _a.editor);
    if (!editor) {
      this.stopRecording();
      return;
    }
    console.log("Voxtral: Session ended, reconnecting silently...");
    try {
      await this.connectRealtimeWebSocket(editor);
      this.consecutiveFailures = 0;
      console.log("Voxtral: Session reconnected");
    } catch (e) {
      this.consecutiveFailures++;
      console.error(
        `Voxtral: Reconnect failed (${this.consecutiveFailures}/${this.maxConsecutiveFailures})`,
        e
      );
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        new import_obsidian4.Notice(
          "Voxtral: Cannot connect to the API. Recording stopped.",
          6e3
        );
        this.stopRecording();
        return;
      }
      const delay = Math.min(
        500 * this.consecutiveFailures,
        3e3
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (this.isRecording) {
        this.handleRealtimeDisconnect();
      }
    }
  }
  handleRealtimeDelta(editor, text) {
    this.pendingText += text;
    const sentenceEnd = /[.!?]\s*$/;
    const longEnough = this.pendingText.length > 120;
    if (sentenceEnd.test(this.pendingText) || longEnough) {
      const sentence = this.pendingText.trim();
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
        this.stopRecording();
        return;
      }
      processText(editor, sentence + " ");
    }
  }
  handleRealtimeDone(editor, _text) {
    if (this.pendingText.trim()) {
      processText(editor, this.pendingText.trim() + " ");
      this.pendingText = "";
    }
  }
  async stopRealtimeRecording() {
    var _a, _b;
    (_a = this.realtimeTranscriber) == null ? void 0 : _a.endAudio();
    await new Promise((resolve) => setTimeout(resolve, 1e3));
    const view = this.app.workspace.getActiveViewOfType(import_obsidian4.MarkdownView);
    if (view && this.pendingText.trim()) {
      processText(view.editor, this.pendingText.trim());
      this.pendingText = "";
    }
    (_b = this.realtimeTranscriber) == null ? void 0 : _b.close();
    this.realtimeTranscriber = null;
    await this.recorder.stop();
    if (this.settings.autoCorrect && view) {
      await this.autoCorrectAfterStop(view.editor);
    }
  }
  // ── Batch recording ──
  async startBatchRecording() {
    const deviceId = this.settings.microphoneDeviceId || void 0;
    await this.recorder.start(deviceId);
  }
  async stopBatchRecording() {
    const blob = await this.recorder.stop();
    if (blob.size === 0) {
      new import_obsidian4.Notice("Voxtral: No audio recorded");
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(import_obsidian4.MarkdownView);
    if (!view) {
      new import_obsidian4.Notice("Voxtral: No active note found");
      return;
    }
    const editor = view.editor;
    try {
      let text = await transcribeBatch(blob, this.settings);
      if (text && isLikelyHallucination(
        text,
        this.recorder.lastChunkDurationSec
      )) {
        console.warn("Voxtral: Discarding hallucinated batch");
        return;
      }
      const hasCommand = text ? matchCommand(text) !== null : false;
      if (this.settings.autoCorrect && text && !hasCommand) {
        text = await correctText(text, this.settings);
      }
      if (text) {
        processText(editor, text);
      }
    } catch (e) {
      console.error("Voxtral: Batch transcription failed", e);
      new import_obsidian4.Notice(`Voxtral: Transcription failed: ${e}`);
    }
  }
  // ── Text correction ──
  async autoCorrectAfterStop(editor) {
    const text = editor.getValue();
    if (!text.trim()) return;
    try {
      const corrected = await correctText(text, this.settings);
      if (corrected && corrected !== text) {
        editor.setValue(corrected);
      }
    } catch (e) {
      console.error("Voxtral: Auto-correct failed", e);
    }
  }
  async correctSelection(editor) {
    const selection = editor.getSelection();
    if (!selection) {
      new import_obsidian4.Notice("Voxtral: Select text first to correct it");
      return;
    }
    if (!this.settings.apiKey) {
      new import_obsidian4.Notice("Voxtral: Please set your API key first");
      return;
    }
    try {
      new import_obsidian4.Notice("Voxtral: Correcting...");
      const corrected = await correctText(selection, this.settings);
      if (corrected) {
        editor.replaceSelection(corrected);
        new import_obsidian4.Notice("Voxtral: Selection corrected");
      }
    } catch (e) {
      new import_obsidian4.Notice(`Voxtral: Correction failed: ${e}`);
    }
  }
  async correctAll(editor) {
    const text = editor.getValue();
    if (!text.trim()) {
      new import_obsidian4.Notice("Voxtral: Note is empty");
      return;
    }
    if (!this.settings.apiKey) {
      new import_obsidian4.Notice("Voxtral: Please set your API key first");
      return;
    }
    try {
      new import_obsidian4.Notice("Voxtral: Correcting...");
      const corrected = await correctText(text, this.settings);
      if (corrected && corrected !== text) {
        editor.setValue(corrected);
        new import_obsidian4.Notice("Voxtral: Note corrected");
      } else {
        new import_obsidian4.Notice("Voxtral: No corrections needed");
      }
    } catch (e) {
      new import_obsidian4.Notice(`Voxtral: Correction failed: ${e}`);
    }
  }
  // ── Help panel ──
  async openHelpPanel() {
    const existing = this.app.workspace.getLeavesOfType(
      VIEW_TYPE_VOXTRAL_HELP
    );
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({
        type: VIEW_TYPE_VOXTRAL_HELP,
        active: true
      });
      this.app.workspace.revealLeaf(leaf);
    }
  }
  // ── Status bar ──
  updateStatusBar(state) {
    if (!this.statusBarEl) return;
    switch (state) {
      case "idle":
        this.statusBarEl.setText("");
        this.statusBarEl.removeClass(
          "voxtral-recording",
          "voxtral-processing",
          "voxtral-paused"
        );
        break;
      case "recording": {
        const mic = this.recorder.activeMicLabel;
        const short = mic.length > 25 ? mic.slice(0, 22) + "..." : mic;
        this.statusBarEl.setText(`\u25CF ${short}`);
        this.statusBarEl.addClass("voxtral-recording");
        this.statusBarEl.removeClass("voxtral-processing", "voxtral-paused");
        break;
      }
      case "paused":
        this.statusBarEl.setText("\u23F8 Paused");
        this.statusBarEl.addClass("voxtral-paused");
        this.statusBarEl.removeClass("voxtral-recording", "voxtral-processing");
        break;
      case "processing":
        this.statusBarEl.setText("\u23F3 Processing...");
        this.statusBarEl.addClass("voxtral-processing");
        this.statusBarEl.removeClass("voxtral-recording", "voxtral-paused");
        break;
    }
  }
};
