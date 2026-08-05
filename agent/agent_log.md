# JaeDrive — AI Agent Development Log

Questo registro contiene lo storico delle modifiche, scelte architetturali ed evoluzioni del codice effettuate dagli agenti/modelli AI sul repository JaeDrive.

---

## [2026-08-05] - Backup/Ripristino Configurazione Switch PREMIUM alla Scadenza/Riattivazione Abbonamento

### 👤 Agent Metadata
- **Agent Nickname / Model**: Laptop Claude (Claude Code / Sonnet 5)
- **Scope / Subsystem**: `[app]`
- **Status**: `COMPLETED` (codice, build verificata) — `REQUIRES_USER_TEST`

### 📌 Sintesi della Funzionalità / Modifica
Bug segnalato dall'utente: `Prefs.setSubscriptionSnapshot()` forzava a `false` i 3 switch PREMIUM (status bar, popup rigenerazione, popup rifornimento) alla scadenza dell'abbonamento, ma **sovrascriveva per sempre** il valore realmente scelto dall'utente - riattivando l'abbonamento in seguito, gli switch restavano tutti spenti indipendentemente da cosa l'utente avesse configurato prima della scadenza (es. status bar ON, regen OFF, refuel ON andavano persi, tornando tutti OFF anche da Premium).

### 🛠️ Dettagli Tecnici & File Modificati
- **`Prefs.java`**: aggiunte 3 chiavi di backup (`*_ENABLED_BACKUP`). `setSubscriptionSnapshot()`: quando `isActive` passa a `false`, salva il valore corrente dei 3 switch nel backup **solo se non gia' presente** (`SharedPreferences.contains()` come flag "gia' salvato per questa scadenza" - evita che un heartbeat/refresh successivo, mentre resta ancora inattivo, sovrascriva il backup con i valori gia' azzerati). Quando `isActive` torna `true` e un backup esiste, ripristina i 3 switch dal backup e lo rimuove (cosi' la prossima scadenza ne salva uno fresco). `clearCloudPairing()` ora rimuove anche le chiavi di backup, per non far ereditare le preferenze di un account precedente a una nuova associazione.
- **Documentazione**: aggiornati `cloud/ANDROID_SUBSCRIPTION_HANDSHAKE.md` §4.2 e `cloud/FREEMIUM_STRATEGY.md` §4.2 con il nuovo comportamento di backup/ripristino.

### 🧪 Comandi di Verifica Eseguiti
- `./gradlew assembleDebug` → **BUILD SUCCESSFUL**.
- Nessun test ancora su emulatore/vettura reale.

### 📋 Handover & Passaggio Consegne per l'Agente Successivo
- **Open Questions / Pending Tasks**: da validare sul campo - impostare una combinazione non ovvia dei 3 switch (es. solo regen ON), forzare la scadenza (o aspettare/simulare lato Admin), verificare che tutti e 3 si spengano, poi riattivare l'abbonamento e verificare che tornino ESATTAMENTE alla combinazione di partenza (non tutti ON, non tutti OFF).
- **Constraints / Warning**: gli switch restano disabilitati in UI mentre l'abbonamento non e' attivo (vedi voce di log precedente) - questo e' cio' che garantisce che il valore "live" non cambi sotto al backup prima del ripristino; se in futuro si permettesse di nuovo di toccarli da Free, questa garanzia andrebbe rivista.

---

## [2026-08-05] - Fix Bug Campo: TrackingService Duplicato (km/litri raddoppiati) + Refresh Abbonamento Live + UI Popup Uniformata

### 👤 Agent Metadata
- **Agent Nickname / Model**: Laptop Claude (Claude Code / Sonnet 5)
- **Scope / Subsystem**: `[app]`
- **Status**: `COMPLETED` (codice, build verificata) — `REQUIRES_USER_TEST` (fix ancora da validare sul campo)

### 📌 Sintesi della Funzionalità / Modifica
Diagnosticati e risolti due bug segnalati dall'utente dopo un giro di test reale con la build della sera precedente, più una richiesta di coerenza UI:

1. **Km/litri raddoppiati durante un viaggio** (es. 46,8 km/2,80 L registrati contro 23,76 km reali confermati dal GPX via haversine sui punti traccia). Causa trovata nel log generale: una chiusura forzata dell'app + riapertura mentre `TrackingService` era gia' attivo in background ha fatto coesistere **due istanze** del servizio per l'intera giornata - ogni riga di log (`GEAR_SELECTION`, letture `ID_TRIP`/`SUM_FUEL`, apertura/chiusura trip) appariva esattamente doppia con timestamp identici. Entrambe le istanze si sottoscrivevano separatamente al bus veicolo e sommavano lo stesso identico delta reale nello stesso accumulatore condiviso (`TripConsumption`/`SharedPreferences`), raddoppiando km e litri. Tre punti indipendenti possono avviare il servizio (`BootReceiver`, `JaeDriveAccessibilityService.onServiceConnected()`, `MainActivity.onCreate()`) senza nessuna guardia contro un'istanza gia' attiva.
2. **Stato abbonamento non aggiornato ad app aperta**: un cambio fatto dal pannello Admin (status/tier/scadenza) non si rifletteva finche' l'app non veniva chiusa e riaperta - `fetchOwnerProfile()` (unica chiamata di rete verso `/owner`) partiva una sola volta in `onCreate()`; `onResume()` rileggeva solo la cache locale.
3. **Coerenza UI sezione Popup**: la card "Notifica barra di stato" restava attivabile a mano con un badge PREMIUM proprio, mentre le due card sopra (rigenerazione/rifornimento) erano gia' ingrigite/disabilitate in blocco - segnalato come incoerente dall'utente.

### 🛠️ Dettagli Tecnici & File Modificati
- **`TrackingService.java`**: nuovo `acquireSingleInstanceLock()`/`releaseSingleInstanceLock()` basati su `java.nio.channels.FileLock` (`tryLock()` su un file dedicato in `getFilesDir()`) chiamato come prima cosa in `onCreate()` (dopo `startForeground()`, obbligatorio comunque per rispettare il contratto di `startForegroundService()`). Esclusivo per l'intera JVM/processo - un secondo `tryLock()` dallo stesso processo lancia `OverlappingFileLockException` (catturata), da un processo diverso fallisce a livello di `flock()` del sistema operativo; rilasciato automaticamente dal SO alla morte del processo, nessuna pulizia manuale necessaria. L'istanza perdente logga e chiama `stopSelf()` subito, senza toccare bus veicolo/`TripConsumption`. Rilascio del lock aggiunto anche in `onDestroy()`.
- **`MainActivity.java`**: `fetchOwnerProfile()` ora accetta un `Runnable onDone` opzionale (sempre eseguito su UI thread, successo o errore) e in caso di successo rinfresca anche la lista Storico se visibile (`refreshTrackList()`), oltre a badge/switch gia' esistenti. Nuovo timer `subscriptionRefreshHandler` (stesso pattern di `tripRefreshHandler`) che richiama `fetchOwnerProfile()` ogni 5 minuti, avviato in `onCreate()` e fermato in `onDestroy()`. Nuovo pulsante `btn_cloud_refresh` (icona freccia circolare) nella card CLOUD, visibile solo se associata, con animazione di rotazione continua (`ObjectAnimator`) finche' la richiesta non risponde. `refreshPremiumGatedSwitches()` ora disabilita/ingrigisce anche `switchStatusBar`/`cardStatusBar` esattamente come le altre due card; rimossa la logica di toast "richiede premium" (irraggiungibile ora che lo switch e' disabilitato quando l'abbonamento non e' attivo).
- **`activity_main.xml`**: rimosso il badge PREMIUM inline dalla card status bar (id aggiunto `card_status_bar`, ora coperta dallo stesso badge unico sull'header sezione "Popup"); aggiunto `btn_cloud_refresh` (ImageView, `?attr/selectableItemBackgroundBorderless`) nella card CLOUD tra il pulsante di pairing e quello di unpair.
- **Nuova risorsa**: `ic_refresh.xml` (icona Material standard, fillColor placeholder bianco - tinta via `android:tint` sull'ImageView, stesso trattamento di `ic_car_small`/`ic_route`/ecc).
- **Stringhe**: aggiunta `label_cloud_refresh_button` (content description) in entrambe le lingue; rimossa `toast_status_bar_requires_premium` (diventata dead code).
- **Documentazione**: `cloud/ANDROID_SUBSCRIPTION_HANDSHAKE.md` - riviste le sottosezioni 4.2 (comportamento uniformato) e aggiunte 4.4 (bug istanza duplicata) e 4.5 (refresh abbonamento); `cloud/FREEMIUM_STRATEGY.md` - rivista 4.2 e aggiunta 4.7 con il riassunto di entrambi i bugfix.

### 🧪 Comandi di Verifica Eseguiti
- `./gradlew assembleDebug` (Linux/Bash) → **BUILD SUCCESSFUL**, nessun errore di compilazione.
- Nessun test ancora su emulatore o vettura reale in questa sessione.

### 📋 Handover & Passaggio Consegne per l'Agente Successivo
- **Stato Attuale**: modifiche nel working tree Linux dell'utente, non ancora committate/pushate.
- **Open Questions / Pending Tasks**: il fix per la doppia istanza va validato sul campo replicando lo scenario originale (chiusura forzata dell'app mentre il servizio e' attivo, poi riapertura) - verificare nel log che compaia al massimo un "TrackingService avviato (onCreate)" vincente per volta e, se una seconda istanza tenta di partire, il nuovo messaggio "istanza duplicata rilevata". Verificare anche che un cambio di abbonamento da pannello Admin con app gia' aperta si rifletta entro 5 minuti o subito col pulsante di refresh, su badge + sezione Popup + Storico.
- **Constraints / Warning**: il lock file (`tracking_service.lock` in `getFilesDir()`) non va mai cancellato/spostato manualmente - e' gestito interamente dal ciclo di vita del processo. Non aggiungere altri punti di scrittura per lo stato subscription fuori da `Prefs.setSubscriptionSnapshot()` (vedi voce precedente in questo log).

---

## [2026-08-05] - Freemium Gating Lato Android (Sync/Status Bar/Popup/Storico/GPX) + Redesign Status Bar Overlay

### 👤 Agent Metadata
- **Agent Nickname / Model**: Laptop Claude (Claude Code / Sonnet 5)
- **Scope / Subsystem**: `[app]`, `[agent]`
- **Status**: `COMPLETED` (codice, build verificata) — `REQUIRES_USER_TEST` (nessun test ancora sulla vettura reale con questa build)

### 📌 Sintesi della Funzionalità / Modifica
Collegata la logica di subscription (`SubscriptionInfo` status/tier/expiresAt/isActive, già esposta da `GET /api/device/owner` e `POST /api/device/heartbeat` — vedi `cloud/ANDROID_SUBSCRIPTION_HANDSHAKE.md`) a un set di gate Premium lato client, decisi insieme all'utente in questa sessione: badge sottoscrizione in Impostazioni, spegnimento automatico di 3 feature (status bar overlay, popup rigenerazione, popup rifornimento) quando l'account non è attivo, finestra Storico limitata a 7 giorni per i Free, export GPX "semplice" (senza `<extensions>` `jd:*`) per i Free, e un nuovo popup di preavviso scadenza (10 giorni, dismissibile per quello specifico `expiresAt`). In parallelo, richiesto e completato un redesign visivo della status bar overlay stessa (niente gradiente, angolo in basso a dx arrotondato, icona/freccia ricentrate e ristrette, freccia ruotata 90° stile `<`/`>`, collasso orizzontale verso sinistra invece che verticale).

### 🛠️ Dettagli Tecnici & File Modificati
- **`CloudApiClient.java`**: nuova classe `SubscriptionInfo` (status/tier/expiresAt/isActive) + `parseSubscription()` condiviso; `heartbeat()` non è più `void`, ora ritorna `SubscriptionInfo` (prima era dead code, mai letto).
- **`Prefs.java`**: `setSubscriptionSnapshot(...)` è l'**unico punto di scrittura** dello stato subscription, chiamato sia da `SyncWorker` (background) che da `MainActivity.fetchOwnerProfile()` (foreground). Quando `isActive=false` forza a `false` anche `statusBarEnabled`/`regenPopupEnabled`/`refuelPopupEnabled`, così gli switch non possono mai restare "on" mentre la feature è bloccata altrove. Default fail-closed (FREE/inactive) finché non arriva la prima risposta di rete.
- **`SyncWorker.java`**: ora chiama `heartbeat()` **prima** di ogni tentativo di upload; se `!isActive` si ferma con `Result.success()` (non `retry()` — prima un 403 causava retry infinito con backoff crescente, bug risolto). Aggiornato anche `SubscriptionExpiryNotifier`.
- **`SubscriptionExpiryNotifier.java`** (nuovo): popup di preavviso scadenza entro 10 giorni (funziona anche con app in background, stesso meccanismo overlay dei popup rigenerazione/rifornimento), OK vs "Non ricordare più" — quest'ultimo è ricordato per lo specifico `expiresAt`, quindi torna a comparire dopo un rinnovo.
- **`TrackingService.java`**: `refreshStatusBar()` ora richiede anche `Prefs.isSubscriptionActive()`.
- **`MainActivity.java`**: card CLOUD con badge sottoscrizione (FREE/PREMIUM STANDARD/PREMIUM GARAGE), `refreshPremiumGatedSwitches()` (disabilita/ingrigisce switch e sezione Popup + badge PREMIUM quando non attivo), gating riga Storico a 7 giorni (`buildTripRow`, badge PREMIUM al posto del chevron per righe >7gg su Free), `stripGpxExtensions()` in `exportTripRecord()` per l'export GPX ridotto ai Free.
- **`StatusBarOverlay.java`** + risorse (`overlay_status_bar.xml`, `overlay_status_bar_icon.xml`, `glass_status_bar_content_bg.xml`, `glass_icon_arrow_bg.xml`, `ic_chevron_up.xml`): redesign completo — collasso animato in **larghezza** (non più altezza), icona ridotta a 46dp / finestra icona 56dp, freccia riusa lo stesso vettore "chevron-up" ruotato ±90° invece di un nuovo drawable, raggio angoli proporzionato all'altezza di ciascuna zona (18dp zona freccia 40dp-alta, 24dp zona contenuto 100dp-alta) per evitare l'effetto "scalino" ottico.
- **Nuove risorse**: `badge_chip_free.xml`, `badge_chip_premium_standard.xml`, `badge_chip_premium_garage.xml`, `ic_car_small.xml`; stringhe aggiunte in `values/strings.xml` e `values-it/strings.xml` (badge, toast, popup scadenza).
- **Documentazione**: aggiunto `cloud/ANDROID_SUBSCRIPTION_HANDSHAKE.md` §4 ("Actual Android Implementation") che documenta cosa è stato davvero costruito rispetto alla proposta originale in §3; aggiornato `cloud/FREEMIUM_STRATEGY.md` (creato dall'utente/altro agente dopo che avevo verificato non esistesse ancora nel repo) con nota su CSV/PDF non ancora implementati da nessuna parte (solo GPX lo è) e nuove sottosezioni §4.1–4.6 sul comportamento Android.

### 🧪 Comandi di Verifica Eseguiti
- `./gradlew assembleDebug` (Linux/Bash) → **BUILD SUCCESSFUL**, nessun errore di compilazione sulle modifiche sopra.
- Nessuna esecuzione su emulatore o su vettura reale in questa sessione (vedi Handover).

### 📋 Handover & Passaggio Consegne per l'Agente Successivo
- **Stato Attuale**: modifiche presenti nel working tree Linux dell'utente, **non ancora committate né pushate** su `origin/main` (l'utente decide quando/se committare). Non sovrappongono i file toccati dal pull più recente (`agent/*`, `cloud/web/src/components/StaticHeader.tsx`, `session.ts`, `ProtectedRoute.tsx`, ecc.) — nessun conflitto atteso.
- **Open Questions / Pending Tasks**: l'utente non ha ancora testato in auto questa build specifica (badge sottoscrizione, sezione Popup ingrigita, blocco Storico 7gg, export GPX ridotto, popup scadenza 10gg) su un account Free reale vs Premium reale — il prossimo passo naturale è quel field test, non altro codice, a meno che il test non riveli un problema.
- **Constraints / Warning**: 7 giorni Storico e stripping GPX `<extensions>` sono enforcement **solo lato client** (i dati restano intatti nel DB/file locale) — non esiste equivalente lato server, è un limite noto e accettato, documentato in §4.3/4.6 di `FREEMIUM_STRATEGY.md`. Non duplicare la logica di scrittura dello stato subscription fuori da `Prefs.setSubscriptionSnapshot()` — è il punto singolo che tiene sincronizzati i 3 switch Premium-gated.

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
   - **[`agent/SIMULATOR.md`](file:///d:/P/JaeDrive/agent/SIMULATOR.md)**: Aggiornata la guida eliminando qualsiasi percorso hardcodato ed introducendo il **Pre-Check automatico di 8 GB di spazio libero** sul disco prima di iniziare l'installazione, oltre all'uso dinamico di `$env:ANDROID_HOME` ed `$env:ANDROID_AVD_HOME`.

### 🧪 Comandi di Verifica Eseguiti
- `.\gradlew.bat assembleDebug assembleRelease` -> **BUILD SUCCESSFUL** (Esito: Debug APK 10.7 MB con mock; Release APK 8.96 MB privo di mock).

### 📋 Handover & Passaggio Consegne per l'Agente Successivo (o su Altro PC)

1. **Compilazione Progetto**:
   - Entrambe le varianti sono compilate e pronte in `app/build/outputs/apk/debug/JaeDrive.apk` (10.7 MB, con mock) e `app/build/outputs/apk/release/JaeDrive.apk` (8.96 MB, priva di mock).

2. **Infrastruttura Emulazione Configurata**:
   - **Immagine SDK**: `system-images;android-33;google_apis;x86_64` scaricata ed estratta in `$env:ANDROID_HOME`. (*Nota*: Su Windows host x86_64 usare sempre l'immagine x86_64 in quanto QEMU2 rifiuta immagini ARM64).
   - **Driver Acceleration (AEHD)**: `aehd.sys` installato con successo (`STATE: 4 RUNNING`).
   - **AVD JaeDrive_Emulator**: Configurato in `$env:ANDROID_AVD_HOME` con risoluzione **1440 × 1770** pixel (head unit Jaecoo 7) e quota dati **6 GB** (`disk.dataPartition.size=6442450944`).

3. **Comandi per la Ripresa su un Altro PC o Prossima Sessione**:
   - Verificare uno spazio libero di almeno **8 GB** sull'unità scelta e configurare le variabili d'ambiente:
     ```powershell
     $env:JAVA_HOME = "C:\Users\Cucci\.jdk-17"  # O percorso JDK su nuova macchina
     $env:ANDROID_HOME = "D:\.android-sdk"      # O percorso SDK dinamico
     $env:ANDROID_AVD_HOME = "D:\.android\avd"  # O percorso AVD dinamico
     $env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\emulator;$env:ANDROID_HOME\platform-tools;$env:PATH"
     ```
   - In caso di prima installazione del driver su nuova macchina Windows:
     ```powershell
     # Da PowerShell (Amministratore):
     cd $env:ANDROID_HOME\extras\google\Android_Emulator_Hypervisor_Driver; .\silent_install.bat
     ```
   - Avvio Emulatore, Deploy APK e Lancio App:
     ```powershell
     # 1. Avvio Emulatore
     & "$env:ANDROID_HOME\emulator\emulator.exe" -avd JaeDrive_Emulator -gpu host

     # 2. Attesa Completamento Boot (sys.boot_completed == 1)
     & "$env:ANDROID_HOME\platform-tools\adb.exe" wait-for-device
     do { Start-Sleep -Seconds 2 } until ((& "$env:ANDROID_HOME\platform-tools\adb.exe" shell getprop sys.boot_completed).Trim() -eq "1")

     # 3. Installazione APK Debug ed Avvio Activity
     & "$env:ANDROID_HOME\platform-tools\adb.exe" install -r "app\build\outputs\apk\debug\JaeDrive.apk"
     & "$env:ANDROID_HOME\platform-tools\adb.exe" shell am start -n com.phabryc.jaedrive/.MainActivity
     ```

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
