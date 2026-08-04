# JaeDrive — AI Agent Development Log

Questo registro contiene lo storico delle modifiche, scelte architetturali ed evoluzioni del codice effettuate dagli agenti/modelli AI sul repository JaeDrive.

---

## [2026-08-04] - Fix Tema Dark Popup Mappa e Contrasto Valori Telemetrici

### 📌 Sintesi della Funzionalità
Risolto il problema di leggibilità del Popup sulla mappa Leaflet (`cloud/web`). Sovrascritto lo sfondo bianco di default di Leaflet con il tema scuro Aetheris Automotive (`#12181F`) e applicato testo ad alto contrasto (`text-white` e `text-slate-400`) per evidenziare tutti i valori di velocità, SOC batteria, livello carburante, rigenerazione, ora e distanza.

### 🛠️ Modifiche Tecniche Dettagliate

1. **Override CSS Leaflet Dark Popup (`cloud/web/src/index.css`)**
   - Aggiunte regole CSS ad alta priorità (`.leaflet-popup-content-wrapper`, `.leaflet-popup-tip`, `.leaflet-popup-content`) con sfondo scuro (`#12181F`), bordo con opacità bianca (`rgba(255, 255, 255, 0.18)`), ombreggiatura profonda e pulsante di chiusura coordinato (`#94A3B8`).

2. **Tipografia ad Alto Contrasto (`cloud/web/src/components/TripMap.tsx`)**
   - Riorganizzato il layout del `PointPopupContent`:
     - Titolo Indirizzo in azzurro accento (`text-sky-400`).
     - Etichette segnali in grigio chiaro (`text-slate-400`).
     - Valori numerici (Velocità, SOC %, Carburante %, Rigenerazione) in testo bianco puro e grassetto (`text-white font-bold`) per una perfetta visibilità su schermi di qualsiasi dimensione.

---

## [2026-08-04] - Mappa Interattiva Telemetrica con Reverse Geocoding, Hit-Target Polylines e Auto-Open Popup

### 📌 Sintesi della Funzionalità
Implementata l'interattività avanzata e la sincronizzazione bidirezionale sulla mappa dei dettagli viaggio (`TripDetail`) nella WebApp React (`cloud/web`). Gli utenti possono ispezionare punto per punto la traccia GPS del viaggio selezionando un segmento direttamente sulla mappa o muovendo il mouse sui grafici temporali della telemetria.

### 🛠️ Modifiche Tecniche Dettagliate

1. **Hit-Target Polylines e Auto-Open Popup (`cloud/web/src/components/TripMap.tsx`)**
   - **Polyline Traccia Invisibile**: Aggiunta una Polyline trasparente con larghezza maggiorata (`weight: 20`) sotto la linea visuale (`weight: 5`) per garantire un'area di click e hover generosa su schermi touch e desktop.
   - **EventHandlers Diretti su Polyline**: Integrati gli eventHandlers `click` e `mouseover` direttamente sulle Polylines della traccia per intercettare l'evento prima del container mappa.
   - **`AutoOpenMarker` Component**: Implementato componente wrapper per aprire automaticamente il `Popup` Leaflet non appena il punto viene selezionato/evidenziato.

2. **Reverse Geocoding Client-Side con Cache (`cloud/web/src/lib/reverseGeocode.ts`)**
   - Creato modulo helper `reverseGeocode(lat, lon)` per interrogare le API OpenStreetMap Nominatim (`/reverse`).
   - Cache in-memory (`Map<string, Promise<string>>`) con arrotondamento delle coordinate a 4 cifre decimali (~11 metri) per abbattere le chiamate di rete ridondanti durante lo scorrimento dei punti.

3. **Standardizzazione Etichette EnergyFlow (`cloud/web/src/lib/energyFlow.ts`)**
   - Mappate le etichette standard internazionali di flusso energetico veicolo: `EV`, `HEV-S`, `HEV-P`, `CHARGE`, `IDLE`.

---
