# Voxtral Transcribe

Dictate directly into Markdown — insert headings, lists, and to-dos by voice, correct text on the fly, and keep talking while edits happen. Speech-to-text dictation for [Obsidian](https://obsidian.md) powered by [Mistral's Voxtral](https://mistral.ai/) models.

## Features

- **Real-time streaming** (desktop) — text appears as you speak
- **Batch mode with tap-to-send** (desktop + mobile) — send audio chunks while you keep talking
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

Need coffee to process all this? Me too.

<a href="https://buymeacoffee.com/maxonamission" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50"></a>

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

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production build
```

## License

[GPL-3.0](LICENSE) — Copyright (c) 2026 Max Kloosterman
