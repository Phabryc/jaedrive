# JaeDrive — AI Agent Development Log

Questo registro contiene lo storico delle modifiche, scelte architetturali ed evoluzioni del codice effettuate dagli agenti/modelli AI sul repository JaeDrive.

---

## [2026-08-04] - Mappa Interattiva Telemetrica con Reverse Geocoding e Segnali Veicolo

### 📌 Sintesi della Funzionalità
Implementata l'interattività avanzata e la sincronizzazione bidirezionale sulla mappa dei dettagli viaggio (`TripDetail`) nella WebApp React (`cloud/web`). Ora gli utenti (e gli agenti) possono ispezionare punto per punto la traccia GPS del viaggio selezionando un segmento direttamente sulla mappa o muovendo il mouse sui grafici temporali della telemetria.

### 🛠️ Modifiche Tecniche Dettagliate

1. **Reverse Geocoding Client-Side con Cache (`cloud/web/src/lib/reverseGeocode.ts`)** [NUOVO]
   - Creato modulo helper `reverseGeocode(lat, lon)` per interrogare le API OpenStreetMap Nominatim (`/reverse`).
   - Implementata cache in-memory (`Map<string, Promise<string>>`) con arrotondamento delle coordinate a 4 cifre decimali (~11 metri) per abbattere le chiamate di rete ridondanti durante lo scorrimento dei punti.

2. **Standardizzazione Etichette EnergyFlow (`cloud/web/src/lib/energyFlow.ts`)**
   - Mappate e confermate le etichette standard internazionali di flusso energetico veicolo:
     - `EV` (Elettrico puro)
     - `HEV-S` (Ibrido Serie / Series Hybrid)
     - `HEV-P` (Ibrido Parallelo / Parallel Hybrid)
     - `CHARGE` (Rigenerazione / Carica)
     - `IDLE` (Inattivo)

3. **Icona Evidenziatrice Dinamica (`cloud/web/src/lib/mapIcons.ts`)**
   - Definita `HIGHLIGHT_ICON`, un'icona Leaflet `divIcon` con cerchio pulsante in animazione CSS (`#00BFFF`) per evidenziare visivamente il punto del percorso correntemente selezionato sulla mappa.

4. **Componente Mappa Interattiva (`cloud/web/src/components/TripMap.tsx`)**
   - Esteso `TripMap` per accettare le props `points?: GpxPoint[]`, `distances?: number[]`, `selectedIndex?: number | null` e `onSelectIndex?: (idx: number | null) => void`.
   - Inserito un Popup Leaflet ricco contenente:
     - 📍 **Indirizzo**: Indirizzo leggibile risolto tramite reverse-geocoding (via, numero civico, città) + coordinate Lat/Lon e quota ($m$).
     - 🚗 **Velocità**: Convertita dinamicamente nell'unità attiva (`km/h` o `mph`).
     - ⚡ **Energy Flow**: Badge colorato con etichette standard (`EV`, `HEV-S`, `HEV-P`, `CHARGE`, `IDLE`).
     - 🔋 **Segnali Veicolo**: SOC Batteria %, Livello Carburante %, Modalità Guida (`ECO`, `NORMAL`, `SPORT`), Livello Rigenerazione (`ALTO`, `MEDIO`, `BASSO`).
   - Aggiunto `MapClickHandler` per consentire la selezione del punto più vicino anche direttamente cliccando sulla mappa.

5. **Sincronizzazione Bidirezionale Grafici ↔ Mappa (`cloud/web/src/components/TripTimelineCharts.tsx` & `TripDetail.tsx`)**
   - Aggiunta la prop `onHighlightIndex` a `BatteryFuelChart`, `SpeedChart` ed `ElevationChart`.
   - Utilizzati gli eventi di ECharts `updateAxisPointer` e `globalout` per aggiornare in tempo reale lo stato centralizzato `selectedIndex` in `TripDetail.tsx` durante lo scorrimento del mouse sui grafici.

---
