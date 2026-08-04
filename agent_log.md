# JaeDrive — AI Agent Development Log

Questo registro contiene lo storico delle modifiche, scelte architetturali ed evoluzioni del codice effettuate dagli agenti/modelli AI sul repository JaeDrive.

---

## [2026-08-04] - Mappa Interattiva Telemetrica con Reverse Geocoding, Hit-Target Polylines e Auto-Open Popup

### 📌 Sintesi della Funzionalità
Implementata l'interattività avanzata e la sincronizzazione bidirezionale sulla mappa dei dettagli viaggio (`TripDetail`) nella WebApp React (`cloud/web`). Gli utenti possono ispezionare punto per punto la traccia GPS del viaggio selezionando un segmento direttamente sulla mappa o muovendo il mouse sui grafici temporali della telemetria.

### 🛠️ Modifiche Tecniche Dettagliate

1. **Hit-Target Polylines e Auto-Open Popup (`cloud/web/src/components/TripMap.tsx`)**
   - **Polyline Traccia Invisibile**: Aggiunta una Polyline trasparente con larghezza maggiorata (`weight: 20`) sotto la linea visuale (`weight: 5`) per garantire un'area di click e hover generosa su schermi touch e desktop.
   - **EventHandlers Diretti su Polyline**: Integrati gli eventHandlers `click` e `mouseover` direttamente sulle Polylines della traccia per intercettare l'evento prima del container mappa.
   - **`AutoOpenMarker` Component**: Implementato componente wrapper per aprire automaticamente il `Popup` Leaflet non appena il punto viene selezionato/evidenziato (risolto limite di `react-leaflet` per cui i popup su marker dinamici non si aprivano fino al click fisico dell'utente).

2. **Reverse Geocoding Client-Side con Cache (`cloud/web/src/lib/reverseGeocode.ts`)**
   - Creato modulo helper `reverseGeocode(lat, lon)` per interrogare le API OpenStreetMap Nominatim (`/reverse`).
   - Cache in-memory (`Map<string, Promise<string>>`) con arrotondamento delle coordinate a 4 cifre decimali (~11 metri) per abbattere le chiamate di rete ridondanti durante lo scorrimento dei punti.

3. **Standardizzazione Etichette EnergyFlow (`cloud/web/src/lib/energyFlow.ts`)**
   - Mappate le etichette standard internazionali di flusso energetico veicolo:
     - `EV` (Elettrico puro)
     - `HEV-S` (Ibrido Serie / Series Hybrid)
     - `HEV-P` (Ibrido Parallelo / Parallel Hybrid)
     - `CHARGE` (Rigenerazione / Carica)
     - `IDLE` (Inattivo)

4. **Icona Evidenziatrice Dinamica (`cloud/web/src/lib/mapIcons.ts`)**
   - Definita `HIGHLIGHT_ICON`, un'icona Leaflet `divIcon` ad alto contrasto per evidenziare visivamente il punto del percorso correntemente selezionato sulla mappa.

5. **Sincronizzazione Bidirezionale Grafici ↔ Mappa (`cloud/web/src/components/TripTimelineCharts.tsx` & `TripDetail.tsx`)**
   - Aggiunta la prop `onHighlightIndex` a `BatteryFuelChart`, `SpeedChart` ed `ElevationChart`.
   - Utilizzati gli eventi di ECharts `updateAxisPointer` e `globalout` per aggiornare in tempo reale lo stato centralizzato `selectedIndex` in `TripDetail.tsx` durante lo scorrimento del mouse sui grafici.

---
