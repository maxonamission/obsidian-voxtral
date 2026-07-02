# Contributing

This repository is **distribution-only**. It contains the pre-built
plugin artifacts (`main.js`, `manifest.json`, `styles.css`,
`versions.json`) that Obsidian consumes when installing the plugin
through the Community Plugins browser.

The source code, build tooling, and tests live in the main repository:

➡️ **https://github.com/maxonamission/voxtral-transcribe**

## Where to file things

- **Bug reports & feature requests:** open an issue at
  https://github.com/maxonamission/voxtral-transcribe/issues
- **Pull requests:** target `maxonamission/voxtral-transcribe`, not
  this repo. The plugin source lives under `obsidian-plugin/` there;
  shared logic (transcript parsing, voice commands) lives under
  `shared/`.

PRs opened against this repo will be redirected — files here are
overwritten on every sync from `voxtral-transcribe`, so changes made
directly will be lost.

## Building from source

In the source repo:

```bash
git clone https://github.com/maxonamission/voxtral-transcribe.git
cd voxtral-transcribe/shared && npm ci
cd ../obsidian-plugin && npm ci
npm run build
```

This produces `main.js`. Copy `main.js`, `manifest.json`, and
`styles.css` into `<vault>/.obsidian/plugins/voxtral-transcribe/` and
enable the plugin in Settings → Community plugins.

## Tests & lint

From `obsidian-plugin/`:

```bash
npm test                              # vitest
npm run lint                          # eslint with warning budget
npx tsc -noEmit -skipLibCheck
```

See `CONTRIBUTING.md` in the source repo for the full development
guide, including the Python backend and release process.
