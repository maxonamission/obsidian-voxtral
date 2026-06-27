# Voxtral Transcribe

**Thoughts move fast. Your transcription should keep up.**

Voxtral Transcribe lets you talk and type in the same breath: dictate straight into your notes, add structure by voice — headings, lists, to-dos — and grab the keyboard mid-sentence whenever you want. The mic waits while you type and picks back up when you stop, so editing happens along the way, not after.

And it's not only for what you say next. Already have a recording — a lecture, a meeting, a voice memo? Right-click it in your vault and Voxtral transcribes it into a note you can search, link, and build on.

Powered by [Mistral's Voxtral](https://mistral.ai/), a speech-to-text engine built for transcription from the ground up. Real-time streaming, tap-to-send batch, and now file transcription. 13+ languages, all inside your vault.

### Get going in under a minute
1. Install and paste your [Mistral API key](https://console.mistral.ai/)
2. Press `Ctrl+Space` (desktop) or tap the mic icon (mobile)
3. Start talking — say *"heading 2"*, *"new bullet"*, *"for the correction: ..."* as you go
4. Like it? [☕ Buy Me a Coffee](https://buymeacoffee.com/maxonamission)

## Why Voxtral?

Voxtral is purpose-built for transcription, not retrofitted from a general audio model. Three things that matter for dictation:

- **Low word error rate on hard audio** — handles background noise, accents, and technical jargon well, including on continuous speech
- **Streaming-first** — designed for low-latency partial results, which is what makes "text appears as you speak" feel real-time instead of stuttery
- **Multilingual by design** — 13+ languages with consistent quality, not English-first with the rest bolted on

If you're choosing a speech-to-text model for dictation — or for turning recordings you already have into text — this is a strong fit.

## Same engine. More of what it can do.

Voxtral was never just a dictation tool — it's a full transcription engine that happens to be fast enough to keep up with live speech. So we started there: real-time dictation. Then tap-to-send batch mode, so it worked on mobile too. That batch pipeline turned out to be the foundation for the obvious next step — pointing the same engine at recordings you already have.

Right-click any audio file in your vault → **Transcribe audio file**. The lecture, the interview, the meeting — same Voxtral quality, now on your back catalogue, not just your next sentence.

### Getting good results from a recording

Transcription quality follows recording quality — and with a file you only find out *after* it's transcribed (live dictation lets you fix things as you go). The plugin runs a quick pre-flight check and warns about obvious problems first, but the basics still matter:

- **Get the mic close to the speaker.** Distance and room echo (reverb) hurt accuracy more than the recording device does.
- **A phone is often good enough.** Its built-in processing (auto-gain, noise reduction) handles most rooms — you don't need pro gear.
- **Quieter is better.** Background chatter, music, and air-conditioning all cost accuracy.
- **Long recordings are split automatically.** Files over the single-request limit (~90 MB) are decoded in the app and transcribed in parts, with each part appearing as it finishes and a Cancel button if you want to stop early. You can set the part length under **Settings → File transcription → Chunk length for long recordings**. Splitting decodes the whole file into memory, so very large files (especially on mobile, where memory is tighter) may fail to decode — if that happens you'll get a clear message; transcribe it on desktop or pre-convert to a smaller/compressed format such as 16 kHz mono.

## Features

- **Real-time streaming** (desktop) — text appears as you speak
- **Batch mode with tap-to-send** (desktop + mobile) — send audio chunks while you keep talking
- **Transcribe existing audio files** (desktop + mobile) — right-click any audio file in your vault → "Transcribe audio file" to turn a meeting, lecture, or voice memo into text. Choose where it lands (the active note, or a new note linked to the audio file) and optionally run it through the correction pass
- **Transcribe an audio embed at your cursor** — a command that transcribes the `![[recording]]` on the current line and inserts the text right below it
- **Long recordings, handled** — files over the single-request limit are split and transcribed in parts automatically, each part appearing as it finishes (with a Cancel button); part length is configurable
- **Readable layout** — file transcripts are broken into paragraphs rather than one long block, with parts clearly separated
- **Speaker labels (optional)** — turn on diarization to label who said what in a file transcript (`**Speaker 1:** …`). Off by default; for long files split into parts, labels are detected per part and a note at the top explains they don't carry across the whole transcript
- **Quality heads-up before transcribing a file** — an optional pre-flight check warns about likely problems (very short, silent, or low-bitrate audio) before spending an API call
- **Voice commands** — insert headings, bullet points, to-do items, numbered lists, and more by voice
- **13 languages** — voice commands automatically adapt to the selected language; English always works as fallback (Dutch, English, French, German, Spanish, Portuguese, Italian, Russian, Chinese, Hindi, Arabic, Japanese, Korean)
- **Voice command help panel** — shows available commands and trigger phrases for the active language
- **Auto-correction** — spelling, capitalization, and punctuation are automatically corrected after recording
- **Inline correction instructions** — say "for the correction: ..." and the corrector will follow your instructions
- **Self-correction recognition** — "no not X but Y" is handled automatically
- **Mishearing correction** — common speech recognition errors are fixed automatically per language
- **Microphone selection** — choose which microphone to use
- **Auto-pause on focus loss** — configurable behavior when switching apps on mobile
- **Configurable Enter-to-send** — optionally use Enter as tap-to-send when the mic is live (batch mode)
- **Typing cooldown** — adjustable delay before the mic resumes after typing

Need coffee to process all this? Me too. [☕ Buy Me a Coffee](https://buymeacoffee.com/maxonamission)

## Requirements

- **Obsidian** v1.0.0 or newer
- **Mistral API key** — free to create at [console.mistral.ai](https://console.mistral.ai/)

## Installation

### From Community Plugins (recommended)

1. Open **Settings** > **Community plugins** > **Browse**
2. Search for "Voxtral Transcribe"
3. Click **Install**, then **Enable**
4. Go to **Settings** > **Voxtral Transcribe** and enter your Mistral API key

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/maxonamission/obsidian-voxtral/releases/latest)
2. Create a folder `.obsidian/plugins/voxtral-transcribe/` in your vault
3. Copy the three files into that folder
4. Restart Obsidian and enable the plugin in **Settings** > **Community plugins**

## Usage

### Desktop (real-time mode)

1. Open a note
2. Click the microphone icon in the ribbon, or press **Ctrl+Space**
3. Start speaking — text appears live in your note
4. Click the microphone again or say **"stop recording"** to stop
5. Auto-correction runs automatically if enabled

### Mobile (batch mode)

On mobile, only batch mode is available (real-time streaming requires Node.js).

1. Open a note
2. Tap the microphone icon to start recording
3. Tap the **send icon** in the view header to transcribe the current audio chunk — the recording keeps going
4. On desktop, press **Enter** while the mic is live (not typing) to send a chunk (if *Enter = tap-to-send* is enabled)
5. Keep talking and tap/press send again for the next chunk
6. Tap the microphone to stop — the last chunk is processed automatically

### Transcribe an audio file

- **From the vault:** right-click any audio file → **Transcribe audio file**.
- **From an embed:** put your cursor on a line with an `![[recording]]` embed and run **Transcribe the audio embed on the current line** — the text is inserted right below the embed.

Long recordings are split and transcribed part by part. Turn on **Speaker labels (diarization)** in settings to label who said what (off by default).

### Voice commands

Voice commands are recognized at the end of a sentence. Commands automatically adapt to the language selected in settings — the table below shows examples in English, but equivalent phrases are available in all 13 supported languages. Open the **Voice Commands** help panel (ribbon icon or command palette) to see the exact phrases for your active language.

| Command | Example (English) | Result |
|---|---|---|
| New paragraph | "new paragraph" | Double line break |
| New line | "new line" | Single line break |
| Heading 1–3 | "heading 1" / "heading 2" / "heading 3" | `# ` / `## ` / `### ` |
| Bullet point | "bullet point" | `- ` |
| To-do item | "new todo" | `- [ ] ` |
| Numbered item | "numbered item" | `1. ` (auto-increments) |
| Delete last paragraph | "delete last paragraph" | Removes last paragraph |
| Delete last line | "delete last line" | Removes last sentence |
| Undo | "undo" | Undo last action |
| Stop recording | "stop recording" | Stops the recording |

### Text correction

- **Correct selection**: Select text > Command palette > "Correct selected text"
- **Correct entire note**: Command palette > "Correct entire note"

### Focus loss behavior

When switching apps on mobile, you can configure what happens to an active recording:

- **Pause immediately** (default) — pauses and resumes when you return
- **Pause after delay** — keeps recording for a configurable time (10s–5min), then pauses
- **Keep recording** — continues recording in the background

## Settings

| Setting | Description |
|---|---|
| Mistral API key | Your API key from console.mistral.ai |
| Microphone | Which microphone to use |
| Mode | Realtime (desktop only) or Batch |
| Enter = tap-to-send | Use Enter to send audio chunks when mic is live (batch mode, default: on) |
| Typing cooldown | Delay before mic resumes after typing (default: 800 ms) |
| On focus loss | Pause immediately / after delay / keep recording |
| Language | Language for transcription and voice commands (13 languages, default: Nederlands) |
| Auto-correct | Enable/disable automatic correction |
| Streaming delay | Latency vs accuracy tradeoff for realtime mode |

### File transcription

| Setting | Description |
|---|---|
| Transcript destination | Where the text goes when you transcribe an audio file — the active note (at the cursor) or a new linked note |
| Correct file transcripts | Run a transcribed file through the correction pass (off by default; adds API cost on long transcripts) |
| Warn about low-quality or oversized files | Pre-flight check that warns before transcribing a likely-poor recording |
| Chunk length for long recordings | Part length used when splitting recordings over the single-request limit |
| Speaker labels (diarization) | Label different speakers in a transcribed file (off by default) |

## Privacy & permissions

What the plugin accesses and why. The Obsidian review page lists some of these without context.

- **Network** — Your audio is sent to `api.mistral.ai` for transcription (and, if Auto-correct is on, dictated text for correction). That is the only place your content leaves your device. A custom **API base URL** can point this elsewhere — e.g. `http://localhost:8000` for a self-hosted/local model — so nothing leaves your machine. `buymeacoffee.com` is a support link only, opened in your browser when you click it in Settings; no data is sent.
- **Audio encoding** — Captured audio is base64-encoded (`btoa()`) to include it in the API request. This is transport encoding, not obfuscation.
- **Vault access** — The plugin reads and writes the **active note** to insert transcribed text and to run "Correct dictated text" on what you dictated. If you enable Templates, it reads template files from the folder you configure. It does not scan or upload your vault.
- **Clipboard** — Not used. The plugin neither reads nor writes the clipboard. ("Export logs" writes a new note in your vault, not the clipboard.)
- **API key storage** — Your Mistral API key is stored in the plugin's `data.json` (Obsidian's plugin data folder), unencrypted, like most Obsidian plugins. Don't share that file.

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production build
```

## License

[GPL-3.0](LICENSE) — Copyright (c) 2026 Max Kloosterman
