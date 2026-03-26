# Voxtral Transcribe — Obsidian Plugin

Speech-to-text dictation for Obsidian using Mistral Voxtral.
Supports real-time streaming (desktop), batch transcription (desktop + mobile),
voice commands, and automatic text correction.

<a href="https://buymeacoffee.com/maxonamission" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50"></a>

---

## Requirements

- **Obsidian** v1.0.0 or newer
- **Mistral API key** — free to create at [platform.mistral.ai](https://console.mistral.ai/)
- **Desktop**: Windows, macOS or Linux (for real-time streaming)
- **Mobile**: Android or iOS (batch mode + tap-to-send only)

---

## Installation (manual testing)

> **Note:** The terminal commands below work in **PowerShell**, **bash** and **zsh**.
> They do **not** work in Windows Command Prompt (`cmd.exe`).
> Open PowerShell via Start → "PowerShell", or use Windows Terminal.

### Step 1: Build the plugin

```bash
cd obsidian-plugin
npm install
npm run build
```

This generates `main.js` in the `obsidian-plugin/` directory.

### Step 2: Copy to your vault

Create a plugin directory in your Obsidian vault:

```bash
# Adjust the path to your vault
VAULT="$HOME/Documents/MyVault"

mkdir -p "$VAULT/.obsidian/plugins/voxtral-transcribe"
cp main.js manifest.json styles.css "$VAULT/.obsidian/plugins/voxtral-transcribe/"
```

**On mobile (Android):**
The vault is usually in `Documents/MyVault` or in the Obsidian sandbox.
Copy the three files using a file manager or sync tool (Syncthing, iCloud, Google Drive).

**On mobile (iOS):**
The vault is in `On My iPhone > Obsidian > MyVault` or in iCloud Drive.

### Step 3: Enable the plugin

1. Open Obsidian
2. Go to **Settings** → **Community plugins**
3. Disable **Restricted mode** (if still enabled)
4. You should now see **Voxtral Transcribe** in the list → toggle it **on**
5. Go to **Settings** → **Voxtral Transcribe**
6. Enter your **Mistral API key**

---

## Testing on Desktop

### Real-time mode (default)

1. Open a note
2. Click the **microphone icon** (🎙) in the ribbon (left sidebar), or use **Ctrl+Space**
3. Start speaking — text appears live in your note
4. Try voice commands:
   - Say "new paragraph" → new paragraph
   - Say "heading two" → ## heading
   - Say "new bullet" → bullet point
   - Say "new to-do" → checkbox
5. Click 🎙 again or say "stop recording" to stop
6. If auto-correction is enabled, the text is automatically corrected

### Batch mode

1. Go to **Settings** → **Voxtral Transcribe** → set mode to **Batch**
2. Click 🎙 to start recording
3. Press **Enter** while the mic is active (not while typing) to send a chunk — or use the send icon
4. While typing, Enter behaves normally as a newline
5. Click 🎙 again to stop → text is transcribed and inserted

> **Tip:** The Enter-as-tap-to-send feature and the typing cooldown (default 800 ms)
> are configurable via **Settings** → **Voxtral Transcribe**.

### Text correction standalone

- **Correct selection**: Select text → Command palette (Ctrl+P) → "Voxtral: Correct selected text"
- **Correct entire note**: Command palette → "Voxtral: Correct entire note"

### Voice commands cheat sheet

- Command palette → "Voxtral: Show voice commands (side panel)"
- Opens a panel on the right with all available commands

---

## Testing on Mobile (Android / iOS)

### How it works

On mobile, only **batch mode** is available (real-time streaming requires Node.js
which is not available on mobile). However, with **tap-to-send** you can send
chunks in between without stopping the dictation.

### Workflow

1. Open a note
2. Tap the **microphone icon** in the ribbon → recording starts
3. Start speaking
4. Tap the **send icon** (📤) in the **view header** (top of the screen, next to the note title) → current audio is transcribed while recording continues!
5. Keep speaking, tap 📤 again for the next chunk
6. Tap 🎙 to stop completely → the last segment is processed

### Tips for mobile

- Chunks of 10-30 seconds work best
- Voice commands ("new paragraph", "heading two", etc.) also work in batch mode
- On desktop: press **Enter** (while the mic is active) to send a chunk — while typing, Enter behaves normally as a newline
- You can also send a chunk via Command palette → "Voxtral: Send audio chunk"
- The voice command side panel does **not** open automatically on mobile (to avoid blocking your screen). Open it manually via Command palette → "Voxtral: Show voice commands (side panel)"

---

## Troubleshooting

### "WebSocket connection failed"
- Check that your API key is valid
- Check your internet connection
- On mobile: real-time mode is not available, use batch

### No audio recorded
- Grant Obsidian permission to access the microphone
- On mobile: check app permissions in system settings

### Transcription is empty or incorrect
- Check that the correct language is set (default: nl)
- Speak clearly and not too far from the microphone

### Plugin does not appear in the list
- Check that all three files (`main.js`, `manifest.json`, `styles.css`)
  are in `.obsidian/plugins/voxtral-transcribe/`
- Restart Obsidian completely

---

## Publishing as a Community Plugin

When the plugin is ready for public release, follow these steps:

### 1. Separate GitHub repository

Create a separate repository (e.g. `voxtral-obsidian-plugin`) with this structure:

```
voxtral-obsidian-plugin/
├── src/                  # TypeScript source files
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── styles.css
├── README.md             # Description for users (required)
├── LICENSE               # GPL-3.0 or other license (required)
└── .github/
    └── workflows/
        └── release.yml   # Automatic release on tag
```

### 2. GitHub Actions for releases

Create `.github/workflows/release.yml`:

```yaml
name: Release Obsidian Plugin

on:
  push:
    tags:
      - "*"

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm install
      - run: npm run build
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            main.js
            manifest.json
            styles.css
```

### 3. Create the first release

```bash
# Make sure the version in manifest.json is correct (e.g. "1.0.0")
git tag 1.0.0
git push origin 1.0.0
# GitHub Actions automatically creates a release
```

### 4. Community plugin list

1. Fork [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
2. Add an entry to `community-plugins.json`:

```json
{
    "id": "voxtral-transcribe",
    "name": "Voxtral Transcribe",
    "author": "Voxtral Transcribe",
    "description": "Speech-to-text dictation using Mistral Voxtral. Supports real-time streaming, voice commands (headings, lists, to-dos), and automatic text correction.",
    "repo": "your-username/voxtral-obsidian-plugin"
}
```

3. Open a **Pull Request** using the plugin submission template
4. Complete the checklist in the PR template
5. Wait for review by the Obsidian team (usually 1-4 weeks)

### 5. Requirements for approval

- `README.md` with clear description and usage instructions
- `LICENSE` file (required)
- No obfuscated code
- No tracking or analytics without consent
- No external network calls without clear explanation
- Plugin ID must be unique in the community list

See the full requirements:
https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins

---

## Development

### Dev mode (hot reload)

```bash
cd obsidian-plugin
npm run dev
```

This starts esbuild in watch mode. Combine with the
[Hot Reload plugin](https://github.com/pjeby/hot-reload) for Obsidian
to see changes immediately.

### Files

| File | Purpose |
|---|---|
| `src/main.ts` | Plugin entry, recording, commands |
| `src/mistral-api.ts` | Batch transcription, correction, real-time WebSocket |
| `src/audio-recorder.ts` | Microphone capture, PCM encoding, level metering |
| `src/voice-commands.ts` | Voice command recognition and execution |
| `src/help-view.ts` | Side panel with command list |
| `src/settings-tab.ts` | Settings UI |
| `src/types.ts` | Interfaces and constants |
| `styles.css` | Styling |
