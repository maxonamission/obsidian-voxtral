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
  dismissMobileBatchNotice: false,
  enterToSend: true,
  typingCooldownMs: 800
};
var DEFAULT_CORRECT_PROMPT = "You are a precise text corrector for dictated text. The input language may vary (commonly Dutch, but follow whatever language the text is in).\n\nCORRECT ONLY:\n- Capitalization (sentence starts, proper nouns)\n- Clearly misspelled or garbled words (from speech recognition)\n- Missing or wrong punctuation\n\nDO NOT CHANGE:\n- Sentence structure or word order\n- Style or tone\n- Markdown formatting (# headings, - lists, - [ ] to-do items)\n\nINLINE CORRECTION INSTRUCTIONS:\nThe text was dictated via speech recognition. The speaker sometimes gives inline instructions meant for you. Recognize these patterns:\n- Explicit markers: 'voor de correctie', 'voor de correctie achteraf', 'for the correction', 'correction note'\n- Spelled-out words: 'V-O-X-T-R-A-L' or 'with an x' \u2192 merge into the intended word\n- Self-corrections: 'no not X but Y', 'nee niet X maar Y', 'I mean Y', 'ik bedoel Y'\n- Meta-commentary: 'that's a Dutch word', 'with a capital letter', 'met een hoofdletter'\n\nWhen you encounter such instructions:\n1. Apply the instruction to the REST of the text\n2. Remove the instruction/meta-commentary itself from the output\n3. Keep all content text \u2014 NEVER remove normal sentences\n\nCRITICAL RULES:\n- Your output must be SHORTER than or equal to the input (after removing meta-instructions)\n- NEVER add your own text, commentary, explanations, or notes\n- NEVER add parenthesized text like '(text missing)' or '(no corrections needed)'\n- NEVER continue, elaborate, or expand on the content\n- NEVER invent or hallucinate text that wasn't in the input\n- If the input is short (even one word), just return it corrected\n- Your output must contain ONLY the corrected version of the input text, NOTHING else";

// src/settings-tab.ts
var import_obsidian2 = require("obsidian");

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
      const timeout = setTimeout(() => {
        console.warn("Voxtral: flushChunk timed out after 5s");
        const blob = new Blob(this.chunks, {
          type: this.getSupportedMimeType()
        });
        this.chunks = [];
        resolve(blob);
      }, 5e3);
      this.mediaRecorder.onstop = () => {
        clearTimeout(timeout);
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

// src/mistral-api.ts
var import_obsidian = require("obsidian");
var BASE_URL = "https://api.mistral.ai";
function sanitizeApiError(status, rawBody) {
  var _a;
  try {
    const parsed = JSON.parse(rawBody);
    const msg = (parsed == null ? void 0 : parsed.message) || ((_a = parsed == null ? void 0 : parsed.error) == null ? void 0 : _a.message);
    if (typeof msg === "string" && msg.length < 200) {
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
async function listModels(apiKey) {
  if (!apiKey) return [];
  try {
    const response = await (0, import_obsidian.requestUrl)({
      url: `${BASE_URL}/v1/models`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });
    if (response.status !== 200) {
      console.warn(
        `Voxtral: Failed to list models (${response.status})`
      );
      return [];
    }
    const data = response.json;
    const models = (data.data || []).map(
      (m) => ({
        id: m.id,
        type: m.type,
        capabilities: m.capabilities
      })
    );
    models.sort((a, b) => a.id.localeCompare(b.id));
    return models;
  } catch (e) {
    console.warn("Voxtral: Could not fetch models", e);
    return [];
  }
}
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
  var _a;
  const ext = audioBlob.type.includes("mp4") ? "m4a" : audioBlob.type.includes("ogg") ? "ogg" : "webm";
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
  if (settings.language) {
    extraFields += `--${boundary}\r
Content-Disposition: form-data; name="language"\r
\r
${settings.language}\r
`;
  }
  if (diarize) {
    extraFields += `--${boundary}\r
Content-Disposition: form-data; name="diarize"\r
\r
true\r
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
  const response = await (0, import_obsidian.requestUrl)({
    url: `${BASE_URL}/v1/audio/transcriptions`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`
    },
    body: body.buffer
  });
  if (response.status !== 200) {
    throw new Error(
      `Transcription failed: ${sanitizeApiError(response.status, response.text)}`
    );
  }
  return ((_a = response.json) == null ? void 0 : _a.text) || "";
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
  const response = await (0, import_obsidian.requestUrl)({
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
      `Correction failed: ${sanitizeApiError(response.status, response.text)}`
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
function createWebSocket(url, headers, callbacks) {
  let wsUrl = url;
  const authHeader = headers["Authorization"] || headers["authorization"];
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const separator = wsUrl.includes("?") ? "&" : "?";
    wsUrl = `${wsUrl}${separator}api_key=${encodeURIComponent(token)}`;
  }
  const ws = new WebSocket(wsUrl);
  const conn = {
    readyState: 0,
    send: (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    },
    close: () => {
      conn.readyState = 3;
      ws.close();
    }
  };
  ws.addEventListener("open", () => {
    conn.readyState = WS_OPEN;
    callbacks.onOpen();
  });
  ws.addEventListener("message", (event) => {
    if (typeof event.data === "string") {
      callbacks.onMessage(event.data);
    }
  });
  ws.addEventListener("error", () => {
    callbacks.onError(new Error("WebSocket connection error"));
  });
  ws.addEventListener("close", () => {
    conn.readyState = 3;
    callbacks.onClose();
  });
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
    const url = `wss://api.mistral.ai/v1/audio/transcriptions/realtime?${params}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        var _a;
        (_a = this.ws) == null ? void 0 : _a.close();
        reject(new Error("WebSocket connection timeout"));
      }, 1e4);
      this.ws = createWebSocket(
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

// src/lang.ts
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
var LANGUAGE_NAMES = {
  nl: "Nederlands",
  en: "English",
  fr: "Fran\xE7ais",
  de: "Deutsch",
  es: "Espa\xF1ol",
  pt: "Portugu\xEAs",
  it: "Italiano",
  ru: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439",
  zh: "\u4E2D\u6587",
  hi: "\u0939\u093F\u0928\u094D\u0926\u0940",
  ar: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629",
  ja: "\u65E5\u672C\u8A9E",
  ko: "\uD55C\uAD6D\uC5B4"
};
var PATTERNS = {
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
    stopRecording: ["beeindig opname", "beeindig de opname", "stop opname", "stop de opname"],
    colon: ["dubbele punt", "double punt", "dubbelepunt"]
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
    colon: ["colon"]
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
    colon: ["deux points"]
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
    colon: ["doppelpunkt"]
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
    colon: ["dos puntos"]
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
    colon: ["dois pontos"]
  },
  // ── Russian ───────────────────────────────────────────────────
  ru: {
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
    colon: ["\u0434\u0432\u043E\u0435\u0442\u043E\u0447\u0438\u0435"]
  },
  // ── Chinese ────────────────────────────────────────────────────
  zh: {
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
    colon: ["\u5192\u53F7"]
  },
  // ── Hindi ──────────────────────────────────────────────────────
  hi: {
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
    colon: ["\u0915\u094B\u0932\u0928"]
  },
  // ── Arabic ─────────────────────────────────────────────────────
  ar: {
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
    colon: ["\u0646\u0642\u0637\u062A\u0627\u0646"]
  },
  // ── Japanese ───────────────────────────────────────────────────
  ja: {
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
    colon: ["\u30B3\u30ED\u30F3"]
  },
  // ── Korean ─────────────────────────────────────────────────────
  ko: {
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
    colon: ["\uCF5C\uB860"]
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
    colon: ["due punti"]
  }
};
var LABELS = {
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
    colon: "Dubbele punt"
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
    colon: "Colon"
  },
  fr: {
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
    colon: "Deux-points"
  },
  de: {
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
    colon: "Doppelpunkt"
  },
  es: {
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
    colon: "Dos puntos"
  },
  pt: {
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
    colon: "Dois pontos"
  },
  ru: {
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
    colon: "\u0414\u0432\u043E\u0435\u0442\u043E\u0447\u0438\u0435"
  },
  zh: {
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
    colon: "\u5192\u53F7"
  },
  hi: {
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
    colon: "\u0915\u094B\u0932\u0928"
  },
  ar: {
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
    colon: "\u0646\u0642\u0637\u062A\u0627\u0646"
  },
  ja: {
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
    colon: "\u30B3\u30ED\u30F3"
  },
  ko: {
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
    colon: "\uCF5C\uB860"
  },
  it: {
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
    colon: "Due punti"
  }
};
var MISHEARINGS = {
  nl: [
    [/\bniveau\b/g, "nieuwe"],
    [/\bnieuw alinea\b/g, "nieuwe alinea"],
    [/\bnieuw regel\b/g, "nieuwe regel"],
    [/\bnieuw punt\b/g, "nieuw punt"]
  ],
  fr: [
    [/\bnouveau ligne\b/g, "nouvelle ligne"],
    [/\bnouvelle paragraphe\b/g, "nouveau paragraphe"]
  ],
  de: [
    [/\bneue absatz\b/g, "neuer absatz"],
    [/\bneues zeile\b/g, "neue zeile"]
  ]
};
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

// src/settings-tab.ts
var VoxtralSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.cachedModels = null;
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    ;
    new import_obsidian2.Setting(containerEl).setName("Mistral API key").setDesc("Your API key from platform.mistral.ai").addText(
      (text) => text.setPlaceholder("Enter your API key").setValue(this.plugin.settings.apiKey).onChange(async (value) => {
        this.plugin.settings.apiKey = value.trim();
        await this.plugin.saveSettings();
      })
    ).then((setting) => {
      const input = setting.controlEl.querySelector("input");
      if (input) input.type = "password";
    });
    const micSetting = new import_obsidian2.Setting(containerEl).setName("Microphone").setDesc("Select which microphone to use");
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
    const modeDesc = import_obsidian2.Platform.isMobile ? "Only batch mode is available on mobile. Use tap-to-send to submit chunks while you keep talking." : "Realtime: text appears as you speak. Batch: audio is transcribed after you stop recording.";
    const modeSetting = new import_obsidian2.Setting(containerEl).setName("Mode").setDesc(modeDesc);
    if (import_obsidian2.Platform.isMobile) {
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
    new import_obsidian2.Setting(containerEl).setName("Enter = tap-to-send").setDesc(
      "In batch mode, pressing Enter sends the current audio chunk when the mic is live. While typing, Enter inserts a normal newline."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.enterToSend).onChange(async (value) => {
        this.plugin.settings.enterToSend = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Typing cooldown").setDesc(
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
    new import_obsidian2.Setting(containerEl).setName("On focus loss").setDesc(
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
      new import_obsidian2.Setting(containerEl).setName("Pause delay (seconds)").setDesc(
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
    new import_obsidian2.Setting(containerEl).setName("Language").setDesc("Language for transcription and voice commands").addDropdown((dropdown) => {
      for (const code of SUPPORTED_LANGUAGES) {
        dropdown.addOption(code, `${LANGUAGE_NAMES[code]} (${code})`);
      }
      dropdown.setValue(this.plugin.settings.language);
      dropdown.onChange(async (value) => {
        this.plugin.settings.language = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian2.Setting(containerEl).setName("Auto-correct").setDesc(
      "Automatically correct spelling, capitalization, and punctuation after recording"
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoCorrect).onChange(async (value) => {
        this.plugin.settings.autoCorrect = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Streaming delay").setDesc(
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
    new import_obsidian2.Setting(containerEl).setName("Keyboard shortcuts").setHeading();
    new import_obsidian2.Setting(containerEl).setName("Customize hotkeys").setDesc(
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
    new import_obsidian2.Setting(containerEl).setName("Support this project").setHeading();
    new import_obsidian2.Setting(containerEl).setName("Buy me a coffee").setDesc("Find this plugin useful? Consider a donation!").addButton(
      (btn) => btn.setButtonText("Buy me a coffee").onClick(() => {
        window.open("https://buymeacoffee.com/maxonamission");
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Advanced").setHeading();
    const isTranscriptionModel = (m) => {
      var _a;
      return !!((_a = m.capabilities) == null ? void 0 : _a.audio_transcription);
    };
    const isChatModel = (m) => {
      var _a;
      return !!((_a = m.capabilities) == null ? void 0 : _a.completion_chat);
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
      isTranscriptionModel
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
      isTranscriptionModel
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
      isChatModel
    );
    new import_obsidian2.Setting(containerEl).setName("Correction system prompt").setDesc("Leave empty to use the default prompt").addTextArea(
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
  }
  /**
   * Add a model dropdown that fetches options from the Mistral API.
   * Falls back to a text field if no API key is set or the fetch fails.
   * The current value is always shown, even if not in the fetched list.
   */
  addModelDropdown(containerEl, name, desc, currentValue, onChange, filter) {
    const setting = new import_obsidian2.Setting(containerEl).setName(name).setDesc(desc);
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
        const ids = filtered.map((m) => m.id);
        if (currentValue && !ids.includes(currentValue)) {
          drop.addOption(currentValue, `${currentValue} (current)`);
        }
        for (const model of filtered) {
          drop.addOption(model.id, model.id);
        }
        drop.setValue(currentValue);
      }).catch((err) => {
        console.error("Voxtral: Failed to fetch models", err);
      });
    });
  }
  async getModels() {
    if (this.cachedModels) return this.cachedModels;
    const models = await listModels(this.plugin.settings.apiKey);
    if (models.length > 0) {
      this.cachedModels = models;
    }
    return models;
  }
};

// src/help-view.ts
var import_obsidian3 = require("obsidian");

// src/voice-commands.ts
var activeLang = "nl";
function setLanguage(lang) {
  activeLang = lang;
}
function normalizeCommand(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/-/g, " ").replace(/[.,!?;:'"()[\]{}]/g, "").toLowerCase().trim();
}
function fixMishearings(text) {
  for (const [pattern, replacement] of getMishearings(activeLang)) {
    text = text.replace(pattern, replacement);
  }
  return text;
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
var COMMAND_DEFS = [
  { id: "newParagraph", action: (editor) => insertAtCursor(editor, "\n\n") },
  { id: "newLine", action: (editor) => insertAtCursor(editor, "\n") },
  { id: "heading1", action: (editor) => insertAtCursor(editor, "\n\n# ") },
  { id: "heading2", action: (editor) => insertAtCursor(editor, "\n\n## ") },
  { id: "heading3", action: (editor) => insertAtCursor(editor, "\n\n### ") },
  { id: "bulletPoint", action: (editor) => insertAtCursor(editor, "\n- ") },
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
  { id: "colon", punctuation: true, action: colonAction }
];
function matchCommand(rawText) {
  const normalized = fixMishearings(normalizeCommand(rawText));
  for (const cmd of COMMAND_DEFS) {
    const patterns = getPatternsForCommand(cmd.id, activeLang);
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
      let before = match.textBefore;
      if (match.command.punctuation) {
        before = before.replace(/[,;.!?]+\s*$/, "");
      }
      insertAtCursor(editor, before);
    }
    match.command.action(editor);
  } else {
    insertAtCursor(editor, text);
  }
}
function getCommandList() {
  return COMMAND_DEFS.map((c) => ({
    label: getLabel(c.id, activeLang),
    patterns: getPatternsForCommand(c.id, activeLang)
  }));
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
    ]
  }
};
function getStrings(lang) {
  var _a;
  return (_a = UI_STRINGS[lang]) != null ? _a : UI_STRINGS.en;
}
var VoxtralHelpView = class extends import_obsidian3.ItemView {
  constructor(leaf) {
    super(leaf);
    this.lang = "nl";
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
  // eslint-disable-next-line @typescript-eslint/require-await -- base class requires async signature
  async onOpen() {
    this.render();
  }
  render() {
    const container = this.contentEl;
    container.empty();
    container.addClass("voxtral-help-view");
    const strings = getStrings(this.lang);
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
  }
  // eslint-disable-next-line @typescript-eslint/require-await -- base class requires async signature
  async onClose() {
    this.contentEl.empty();
  }
};

// src/main.ts
var LOG_BUFFER_SIZE = 500;
var logBuffer = [];
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
var VoxtralPlugin = class _VoxtralPlugin extends import_obsidian4.Plugin {
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
    this.keydownHandler = null;
    /** Ranges of text inserted during realtime dictation.
     *  Offsets are always in the current document coordinate system —
     *  existing ranges are adjusted when a new insertion happens. */
    this.dictatedRanges = [];
  }
  /** Whether realtime mode is available on this platform */
  get canRealtime() {
    return !import_obsidian4.Platform.isMobile;
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
    this.addRibbonIcon("mic", "Start/stop recording", () => {
      void this.toggleRecording();
    });
    if (!import_obsidian4.Platform.isMobile) {
      this.statusBarEl = this.addStatusBarItem();
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
      name: "Export logs to clipboard",
      icon: "clipboard-copy",
      callback: () => {
        void this.exportLogs();
      }
    });
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
      name: "Correct entire note",
      icon: "file-check",
      editorCallback: (editor) => {
        void this.correctAll(editor);
      }
    });
    this.addSettingTab(new VoxtralSettingTab(this.app, this));
    this.registerDomEvent(document, "visibilitychange", () => {
      this.handleVisibilityChange();
    });
    this.keydownHandler = (e) => this.handleTypingMute(e);
    document.addEventListener("keydown", this.keydownHandler, true);
  }
  onunload() {
    if (this.isRecording) {
      void this.stopRecording();
    }
    this.removeSendButton();
    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler, true);
    }
  }
  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
    setLanguage(this.settings.language);
  }
  async saveSettings() {
    await this.saveData(this.settings);
    setLanguage(this.settings.language);
    this.refreshHelpView();
  }
  /** Re-render the help panel with the current language. */
  refreshHelpView() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_VOXTRAL_HELP)) {
      const view = leaf.view;
      if (view instanceof VoxtralHelpView) {
        view.setLanguage(this.settings.language);
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
    if (import_obsidian4.Platform.isMobile) {
      const view = this.app.workspace.getActiveViewOfType(import_obsidian4.MarkdownView);
      if (view) {
        this.mobileActionEl = view.addAction(
          "send",
          "Send chunk",
          () => {
            void this.sendChunk();
          }
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
        vlog.debug("Voxtral: App backgrounded, recording continues");
      } else if (behavior === "pause-after-delay") {
        const delaySec = this.settings.focusPauseDelaySec;
        console.debug(
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
    vlog.debug("Voxtral: Recording paused (app backgrounded)");
  }
  resumeRecording() {
    this.isPaused = false;
    this.recorder.resume();
    this.updateStatusBar("recording");
    new import_obsidian4.Notice("Recording resumed");
    vlog.debug("Voxtral: Recording resumed (app foregrounded)");
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
    if (e.key === "Enter" && this.settings.enterToSend && this.effectiveMode === "batch" && !this.isTypingMuted && !this.typingResumeTimer) {
      e.preventDefault();
      void this.sendChunk();
      return;
    }
    if (e.key === "Escape" || e.key === "Tab" || e.key === "Enter" || e.key === "Backspace" || e.key === "Delete" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End" || e.key === "PageUp" || e.key === "PageDown" || e.key.startsWith("F") && e.key.length <= 3) {
      if (this.isTypingMuted && this.typingResumeTimer) {
        clearTimeout(this.typingResumeTimer);
        this.typingResumeTimer = setTimeout(() => {
          this.typingResumeTimer = null;
          if (this.isRecording && this.isTypingMuted && !this.isPaused) {
            this.isTypingMuted = false;
            this.recorder.unmute();
          }
        }, this.settings.typingCooldownMs);
      }
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
      this.typingResumeTimer = null;
      if (this.isRecording && this.isTypingMuted && !this.isPaused) {
        this.isTypingMuted = false;
        this.recorder.unmute();
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
  async startRecording() {
    if (!this.settings.apiKey) {
      new import_obsidian4.Notice("Please set your API key in the plugin settings.");
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(import_obsidian4.MarkdownView);
    if (!view) {
      new import_obsidian4.Notice("Open a note first to start dictating.");
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
        void this.openHelpPanel();
      }
      const micName = this.recorder.activeMicLabel;
      if (this.effectiveMode === "batch") {
        const enterHint = this.settings.enterToSend ? " Press Enter (when not typing) or tap send to transcribe chunks." : " Tap send to transcribe chunks while you keep talking.";
        if (import_obsidian4.Platform.isMobile && !this.settings.dismissMobileBatchNotice) {
          const frag = document.createDocumentFragment();
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
          new import_obsidian4.Notice(frag, 8e3);
        } else {
          new import_obsidian4.Notice(
            `Voxtral: Recording started (${micName})
` + enterHint.trim(),
            6e3
          );
        }
      } else {
        new import_obsidian4.Notice(`Recording started (${micName})`);
      }
    } catch (e) {
      vlog.error("Voxtral: Failed to start recording", e);
      new import_obsidian4.Notice(`Could not start recording: ${e}`);
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
      vlog.error("Voxtral: Failed to stop recording", e);
      new import_obsidian4.Notice(`Error stopping recording: ${e}`);
    }
    this.currentEditor = null;
    this.dictatedRanges = [];
    this.updateStatusBar("idle");
    new import_obsidian4.Notice("Recording stopped");
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
        vlog.warn("Voxtral: Discarding hallucinated chunk");
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
      vlog.error("Voxtral: Chunk transcription failed", e);
      this.updateStatusBar("recording");
      new import_obsidian4.Notice(`Chunk failed: ${e}`);
    }
  }
  // ── Realtime recording ──
  async startRealtimeRecording(editor) {
    this.pendingText = "";
    this.dictatedRanges = [];
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
        vlog.debug("Voxtral: Realtime session created");
      },
      onDelta: (text) => {
        this.handleRealtimeDelta(editor, text);
      },
      onDone: (text) => {
        this.handleRealtimeDone(editor, text);
      },
      onError: (message) => {
        vlog.error("Voxtral: Realtime error:", message);
        new import_obsidian4.Notice(`Streaming error: ${message}`);
      },
      onDisconnect: () => {
        void this.handleRealtimeDisconnect();
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
      void this.stopRecording();
      return;
    }
    vlog.debug("Voxtral: Session ended, reconnecting silently...");
    try {
      await this.connectRealtimeWebSocket(editor);
      this.consecutiveFailures = 0;
      vlog.debug("Voxtral: Session reconnected");
    } catch (e) {
      this.consecutiveFailures++;
      console.error(
        `Voxtral: Reconnect failed (${this.consecutiveFailures}/${this.maxConsecutiveFailures})`,
        e
      );
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        new import_obsidian4.Notice(
          "Cannot connect to the API. Recording stopped.",
          6e3
        );
        void this.stopRecording();
        return;
      }
      const delay = Math.min(
        500 * this.consecutiveFailures,
        3e3
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (this.isRecording) {
        void this.handleRealtimeDisconnect();
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
        void this.stopRecording();
        return;
      }
      this.trackProcessText(editor, sentence + " ");
    }
  }
  handleRealtimeDone(editor, _text) {
    if (this.pendingText.trim()) {
      this.trackProcessText(editor, this.pendingText.trim() + " ");
      this.pendingText = "";
    }
  }
  async stopRealtimeRecording() {
    var _a, _b;
    (_a = this.realtimeTranscriber) == null ? void 0 : _a.endAudio();
    await new Promise((resolve) => setTimeout(resolve, 1e3));
    const view = this.app.workspace.getActiveViewOfType(import_obsidian4.MarkdownView);
    if (view && this.pendingText.trim()) {
      this.trackProcessText(view.editor, this.pendingText.trim());
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
      new import_obsidian4.Notice("No audio recorded");
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(import_obsidian4.MarkdownView);
    if (!view) {
      new import_obsidian4.Notice("No active note found");
      return;
    }
    const editor = view.editor;
    try {
      let text = await transcribeBatch(blob, this.settings);
      if (text && isLikelyHallucination(
        text,
        this.recorder.lastChunkDurationSec
      )) {
        vlog.warn("Voxtral: Discarding hallucinated batch");
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
      vlog.error("Voxtral: Batch transcription failed", e);
      new import_obsidian4.Notice(`Transcription failed: ${e}`);
    }
  }
  // ── Dictation range tracking ──
  /**
   * Wrap processText to track what was inserted in the editor.
   * Records the cursor offset before and after to determine the
   * range of inserted text, and adjusts existing ranges when an
   * insertion shifts them.
   */
  trackProcessText(editor, text) {
    const offsetBefore = editor.posToOffset(editor.getCursor());
    processText(editor, text);
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
  }
  // ── Text correction ──
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
  /**
   * After stopping realtime recording, correct only the text
   * that was actually dictated.  Each tracked range is corrected
   * independently, processed from end to start so that earlier
   * offsets remain valid after replacements.
   */
  async autoCorrectAfterStop(editor) {
    if (this.dictatedRanges.length === 0) return;
    const merged = _VoxtralPlugin.mergeRanges(this.dictatedRanges);
    merged.sort((a, b) => b.from - a.from);
    const fullText = editor.getValue();
    const corrections = [];
    for (const range of merged) {
      if (range.from >= fullText.length || range.to > fullText.length) {
        continue;
      }
      const text = fullText.substring(range.from, range.to);
      if (!text.trim()) continue;
      corrections.push({
        from: editor.offsetToPos(range.from),
        to: editor.offsetToPos(range.to),
        text
      });
    }
    for (const c of corrections) {
      try {
        const corrected = await correctText(c.text, this.settings);
        if (corrected && corrected !== c.text) {
          editor.replaceRange(corrected, c.from, c.to);
        }
      } catch (e) {
        vlog.error("Voxtral: Auto-correct failed", e);
      }
    }
  }
  async exportLogs() {
    if (logBuffer.length === 0) {
      new import_obsidian4.Notice("No logs to export");
      return;
    }
    const text = logBuffer.join("\n");
    await navigator.clipboard.writeText(text);
    new import_obsidian4.Notice(`${logBuffer.length} log entries copied to clipboard`);
  }
  async correctSelection(editor) {
    const selection = editor.getSelection();
    if (!selection) {
      new import_obsidian4.Notice("Select text first to correct it");
      return;
    }
    if (!this.settings.apiKey) {
      new import_obsidian4.Notice("Please set your API key first");
      return;
    }
    try {
      new import_obsidian4.Notice("Correcting...");
      const corrected = await correctText(selection, this.settings);
      if (corrected) {
        editor.replaceSelection(corrected);
        new import_obsidian4.Notice("Selection corrected");
      }
    } catch (e) {
      new import_obsidian4.Notice(`Correction failed: ${e}`);
    }
  }
  async correctAll(editor) {
    const text = editor.getValue();
    if (!text.trim()) {
      new import_obsidian4.Notice("Note is empty");
      return;
    }
    if (!this.settings.apiKey) {
      new import_obsidian4.Notice("Please set your API key first");
      return;
    }
    try {
      new import_obsidian4.Notice("Correcting...");
      const corrected = await correctText(text, this.settings);
      if (corrected && corrected !== text) {
        editor.setValue(corrected);
        new import_obsidian4.Notice("Note corrected");
      } else {
        new import_obsidian4.Notice("No corrections needed");
      }
    } catch (e) {
      new import_obsidian4.Notice(`Correction failed: ${e}`);
    }
  }
  // ── Help panel ──
  async openHelpPanel() {
    const existing = this.app.workspace.getLeavesOfType(
      VIEW_TYPE_VOXTRAL_HELP
    );
    if (existing.length > 0) {
      void this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({
        type: VIEW_TYPE_VOXTRAL_HELP,
        active: true
      });
      void this.app.workspace.revealLeaf(leaf);
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
        this.statusBarEl.setText("\u23F8 paused");
        this.statusBarEl.addClass("voxtral-paused");
        this.statusBarEl.removeClass("voxtral-recording", "voxtral-processing");
        break;
      case "processing":
        this.statusBarEl.setText("\u23F3 processing...");
        this.statusBarEl.addClass("voxtral-processing");
        this.statusBarEl.removeClass("voxtral-recording", "voxtral-paused");
        break;
    }
  }
};
