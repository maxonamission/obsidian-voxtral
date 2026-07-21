# Voxtral Transcribe

**Thoughts move fast. Your transcription should keep up.**

Voxtral Transcribe lets you talk and type in the same breath: dictate straight into your notes, add structure by voice — headings, lists, to-dos, tables — and grab the keyboard mid-sentence whenever you want. The mic waits while you type and picks back up when you stop, so editing happens along the way, not after. Already have a recording — a lecture, a meeting, a voice memo? Right-click it in your vault and Voxtral transcribes it into a note you can search, link, and build on.

Powered by [Mistral's Voxtral](https://mistral.ai/), a speech-to-text engine built for transcription from the ground up. Real-time streaming on desktop, tap-to-send on mobile, file transcription everywhere. Voice commands come localized in 13 languages — and the engine itself understands even more. All inside your vault.

### Get going in under a minute

1. Install and paste your [Mistral API key](https://console.mistral.ai/)
2. Press `Ctrl+Space` (desktop) or tap the mic icon (mobile)
3. Start talking — say *"heading 2"*, *"new bullet"*, *"for the correction: ..."* as you go
4. Like it? [☕ Buy Me a Coffee](https://buymeacoffee.com/maxonamission)

## Why Voxtral Transcribe?

**Talk, type and structure — in one flow.** Dictation tools give you a wall of text to clean up later. Here, structure happens while you speak: headings, lists, to-dos and tables by voice, self-corrections ("no, not X but Y") understood, and the keyboard always one grab away — the mic simply waits its turn. With voice commands localized in 13 languages — and transcription in even more.

**Quality that gives you your time back.** Every misheard word is a correction you make later; every structure you add afterwards is a second editing pass. We deliberately run the best transcription model available for this job — purpose-built for speech, strong on background noise, accents and jargon, streaming-first so live text feels live, and multilingual by design rather than English-first — topped with an automatic correction layer. The goal: when you stop talking, the note is *done*. On your desktop and on your phone.

**A deliberate trade on privacy.** Your audio is processed by Mistral, a European company, using your own API key, directly — no middleman, nothing stored by the plugin, no telemetry. That is not 100% offline, and we say so honestly. Prefer fully local? An experimental **local server mode** (desktop) connects realtime dictation to your own [vLLM](https://docs.vllm.ai/) server running Voxtral's open-weight realtime model — see the [local server guide](https://github.com/maxonamission/voxtral-transcribe/blob/main/docs/local-server.md) — with two honest caveats: it needs a ~16 GB GPU (Windows: WSL), and today's local models can't fully match the cloud's quality, especially outside English. Details in [Privacy & permissions](#privacy--permissions).

## Features

### Dictation

- **Real-time streaming** (desktop only) — text appears as you speak ([why not on mobile?](#mobile-batch-mode))
- **Batch mode with tap-to-send** (desktop + mobile) — send audio chunks while you keep talking
- **Voice commands** — headings, bullet points, to-do items, numbered lists and more by voice, localized to all 13 supported languages (Dutch, English, French, German, Spanish, Portuguese, Italian, Russian, Chinese, Hindi, Arabic, Japanese, Korean); a help panel shows the trigger phrases for your active language
- **Per-note language override** — set `voxtral-language` in a note's frontmatter to dictate that note in a different language
- **Typing-friendly mic** — configurable cooldown before the mic resumes after typing, optional Enter-to-send while the mic is live, microphone selection, and configurable behavior when you switch apps on mobile

### Correction

- **Auto-correction** — spelling, capitalization, and punctuation are corrected automatically after recording
- **Inline correction instructions** — say "for the correction: ..." and the corrector follows your instructions
- **Self-correction recognition** — "no not X but Y" is handled automatically
- **Mishearing correction** — common speech recognition errors are fixed automatically per language

### File transcription

- **Transcribe existing audio files** (desktop + mobile) — right-click any audio file → "Transcribe audio file"; choose where the text lands (active note or a new linked note), or transcribe the `![[recording]]` embed at your cursor
- **Long recordings, handled** — files over the single-request limit are split and transcribed in parts automatically, each part appearing as it finishes (with a Cancel button); part length is configurable
- **Readable layout** — transcripts are broken into paragraphs rather than one long block
- **Speaker labels (optional)** — turn on diarization to label who said what (`**Speaker 1:** …`)
- **Quality heads-up** — an optional pre-flight check warns about likely problems (very short, silent, or low-bitrate audio) before spending an API call

## Requirements & installation

You need **Obsidian v1.11.4 or newer** and a **Mistral API key** (free to create at [console.mistral.ai](https://console.mistral.ai/)).

**From Community Plugins (recommended):** Settings → Community plugins → Browse → search "Voxtral Transcribe" → Install, Enable, then enter your API key under Settings → Voxtral Transcribe.

**Manual:** download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/maxonamission/obsidian-voxtral/releases/latest) into `.obsidian/plugins/voxtral-transcribe/` in your vault, restart Obsidian, and enable the plugin under Settings → Community plugins.

## Usage

### Desktop (real-time mode)

1. Open a note
2. Click the microphone icon in the ribbon, or press **Ctrl+Space**
3. Start speaking — text appears live in your note
4. Click the microphone again or say **"stop recording"** to stop
5. Auto-correction runs automatically if enabled

### Mobile (batch mode)

On mobile, only batch mode is available. This is a platform limitation, not a plugin choice: the real-time connection has to send an authentication header during the WebSocket handshake, which needs Node.js — and Obsidian only has Node.js on desktop. If that ever changes (on Obsidian's or Mistral's side), real-time on mobile is high on the wish list.

Batch mode keeps the same flow — keep talking, tap send whenever you want a chunk transcribed, and keep going:

1. Open a note and tap the microphone icon to start recording
2. Tap the **send icon** in the view header to transcribe the current audio chunk — the recording keeps going
3. Keep talking and tap send again for the next chunk
4. Tap the microphone to stop — the last chunk is processed automatically

Batch mode works on desktop too: press **Enter** while the mic is live (and you're not typing) to send a chunk, if *Enter = tap-to-send* is enabled.

### Transcribe an audio file

- **From the vault:** right-click any audio file → **Transcribe audio file**.
- **From an embed:** put your cursor on a line with an `![[recording]]` embed and run **Transcribe the audio embed on the current line** — the text is inserted right below the embed.

Turn on **Speaker labels (diarization)** in settings to label who said what (off by default; for long files split into parts, labels are detected per part and a note at the top explains they don't carry across the whole transcript).

**Getting good results from a recording** — transcription quality follows recording quality, and with a file you only find out *after* it's transcribed. The pre-flight check warns about obvious problems, but the basics still matter:

- **Get the mic close to the speaker.** Distance and room echo hurt accuracy more than the recording device does.
- **A phone is often good enough.** Its built-in processing (auto-gain, noise reduction) handles most rooms.
- **Quieter is better.** Background chatter, music, and air-conditioning all cost accuracy.
- **Very large files need memory.** Files over the single-request limit (~90 MB) are decoded in the app and split into parts. Decoding loads the whole file into memory, so very large files (especially on mobile) may fail — you'll get a clear message; transcribe on desktop or pre-convert to a smaller format such as 16 kHz mono.

### Voice commands

Voice commands are recognized at the end of a sentence and automatically adapt to the selected language — the table shows English examples, but equivalent phrases exist in all 13 supported languages. Open the **Voice Commands** help panel (ribbon icon or command palette) for the exact phrases in your active language.

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

### Per-note language override

Add a `voxtral-language` key to a note's frontmatter to dictate that note in a different language than your global **Language** setting, without changing the setting itself:

```yaml
---
voxtral-language: en
---
```

Supported codes: `nl`, `en`, `fr`, `de`, `es`, `pt`, `it`, `ru`, `zh`, `hi`, `ar`, `ja`, `ko` (the same 13 languages as the Language setting).

- The override is resolved once, when you start recording — it applies to transcription, voice-command matching, and the help panel for the whole session. Editing the frontmatter mid-recording has no effect until the next recording.
- Removing the key (or leaving it out) falls back to your global Language setting.
- An unrecognized value (e.g. a typo) also falls back to the global setting, with a one-time notice telling you what happened.

### Text correction

- **Correct selection**: select text → Command palette → "Correct selected text"
- **Correct entire note**: Command palette → "Correct entire note"

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
| Language | Language for transcription and voice commands (13 languages, default: Nederlands). Override per note — see [Per-note language override](#per-note-language-override) |
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

- **Network** — Your audio is sent to `api.mistral.ai` (Mistral, an EU company) for transcription — and, if Auto-correct is on, dictated text for correction. That is the only place your content leaves your device. A custom **API base URL** can point this elsewhere — e.g. `http://localhost:8000` for a self-hosted/local model — so nothing leaves your machine. `buymeacoffee.com` is a support link only, opened in your browser when you click it in Settings; no data is sent.
- **Audio encoding** — Captured audio is base64-encoded (`btoa()`) to include it in the API request. This is transport encoding, not obfuscation.
- **Vault access** — The plugin reads and writes the **active note** to insert transcribed text and to run "Correct dictated text" on what you dictated. If you enable Templates, it reads template files from the folder you configure. It does not scan or upload your vault.
- **Clipboard** — Not used. The plugin neither reads nor writes the clipboard. ("Export logs" writes a new note in your vault, not the clipboard.)
- **API key storage** — Your Mistral API key is stored in Obsidian's secret storage (backed by the OS keychain on desktop), not in the plugin's `data.json` — so it stays out of your synced vault. The key is per-device: enter it once on each device you use.

## Works well with

**[Parallax](https://github.com/maxonamission/obsidian-parallax)** — from the same workshop. A
transcript is raw thinking; Parallax turns it into structured research. Speak a messy problem
statement or a research question, let Voxtral put it in your note, then select the transcript
and run Parallax's **Explore the problem**: assumptions and counter-assumptions, reformulations,
theoretical lenses, and graded multi-source literature research (free via OpenAlex). The two
plugins share the same principles (your keys, local where possible, no telemetry) but stay
deliberately separate tools: Voxtral owns capturing speech, Parallax owns the reasoning.

**[Quadro](https://github.com/chrisgrieser/obsidian-quadro)** — qualitative data analysis
(coding and extraction, a MAXQDA/atlas.ti alternative) in plain markdown. Voxtral's file
transcription is a natural intake for Quadro's `Data/` folder: record the interview,
right-click the audio → **Transcribe audio file** (with speaker labels on), move the transcript
note into `Data/`, and code it.

### Preparing transcripts for Quadro

Quadro's conventions, confirmed by its maintainer (July 2026) — Voxtral's file transcripts fit
them out of the box, and a light edit pass makes them ideal:

- **One paragraph per speaker turn** is the recommended layout — each paragraph is the unit
  Quadro codes. Voxtral already splits file transcripts into paragraphs; with **Speaker
  labels** on, turns are labelled `**Speaker 1:** …`. Split up very long turns into several
  paragraphs if you want to code them at a finer grain.
- **Speaker prefixes don't interfere.** Quadro works entirely on a paragraph's *suffix*
  (wikilinks plus a trailing block id) and is agnostic to the paragraph's content.
- **Existing block ids are reused, not duplicated.** Quadro only needs unique ids for
  Obsidian's embedded links, so ids already present in a transcript are kept.
- **Front-matter is yours.** Data files reserve a single key — `read` (used by Quadro's *Mark
  current Data File as read*), so don't set that one yourself. Anything else (interview date,
  participant, a link to the source audio) is free to add and aggregates nicely with Obsidian
  Bases.

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production build
```

## License

[GPL-3.0](LICENSE) — Copyright (c) 2026 Max Kloosterman
