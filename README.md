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

## Projectstructuur

```
voxtral-app/
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
├── TECHNICAL.md           # Technische documentatie
└── STATUS.md              # Project status & roadmap
```

## Licentie

MIT
