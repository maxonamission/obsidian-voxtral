# Changelog

All notable user-facing changes to the **Voxtral Transcribe** Obsidian plugin.
The format is based on [Keep a Changelog](https://keepachangelog.com/); this
plugin follows [semantic versioning](https://semver.org/).

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
