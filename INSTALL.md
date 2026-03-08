# Voxtral Transcribe — Obsidian Plugin

Spraak-naar-tekst dictatie voor Obsidian met Mistral Voxtral.
Ondersteunt realtime streaming (desktop), batch transcriptie (desktop + mobiel),
stemcommando's, en automatische tekstcorrectie.

<a href="https://buymeacoffee.com/maxonamission" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50"></a>

---

## Vereisten

- **Obsidian** v1.0.0 of nieuwer
- **Mistral API key** — gratis aan te maken op [platform.mistral.ai](https://console.mistral.ai/)
- **Desktop**: Windows, macOS of Linux (voor realtime streaming)
- **Mobiel**: Android of iOS (alleen batch modus + tap-to-send)

---

## Installatie (handmatig testen)

> **Let op:** De onderstaande terminal-commando's werken in **PowerShell**, **bash** en **zsh**.
> Ze werken **niet** in de Windows Command Prompt (`cmd.exe`).
> Open PowerShell via Start → "PowerShell", of gebruik Windows Terminal.

### Stap 1: Plugin bouwen

```bash
cd obsidian-plugin
npm install
npm run build
```

Dit genereert `main.js` in de `obsidian-plugin/` directory.

### Stap 2: Kopieer naar je vault

Maak een plugin-directory aan in je Obsidian vault:

```bash
# Pas het pad aan naar jouw vault
VAULT="$HOME/Documents/MijnVault"

mkdir -p "$VAULT/.obsidian/plugins/voxtral-transcribe"
cp main.js manifest.json styles.css "$VAULT/.obsidian/plugins/voxtral-transcribe/"
```

**Op mobiel (Android):**
De vault staat meestal in `Documents/MijnVault` of in de Obsidian sandbox.
Kopieer de drie bestanden via een bestandsbeheerder of sync-tool (Syncthing, iCloud, Google Drive).

**Op mobiel (iOS):**
De vault staat in `On My iPhone > Obsidian > MijnVault` of in iCloud Drive.

### Stap 3: Plugin activeren

1. Open Obsidian
2. Ga naar **Instellingen** → **Community plugins**
3. Schakel **Restricted mode** uit (als dat nog aan staat)
4. Je ziet nu **Voxtral Transcribe** in de lijst → schakel het **aan**
5. Ga naar **Instellingen** → **Voxtral Transcribe**
6. Vul je **Mistral API key** in

---

## Testen op Desktop

### Realtime modus (standaard)

1. Open een notitie
2. Klik op het **microfoon-icoon** (🎙) in de ribbon (linkerbalk), of gebruik **Ctrl+Spatie**
3. Begin te praten — tekst verschijnt live in je notitie
4. Probeer stemcommando's:
   - Zeg "nieuwe alinea" → nieuwe paragraaf
   - Zeg "kop twee" → ## heading
   - Zeg "nieuw punt" → bullet point
   - Zeg "nieuw to-do item" → checkbox
5. Klik nogmaals op 🎙 of zeg "beëindig opname" om te stoppen
6. Als autocorrectie aan staat, wordt de tekst automatisch gecorrigeerd

### Batch modus

1. Ga naar **Instellingen** → **Voxtral Transcribe** → zet modus op **Batch**
2. Klik op 🎙 om op te nemen
3. Klik nogmaals op 🎙 om te stoppen → tekst wordt getranscribeerd en ingevoegd

### Tekstcorrectie los gebruiken

- **Selectie corrigeren**: Selecteer tekst → Command palette (Ctrl+P) → "Voxtral: Corrigeer geselecteerde tekst"
- **Hele notitie corrigeren**: Command palette → "Voxtral: Corrigeer hele notitie"

### Stemcommando's cheat sheet

- Command palette → "Voxtral: Toon stemcommando's (zijpaneel)"
- Opent een panel rechts met alle beschikbare commando's

---

## Testen op Mobiel (Android / iOS)

### Hoe het werkt

Op mobiel is alleen **batch modus** beschikbaar (realtime streaming vereist Node.js
dat niet beschikbaar is op mobiel). Maar met **tap-to-send** kun je tussendoor
chunks verzenden zonder het dicteren te stoppen.

### Workflow

1. Open een notitie
2. Tik op het **microfoon-icoon** in de ribbon → opname start
3. Begin te praten
4. Tik op het **verzend-icoon** (▶) dat verschijnt → huidige audio wordt getranscribeerd
   terwijl de opname doorloopt!
5. Blijf praten, tik opnieuw op ▶ voor de volgende chunk
6. Tik op 🎙 om definitief te stoppen → laatste stuk wordt verwerkt

### Tips voor mobiel

- Chunks van 10-30 seconden werken het best
- Stemcommando's ("nieuwe alinea", "kop twee", etc.) werken ook in batch modus
- Je kunt ook via Command palette → "Voxtral: Verzend audio chunk" de chunk versturen

---

## Problemen oplossen

### "WebSocket connection failed"
- Controleer of je API key geldig is
- Controleer je internetverbinding
- Op mobiel: realtime modus is niet beschikbaar, gebruik batch

### Geen audio opgenomen
- Geef Obsidian toestemming voor microfoontoegang
- Op mobiel: controleer app-permissies in systeeminstellingen

### Transcriptie is leeg of onjuist
- Controleer of de juiste taal is ingesteld (standaard: nl)
- Spreek duidelijk en niet te ver van de microfoon

### Plugin verschijnt niet in de lijst
- Controleer of alle drie bestanden (`main.js`, `manifest.json`, `styles.css`)
  in `.obsidian/plugins/voxtral-transcribe/` staan
- Herstart Obsidian volledig

---

## Beschikbaar maken als Community Plugin

Wanneer de plugin klaar is voor publieke release, volg deze stappen:

### 1. Eigen GitHub repository

Maak een aparte repository aan (bijv. `voxtral-obsidian-plugin`) met deze structuur:

```
voxtral-obsidian-plugin/
├── src/                  # TypeScript bronbestanden
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── styles.css
├── README.md             # Beschrijving voor gebruikers (verplicht)
├── LICENSE               # MIT of andere licentie (verplicht)
└── .github/
    └── workflows/
        └── release.yml   # Automatische release bij tag
```

### 2. GitHub Actions voor releases

Maak `.github/workflows/release.yml`:

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

### 3. Eerste release maken

```bash
# Zorg dat versie in manifest.json klopt (bijv. "1.0.0")
git tag 1.0.0
git push origin 1.0.0
# GitHub Actions maakt automatisch een release aan
```

### 4. Community plugin lijst

1. Fork [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
2. Voeg een entry toe aan `community-plugins.json`:

```json
{
    "id": "voxtral-transcribe",
    "name": "Voxtral Transcribe",
    "author": "Voxtral Transcribe",
    "description": "Speech-to-text dictation using Mistral Voxtral with real-time streaming, voice commands, and auto-correction.",
    "repo": "jouw-username/voxtral-obsidian-plugin"
}
```

3. Open een **Pull Request** met de plugin submission template
4. Vul de checklist in het PR-template volledig in
5. Wacht op review door het Obsidian team (meestal 1-4 weken)

### 5. Vereisten voor goedkeuring

- `README.md` met duidelijke beschrijving en gebruiksinstructies
- `LICENSE` bestand (MIT aanbevolen)
- Geen obfuscated code
- Geen tracking of analytics zonder toestemming
- Geen externe netwerk-calls zonder duidelijke uitleg
- Plugin ID moet uniek zijn in de community lijst

Zie de volledige vereisten:
https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins

---

## Ontwikkeling

### Dev mode (hot reload)

```bash
cd obsidian-plugin
npm run dev
```

Dit start esbuild in watch mode. Combineer met de
[Hot Reload plugin](https://github.com/pjeby/hot-reload) voor Obsidian
om wijzigingen direct te zien.

### Bestanden

| Bestand | Functie |
|---|---|
| `src/main.ts` | Plugin entry, recording, commands |
| `src/mistral-api.ts` | Batch transcriptie, correctie, realtime WebSocket |
| `src/audio-recorder.ts` | Microfoon capture, PCM encoding, level metering |
| `src/voice-commands.ts` | Stemcommando herkenning en uitvoering |
| `src/help-view.ts` | Zijpaneel met commandolijst |
| `src/settings-tab.ts` | Instellingen UI |
| `src/types.ts` | Interfaces en constanten |
| `styles.css` | Styling |
