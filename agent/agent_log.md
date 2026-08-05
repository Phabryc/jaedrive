# JaeDrive — AI Agent Development Log

Questo registro contiene lo storico delle modifiche, scelte architetturali ed evoluzioni del codice effettuate dagli agenti/modelli AI sul repository JaeDrive.

---

## [2026-08-05] - Configurazione Ambiente di Compilazione, Mock Veicolo (Debug-Only) e Documentazione Agenti

### 👤 Agent Metadata
- **Agent Nickname / Model**: Leo AG (Antigravity / Gemini 3.6 Flash)
- **Scope / Subsystem**: `[app]`, `[build-system]`, `[agent]`
- **Status**: `COMPLETED`

### 📌 Sintesi della Funzionalità
Installato e configurato l'ambiente di compilazione automatizzato (JDK 17 + Android SDK 33). Risolta la dipendenza mancante `android.car.jar`. Progettata ed implementata l'architettura di emulazione telemetrica del veicolo isolata esclusivamente nelle build di **Debug** (`src/debug`), escludendo totalmente qualsiasi codice o risorsa di mock dalle build di **Release** (`src/release`). Creata la cartella centralizzata `agent/` contenente il protocollo di comunicazione tra agenti AI (`README.md`), il registro evolutivo (`agent_log.md`) e le istruzioni trasparenti di setup dell'emulatore AVD 1440x1770 (`SIMULATOR.md`).

### 🛠️ Dettagli Tecnici & File Modificati

1. **Setup Ambiente & Dipendenza System Framework**
   - **`app/libs/android.car.jar`**: Copiata la libreria di stub Android Automotive dall'Android SDK (`platforms/android-33/optional/android.car.jar`) per consentire la compilazione offline priva dell'head unit reale.

2. **Isolamento Architetturale Mock Veicolo**
   - **[`VehicleSimulator.java`](file:///d:/P/JaeDrive/app/src/debug/java/com/phabryc/jaedrive/mock/VehicleSimulator.java)** (solo `src/debug`): Generatore di telemetria dinamica sintetica in background (SOC %, carburante, odometro, trip km, flusso d'energia EV/HEV/Regen, consumo e pressione pneumatici).
   - **[`VehicleMockBridge.java`](file:///d:/P/JaeDrive/app/src/debug/java/com/phabryc/jaedrive/mock/VehicleMockBridge.java)** (versione `src/debug`): Intercetta i fallimenti di `bindService()` e attiva `VehicleSimulator`.
   - **[`VehicleMockBridge.java`](file:///d:/P/JaeDrive/app/src/release/java/com/phabryc/jaedrive/mock/VehicleMockBridge.java)** (versione `src/release`): Variante **No-Op** vuota per le build di produzione. Nessuna classe o risorsa mock inclusa nell'APK di Release.
   - **[`VDInfoClient.java`](file:///d:/P/JaeDrive/app/src/main/java/com/phabryc/jaedrive/VDInfoClient.java)**: Integrata la chiamata condizionale verso `VehicleMockBridge`.

3. **Cartella Centralizzata Agenti (`agent/`) & Troubleshooting Emulazione**
   - **[`agent/README.md`](file:///d:/P/JaeDrive/agent/README.md)**: Definizione delle regole della cartella e del protocollo standard di comunicazione tra agenti AI.
   - **[`agent/agent_log.md`](file:///d:/P/JaeDrive/agent/agent_log.md)**: Spostato registro storico nella cartella centralizzata.
   - **[`agent/SIMULATOR.md`](file:///d:/P/JaeDrive/agent/SIMULATOR.md)**: Aggiornata la guida con la migrazione dell'SDK e dell'AVD su disco **`D:\.android-sdk`** ed **`D:\.android\avd`** (per superare il limite di spazio su `C:\`), le istruzioni per le immagini ARM64 (`system-images;android-33;google_apis;arm64-v8a`) e l'accettazione automatizzata delle licenze SDK.

### 🧪 Comandi di Verifica Eseguiti
- `.\gradlew.bat assembleDebug assembleRelease` -> **BUILD SUCCESSFUL** (Esito: Debug APK 10.7 MB con mock; Release APK 8.96 MB privo di mock).

### 📋 Handover & Passaggio Consegne per l'Agente Successivo
- **Stato Attuale**: Repository perfettamente compilabile per entrambe le varianti.
- **Risoluzione AVD**: Configurare `hw.lcd.width=1440` e `hw.lcd.height=1770` nell'AVD.
- **Constraints**: Non importare mai `com.phabryc.jaedrive.mock.VehicleSimulator` in `src/main`, ma passare sempre per l'interfaccia/bridge `VehicleMockBridge` per preservare il pulito nelle build di produzione.

---

## [2026-08-04] - Fix Selezione Periodo Calendario e Layout Responsive Grid (Web)

### 📌 Sintesi della Funzionalità
Risolto il problema di azzeramento dello stato della selezione periodo nel calendario (`cloud/web`) durante il ricaricamento dei dati e ottimizzato il layout responsive per schermi mobile in modalità landscape. Ora la selezione del periodo attende il secondo click senza ricaricamenti intermedi, l'azzeramento con la X disattiva il toggle periodo, e le 6 card KPI numeriche si dispongono in 2 righe da 3 senza alterare la posizione del calendario e dei donut.

### 🛠️ Modifiche Tecniche Dettagliate

1. **Permanenza del componente `CalendarHeatmap` (`cloud/web/src/components/VehicleStatsPanel.tsx`)**
   - Rimosso `CalendarHeatmap` dal wrapper `StatsBody` e riposizionato come elemento figlio permanente della griglia in `VehicleStatsPanel`. Ciò previene lo smontaggio (unmount) del calendario durante il `setStats(null)` del refetch dati, preservando gli stati locali `periodMode` e `pendingStart`.

2. **Selezione Periodo a 2 Click ed Auto-disattivazione Toggle (`cloud/web/src/components/CalendarHeatmap.tsx`)**
   - Rimosso l'invio immediato di `onRangeChange(date, date)` sul primo click del giorno d'inizio: il calendario ora evidenzia il giorno iniziale localmente e attende il secondo click prima di aggiornare i filtri globali della pagina.
   - Aggiunta la disattivazione automatica di `periodMode` sia nel metodo `clearRange()` che nell'hook `useEffect` al reset del periodo (`rangeFrom === null && rangeTo === null`).

3. **Griglia Responsive per Smartphone Landscape (`cloud/web/src/components/VehicleStatsPanel.tsx`)**
   - Aggiornata la classe `kpiSpan` in `"col-span-6 sm:col-span-4 xl:col-span-2"`. Su breakpoint `sm:` (landscape smartphone), le 6 card KPI occupano 4 colonne ciascuna (3 card per riga, 2 righe complete).
   - Eliminato lo spazio residuo a fine seconda riga che causava il risucchio visivo del donut di ripartizione energia sopra il calendario.

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
