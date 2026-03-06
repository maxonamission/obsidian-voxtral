# Voxtral Transcribe — Technische Beschrijving

## Overzicht

Lokale spraak-naar-tekst webapplicatie met realtime streaming transcriptie via de Mistral Voxtral API, inclusief stemcommando's voor documentstructuur, automatische tekstcorrectie, en offline-opslag.

## Architectuur

**Stack:** Python (FastAPI) backend + vanilla JavaScript/HTML/CSS frontend, draait als lokale server.

---

## Backend — `server.py` (~280 regels)

### Endpoints

| Endpoint | Methode | Functie |
|---|---|---|
| `/ws/transcribe` | WebSocket | Realtime streaming transcriptie |
| `/api/transcribe` | POST | Batch transcriptie (audio-bestand upload) |
| `/api/correct` | POST | Tekstcorrectie via Mistral Small |
| `/api/settings` | GET/POST | API key opslag en validatie |
| `/api/health` | GET | Status check |

### Realtime WebSocket Flow

1. Client opent WebSocket met configureerbare `delay` parameter
2. Client stuurt raw PCM audio (s16le, 16kHz, mono) als binary frames
3. Server streamt audio naar Mistral's `voxtral-mini-transcribe-realtime-2602` model
4. Server stuurt tekst-delta's terug als JSON:
   - `{type: "delta", text: "..."}` — incrementele tekst
   - `{type: "done"}` — zin voltooid
   - `{type: "error", message: "..."}` — foutmelding
5. `ws_closed` guard flag voorkomt `RuntimeError` bij send-after-close

### Batch Transcriptie

- Ontvangt audio-bestand (WebM/Opus) via multipart form upload
- Stuurt naar Mistral's `voxtral-mini-transcribe-2502` model
- Optionele sprekerherkenning (diarization) via `diarize` parameter

### Tekstcorrectie

- Model: `mistral-small-latest`
- Uitgebreide systeemprompt voor Nederlandse tekstcorrectie
- Corrigeert: capitalisatie, spelfouten door spraakherkenning, leestekens
- Behoudt: zinsstructuur, stijl, markdown opmaak
- **Inline correctie-instructies**: herkent patronen als "voor de correctie", "voor de controle achteraf", gespelde woorden, zelfcorrecties — voert ze uit en verwijdert ze uit de output
- Optionele gebruikers-systeemprompt voor vaktermen/jargon

---

## Frontend — `app.js` (~1240 regels)

### 1. Active Insert Point

Kernconcept: één `<span class="partial">` element dat alle binnenkomende tekst ontvangt.

- **Standaard:** aan het einde van de transcript
- **Klik:** verplaats het invoegpunt naar een willekeurige positie
- **Selectie:** vervang geselecteerde tekst (replace mode met `<span class="replacing">`)
- **DOM-veiligheid:** `transcript.contains()` checks op alle operaties, range clamping bij triple-click, safety re-attachment als het element buiten de transcript terechtkomt

### 2. Stemcommando's

12 commando's, herkend via `endsWith`-matching op genormaliseerde tekst:

| Commando | Actie | Output |
|---|---|---|
| "nieuwe alinea" / "paragraaf" | Structuur | `\n\n` |
| "nieuwe regel" | Structuur | `\n` |
| "kop een/twee/drie" | Heading | `\n\n# ` / `## ` / `### ` |
| "nieuw punt" | Lijst | `\n- ` |
| "nieuw to-do item" | To-do | `\n- [ ] ` |
| "beëindig opname" | Bediening | Stopt opname |
| "verwijder laatste alinea" | Wissen | Verwijdert tot `\n\n` |
| "verwijder laatste regel" | Wissen | Verwijdert tot `.!?` of `\n` |
| "herstel" | Undo | Herstelt laatste state |

### 3. Commandoverwerking (twee-pass systeem)

**`processCompletedSentences()`** — verwerkt afgeronde zinnen (met `.!?`) in realtime:
1. **Pass 1 — Classificatie:** elke zin wordt geclassificeerd als commando of tekst
2. **Conditionele undo:** `saveUndo()` alleen bij zinnen met tekstdelen (niet bij pure commando's)
3. **Pass 2 — Executie:** commando's worden uitgevoerd, tekst wordt gefinaliseerd

**`checkForCommand()`** — controleert bij een `done`-event of de volledige buffer een commando is.

### 4. Normalisatie

`normalizeCommand()` verwerkt gesproken tekst voor command matching:
- Diacrieten strippen (`ë→e`, `é→e`) via NFD decomposition
- Alle Unicode hyphen/dash varianten verwijderen (U+002D, U+2010–U+2015)
- Leestekens verwijderen (`,;:'"…`)
- Common mishearings corrigeren (`niveau→nieuwe`)

`findCommand()` matcht via:
- Exacte match: `normalized === pattern`
- Suffix match: `normalized.endsWith(" " + pattern)` — vangt gevallen op waar Voxtral woorden prepend (bijv. "dan nieuwe paragraaf")

### 5. Auto-spacing & Capitalisatie

- **Spatie-invoeging:** automatisch spatie voor/na invoegpunt wanneer nodig
- **Dubbele-spatie-preventie:** trim leading spaces als er al een spatie staat
- **Mid-sentence detectie:** bepaalt of invoegpunt midden in een zin staat
- **Lowercase first letter:** bij mid-sentence insert wordt de eerste letter lowercase
- **Capitalize after sentence end:** na `.!?` wordt de eerste letter van de volgende tekst uppercase

### 6. Scrollgedrag

`scrollToInsertPoint()` berekent de relatieve positie van het invoegpunt in het viewport:
- **Bovenste helft (0–50%):** niet scrollen — positie is goed
- **Onderste helft (>50%) of buiten beeld:** scrolt naar ~35% van de bovenkant
- De 50vh CSS `padding-bottom` op `.transcript` zorgt voor visuele ruimte onder de actieve tekst

### 7. Undo-stack

- Maximaal 20 states (FIFO)
- `saveUndo()` slaat `transcript.innerHTML` op
- Conditioneel: alleen bij zinnen met tekstdelen, niet bij pure commando's
- Destructieve acties (`deleteLastBlock`) slaan hun eigen undo op
- `undoStack` wordt geleegd bij "Wis" knop

### 8. Tekstcorrectie

Twee modi:
- **Handmatig:** "Controleer" knop stuurt volledige transcript naar `/api/correct`
- **Automatisch:** na elke opname-stop (als de optie aanstaat in instellingen)
- Na correctie wordt de tekst automatisch naar het klembord gekopieerd

### 9. Auto-reconnect

Bij WebSocket-fouten (bijv. Mistral server errors):
1. Korte toast "Serverfout — herverbinden..." (geen stacktrace in transcript)
2. Audio capture wordt gestopt, insert point gefinaliseerd
3. Na 1,5 seconde automatisch nieuwe WebSocket verbinding
4. Bij succes: toast "Herverbonden"
5. Bij falen: opname stopt, toast "Herverbinden mislukt"

### 10. Offline Queue

- **IndexedDB** (`voxtral-queue`) slaat opnames op als de server niet bereikbaar is
- Automatische retry bij:
  - `online` event (browser komt terug online)
  - Periodiek interval (elke 30 seconden)
  - Handmatige klik op de wachtrij-badge

---

## Styling — `style.css` (~600 regels)

- Volledig dark mode (achtergrond `#0a0a0a`)
- Responsief: mobiel-vriendelijk met aangepaste header-layout
- `padding-bottom: 50vh` op transcript voor visuele ruimte onder actieve tekst
- Partial tekst (in opname) is grijs; definitieve tekst is wit
- Gecorrigeerde tekst krijgt een subtiel groene flash-animatie
- Dark scrollbars (webkit + Firefox) op help panel
- Replace mode highlight voor geselecteerde tekst

---

## PWA

- `manifest.json` met standalone display mode
- `sw.js` service worker voor offline caching van statische assets
- SVG-iconen voor installatie
- Installeerbaar als standalone app

---

## Dataflow

### Realtime Modus

```
Microfoon → AudioContext (16kHz) → ScriptProcessor (4096 samples)
    → floatTo16BitPCM() → downsample() → PCM s16le binary
    → WebSocket → FastAPI → Mistral Realtime API
    → Server-Sent Events (delta/done) → WebSocket → Browser
    → feedText() → processCompletedSentences() → DOM updates
    → [na stop] autoCorrectAfterStop() → copyTranscript()
```

### Batch Modus

```
Microfoon → MediaRecorder (WebM/Opus, 1s chunks)
    → [stop] → Blob → FormData POST /api/transcribe
    → Mistral Batch API (+ optionele diarization)
    → JSON response → feedText() / appendDiarizedText()
    → [na stop] autoCorrectAfterStop() → copyTranscript()
```

### Offline Fallback

```
POST /api/transcribe mislukt
    → saveToQueue(blob) → IndexedDB
    → [online event / 30s interval / handmatig]
    → processQueue() → retry POST → appendFinalText()
```

---

## Configuratie (localStorage)

| Key | Type | Inhoud | Default |
|---|---|---|---|
| `voxtral-delay` | string | Streaming delay in ms | `"1000"` |
| `voxtral-autocorrect` | boolean (JSON) | Auto-correctie aan/uit | `false` |
| `voxtral-system-prompt` | string | Extra correctie-instructies | `""` |
| `voxtral-mic` | string | Geselecteerd microfoon device ID | `""` (systeem default) |
| `voxtral-shortcut` | object (JSON) | Opname-sneltoets | `{ctrl:true, key:" "}` |

---

## Bestandsstructuur

```
voxtral-app/
├── server.py              # FastAPI backend (~280 regels)
├── static/
│   ├── index.html         # UI layout + help panel + settings modal
│   ├── app.js             # Frontend logica (~1240 regels)
│   ├── style.css          # Dark mode styling (~600 regels)
│   ├── sw.js              # Service worker (PWA offline cache)
│   ├── manifest.json      # PWA manifest
│   ├── icon-192.svg       # App icoon
│   └── icon-512.svg       # App icoon (groot)
└── TECHNICAL.md           # Dit bestand
```
