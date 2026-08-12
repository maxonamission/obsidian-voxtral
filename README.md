# Voxtral Transcribe

**Thoughts move fast. Your transcription should keep up.**

Voxtral Transcribe lets you talk and type in the same breath: dictate straight into your notes, add structure by voice — headings, lists, to-dos, tables — and grab the keyboard mid-sentence whenever you want. The mic waits while you type and picks back up when you stop, so editing happens along the way, not after. Already have a recording — a lecture, a meeting, a voice memo? Right-click it in your vault and the plugin transcribes it into a note you can search, link, and build on.

Powered by [Mistral's Voxtral](https://mistral.ai/), a speech-to-text engine built for transcription from the ground up. Real-time streaming on desktop and mobile, batch/tap-to-send everywhere, file transcription everywhere. Voice commands come localized in 13 languages — and the engine itself understands even more. All inside your vault.

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

- **Real-time streaming** (desktop + mobile) — text appears as you speak; on mobile this runs via Mistral's ephemeral client tokens ([how it works](#mobile))
- **Batch mode with tap-to-send** (desktop + mobile) — send audio chunks while you keep talking; also the automatic fallback if a real-time token mint ever fails
- **Voice commands** — headings, bullet points, to-do items, numbered lists and more by voice, localized to all 13 supported languages (Dutch, English, French, German, Spanish, Portuguese, Italian, Russian, Chinese, Hindi, Arabic, Japanese, Korean); a help panel shows the trigger phrases for your active language
- **Per-note language override** — set `voxtral-language` in a note's frontmatter to dictate that note in a different language
- **Per-note style preference** — set `voxtral-style` in a note's frontmatter to nudge the tone of corrections (e.g. casual for a journal, terse for meeting notes)
- **Per-note vocabulary** — set `voxtral-vocabulary` in a note's frontmatter to spell out names and jargon for that note
- **Typing-friendly mic** — configurable cooldown before the mic resumes after typing, optional Enter-to-send while the mic is live, microphone selection, and configurable behavior when you switch apps on mobile

### Correction

- **Auto-correction** — spelling, capitalization, and punctuation are corrected automatically after recording
- **Inline correction instructions** — say "for the correction: ..." and the corrector follows your instructions
- **Self-correction recognition** — "no not X but Y" is handled automatically
- **Mishearing correction** — common speech recognition errors are fixed automatically per language
- **Vault vocabulary (optional, off by default)** — send term names from the active note's own vault context (headings, links, aliases, and tags — never note contents) along with your dictated text, so a misheard or misspelled vault term is corrected toward its exact spelling; those same terms are also sent to the transcription API itself as context bias, so names and jargon are more likely to be spelled correctly from the start — optimized for English, with other languages experimental
- **Custom vocabulary** — a global list of your own terms (names, jargon, abbreviations) in the settings, separated by commas or new lines; unlike vault vocabulary above, these are always sent along with corrections and as transcription context bias, even when vault vocabulary is off — the trade-off being that these terms are shared with the API on every call

### File transcription

- **Transcribe existing audio files** (desktop + mobile) — right-click any audio file → "Transcribe audio file"; choose where the text lands (active note or a new linked note), or run "Transcribe the audio embed on the current line" to transcribe a `![[recording]]` embed — it finds the nearest or only audio embed in the note even if your cursor isn't right on it, and works in reading view too
- **Long recordings, handled** — files over the single-request limit are split and transcribed in parts automatically, each part appearing as it finishes (with a Cancel button); part length is configurable
- **Readable layout** — transcripts are broken into paragraphs rather than one long block
- **Speaker labels (optional)** — turn on diarization to label who said what (`**Speaker 1:** …`)
- **Quality heads-up** — an optional pre-flight check warns about likely problems (very short, silent, or low-bitrate audio) before spending an API call

## Requirements & installation

You need **Obsidian v1.11.4 or newer** and a **Mistral API key** (free to create at [console.mistral.ai](https://console.mistral.ai/)).

**From Community Plugins (recommended):** Settings → Community plugins → Browse → search "Voxtral Transcribe" → Install, Enable, then enter your API key under Settings → Voxtral Transcribe.

**Manual:** download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/maxonamission/obsidian-voxtral/releases/latest) into `.obsidian/plugins/voxtral-transcribe/` in your vault, restart Obsidian, and enable the plugin under Settings → Community plugins.

## Usage

### Real-time mode (desktop and mobile)

1. Open a note
2. Click the microphone icon in the ribbon (desktop) or tap it (mobile), or press **Ctrl+Space** on desktop
3. Start speaking — text appears live in your note
4. Click/tap the microphone again or say **"stop recording"** to stop
5. Auto-correction runs automatically if enabled

### Mobile

Real-time dictation works on mobile: Obsidian's mobile webview can't set the `Authorization` header the desktop connection uses, so on mobile the plugin instead mints a short-lived token with your API key and passes it via the WebSocket subprotocol — [Mistral's ephemeral client tokens](https://docs.mistral.ai/studio-api/audio/speech_to_text/realtime_transcription/client_auth), added specifically to unblock this (see [obsidian-voxtral#13](https://github.com/maxonamission/obsidian-voxtral/issues/13)). Your API key itself only ever goes to `api.mistral.ai`; it's never part of the WebSocket handshake. If a token mint ever fails, the plugin falls back to batch mode for that session with a clear notice — dictation still works, it just isn't live.

Batch mode with tap-to-send remains available on mobile too, as a deliberate choice or as that fallback:

1. Open a note and tap the microphone icon to start recording
2. Tap the **send icon** in the view header to transcribe the current audio chunk — the recording keeps going
3. Keep talking and tap send again for the next chunk
4. Tap the microphone to stop — the last chunk is processed automatically

Batch mode works on desktop too: press **Enter** while the mic is live (and you're not typing) to send a chunk, if *Enter = tap-to-send* is enabled.

### Transcribe an audio file

- **From the vault:** right-click any audio file → **Transcribe audio file**.
- **From an embed:** run **Transcribe the audio embed on the current line** — the text is inserted right below the embed. It's forgiving about where the cursor is: on the embed's line, near it, or anywhere at all if the note has only one audio embed; with several embeds and no clear nearby one, it asks which you mean. Works in reading view too.

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

### Per-note style preference

Add a `voxtral-style` key to a note's frontmatter to nudge the correction step toward a particular tone — casual for a diary entry, tight and formal for meeting notes, flowing for a blog draft:

```yaml
---
voxtral-style: casual, first person, contractions okay
---
```

- Resolved the same way and at the same moment as `voxtral-language` — once, from the output-target note, and held for that recording session or file transcription.
- Free text: there's no fixed list of styles and no validation notice, just whatever you write (capped at 300 characters).
- Style guides tone of corrections only; it cannot add or remove content — it can never make the corrector invent sentences, drop text, or restructure your note, no matter what the style text says.
- Removing the key (or leaving it out) leaves correction exactly as it is today.

### Per-note vocabulary and the global custom vocabulary list

Add a `voxtral-vocabulary` key to a note's frontmatter to spell out names and jargon for that note — either a YAML list or a single comma/newline-separated string:

```yaml
---
voxtral-vocabulary:
  - Voxtral
  - Kloosterman
---
```

- These terms are **always** sent — with corrections and as transcription context bias — regardless of the "Vault vocabulary" setting above, which only gates *automatic* collection from the vault. You typed them for exactly this purpose.
- Resolved the same way and at the same moment as `voxtral-language`/`voxtral-style` — once, from the output-target note, and held for that recording session or file transcription.
- There's also a global **Custom vocabulary** setting (Settings → Voxtral Transcribe) for terms you always want available, regardless of which note you're in — your own name, recurring jargon, project codenames. Same always-on rule applies, and the same privacy trade-off: these terms are shared with the API on every call.
- Order when combined with the vault vocabulary's automatic collection: this note's `voxtral-vocabulary` terms first, then the global custom terms, then collected vault terms — deduped and capped like the rest of the vocabulary list.

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
| Mode | Realtime or Batch (both available on desktop and mobile) |
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
statement or a research question, dictate it into your note, then select the transcript
and run Parallax's **Explore the problem**: assumptions and counter-assumptions, reformulations,
theoretical lenses, and graded multi-source literature research (free via OpenAlex). The two
plugins share the same principles (your keys, local where possible, no telemetry) but stay
deliberately separate tools: this plugin owns capturing speech, Parallax owns the reasoning.

**[Quadro](https://github.com/chrisgrieser/obsidian-quadro)** — qualitative data analysis
(coding and extraction, a MAXQDA/atlas.ti alternative) in plain markdown. the plugin's file
transcription is a natural intake for Quadro's `Data/` folder: record the interview,
right-click the audio → **Transcribe audio file** (with speaker labels on), move the transcript
note into `Data/`, and code it.

### Preparing transcripts for Quadro

Quadro's conventions, confirmed by its maintainer (July 2026) — the plugin's file transcripts fit
them out of the box, and a light edit pass makes them ideal:

- **One paragraph per speaker turn** is the recommended layout — each paragraph is the unit
  Quadro codes. The plugin already splits file transcripts into paragraphs; with **Speaker
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
