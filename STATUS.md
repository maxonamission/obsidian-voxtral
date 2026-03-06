# Project Status — Voxtral Transcribe

**Laatste update:** 2026-03-06

## Huidige staat: Werkende app (v18)

De app is volledig functioneel voor dagelijks gebruik. Alle kernfuncties werken betrouwbaar.

---

## Wat werkt

### Kern
- [x] Realtime streaming transcriptie via Mistral Voxtral API
- [x] Batch transcriptie (opnemen + versturen)
- [x] Sprekerherkenning (diarization) in batch modus
- [x] Auto-copy naar klembord na opname
- [x] Windows line ending normalisatie (`\r\n`)

### Stemcommando's
- [x] Structuur: nieuwe alinea, nieuwe regel
- [x] Koppen: kop 1/2/3
- [x] Lijsten: nieuw punt, nieuw to-do item
- [x] Bediening: beëindig opname, verwijder laatste alinea/regel, herstel (undo)
- [x] Suffix-matching (commando's werken ook als deel van een zin)
- [x] Unicode hyphen/dash normalisatie
- [x] Diacrieten-stripping
- [x] Voxtral mishearing correctie (`niveau` → `nieuwe`)

### Tekstcorrectie
- [x] Handmatige correctie via "Controleer" knop
- [x] Automatische correctie na opname (instelbaar)
- [x] Inline correctie-instructies ("voor de controle achteraf: ...")
- [x] Aangepaste systeemprompt voor jargon/vaktermen
- [x] Behoud van markdown opmaak bij correctie

### UI & UX
- [x] Dark mode (volledig)
- [x] Mid-text editing (klik om invoegpunt te verplaatsen)
- [x] Tekst selecteren en vervangen
- [x] Scroll volgt invoegpunt (35% van bovenkant)
- [x] 50vh padding voor visuele ruimte onder tekst
- [x] Help panel met stemcommando-overzicht
- [x] Configureerbare sneltoets (standaard Ctrl+Space)
- [x] Streaming delay instelling (persistent)
- [x] Microfoon selectie (persistent)
- [x] Toast notificaties
- [x] Auto-reconnect bij verbindingsproblemen

### Infra
- [x] PWA (installeerbaar, offline cache)
- [x] Offline queue (IndexedDB)
- [x] PyInstaller build scripts (Windows, macOS, RPi)
- [x] Start scripts (Windows, macOS/Linux)
- [x] Systemd service optie (RPi)
- [x] API key via UI of .env

---

## Bekende issues

### Scroll padding
- De 50vh padding werkt goed, maar bij window resize tijdens opname kan het scrollgedrag verstoord raken
- `scrollToInsertPoint()` met 35%/50% thresholds is een verbetering maar nog niet perfect in alle gevallen

### Commando false positives
- `endsWith`-matching kan false positives geven als je over commando's praat in context (bijv. "hallo nieuwe paragraaf" wordt als commando herkend)
- Mogelijke oplossing: minimum woordaantal check, of confidence scoring

### Inline correctie-instructies
- Werken gedeeltelijk — expliciete markers ("voor de correctie", "voor de controle achteraf") worden goed herkend
- Subtielere patronen (zelfcorrecties, gespelde woorden) worden niet altijd opgepakt door Mistral Small
- Afhankelijk van model-kwaliteit, niet altijd te verbeteren via prompt

---

## Te doen

### Prioriteit: GitHub & Build

- [ ] **GitHub repo aanmaken** en code pushen
- [ ] **Build testen** — `build.bat` draaien en verifiëren dat de executable werkt
- [ ] **`.gitignore` checken** — `*.spec` staat nu in gitignore, maar de spec files zijn wel nuttig voor reproduceerbare builds. Overwegen om ze toe te voegen
- [ ] **LICENSE bestand** toevoegen (MIT)

### Opschoning

- [ ] **Debug logging verwijderen** — hex code logging in `processCompletedSentences()` en `[autocorrect]` console.log. Nuttig tijdens development, kan weg voor release
- [ ] **Service worker cache versie** — sw.js cache versie synchroniseren met HTML cache bust versie, of een automatisch mechanisme

### Nice-to-have

- [ ] **Scroll bij window resize** — ResizeObserver toevoegen die `scrollToInsertPoint()` aanroept bij resize
- [ ] **Commando confidence** — false positives verminderen bij `endsWith` matching (bijv. minimum 2 woorden voor commando, of alleen matchen als het na een punt/pauze komt)
- [ ] **Export opties** — download als .md of .txt bestand
- [ ] **Meerdere transcripties** — tabs of sessies voor meerdere documenten
- [ ] **Woordenteller** — live woord-/tekentelling
- [ ] **Donker/licht thema toggle** — momenteel alleen dark mode
- [ ] **Sprekerherkenning in realtime** — nu alleen in batch modus

---

## Technische schuld

- `createScriptProcessor` is deprecated — zou vervangen moeten worden door `AudioWorklet` voor betere performance, maar werkt voorlopig prima
- Undo stack slaat volledige `innerHTML` op — bij zeer grote documenten kan dit geheugenintensief worden
- `*.spec` bestanden worden gegenereerd door PyInstaller maar staan in `.gitignore` — als ze handmatig aangepast zijn, gaan ze verloren

---

## Versiegeschiedenis

| Versie | Datum | Wijzigingen |
|---|---|---|
| v18 | 2026-03-06 | Auto-reconnect, gebruiksvriendelijke foutmeldingen |
| v17 | 2026-03-06 | Scroll padding fix (35%/50% thresholds) |
| v16 | 2026-03-05 | `scrollToInsertPoint()` vervangt `scrollToBottom()` |
| v15 | 2026-03-05 | Unicode hyphen fix, to-do items hersteld |
| v14 | 2026-03-05 | Dark scrollbar help panel |
| v13 | 2026-03-05 | Delay persistence, Windows line endings |
| v12 | 2026-03-05 | To-do greedy match fix, autocorrect debug |
| v10 | 2026-03-05 | Inline correctie-instructies, to-do commando |
| v7 | 2026-03-05 | `endsWith` matching, undo fix, WebSocket guard |
| v1 | 2026-03-04 | Initial release |
