# Changelog

All notable user-facing changes to the **Voxtral Transcribe** Obsidian plugin.
The format is based on [Keep a Changelog](https://keepachangelog.com/); this
plugin follows [semantic versioning](https://semver.org/).

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
