# JaeDrive — AI Agent Development Log

Questo registro contiene lo storico delle modifiche, scelte architetturali ed evoluzioni del codice effettuate dagli agenti/modelli AI sul repository JaeDrive.

---

## [2026-08-05] - Fix Densità Emulatore (240→160dpi, confermata da dump reale) + Centratura Icona/Freccia Status Bar

### 👤 Agent Metadata
- **Agent Nickname / Model**: Laptop Claude (Claude Code / Sonnet 5)
- **Scope / Subsystem**: `[app]`, `[agent]`
- **Status**: `COMPLETED`

### 📌 Sintesi della Funzionalità / Modifica
Due fix, entrambi verificati visivamente sull'emulatore:

1. **Densità AVD sbagliata**: la voce di log precedente (stesso giorno) aveva configurato l'AVD `JaeDrive_Automotive` a `hw.lcd.density=240`, un valore preso senza verifica dal suggerimento (anch'esso mai verificato) in `agent/SIMULATOR.md`. L'utente ha segnalato che la UI "sembrava troppo diversa" pur con la risoluzione 1440×1770 corretta. Trovato in `~/Desktop/Desktop/full_getprop.txt` (dump reale pullato dalla vettura in una sessione precedente): **`ro.sf.lcd_density=160`** e **`ro.desay.display.ivi=Chery-DS-14.8-SCREEN`** (schermo fisico 14.8", verificato per coerenza: sqrt(1440²+1770²)/14.8" ≈ 154dpi, vicino a 160). A 240dpi invece di 160, ogni elemento dp-based (tutta la UI di JaeDrive) veniva disegnato ~50% più "zoomato" del reale. Corretto l'AVD a 160dpi - confermato visivamente col confronto prima/dopo (screenshot), risultato molto più compatto/coerente con un vero schermo 14.8" a bassa densità.
2. **Icona/freccia status bar non centrate**: `android:gravity="center"` sul `FrameLayout` contenitore (`overlay_status_bar_icon.xml`) non veniva onorato a runtime in questa finestra overlay inflata da un Context di Service (stesso genere di comportamento anomalo già documentato altrove in questo file per il contesto "povero" di tema) - la freccia risultava visibilmente ancorata in alto a sinistra invece che centrata, confermato misurando i pixel dello screenshot (centro atteso x≈42px su una finestra di 84px, osservato x≈14px). Fix: spostata l'istruzione di centratura sul FIGLIO (`android:layout_gravity="center"` su entrambi gli `ImageView`, icona e freccia) invece di fare affidamento solo sulla gravità di default del contenitore - verificato di nuovo via misurazione pixel, freccia ora a x≈40-44px, centro corretto.

### 🛠️ Dettagli Tecnici & File Modificati
- **AVD `JaeDrive_Automotive`** (`~/.android/avd/JaeDrive_Automotive.avd/config.ini`): `hw.lcd.density` 240→160. Richiede cold boot (non basta `wm density` a runtime) - riavviato l'emulatore per applicare.
- **[`overlay_status_bar_icon.xml`](app/src/main/res/layout/overlay_status_bar_icon.xml)**: aggiunto `android:layout_gravity="center"` sui due `ImageView` (icona JD e freccia chevron).
- **`agent/SIMULATOR.md`**: tutte le occorrenze di `hw.lcd.density=240` corrette a `160` (Windows e Linux), tutte le occorrenze di `system-images;...;google_apis;...` corrette a `system-images;...;android-automotive;...` (altro bug trovato in sessione precedente lo stesso giorno: google_apis manca delle classi `android.car` a runtime, crash immediato). Aggiunte due note in "Risoluzione Problemi": permessi da concedere a mano su emulatore generico (CAR_SPEED/SYSTEM_ALERT_WINDOW/ivi.sn, con l'importante dettaglio dello user profile giusto - l'app gira sotto lo user "Driver", non user 0), e il fatto che la UI di sistema (launcher/status bar) di questo emulatore è quella AOSP/AAOS generica, non la vera skin Desay - differenze visive nel chrome di sistema sono attese solo qui.

### 🧪 Comandi di Verifica Eseguiti
- `./gradlew assembleDebug` → **BUILD SUCCESSFUL** (solo il fix XML del gravity ha toccato codice; il fix densità è solo config AVD).
- Confronto screenshot prima/dopo su entrambi i fix, con misurazione pixel diretta (Python/Pillow) per la centratura freccia, non solo ispezione visiva.

### 📋 Handover & Passaggio Consegne per l'Agente Successivo
- **Constraints / Warning**: ricordarsi SEMPRE `hw.lcd.density=160` per qualunque nuovo AVD JaeDrive creato in futuro (mai fidarsi ciecamente di un valore scritto in doc senza una fonte verificata come `full_getprop.txt`). I permessi concessi via `pm grant`/`appops set` sull'emulatore si perdono ad ogni cold boot (non a un semplice `am force-stop`) - vanno riconcessi dopo aver riavviato l'emulatore stesso (non l'app).

---

## [2026-08-05] - Setup Emulatore Android Automotive Funzionante + Mock VDB Reale + Fix Critico Scappatoia PREMIUM su Disassociazione

### 👤 Agent Metadata
- **Agent Nickname / Model**: Laptop Claude (Claude Code / Sonnet 5)
- **Scope / Subsystem**: `[app]`, `[agent]`, `[build-system]`
- **Status**: `COMPLETED` (codice, build verificata, testato dal vivo su emulatore) — `REQUIRES_USER_TEST` sulla vettura reale per la scappatoia PREMIUM

### 📌 Sintesi della Funzionalità / Modifica
Leo AG (voce di log precedente, stesso giorno) aveva **documentato** un'architettura di mock/emulazione (`agent/SIMULATOR.md`) ma non era mai riuscito a far partire l'app emulata su Windows, e i file `VehicleSimulator.java`/`VehicleMockBridge.java` descritti nel suo log **non esistevano da nessuna parte nel repository** (verificato con `git log --all` su tutta la history, zero commit su nessun branch) - la doc descriveva un piano mai realmente implementato. Ho fatto partire l'emulatore su Linux (KVM disponibile, SDK già presente in `~/Android/Sdk`), trovato e risolto un vero crash (`NoClassDefFoundError` su `android.car.Car` - `android.car.jar` è `compileOnly`, serve una vera immagine **Android Automotive**, non una `google_apis` generica), poi scritto per davvero il mock che mancava, e infine - testando dal vivo - l'utente ha scoperto un bug reale e serio: **le funzioni PREMIUM restavano utilizzabili gratis per sempre dopo una disassociazione dell'auto dal cloud**.

### 🛠️ Dettagli Tecnici & File Modificati

**Ambiente emulatore (nessun file di progetto, solo setup locale)**:
- SDK trovato in `~/Android/Sdk` (platforms/build-tools/emulator già presenti, mancavano cmdline-tools e immagini di sistema) - scaricati `cmdline-tools`, licenze accettate, immagine `system-images;android-33;android-automotive;x86_64` (NON `google_apis` - quella genera un crash immediato, vedi sotto).
- AVD `JaeDrive_Automotive` creato a 1440×1770 (risoluzione confermata corretta dall'utente, "è uno schermo 2K" - il documento non era sbagliato).
- Permessi Android specifici da concedere manualmente su questo emulatore genereico (non servono sulla vettura reale, dove presumibilmente sono già garantiti dalla ROM OEM): `android.car.permission.CAR_SPEED` (dangerous, non privilegiato - concedibile via `pm grant`, ma **per lo user profile giusto**: l'app gira sotto lo user 10 "Driver" di Android Automotive multi-utente, non lo user 0) e l'appop `SYSTEM_ALERT_WINDOW` (via `appops set`, necessario per mostrare popup/status bar overlay con l'app in background - senza, gli overlay restano invisibili). `Settings.Global "ivi.sn"` impostato via `adb shell settings put global` per popolare il numero di serie DMC in Impostazioni.
- La barra di stato overlay JaeDrive risulta coperta dalla status bar di sistema su questa ROM AAOS generica (z-order) - non è un bug, solo un artefatto dell'ambiente di test (sulla ROM Desay reale ha priorità diversa, già validato sul campo in sessioni precedenti).

**Mock VDB reale (nuovo, mai esistito prima nonostante la doc)**:
- **[`VehicleSimulator.java`](app/src/debug/java/com/phabryc/jaedrive/mock/VehicleSimulator.java)** (solo `src/debug`): singleton che genera SOC%/carburante%/km trip/litri consumati/autonomia/flusso energia/livello rigenerazione/consumo istantaneo, con le stesse identiche formule di codifica già verificate sul campo in `MainActivity.updateFooterStatus()`/`TrackingService.handleTripKm()`/`handleFuel()` (combine primi-due-byte /100 e /10 per SOC/carburante, combine 4-byte big-endian *0.1 per il trip, ecc. - vedi tabella di decodifica completa in `VDInfoClient.java`).
- **[`VehicleMockBridge.java`](app/src/debug/java/com/phabryc/jaedrive/mock/VehicleMockBridge.java)** (debug) + variante **No-Op** in `src/release/` (stesso nome pienamente qualificato, mai compresenti) - **[`VDInfoClient.java`](app/src/main/java/com/phabryc/jaedrive/VDInfoClient.java)** chiama `VehicleMockBridge.onBindFailed()` quando il bind verso il vero servizio Desay fallisce. Isolamento verificato byte per byte: `grep` sui `classes*.dex` conferma `VehicleSimulator` presente SOLO nell'APK debug, assente da quello release.

**Bugfix scappatoia PREMIUM (il più importante di questa voce)**:
- **[`Prefs.java`](app/src/main/java/com/phabryc/jaedrive/Prefs.java)**: `clearCloudPairing()` ora forza sempre i 3 switch (status bar/regen popup/refuel popup) a `false` - prima rimuoveva solo i dati di sottoscrizione, mai gli switch stessi, permettendo di associare→attivare→disassociare in loop ottenendo le funzioni PREMIUM gratis per sempre. Nessun backup/ripristino qui (diverso da `setSubscriptionSnapshot()` per scadenza temporanea) - una disassociazione è un reset deliberato.
- **[`TrackingService.java`](app/src/main/java/com/phabryc/jaedrive/TrackingService.java)**: i trigger dei popup rigenerazione e rifornimento ora ricontrollano `Prefs.isSubscriptionActive()` DIRETTAMENTE al momento di scattare, non solo lo switch salvato - difesa in profondità (la barra di stato lo faceva già, era l'unica delle 3 al sicuro da questo bug).
- **[`MainActivity.java`](app/src/main/java/com/phabryc/jaedrive/MainActivity.java)**: scoperto un secondo bug più subdolo investigando il primo - se l'auto viene disassociata dal **sito** (non dal bottone RIMUOVI dell'app), `fetchOwnerProfile()` (unica chiamata di rete regolare ad app aperta e inattiva, ogni 5 minuti) ignorava in silenzio il `409 "Device is not paired to a vehicle"` del server, lasciando lo stato locale (token/abbonamento) valido per sempre - `SyncWorker` gestiva già lo stesso 409 su heartbeat/upload, ma parte solo dopo la chiusura di un viaggio, quindi in pratica non copriva questo scenario. Ora `fetchOwnerProfile()` cattura `CloudApiClient.ApiException`, su 409 chiama `Prefs.clearCloudPairingRemotely()` e mostra subito l'avviso "disassociata da remoto" già esistente (`consumeCloudUnpairedRemotelyFlag()`), invece di aspettare la prossima riapertura dell'app. Anche il flusso locale RIMUOVI ora richiama `refreshPremiumGatedSwitches()`/`refreshTrackList()` subito invece di aspettare il prossimo `onResume()`.
- **Documentazione**: `cloud/ANDROID_SUBSCRIPTION_HANDSHAKE.md` §4.6 e `cloud/FREEMIUM_STRATEGY.md` §4.8 aggiornati con l'analisi completa.

### 🧪 Comandi di Verifica Eseguiti
- `./gradlew assembleDebug assembleRelease` → **BUILD SUCCESSFUL** ad ogni giro di modifiche.
- Verifica isolamento debug/release del mock via grep sui file `.dex` estratti dagli APK.
- Test dal vivo sull'emulatore: app avviata senza crash, dati mock dinamici confermati a schermo (screenshot), refuel popup in background confermato funzionante dall'utente dopo il fix del permesso `SYSTEM_ALERT_WINDOW`.
- Fix scappatoia PREMIUM verificato via build; **non** verificato end-to-end con un vero 409 dal vivo (avrebbe richiesto disassociare di nuovo l'account reale dell'utente sul sito - evitato per non toccare ulteriormente dati di produzione senza necessità).

### 📋 Handover & Passaggio Consegne per l'Agente Successivo
- **Stato Attuale**: modifiche nel working tree Linux dell'utente, non ancora committate/pushate.
- **Open Questions / Pending Tasks**: validare sul campo (auto reale) che la scappatoia sia davvero chiusa - impostare i 3 switch mentre Premium è attivo, disassociare (sia dal bottone RIMUOVI in app sia, se possibile, dal sito), verificare che gli switch tornino grigi/spenti IMMEDIATAMENTE e che i popup rigenerazione/rifornimento non scattino più. `agent/SIMULATOR.md` resta accurato come descrizione architetturale (ora finalmente vera), nessuna modifica necessaria lì.
- **Constraints / Warning**: l'emulatore locale di questa sessione risulta attualmente **associato all'account cloud reale dell'utente** (pairing di test fatto per validare il fix) - se un futuro agente riprende questo lavoro sullo stesso emulatore, ricordarsi che non è un ambiente isolato dal cloud di produzione.

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
