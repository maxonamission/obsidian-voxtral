# Changelog

All notable user-facing changes to the **Voxtral Transcribe** Obsidian plugin.
The format is based on [Keep a Changelog](https://keepachangelog.com/); this
plugin follows [semantic versioning](https://semver.org/).

## [1.15.0] - 2026-09-15

- **Fixed: unticking a term in "Terms for this recording" did nothing when
  the same term also appeared in a lower-ranked group.** The term was still
  sent as context bias, and still learned or forgotten as if you had kept it.
  A term now belongs to the highest-ranked group it appears in; its copy
  further down is shown disabled and now follows that group's checkbox
  (tick, untick, or the group's All/None), and its tooltip names the group it
  is included under.
- **A part the API refuses is retried as two halves.** With a long chunk
  length (for example 20 minutes) the service could refuse a part; the
  plugin then uploaded it five more times with backoff before giving up and
  leaving a hole. A refusal (too large or any other client error) is no
  longer retried: the part is split in two and each half is transcribed,
  down to one-minute slices, and the note shows "Part 2 (1/2)" and
  "Part 2 (2/2)". Rate limits and server errors are still retried as before.
- **See and choose the terms before a file is transcribed.** A new dialog
  "Terms for this recording" shows every name and jargon term that will be
  sent as context bias, grouped by where it came from (your custom list,
  the note's frontmatter, the file name, the note and its links), lets you
  switch terms off, type terms just for this recording, and remember typed
  terms in your custom vocabulary. New: name-like words in the file name
  ("Interview Jurre en Wouter" gives Jurre and Wouter) are offered as terms.
  The list is now ranked (your own terms first, collected terms last) and
  capped only after ranking, so a long link list can no longer push your
  own terms out. On by default for transcriptions you start yourself; the
  automatic watch folder never shows it and never sends file-name terms
  unseen. Switch it off under File transcription if you prefer the old
  silent behaviour.
- **The plugin remembers the terms you confirm.** The list chosen for a
  recording (minus your custom vocabulary) is written into the transcript
  note's `voxtral-vocabulary` frontmatter, or merged into the note you
  insert into, so the next recording for that note starts from it. Terms
  you type, keep from the file name, or give to speakers in the review
  step also land in a learned vocabulary that the dialog offers again for
  later recordings; a term you switch off loses weight. The learned list
  can be cleared under Advanced.
- **The debug log records how many context-bias terms were sent,** and when a
  long transcription was cancelled and after which part. The terms themselves
  are not written down: they are names and jargon from your own notes, and the
  log is a file you might paste into a bug report.

- **Long recordings need far less memory to split.** A file that has to be
  split was first decoded at its original sample rate and only then reduced to
  16 kHz mono, so two hours of 48 kHz stereo needed about 2.8 GB before
  anything could be sent, and large files failed with "Array buffer allocation
  failed". The audio is now decoded straight to 16 kHz, and when a recording is
  already 16 kHz mono the extra conversion step is skipped entirely.
- **A WAV recording is split without decoding it first.** A WAV already
  contains raw audio, so the plugin now reads its header and cuts the parts
  straight from the file. That removes the copy and the conversion buffer that
  a long recording needed, which is what ran out of memory on large files.
  32-bit float recordings (what a Zoom H5studio or H2essential writes) are
  levelled first: those files have no fixed maximum, so without that step a
  loud passage would clip and a quietly recorded one would arrive as near
  silence.
- **A memory failure now says what to do.** Instead of a raw error it explains
  that a long recording is decoded in full, and suggests converting to 16 kHz
  mono or splitting the recording.
- **The language setting now also applies when speaker recognition is on.** It
  used to be dropped for those requests, on the assumption that the API could not
  take both. It can: only the timestamps that diarization needs were ever the
  constraint. On a 90-minute Dutch recording this changed nothing measurable, so
  treat it as the setting doing what it says rather than as a quality fix.
- **A very large WAV recording no longer fails before transcription even
  starts.** A 2 GB file never got past being read into memory: one buffer that
  size isn't reliably allocatable. On desktop, a large WAV is now read
  straight from disk in pieces instead — never as a single buffer — so a
  long field recording can be split and transcribed regardless of size.
- **A WAV recording is now split at 16 kHz instead of its original sample
  rate.** The fast path that splits a WAV without decoding it was still
  cutting parts at the recording's own rate, so a 48 kHz recording uploaded
  three times more data than the model actually uses (511 MB for a 2 GB
  recording, where 170 MB was enough). Each part now goes through a
  proper low-pass filter before being reduced to 16 kHz — simply keeping
  every third sample was rejected earlier because it turns high frequencies
  into low-frequency noise right in the band speech recognition depends on.
- **A file too large for a phone or tablet now says what to do about it.**
  There is no way to read a large file in pieces on mobile yet, so the
  message now says the same recording works on desktop, or suggests making a
  compressed copy (m4a or mp3) — a fraction of the size, at no real cost to
  recognition quality.

## [1.14.3] - 2026-09-14

- **A vocabulary term typed with a full stop no longer speaks it.** Writing
  your terms as "Moniek. Jurre." used to send "Moniek." to the transcription
  service, which then put the dot in the transcript. Trailing punctuation is
  removed; an abbreviation like "B.V." keeps its dot.

## [1.14.2] - 2026-09-13

- **Read aloud is reachable from the menu in reading view.** The right-click
  item only existed while editing; the note's own menu now offers "Read
  aloud" in both modes.

## [1.14.1] - 2026-09-13

- **Read aloud now works in reading view too.** The command was only offered
  while editing a note, which is the opposite of when you want to listen to
  one. It now shows up in both modes.
- **A note's properties are no longer read out.** Starting at the top of a
  note used to mean hearing its front matter (tags, status, dates) before the
  prose began. The block is skipped now.

## [1.14.0] - 2026-09-11

- **Read aloud now starts where you are.** "Read selection aloud" has become
  "Read aloud": with text selected it reads that, and otherwise it reads on
  from the paragraph your cursor is in to the end of the note, until you stop
  it. Right-clicking without a selection offers "Read aloud from here". Audio
  is only generated just ahead of what you're hearing, so stopping early
  doesn't pay for the rest of the note. The command keeps its identifier, so
  any hotkey you assigned to it still works.
- **Listen back can now pause.** Playback of a read-aloud selection or
  paragraph can be paused and resumed in place — no need to start over,
  and no extra API call. On desktop, a status bar control shows while
  audio is generating or playing, with pause/resume and stop buttons; the
  new "Pause or resume playback" command works everywhere, including on
  mobile where there's no status bar.
- **Listen back starts sooner and reads paragraph by paragraph.** A
  read-aloud selection is now split into paragraphs and synthesized one at
  a time, so the voice starts after the first paragraph instead of after
  the whole passage. New "Skip forward one paragraph" and "Skip back one
  paragraph" commands (and buttons in the desktop status bar, with a
  paragraph counter) move through it; skipping back restarts the current
  paragraph if you are more than two seconds into it. Paragraphs you
  already heard are kept in memory, so going back costs no extra API call.
- **Listen back is now controllable on mobile.** Since there's no status bar
  on mobile, skip-back, pause/resume and skip-forward now show as actions
  in the note's header while something is playing, and disappear again
  once it stops. Switching notes mid-playback moves the controls to the
  new note. Pause, and a stop button appears next to them for when you are
  done rather than just interrupting.
- **Editing a paragraph no longer re-synthesizes the whole passage.** Listen
  back remembers audio per paragraph instead of per position, so changing one
  paragraph and listening again only regenerates that paragraph. The same
  applies to listening to an overlapping selection. Up to twelve paragraphs
  are kept at a time. Fewer API calls, less data over the wire, and less
  compute spent on audio you already had.
- **Smaller playback buttons in the status bar.** The desktop controls now
  match the scale of the rest of the status bar instead of rendering as
  full-size buttons.

## [1.13.0] - 2026-09-02

- **Sharper plugin description and README opening.** The directory listing
  now leads with what you get ("Your notes, done when you stop talking")
  and names the engine, and the README opens with the problem, a
  three-step start and one clear next step.
- **Batch mode keeps your words when a correction fails.** In tap-to-send
  mode, a failed correction request used to drop the whole chunk with a
  "Chunk failed" notice; the raw transcription is now inserted instead, as
  realtime mode already did. Batch, realtime and dual-delay dictation now
  share one session machinery under the hood.
- **Small dictation fixes.** Realtime recording now checks the actual
  microphone sample rate and resamples to 16 kHz when the platform ignores
  the requested rate, instead of silently sending mismatched audio. Realtime
  dictation no longer occasionally duplicates a word when the final
  transcription re-punctuates the streamed text. The correction pass after
  stopping scales its timeout with the dictated length, corrects sections
  concurrently, and no longer re-corrects everything when triggered twice;
  if every correction fails, the dictated text stays available for a manual
  "Correct dictated text". Typing a capital F now mutes the microphone like
  any other letter. Exporting logs twice within a second no longer fails.
- **Stopping a recording is now reliable, and batch text lands in the note
  you started in.** Stopping realtime dictation while no note was focused
  (settings open, a non-markdown view) used to skip closing the connection;
  it now always closes and flushes. Batch mode (tap-to-send) now inserts
  into the note where the recording started, even if you switched notes
  in the meantime, matching realtime mode. A recorder that never reports
  its final chunk no longer leaves the status bar stuck on "Processing".
  Realtime dictation also stops buffering an unused audio file in memory
  during long sessions.
- **File transcriptions run one at a time.** Several files arriving at once
  (for example through the watch folder) are queued with a notice instead
  of running in parallel and sharing settings; each file keeps its own
  vocabulary and style.
- **A double click on the microphone no longer opens the microphone twice.**
  Clicking the ribbon icon (or pressing the hotkey) again while a recording
  was still starting up used to start a second capture and leak the first
  one, leaving the microphone open. Recording start/stop is now driven by an
  explicit state machine that ignores a second start and lets a stop wait
  for an in-flight start to finish.
- **Dual-delay mode gets the same dropout protection as single-stream
  realtime.** A silently dead connection is now detected per stream within
  a minute and reconnected, and audio spoken during a reconnect is buffered
  and replayed, so the "no longer drops out" fix from 1.12.1 now covers
  both realtime modes. Two lifecycle leaks are closed as well: a connection
  attempt that times out is now really cancelled (a late server reply no
  longer opens a second, orphaned connection with its own keep-alive), and
  stopping while a reconnect is in flight no longer leaves a live
  connection behind.
- **Log export now includes the realtime connection log, and never your
  text.** WebSocket events (connect, reconnect, streaming errors) used to go
  only to the developer console, so "Export logs to file" missed exactly
  what a dropout investigation needs; they now land in the exportable log.
  No log line contains transcript text anymore (only lengths), error
  details are kept instead of being flattened to `{}`, and the export
  redaction also covers quoted text with escaped quotes.
- **Complete README.** The README now carries a full command reference
  (every palette command and every voice command by category, with example
  phrases), a settings reference per settings section with defaults, short
  sections for listen back, undo auto-correction, log export, test
  connection, update highlights and local server mode, and a troubleshooting
  section listing the built-in diagnostics.
- **Your API key is never sent over an unencrypted connection.** An API
  base URL of the form `http://<remote host>` is now refused by every call
  that carries the key (models, voices, transcription, correction, speech,
  realtime token), with a clear message in the settings tab and in "Test
  connection". Plain `http://` stays allowed for local addresses (localhost,
  private-network ranges, `.local`), so a local vLLM or Ollama server keeps
  working.
- **The spoken stop command now works in every language in realtime mode.**
  Single-stream realtime dictation only recognized "stop opname" / "stop
  recording" (Dutch and English) through a separate hard-coded list; in the
  other eleven languages the command was matched but never acted on, so the
  recording kept running. The session now uses the same command matcher as
  batch and dual-delay mode. A sentence that merely contains the words
  ("we should improve the stop recording button") no longer stops the
  recording either.
- **Built-in voice commands are read-only in settings.** The table and
  callout commands showed Edit and Delete buttons, but every edit or
  deletion was silently undone at the next restart, because built-ins are
  refreshed from the plugin's defaults on load. They now show why, and
  "Reset built-ins" remains available; add a custom command to use your own
  trigger.
- **Correct privacy note in the help panel.** The panel said your API key is
  stored in `data.json`; since 1.8.1 it lives in Obsidian's secret storage on
  this device and `data.json` only holds a reference. The note now says so in
  all thirteen languages.
- **README fixes.** No `Ctrl+Space` shortcut exists (assign one under
  Settings → Hotkeys); "Correct entire note" is "Correct dictated text";
  Enter = tap-to-send is off by default; auto-correction is Off / Light /
  Standard; building from source installs from the repository root.

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
