# Voxtral Transcribe

**Your notes, done when you stop talking.**

Your thinking moves faster than your typing, and dictation tools hand you a wall of text to clean up afterwards. Voxtral Transcribe lets you talk, type and structure in one flow, so the note is done when you stop talking: dictate straight into your notes, add headings, lists, to-dos and tables by voice, and grab the keyboard mid-sentence whenever you want. The mic waits while you type and picks back up when you stop. Already have a recording (a lecture, a meeting, a voice memo)? Right-click it in your vault and the plugin transcribes it into a note you can search, link and build on.

We built this for people who think out loud: researchers, consultants, anyone whose best ideas arrive mid-sentence. It runs on [Mistral's Voxtral](https://mistral.ai/), a speech model built for transcription from the ground up, with an automatic correction layer on top, on desktop and on your phone. Voice commands come localized in 13 languages, and the engine itself understands even more.

### Get going in under a minute

1. Install and paste your [Mistral API key](https://console.mistral.ai/)
2. Click the microphone ribbon icon (desktop) or tap it (mobile), or assign your own hotkey to "Voxtral: Start/stop recording" under Settings → Hotkeys
3. Start talking, and say *"heading 2"*, *"new bullet"* or *"no, not X but Y"* as you go

**Install it, dictate one note, and see whether you still want to edit afterwards.** Like it? [☕ Buy Me a Coffee](https://buymeacoffee.com/maxonamission)

## Why Voxtral Transcribe?

**Talk, type and structure — in one flow.** Dictation tools give you a wall of text to clean up later. Here, structure happens while you speak: headings, lists, to-dos and tables by voice, self-corrections ("no, not X but Y") understood, and the keyboard always one grab away — the mic simply waits its turn. With voice commands localized in 13 languages — and transcription in even more.

**Quality that gives you your time back.** Every misheard word is a correction you make later; every structure you add afterwards is a second editing pass. We deliberately run the best transcription model available for this job — purpose-built for speech, strong on background noise, accents and jargon, streaming-first so live text feels live, and multilingual by design rather than English-first — topped with an automatic correction layer. When you stop talking, your note is done. Your time goes to thinking, not to cleaning up. On your desktop and on your phone.

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
- **Watch folder (optional, off by default)** — point it at a vault folder (e.g. a phone auto-sync folder) and a new audio file there is offered for transcription with a notice, or transcribed automatically if you switch the mode — automatic sends every new recording in the folder to the API without asking, so each one costs an API call

## Requirements & installation

You need **Obsidian v1.11.4 or newer** and a **Mistral API key** (free to create at [console.mistral.ai](https://console.mistral.ai/)).

**From Community Plugins (recommended):** Settings → Community plugins → Browse → search "Voxtral Transcribe" → Install, Enable, then enter your API key under Settings → Voxtral Transcribe.

**Manual:** download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/maxonamission/obsidian-voxtral/releases/latest) into `.obsidian/plugins/voxtral-transcribe/` in your vault, restart Obsidian, and enable the plugin under Settings → Community plugins.

## Usage

### Real-time mode (desktop and mobile)

1. Open a note
2. Click the microphone icon in the ribbon (desktop) or tap it (mobile), or assign your own hotkey to **Voxtral: Start/stop recording** under Settings → Hotkeys
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

Voice commands are recognized at the end of a sentence and automatically adapt to the selected language: equivalent phrases exist in all 13 supported languages. Open the help panel for the exact phrases in your active language: run **Show voice help panel** from the command palette, or click the microphone icon in the status bar (desktop); on mobile, swipe from the right to reach it. See [Command reference](#command-reference) below for the full list, grouped by category, with English example phrases.

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

- **Correct selection**: select any text → Command palette → "Correct selected text"
- **Correct dictated text**: Command palette → "Correct dictated text", which corrects the text you dictated in the current session (after stopping the recording with auto-correction off), not the whole note
- **Undo auto-correction**: Command palette → "Undo auto-correction" reverts the correction layer's last replacement back to your raw dictation. This is separate from "Undo last voice action" below, which reverts a structural voice command (a heading, a bullet, a slot), not a correction

### Focus loss behavior

When switching apps on mobile, you can configure what happens to an active recording:

- **Pause immediately** (default) — pauses and resumes when you return
- **Pause after delay** — keeps recording for a configurable time (10s–5min), then pauses
- **Keep recording** — continues recording in the background

### Listen back (experimental)

Turn on **Read text aloud** under Settings → Voxtral Transcribe → Listen back to add three commands that use Voxtral text-to-speech: "Read selection aloud", "Read current paragraph aloud", and "Stop playback". Pick a **Voice** from the dropdown: the list is fetched from your account (presets plus any cloned voices) and can be refreshed without reopening settings; voices are multilingual, so an English voice still reads other languages in its own accent. Off by default; each listen makes an API call.

### Export logs and debug logging

Run **Export logs to file** from the command palette to save the last 500 buffered log entries (warnings and errors are always recorded) to a new vault note, `voxtral-logs-<timestamp>.md`. Sensitive content (API keys, quoted transcription text) is redacted before export. Turn on **Debug logging** under Settings → Advanced to also capture verbose diagnostic entries for that export; leave it off unless you're troubleshooting, since it also prints to the developer console.

If a hard crash interrupts a file transcription (mobile OOM, WebView kill), the last completed step survives in a vault note, `voxtral-crash-log.md`, written incrementally as each step runs, so the crashed step is visible after the fact even without debug logging on.

### Test connection

Under Settings → Voxtral Transcribe → Connection, **Test connection** sends one cheap authenticated request (`GET /v1/models`) against your configured API key and base URL, and reports inline whether it succeeded, the key is invalid or revoked, there's a quota/billing issue, or the endpoint is unreachable. No need to start a recording just to check your setup.

### Update highlights

After installing a minor or major update (never a patch release), a one-time notice links to that version's release notes. Turn this off under Settings → Help & shortcuts → **Update highlights**.

### Local server mode (experimental, desktop)

Instead of Mistral's cloud, **Local server mode** (Settings → Connection, desktop only) connects realtime dictation to your own OpenAI-compatible server (e.g. [vLLM](https://docs.vllm.ai/)) running Voxtral's open-weight realtime model at the **API base URL** you configure: realtime only, no API key needed. A **Local server status** check confirms the server actually responds. See the [local server guide](https://github.com/maxonamission/voxtral-transcribe/blob/main/docs/local-server.md) for setup, hardware requirements, and the honest quality trade-offs versus the cloud.

## Command reference

### Command palette

| Command | What it does |
|---|---|
| Start/stop recording | Starts or stops dictation in realtime or batch mode |
| Send audio chunk (tap-to-send) | Sends the current audio chunk for transcription without stopping the recording (batch mode) |
| Show voice help panel | Opens the voice command help panel for your active language |
| Export logs to file | Saves buffered log entries (redacted) to a new vault note; see [Export logs and debug logging](#export-logs-and-debug-logging) |
| Correct selected text | Runs the correction pass on the current selection |
| Correct dictated text | Runs the correction pass on the text dictated this session |
| Undo last voice action | Reverts the last structural voice command (heading, bullet, slot, …) |
| Undo auto-correction | Reverts the correction layer's last replacement back to the raw dictation |
| Transcribe the audio embed on the current line | Transcribes the nearest `![[recording]]` embed in the note |
| Read selection aloud | Listen back (experimental): reads the current selection |
| Read current paragraph aloud | Listen back (experimental): reads the paragraph under the cursor |
| Stop playback | Listen back (experimental): stops text-to-speech playback |

**Transcribe audio file** is not in the command palette: right-click an audio file in the file explorer instead.

### Voice commands

The tables below show English trigger phrases; the same commands exist, with localized phrases, in all 13 supported languages. Open the help panel (**Show voice help panel**, or the microphone icon in the status bar on desktop) for the exact phrases in your active language.

**Structure & punctuation**

| Voice command | Example phrases | Result |
|---|---|---|
| New paragraph | "new paragraph" | Double line break |
| New line | "new line", "next line" | Single line break |
| Heading 1 | "heading one", "heading 1" | `# ` |
| Heading 2 | "heading two", "heading 2" | `## ` |
| Heading 3 | "heading three", "heading 3" | `### ` |
| Colon | "colon" | Inserts `:` |

**Lists and tasks**

| Voice command | Example phrases | Result |
|---|---|---|
| Bullet point | "new item", "next item", "bullet", "bullet point", "new bullet" | `- ` |
| To-do item | "new todo", "new to do", "todo item", "to do item" | `- [ ] ` |
| Numbered item | "numbered item", "new numbered item", "next number" | `1. ` (auto-increments) |

**Formatting slots** (say the open phrase, dictate or type the content, then say the close phrase to close it)

| Slot | Open phrases | Close phrases | Wraps content in |
|---|---|---|---|
| Bold | "open bold", "bold open", "start bold" | "close bold", "bold close", "end bold" | `**…**` |
| Italic | "open italic", "italic open", "start italic" | "close italic", "italic close", "end italic" | `*…*` |
| Inline code | "open code", "code open", "start code" | "close code", "code close", "end code" | `` `…` `` |
| Tag | "open tag", "tag open", "start tag" | "close tag", "tag close", "end tag" | `#…` |
| Code block | "open code block", "code block open", "start code block" | "close code block", "code block close", "end code block" | A fenced code block (triple backtick) |

**Links**

| Voice command | Example phrases | Result |
|---|---|---|
| Wikilink | "wiki link", "wikilink", "link" | Inserts `[[`; Obsidian's own autocomplete handles the closing `]]` |

**Editing and undo**

| Voice command | Example phrases | Result |
|---|---|---|
| Delete last paragraph | "delete last paragraph" | Removes the last paragraph |
| Delete last line | "delete last line", "delete last sentence" | Removes the last sentence |
| Undo | "undo" | Undoes the last editor action |
| Undo last voice command | "undo last command", "undo last voice command", "cancel last command" | Reverts the last structural voice command specifically |

**Recording control**

| Voice command | Example phrases | Result |
|---|---|---|
| Stop recording | "stop recording" | Stops the active recording |

**Templates**

| Voice command | Example phrase | Result |
|---|---|---|
| Insert template | "template {name}" | Inserts the named template from your configured **Templates folder**, with `{{date}}`, `{{time}}`, and `{{title}}` variables filled in |

**Built-in commands (table, callouts)**

Pre-configured, always-on voice commands (Settings → Voice commands → Custom voice commands; editable only by resetting to defaults, not by editing in place, since they're re-synced with the plugin):

| Command | Example phrases | Inserts |
|---|---|---|
| Table | "table", "new table" | A 3-column Markdown table skeleton |
| Callout (note) | "callout", "note block" | `> [!note]` |
| Callout (warning) | "warning", "warning block" | `> [!warning]` |
| Callout (tip) | "tip", "tip block" | `> [!tip]` |

## Settings reference

Settings are grouped into eight collapsible sections in Settings → Voxtral Transcribe. Connection is open by default when something needs attention (e.g. no API key yet); Advanced and Support this project stay collapsed until you open them.

### Connection

| Setting | Default | Description |
|---|---|---|
| Local server mode (experimental) | Off (desktop only) | Connect to a local vLLM-style server instead of Mistral's cloud; realtime only |
| Local server status | N/A | Checks whether the configured server responds (shown only in local server mode) |
| Local correction endpoint (advanced) | Empty | OpenAI-compatible server for the correction step in local mode (shown only in local server mode) |
| Local correction model | `ministral-3:3b` | Model name sent to the local correction server above (shown only in local server mode) |
| Mistral API key | Empty | Stored in Obsidian's secret storage on this device, not in the vault |
| Test connection | N/A | Sends one request to confirm the API key and base URL work |
| API base URL | `https://api.mistral.ai` | Base URL for a Mistral-compatible API; leave at the default for Mistral's cloud |

### Recording & dictation

| Setting | Default | Description |
|---|---|---|
| Microphone | System default | Which microphone to use |
| Mode | Realtime | Realtime (streaming) or Batch (after recording) |
| Enter = tap-to-send | Off | In batch mode, Enter sends the current chunk while the mic is live |
| Typing cooldown | 800 ms | How long after you stop typing before the mic unmutes again |
| On focus loss | Pause immediately | What happens to an active recording when you switch apps |
| Pause delay (seconds) | 30 | Delay before pausing, shown only when "On focus loss" is set to "Pause after delay" |
| Language | Nederlands (`nl`) | Language for transcription and voice commands; override per note, see [Per-note language override](#per-note-language-override) |
| Auto-correction | Standard | Off / Light (spelling, capitalization, punctuation only) / Standard (also fixes clearly garbled words) |
| Noise suppression | Off | Browser-level noise suppression, echo cancellation, and auto gain control |
| Dual-delay mode (experimental) | Off | Realtime only: two parallel streams (fast preview + slow accuracy); uses 2x API bandwidth |
| Streaming delay | 480 ms | Latency vs. accuracy trade-off for realtime mode; hidden when dual-delay is on |

### File transcription

| Setting | Default | Description |
|---|---|---|
| Transcript destination | Insert into the active note | Active note (at the cursor) or a new linked note |
| Correct file transcripts | Off | Run a transcribed file through the correction pass (adds API cost on long transcripts) |
| Warn about low-quality or oversized files | On | Pre-flight check that warns before transcribing a likely-poor recording |
| Chunk length for long recordings | 10 minutes | Part length used when splitting recordings over the single-request limit |
| Speaker labels (diarization) | Off | Label different speakers in a transcribed file |
| Review before inserting | Off | Preview the transcript and rename detected speakers before it lands in the note |
| Watch folder | Empty (off) | Vault folder to watch for new audio recordings |
| New audio in watch folder | Offer with a notice | Offer, or transcribe automatically (each automatic transcription costs an API call) |

### Listen back (experimental)

| Setting | Default | Description |
|---|---|---|
| Read text aloud | Off | Adds commands to read selected text or the current paragraph aloud |
| Voice | `en_paul_neutral` | Which text-to-speech voice to use; the list is fetched from your account |

### Voice commands

| Setting | Default | Description |
|---|---|---|
| Show voice command feedback | On | Briefly shows which command just ran (status-bar flash on desktop, a notice on mobile) |
| Templates folder | Empty (off) | Vault path scanned for template notes, insertable by saying "template {name}" |
| Custom voice commands | N/A | Add, edit, and delete your own trigger phrases for inserting text or opening a slot; also where built-in commands (table, callouts) can be reset to their defaults |

### Help & shortcuts

| Setting | Default | Description |
|---|---|---|
| Auto-open on desktop | On | Opens the voice help panel in the right sidebar when recording starts |
| Auto-open on mobile | Off | Opens the voice help panel when recording starts on mobile |
| Update highlights | On | Shows a notice after a minor or major update, linking to the release notes |
| Customize hotkeys | N/A | Opens Obsidian's Hotkeys settings, pre-filtered to Voxtral commands |

### Advanced

| Setting | Default | Description |
|---|---|---|
| Realtime model | `voxtral-mini-transcribe-realtime-2602` | Model for real-time streaming transcription |
| Batch model | `voxtral-mini-latest` | Model for batch transcription |
| Correction model | `mistral-small-latest` | Model for text correction |
| Vault vocabulary | Off | Send vault term names (headings, link texts, titles, aliases, tags) as correction and transcription context |
| Custom vocabulary | Empty | Your own terms (names, jargon, abbreviations), always sent regardless of vault vocabulary |
| Auto-link vault terms (experimental) | Off | Wrap exact matches of vault terms in `[[wikilinks]]` after correction; requires Vault vocabulary |
| Correction system prompt | Empty (default prompt) | Override the correction step's system prompt |
| Debug logging | Off | Record verbose diagnostic logs for "Export logs to file" |

### Support this project

| Setting | Default | Description |
|---|---|---|
| Buy me a coffee | N/A | Opens the donation page in your browser |

## Troubleshooting

- **Realtime dictation keeps disconnecting.** Short silent reconnects during recording are normal: Mistral's realtime API closes the connection after each utterance, and the plugin reconnects immediately without interrupting you. A notice ("Cannot connect to the API. Recording stopped.") only appears after several reconnect attempts fail in a row; check your API key and network if you see it.
- **"No dictated text to correct."** "Correct dictated text" only corrects text dictated in the current session (with auto-correction off); it has nothing to work with right after opening a note, or once auto-correction has already run.
- **Something went wrong and you need details.** Run **Export logs to file** to save buffered log entries to a vault note; turn on **Debug logging** (Settings → Advanced) first if you need verbose detail before reproducing the issue.
- **A file transcription got interrupted by a crash.** Check `voxtral-crash-log.md` in your vault root: it records the last completed step even through a hard crash, without needing debug logging on.
- **Not sure the API key or base URL actually works.** Use **Test connection** (Settings → Connection) rather than starting a real recording; it reports an invalid/revoked key, a quota or billing issue, or an unreachable endpoint inline.
- **Local server mode looks connected but isn't.** Check **Local server status** (Settings → Connection, shown only in local server mode): it does an unauthenticated request against your API base URL and reports whether a server actually answers there.

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
npm ci          # from the repository root (npm workspaces)
cd obsidian-plugin
npm run dev     # watch mode
npm run build   # production build
```

## License

[GPL-3.0](LICENSE) — Copyright (c) 2026 Max Kloosterman
