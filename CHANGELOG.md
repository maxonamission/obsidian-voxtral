# Changelog

All notable user-facing changes to the **Voxtral Transcribe** Obsidian plugin.
The format is based on [Keep a Changelog](https://keepachangelog.com/); this
plugin follows [semantic versioning](https://semver.org/).

## [1.12.2] - 2026-08-19

- **"Correct selected text" now works on long selections.** The command
  timed out on long text — such as the transcript of an hour-long
  conversation. It now uses the same length-scaled correction budget as
  file transcription (up to 20 minutes for very long text), and says up
  front when a long correction may take a few minutes.

## [1.12.1] - 2026-08-19

- **Realtime dictation no longer drops out mid-session.** Two causes fixed:
  a rare handshake race could abort a session with a server error about the
  audio format changing mid-transcription (mostly during continuous speech,
  such as transcribing a conversation), and a silently dead network
  connection (laptop sleep, network switch) would stop the stream forever
  without any message. A watchdog now detects a dead connection within a
  minute and reconnects automatically — audio spoken in the reconnect window
  is buffered and replayed, so nothing is lost.
- **Realtime sessions are now diagnosable after the fact.** With debug
  logging on, the session lifecycle (connects, reconnects, streaming errors,
  watchdog interventions, stop reason) is written to `voxtral-crash-log.md`
  — the same crash-proof log that file transcription already uses.

## [1.12.0] - 2026-08-17

- **Watch folder.** Point the plugin at a vault folder — for example the
  auto-sync folder your phone drops recordings into — and every new audio
  file there is offered for transcription with a small notice, or transcribed
  automatically into a linked note if you prefer. Off by default; the
  automatic mode says honestly what it costs: every new recording in the
  folder is sent to the API without asking.
- **Snappier realtime dictation.** In single-stream realtime mode, text now
  appears every few words — flushing at word boundaries and after commas —
  instead of only at sentence ends or after roughly 120 characters. A
  retained tail guarantees voice commands are never split by a partial
  flush. The model's own punctuation and capitalization are preserved
  across these new partial flushes, instead of being stripped as if every
  fragment started mid-sentence.

## [1.11.1] - 2026-08-12

- **Fix: the correction timeout now scales with transcript length.** The
  fixed budget introduced in 1.11.0 was tight for long recordings — a
  30-minute transcript's correction already takes close to two minutes, and
  a 2-hour recording needs around eight. The budget now grows with the
  transcript (up to a 20-minute cap), so long corrections get the time they
  need; if anything still fails, the uncorrected transcript is inserted as
  before. Dictation corrections keep their fast timeout.

## [1.11.0] - 2026-08-12

- **Auto-correction is now a choice: Off, Light, or Standard.** The Light
  setting only fixes capitalization, misspellings and punctuation — it never
  adds, removes or merges line breaks or rewrites your wording. Standard is
  the existing behavior. If a correction ever goes wrong anyway, the new
  **Undo auto-correction** command reverts the last dictation to the raw
  transcription (and tells you if the text has changed since).
- **Per-note style.** Set `voxtral-style` in a note's frontmatter to nudge
  the tone of corrections for that note — casual for a journal, terse for
  meeting notes. It only influences tone and register, never content.
- **Per-note vocabulary and a global custom vocabulary.** Set
  `voxtral-vocabulary` in a note's frontmatter, or fill the new *Custom
  vocabulary* list in the settings, to spell out names and jargon. These
  explicit terms are always used — even with vault vocabulary off — for both
  the correction pass and, new in this release, **transcription context
  bias**: vocabulary terms now ride along with every batch transcription
  request so names and jargon are more likely to be spelled correctly from
  the start (optimized for English; other languages experimental, though our
  own Dutch tests showed clear improvements).
- **Forgiving embed transcription.** "Transcribe the audio embed on the
  current line" no longer requires the cursor to sit exactly on the embed's
  line: it finds the nearest audio embed, falls back to the only one in the
  note, asks which one you mean if there are several — and now also works in
  reading view.
- **A quieter kind of update notice.** After an update to a new minor or
  major version (never a patch), a single small notice points to what's new —
  and can be turned off entirely.
- **Fixes.** A failed or timed-out correction pass no longer loses your file
  transcript — the uncorrected text is inserted instead, with a clear notice;
  correcting a long transcript now gets a proper timeout budget (a 30-minute
  meeting's correction used to time out); and audio/attachment filenames can
  no longer sneak into the vault vocabulary as "terms".

## [1.10.0] - 2026-08-08

- **Real-time dictation on mobile.** Real-time streaming — text appearing as
  you speak — now works on Obsidian mobile, not just desktop. Obsidian's
  mobile webview can't set the `Authorization` header the desktop connection
  uses during the WebSocket handshake, so on mobile the plugin instead mints
  a short-lived token with your API key and authenticates the connection via
  the WebSocket subprotocol, using
  [Mistral's ephemeral client tokens](https://docs.mistral.ai/studio-api/audio/speech_to_text/realtime_transcription/client_auth)
  — added specifically to unblock this, closing
  [obsidian-voxtral#13](https://github.com/maxonamission/obsidian-voxtral/issues/13).
  Your API key itself only ever goes to `api.mistral.ai`, never the WebSocket
  handshake. Batch mode with tap-to-send remains available as a choice on
  both platforms, and is now also the automatic fallback — with a clear
  notice — if a token mint ever fails. Desktop keeps using the existing
  header-based connection unchanged.

## [1.9.1] - 2026-07-22

- **Sturdier custom API URL handling.** The Mistral API URL setting now
  normalizes whitespace and trailing slashes, falls back to the default when
  cleared, and warns about scheme-less or non-Mistral endpoints — so an
  edited URL can always find its way back to a working default.

## [1.9.0] - 2026-07-21

- **Experimental: local server mode (desktop).** A new *Local server mode
  (experimental)* toggle under Settings → Connection connects realtime
  dictation to a local [vLLM](https://docs.vllm.ai/) server running Mistral's
  open `Voxtral-Mini-4B-Realtime-2602` model — your audio never leaves your
  machine, and no API key is needed for dictating. Requires a GPU with
  ~16 GB VRAM (Windows: via WSL); the
  [local server guide](https://github.com/maxonamission/voxtral-transcribe/blob/main/docs/local-server.md)
  gets you from zero to talking. This has had limited real-world testing so
  far — feedback via [GitHub issues](https://github.com/maxonamission/obsidian-voxtral/issues)
  is very welcome.
  - A *Local server status* row in settings shows whether the server responds
    and which model it has loaded.
  - **Auto-correction is off in local mode** unless you configure a local
    correction endpoint (e.g. Ollama with a small Ministral model) — either
    way, nothing is sent to the cloud in local mode.
  - Cloud behavior is unchanged when the toggle is off. File transcription and
    listen back still use the cloud (and your API key) for now.

## [1.8.1] - 2026-07-15

- **Open the voice help panel straight from the status bar.** The status-bar
  indicator (bottom right on desktop) now always shows a small microphone and is
  clickable — click it any time to open, or reveal, the voice help panel. No
  need for the command palette or ribbon.
- **Your API key now lives in Obsidian's secret storage, not in a plain file.**
  The Mistral API key used to sit unencrypted in the plugin's `data.json`; it
  now goes into Obsidian's built-in secret storage (the OS keychain on desktop),
  shown with a masked field and a change/clear button. Your existing key is moved
  across automatically the first time you open the plugin after updating.
  - **The key no longer syncs between devices.** It is stored per device, so
    enter it once on each device you use. If your vault previously synced the
    plaintext key, consider rotating it — old copies can linger in sync history
    and file-recovery snapshots.
  - Requires Obsidian 1.11.4 or newer (for the secret-storage API).

## [1.8.0] - 2026-07-14

- **A faster, tidier settings screen.** Collapsed sections now render on first
  open (no hidden work for sections you never look at), switching modes only
  redraws its own section instead of the whole tab, and failed model/voice
  lookups are no longer retried on every redraw.
- **No more duplicate entries in the model dropdowns.** The model and voice
  lists are de-duplicated; aliases and dated releases of the same model showed
  up as identical-looking doubles.

## [1.7.3] - 2026-07-12

- **The plugin now speaks your language everywhere.** With the language set to
  anything other than Dutch, two spots still showed Dutch (thanks to the report
  in [#14](https://github.com/maxonamission/obsidian-voxtral/issues/14)): the
  "new table" voice command inserted `| Kolom 1 | Kolom 2 | … |` headers, and
  part of the voice-commands panel (title, tips, privacy, and command names)
  stayed Dutch until something re-rendered it. Table headers now come localized
  in all 13 languages, the help panel renders in your configured language from
  the moment it opens, and command names follow a language switch immediately.
- Under the hood: the auto-correction pass now knows to preserve the localized
  table it just inserted (previously it only protected the English variant),
  and the settings screen previews the text a command will actually insert in
  your language.

## [1.7.2] - 2026-07-10

- **Docs: clarified why real-time streaming is desktop-only.** The README now
  explains the actual limitation — the streaming connection must send an
  authentication header during the WebSocket handshake, which needs Node.js,
  and Obsidian only has Node.js on desktop — and points mobile users to batch
  mode with tap-to-send as the alternative. Prompted by
  [obsidian-voxtral#13](https://github.com/maxonamission/obsidian-voxtral/issues/13).
  No code changes.

## [1.7.1] - 2026-07-02

- **Smarter vault vocabulary sources.** The optional vault-aware correction
  (introduced in 1.7.0) now draws its "known terms" from what is actually
  connected to the note you're dictating in — the note's own headings, links
  and aliases, notes it links to, notes linking back to it, and its tags —
  instead of recently modified notes. Recency turned out to be a poor
  relevance signal: jargon from an unrelated project you edited yesterday
  could nudge corrections in today's note. Context-anchored terms make the
  correction hints more precise.
- As a side effect, the plugin no longer enumerates vault files at all: the
  "Vault Enumeration" disclosure on the community plugin page disappears
  with this release. As before, term *names* (never note contents) are only
  sent to the Mistral API when the opt-in toggle is enabled.
- Internal: added an evaluation harness for the correction layer (golden
  prompt tests in CI plus an owner-run live check, including
  prompt-injection and sensitive-content cases). No user-facing changes.

## [1.7.0] - 2026-07-02

This release follows up on a full code review: several new quality-of-life
features, two dictation-reliability fixes you may actually have hit, and a
large invisible layer of hardening and tests.

- **See which voice command just ran.** When a command executes, its name
  flashes briefly in the status bar (desktop) or as a short notice (mobile),
  so a false trigger is caught in a second instead of discovered later in
  your text. Toggleable under **Settings → Voice commands** (on by default).
- **Undo the last voice command — by voice.** Say "undo last command" (or run
  "Undo last voice action" from the command palette) to revert exactly what
  the last command changed. It refuses safely if you've dictated past it, so
  your text is never touched.
- **Test your API key from settings.** A "Test connection" button next to the
  key field tells you within seconds whether the key works, is invalid, hits
  a quota/billing issue, or the endpoint is unreachable — no more failed
  first recordings to find out.
- **Review a file transcript before it lands (optional).** With
  **Settings → File transcription → Review before inserting** enabled, the
  finished transcript opens in a preview where you can rename speakers
  (per part, applied cleanly to the labels — never to spoken text) and then
  insert or discard. Off by default; the direct flow is unchanged.
- **Vault-aware correction (optional, off by default).** The correction pass
  can be given the names of notes you link to, recent notes, and tags as
  "known terms", so your own jargon survives transcription with your exact
  spelling. A second toggle turns exact matches into `[[wikilinks]]` after
  correction. Privacy note: when enabled, those term names (titles, aliases,
  tags — never note contents) are sent to the Mistral API; both toggles are
  therefore opt-in.
- **Per-note language.** Add `voxtral-language: en` (any of the 13 supported
  codes) to a note's frontmatter and recording, voice commands and the help
  panel switch to that language for that note — no more flipping the global
  setting for multilingual vaults.
- **A recording indicator on mobile.** A small pulsing dot in the note header
  shows recording/paused state at a glance — no more "is the mic still on?"
  after switching apps or typing.
- **Dictation reliability fixes.** Fixed text occasionally duplicating after
  the fast preview stream reconnected in dual-delay mode; fixed a half-open
  session lingering when a recording failed to start; fixed two socket-state
  bugs that could leave a dead connection looking alive. Network calls now
  have proper timeouts and retry politely on rate limits, and a stalled
  recorder recovers instead of silently failing the next send.
- Internal: the codebase was restructured (npm workspaces, extracted
  file-transcription and playback modules) and the automated test suite grew
  from 486 to 724 tests. No behavior changes from the restructuring — the
  release build was verified byte-identical across the migration.

## [1.6.0] - 2026-06-28

- **Listen back to a selection (experimental).** A new, opt-in option reads the
  selected text — or the current paragraph — aloud using Voxtral text-to-speech, with
  a Stop command and a right-click "Read selection aloud". Turn it on under
  **Settings → Listen back (experimental)** and pick a voice; the voice list is fetched
  from your account (presets and any voices you've cloned on Mistral), with a refresh
  button. Handy for proofreading — you often hear a mistake you'd skim past. Off by
  default; each listen makes an API call.

## [1.5.0] - 2026-06-27

This release builds out **file transcription** — the same engine, pointed at
recordings you already have. Dictation is unchanged.

- **Long recordings are transcribed automatically, in parts.** Files over the
  single-request limit (~90 MB) are now split in the app and transcribed part by
  part — each part appears as it finishes, with a Cancel button, and a part length
  you can set under **Settings → File transcription**. Previously such files were
  rejected as too large.
- **Optional speaker labels (diarization).** A new toggle (off by default) labels
  who said what (`**Speaker 1:** …`) when transcribing a file. Labels are detected
  automatically; for long recordings split into parts they reset per part, and a
  note at the top of the transcript says so. This is an extra for file transcripts,
  not a change to dictation.
- **More readable transcripts.** File transcripts are broken into paragraphs
  instead of one long block, and parts are clearly separated.
- **Transcribe an audio embed from the current line.** A new command transcribes
  the `![[recording]]` on your cursor's line and inserts the text right below it.
- **A heads-up before transcribing a low-quality file.** An optional pre-flight
  check warns about likely problems (very short, silent, or low-bitrate audio)
  before spending an API call — handy because, with a file, you'd otherwise only
  find out after transcribing.

## [1.4.5] - 2026-06-24

- **File transcription: choose where the text lands, plus optional cleanup.** When
  you transcribe an audio file you can now pick the destination — the active note
  (at the cursor) or a new note linked to the audio file — and optionally run the
  result through the correction pass. The correction toggle is off by default,
  since file transcripts can be long and the extra pass adds API cost.
- **Gentler help-panel auto-open.** Starting a recording no longer pulls focus out
  of the note you're dictating into, and won't yank the panel to the front —
  hiding a stacked outline or properties panel — when it's already open. Opening it
  yourself via the "Show voice help panel" command still brings it forward.

## [1.4.4] - 2026-06-23

- **Transcribe an existing audio file from your vault.** Right-click an audio file
  → "Transcribe audio file" to transcribe it with Voxtral and insert the text into
  your note — on desktop and mobile. (Automatic splitting of very long recordings
  is still on the roadmap.)

## [1.4.3] - 2026-06-23

- **Help panel: tidier "don't auto-open" control on mobile.** The opt-out
  checkbox and its text now line up cleanly — the label and helper text share one
  column beside the checkbox instead of drifting to a ragged left edge, and the
  oversized gap between the checkbox and its text on mobile is gone.

## [1.4.2] - 2026-06-23

- **Voice help panel: stop it auto-opening, from the panel itself.** A new checkbox
  at the bottom of the help panel ("Don't open it automatically when recording
  starts") keeps the panel from sliding over your note every time you start
  recording — no digging through settings. It's per-platform and you can switch it
  back on any time; the panel is always available via the "Show voice help panel"
  command.
- **Help panel now fully translated in all 13 supported languages.** Russian,
  Chinese, Hindi, Arabic, Japanese and Korean now show localized panel text
  instead of falling back to English.

## [1.4.1] - 2026-06-09

- **Docs:** added a "Privacy & permissions" section to the README explaining the
  network calls, audio encoding, vault access and API-key storage behind the
  Obsidian review-page disclosures.

## [1.4.0] - 2026-06-09

- **Dictation into tables now works reliably (Live Preview).** Text lands in the
  right cell and in order instead of being prepended in reverse, the caret no
  longer jumps to earlier columns, and you can dictate **mid-cell** at your
  cursor. Casing and punctuation in cells match normal text (a fresh cell
  capitalises and keeps its period; a mid-sentence insert is lowercased), and
  inserted text is properly spaced from what follows. Works on both desktop
  (realtime) and mobile (batch).
- **Replace a selection while recording.** Selecting text during an active
  session now replaces it with what you dictate — just like typing — not only
  when you start dictation.
- **Optional debug logging.** A new "Debug logging" toggle (Advanced settings,
  off by default) feeds the "Export logs to file" command for troubleshooting.

## [1.3.3] - 2026-06-09

- Further fixes for dictating into table cells (continued in 1.4.0).

## [1.3.2] - 2026-06-08

- First fix for the caret jumping when dictating into a table cell.

## [1.3.1] - 2026-06-08

- **Replace selected text when dictation starts** — typing-parity: a selection
  is replaced by the transcription instead of being appended after it.
- **No lost words on reconnect** — audio is buffered during a reconnect so speech
  right after a pause isn't dropped.
- Auto-correction no longer reformats or breaks markdown tables.

## [1.3.0] - 2026-06-03

- Improved live punctuation in realtime dictation.

## [1.2.0] - 2026-05-26

- The help panel's auto-open on recording is now configurable per platform
  (separate toggles for desktop and mobile).

## [1.1.0] - 2026-05-19

- "Export logs" now writes to a note in your vault instead of the system
  clipboard.

## [1.0.0] - 2026-05-17

- First release in the Obsidian Community Plugins directory: real-time streaming
  dictation with voice commands (headings, lists, to-dos, tables and more) and
  automatic text correction, on desktop (realtime) and mobile (batch).
