# Obsidian plugin: introducievideo toevoegen voor nieuwe gebruikers

## Doel

Een korte introducievideo opnemen die nieuwe Obsidian-gebruikers een soepele start geeft met de Voxtral Transcribe plugin. De video wordt embedded in de plugin README.

## Waarom

De plugin zit intuïtief in elkaar, maar combineert veel slimme features (realtime vs batch, spraakcommando's, auto-correctie, typing mute) die je als nieuwe gebruiker niet vanzelf ontdekt. Een visuele walkthrough bespaart frustratie en laat direct de kracht zien.

## Suggestie voor inhoud

### 1. Installatie & API key (~1 min)
- Community plugins → zoek "Voxtral Transcribe" → installeren → activeren
- Settings → Voxtral Transcribe → API key invullen (gratis via platform.mistral.ai)
- Microfoon selecteren als je meerdere hebt

### 2. Eerste opname — desktop realtime (~1–2 min)
- Open een notitie, klik het microfoon-icoon in de ribbon of druk `Ctrl+Space`
- Laten zien dat tekst live verschijnt in je notitie terwijl je spreekt
- Het spraakcommando-paneel opent automatisch aan de zijkant — handig als spiekbriefje
- Nogmaals klikken of zeg "beëindig opname" om te stoppen
- Status bar onderaan toont de opnamestatus

### 3. Spraakcommando's in actie (~1–2 min)
- "nieuwe alinea" — nieuwe paragraaf beginnen
- "kop twee" — een markdown heading invoegen
- "nieuw punt" — bullet list starten
- "nieuw to-do item" — checkbox toevoegen
- "genummerd item" — nummert automatisch door
- Tip: gewoon Nederlands spreken, het commando komt aan het einde van je zin

### 4. Batch mode & tap-to-send (~1 min)
- Settings → Mode → Batch (of automatisch op mobiel)
- Opname starten → spreken → Enter of het verzend-icoon tikken om een stuk te versturen
- Je blijft opnemen terwijl het vorige stuk wordt verwerkt — soepele workflow
- Laten zien dat dit ook handig is op desktop als je langere stukken wilt dicteren

### 5. Mobiel gebruik (~1 min)
- Batch mode is de enige optie op mobiel
- Verzend-knop zit in de header (altijd zichtbaar boven het toetsenbord)
- Het spraakcommando-paneel opent niet automatisch op mobiel (schermruimte)
- Auto-pause bij focus loss: wat er gebeurt als je even naar een andere app switcht

### 6. Tekst corrigeren (~1 min)
- Auto-correctie staat standaard aan — na elke opname wordt tekst opgeschoond
- Handmatig: Command palette → "Correct entire note" of "Correct selected text"
- Inline instructies: zeg "voor de controle achteraf: schrijf dit als opsomming" — de corrector voert het uit
- Gespelde woorden en zelfcorrecties ("nee niet X maar Y") worden herkend

### 7. Handige instellingen om te kennen (~30s)
- **Streaming delay**: lager = sneller maar minder nauwkeurig (standaard 480ms)
- **Typing cooldown**: microfoon dempt automatisch tijdens typen zodat toetsaanslagen niet worden getranscribeerd
- **Focus loss gedrag**: pauzeer direct, na vertraging, of blijf opnemen
- **Enter = tap-to-send**: aan/uit schakelbaar
- **Systeemprompt**: eigen jargon of terminologie meegeven aan de corrector

### 8. Bonus tips (~30s)
- Logs exporteren via Command palette → "Export logs" (handig bij problemen)
- Spraakcommando's werken ook in het Engels ("new paragraph", "heading two")
- De plugin werkt samen met je bestaande Obsidian workflow — tekst gaat gewoon in de actieve notitie

## Technische notities
- Ideale lengte: 4–6 minuten
- Taal: Nederlands (eventueel met ondertiteling)
- Formaat: YouTube (unlisted of public) embedded in de plugin README
- Overweeg twee delen: desktop walkthrough + kort mobiel-segment
- Laat het spraakcommando-paneel zichtbaar tijdens de demo — dat geeft context

## Niet vergeten
- [ ] Video opnemen (desktop + mobiel)
- [ ] Video hosten (YouTube)
- [ ] Plugin README updaten met embed/link
- [ ] Eventueel een "Snelstart" sectie toevoegen bovenaan de README
