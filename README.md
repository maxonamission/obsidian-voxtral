# Voxtral Transcribe

Lokale spraak-naar-tekst applicatie met realtime streaming via de [Mistral](https://mistral.ai) Voxtral API. Dicteer tekst met stemcommando's voor structuur, automatische correctie, en kopieer het resultaat naar je klembord.

## Features

- **Realtime transcriptie** — tekst verschijnt terwijl je praat, met configureerbare streaming delay
- **Stemcommando's** — nieuwe alinea, koppen, lijsten, to-do items, wissen en undo, allemaal met je stem
- **Tekstcorrectie** — automatische of handmatige correctie via Mistral Small (spelling, leestekens, capitalisatie)
- **Inline correctie-instructies** — geef de corrector opdrachten midden in je dictaat ("voor de controle achteraf: maak van X altijd Y")
- **Mid-text editing** — klik ergens in de tekst om daar in te voegen, of selecteer tekst om te vervangen
- **Auto-copy** — na elke opname wordt de tekst automatisch naar het klembord gekopieerd
- **Offline queue** — opnames worden lokaal opgeslagen als de server niet bereikbaar is
- **PWA** — installeerbaar als standalone app
- **Auto-reconnect** — bij verbindingsproblemen wordt automatisch opnieuw verbonden
- **Sprekerherkenning** — optionele diarization in batch modus
- **Microfoon status** — statuslampje met stabiele beoordeling van je microfoonniveau
- **Slim scrollen** — scroll omhoog om terug te lezen terwijl je dicteert, auto-scroll hervat als je terug naar beneden scrollt

Need coffee to process all this? Me too.

<a href="https://buymeacoffee.com/maxonamission" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50"></a>

## Vereisten

- Python 3.10+
- [Mistral API key](https://console.mistral.ai/api-keys)

## Installatie

```bash
git clone https://github.com/jouw-gebruikersnaam/voxtral-app.git
cd voxtral-app
```

### Windows

Dubbelklik op `start.bat` — dit maakt automatisch een virtual environment aan, installeert dependencies, en start de server.

### macOS / Linux

```bash
chmod +x start.sh
./start.sh
```

### Handmatig

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python server.py
```

Open daarna [http://127.0.0.1:8000](http://127.0.0.1:8000) in je browser. Bij eerste gebruik wordt gevraagd om je Mistral API key.

## Stemcommando's

| Commando | Actie |
|---|---|
| "nieuwe alinea" / "nieuwe paragraaf" | Dubbele regelbreuk |
| "nieuwe regel" | Enkele regelbreuk |
| "kop een" / "kop twee" / "kop drie" | Markdown heading H1–H3 |
| "nieuw punt" | Lijstitem (`- `) |
| "nieuw to-do item" | To-do checkbox (`- [ ] `) |
| "verwijder laatste alinea" | Verwijdert de laatste paragraaf |
| "verwijder laatste regel" | Verwijdert de laatste zin |
| "herstel" | Undo |
| "beëindig opname" | Stopt de opname |

Commando's worden herkend als suffix — je kunt gewoon doorpraten en eindigen met het commando (bijv. "en dan nieuwe alinea").

## Build (standalone executable)

### Windows

```bash
build.bat
```

### macOS

```bash
chmod +x build-mac.sh
./build-mac.sh
```

### Raspberry Pi / Linux

```bash
chmod +x build-rpi.sh
./build-rpi.sh
```

De build gebruikt PyInstaller en maakt een standalone executable in `dist/`. De RPi-build kan optioneel een systemd service installeren voor autostart.

## Configuratie

De API key kan op twee manieren worden ingesteld:

1. **Via de app** — klik op het tandwiel-icoon en plak je key (opgeslagen in `config.json`)
2. **Via environment** — maak een `.env` bestand aan met `MISTRAL_API_KEY=...`

### Instellingen (via tandwiel-icoon)

| Instelling | Omschrijving |
|---|---|
| Streaming delay | Vertraging voor nauwkeurigere transcriptie (240–2400ms) |
| Automatisch corrigeren | Corrigeer tekst automatisch na elke opname |
| Systeemprompt | Extra instructies voor de corrector (jargon, vaktermen) |
| Microfoon | Selecteer de gewenste microfoon |
| Sneltoets | Configureerbare opname-sneltoets (standaard: Ctrl+Space) |

## Obsidian Plugin

Voxtral Transcribe is ook beschikbaar als **Obsidian plugin** — dicteer direct in je Obsidian notities.

### Features

- **Realtime streaming** op desktop (Windows, macOS, Linux)
- **Batch modus met tap-to-send** op mobiel (Android, iOS) — verstuur audio chunks terwijl je blijft praten
- **Stemcommando's** — nieuwe alinea, koppen, lijsten, to-do items, undo
- **Automatische tekstcorrectie** — spelling, leestekens, capitalisatie via Mistral Small
- **Inline correctie-instructies** — geef de corrector opdrachten midden in je dictaat
- **Zijpaneel** met stemcommando-overzicht (desktop)

### Installatie

Zie [`obsidian-plugin/INSTALL.md`](obsidian-plugin/INSTALL.md) voor volledige installatie-instructies.

Kort:
```bash
cd obsidian-plugin
npm install && npm run build
```
Kopieer `main.js`, `manifest.json` en `styles.css` naar `.obsidian/plugins/voxtral-transcribe/` in je vault.

### Mobiel

Op mobiel (Android/iOS) wordt automatisch batch modus gebruikt. Een **verzend-knop** verschijnt in de view header wanneer je een opname start, zodat je chunks kunt verzenden zonder te stoppen. Het stemcommando-zijpaneel opent niet automatisch op mobiel om het scherm niet te blokkeren.

## Projectstructuur

```
voxtral-transcribe/
├── server.py              # FastAPI backend
├── requirements.txt       # Python dependencies
├── .env.example           # Voorbeeld environment
├── start.bat / start.sh   # Start scripts
├── build.bat              # Windows build
├── build-mac.sh           # macOS build
├── build-rpi.sh           # RPi/Linux build
├── static/
│   ├── index.html         # Frontend UI
│   ├── app.js             # Frontend logica
│   ├── style.css          # Styling (dark mode)
│   ├── sw.js              # Service worker
│   ├── manifest.json      # PWA manifest
│   └── icon-*.svg         # App iconen
├── obsidian-plugin/       # Obsidian plugin
│   ├── src/               # TypeScript bronbestanden
│   ├── main.js            # Gebouwde plugin
│   ├── manifest.json      # Obsidian plugin manifest
│   ├── styles.css         # Plugin styling
│   └── INSTALL.md         # Installatie-instructies
├── TECHNICAL.md           # Technische documentatie
└── STATUS.md              # Project status & roadmap
```

## Licentie

MIT
