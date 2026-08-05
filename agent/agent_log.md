# JaeDrive — AI Agent Development Log

Questo registro contiene lo storico delle modifiche, scelte architetturali ed evoluzioni del codice effettuate dagli agenti/modelli AI sul repository JaeDrive.

---

## [2026-08-05] - Fix Critico: Chiave HMAC Interpretata Diversamente tra Server e App (Pairing Sempre Fallito)

### 👤 Agent Metadata
- **Agent Nickname / Model**: Laptop Claude (Claude Code / Sonnet 5)
- **Scope / Subsystem**: `[cloud]`
- **Status**: `COMPLETED` (bug trovato, corretto, verificato via test locale) — `REQUIRES_USER_TEST` (serve un redeploy, vedi Handover)

### 📌 Sintesi della Funzionalità / Modifica
Test dal vivo richiesto dall'utente ("avvia l'app sull'emulatore e verifica il pairing") della firma HMAC introdotta nella voce di log precedente. Emulatore riavviato dopo spegnimento PC, app avviata, navigato fino a Impostazioni → CLOUD → "ASSOCIA AUTO" → toast generico "Errore di connessione", ma il logcat rivela la causa reale: `CloudApiClient$ApiException: Invalid or expired pairing signature` (401 dal server, non un problema di rete). Verificato che l'orologio emulatore/host sono allineati (non e' un problema di finestra temporale). Isolata la causa reale replicando manualmente lato server (script Node) l'esatta stessa chiave/firma usate lato Android: **bug nell'interpretazione della chiave** - `lib/pairingAuth.ts` passava `env.pairingHmacSecret` (la stringa esadecimale di 64 caratteri) direttamente a `createHmac("sha256", ...)`, che Node tratta come chiave UTF-8 letterale (64 byte) invece di decodificarla come esadecimale (32 byte grezzi) - esattamente quello che fa invece `CloudApiClient.getPairingHmacKey()` lato Android. Stessa chiave "sulla carta", due interpretazioni diverse, firme che non avrebbero MAI potuto combaciare - il pairing sarebbe stato permanentemente rotto per ogni client con qualunque valore di `PAIRING_HMAC_SECRET` fosse stato impostato.

### 🛠️ Dettagli Tecnici & File Modificati
- **[`cloud/server/src/lib/pairingAuth.ts`](cloud/server/src/lib/pairingAuth.ts)**: `verifyPairingSignature()` ora decodifica esplicitamente `env.pairingHmacSecret` con `Buffer.from(env.pairingHmacSecret, "hex")` prima di passarlo a `createHmac()`, cosi' la chiave usata e' i 32 byte grezzi - identica a quella ricostruita lato Android da `PAIRING_KEY_OBFUSCATED`/`PAIRING_KEY_XOR`.

### 🧪 Comandi di Verifica Eseguiti
- `npx tsc --noEmit` → **exit 0**.
- Script Node locale: calcolata la firma "lato client" (chiave = 32 byte da `Buffer.from(secretHex, "hex")`, stesso codice del client Android), poi la stessa identica firma "vecchio server" (chiave = stringa esadecimale letterale, il bug) e "nuovo server" (chiave decodificata, il fix) - **vecchio server NON combacia** con la firma client (conferma del bug), **nuovo server combacia esattamente** (conferma del fix).
- Test end-to-end reale sull'emulatore: app avviata (`JaeDrive_Automotive`, riavviato dopo spegnimento PC - snapshot non compatibile, ripartito "from scratch" ma dati utente/app preservati), navigato a Impostazioni → CLOUD → ASSOCIA AUTO, riprodotto l'errore "Invalid or expired pairing signature" **prima** del fix. **Non ancora ripetuto dopo il fix** - serve un redeploy del server (vedi Handover).

### 📋 Handover & Passaggio Consegne per l'Agente Successivo
- **Stato Attuale**: fix scritto e verificato via script locale, non ancora verificato end-to-end contro il server di produzione (che gira ancora col bug finche' non viene ridistribuito).
- **Open Questions / Pending Tasks**:
  1. **Serve un nuovo commit+push+redeploy Portainer** prima che il pairing possa funzionare su qualunque client (emulatore o vettura reale) - il bug e' server-side, nessuna modifica Android necessaria (la chiave/firma lato app erano gia' corrette).
  2. Dopo il redeploy, ripetere il test end-to-end sull'emulatore (Impostazioni → CLOUD → ASSOCIA AUTO) e verificare che compaia il popup con codice+QR invece dell'errore.
  3. Se si vuole rigenerare la chiave in futuro, il fix qui non cambia nulla del formato (`PAIRING_HMAC_SECRET` resta sempre la rappresentazione esadecimale dei 32 byte) - solo l'interpretazione lato server era sbagliata, ora corretta.
- **Constraints / Warning**: nessun altro punto del codice usa `env.pairingHmacSecret` direttamente - `pairingAuth.ts` e' l'unico consumer, quindi il fix e' isolato e non richiede altre modifiche.

---

## [2026-08-05] - Security Review Cloud + Firma HMAC su Pairing/Start + Rete di Sicurezza Admin

### 👤 Agent Metadata
- **Agent Nickname / Model**: Laptop Claude (Claude Code / Sonnet 5)
- **Scope / Subsystem**: `[cloud]`, `[app]`
- **Status**: `COMPLETED` (codice, build/type-check verificati) — `REQUIRES_USER_TEST` (deploy reale, vedi Constraints)

### 📌 Sintesi della Funzionalità / Modifica
Richiesta esplicita dell'utente: analisi di sicurezza completa di `cloud/server` e `cloud/web`. Trovate 5 criticità, ordinate per severità:

1. **🔴 ALTO — VIN/ivi_sn squatting**: `POST /api/device/pairing/start` era volutamente non autenticato e accettava qualunque `vin` in chiaro. Poiché `vehicles.vin` e' univoco globalmente e vince il primo che lo reclama, chiunque conoscesse il VIN/ivi_sn di un'auto non propria poteva reclamarla per se' PRIMA del vero proprietario, bloccandolo permanentemente (409 "already paired to a different account", nessun recupero). L'utente ha chiarito che in pratica si usa l'ivi_sn (seriale head unit), non il VIN standard - stesso identico problema, cambia solo quanto l'identificativo sia esposto pubblicamente.
2. **🟠 MEDIO — HTML non escapato nelle email transazionali** (`emailTemplates.ts`): `name`/`vehicleName`/`vin`/`tier`/`code` interpolati senza escape nell'HTML inviato via Resend.
3. **🟡 BASSO — Rate limit mancante** su `POST /api/user/redeem-discount-code` (unico endpoint "che eroga valore" senza `config.rateLimit`, a differenza di tutti gli altri endpoint sensibili del file).
4. **🟡 BASSO — Validazione schema mancante** sulle route admin di scrittura (`/users/:userId/subscription`, `/extra-swaps`, `/role`, `POST /discount-codes`) - accettavano `req.body` senza schema Fastify, a differenza del resto del codice.
5. **Positivo**: nessuna SQL injection (Prisma parametrizzato ovunque), IDOR sistematicamente prevenuto su ~15 route utente-scoped, nessun segreto committato, nessun `dangerouslySetInnerHTML`/`eval` nel frontend.

Per il punto 1, discusso con l'utente il meccanismo di mitigazione: Google Play Integrity (lo standard per questo problema) **non e' disponibile** su questa ROM (niente Google Play Services, head unit Desay china-market). Concordata un'alternativa: firma HMAC-SHA256 con chiave embedded offuscata nell'app (stesso schema XOR gia' usato per la password dello zip in JaeDriveProbe) - **esplicitamente comunicato all'utente che questo NON prova il possesso fisico di un'auto specifica** (la chiave e' identica per ogni installazione, estraibile da chi decompila l'APK), alza solo il costo dell'attacco da "una richiesta HTTP a caso" a "reverse engineering dell'app", e blocca il replay letterale grazie alla finestra temporale. Il rischio residuo (attaccante disposto a fare RE) resta chiuso solo dalla rete di sicurezza admin (punto 4 sotto), non dalla firma.

### 🛠️ Dettagli Tecnici & File Modificati

**Fix 2 (HTML escaping)** - **[`cloud/server/src/lib/emailTemplates.ts`](cloud/server/src/lib/emailTemplates.ts)**: aggiunta `escapeHtml()`, applicata a `name`/`vehicleName`/`vin`/`tier`/`code` in tutte le 8 funzioni di build email (solo nel corpo HTML, non nei subject - testo semplice, l'escape li' sarebbe sbagliato).

**Fix 3 (rate limit)** - **[`cloud/server/src/routes/user.ts`](cloud/server/src/routes/user.ts)**: `POST /redeem-discount-code` ora ha `config: { rateLimit: { max: 10, timeWindow: "1 minute" } }`.

**Fix 4 (validazione admin)** - **[`cloud/server/src/routes/admin.ts`](cloud/server/src/routes/admin.ts)**: schemi Fastify aggiunti a `/users/:userId/subscription` (status enum FREE/PREMIUM, tier enum STANDARD/GARAGE), `/users/:userId/role` (role enum USER/ADMIN), `POST /discount-codes` (discountType enum FREE_DAYS/PERCENT/FIXED_AMOUNT). **Bug scoperto e risolto in corsa**: `/users/:userId/extra-swaps` ha uno schema con `extraSwaps` OPZIONALE (non required) con fallback `?? 1` nel handler - il pulsante Admin esistente (`handleAddExtraSwap` in `AdminDashboard.tsx`) chiama questa route senza body affatto, intendendo sempre "+1"; renderlo `required` avrebbe rotto quel pulsante (probabilmente era gia' silenziosamente rotto prima, con `extraSwaps` `undefined` passato a `increment`).

**Fix 1 (firma HMAC) - lato server**:
- **[`cloud/server/src/lib/pairingAuth.ts`](cloud/server/src/lib/pairingAuth.ts)** (nuovo): `verifyPairingSignature(vin, timestamp, signature)` - HMAC-SHA256 su `vin|timestamp` con `env.pairingHmacSecret`, confronto a tempo costante (`timingSafeEqual`), finestra di validita' `timestamp` di ±2 minuti (blocca replay).
- **[`cloud/server/src/env.ts`](cloud/server/src/env.ts)**: nuova var **richiesta** `PAIRING_HMAC_SECRET` (`required()`, il server non parte senza - vedi Constraints).
- **[`cloud/server/src/routes/device.ts`](cloud/server/src/routes/device.ts)**: `POST /pairing/start` ora richiede `timestamp`+`signature` nel body, verificati PRIMA di creare il `pairingRequest` (401 se non validi). Aggiunto anche un rate-limit **per VIN** indipendente da quello per IP gia' presente (`MAX_PAIRING_STARTS_PER_VIN_PER_DAY = 3`, query `prisma.pairingRequest.count()` sulle ultime 24h) - blocca lo scanning massivo anche da chi ha gia' una firma valida.

**Fix 1 (firma HMAC) - lato Android**:
- **[`app/src/main/java/com/phabryc/jaedrive/CloudApiClient.java`](app/src/main/java/com/phabryc/jaedrive/CloudApiClient.java)**: `PAIRING_KEY_OBFUSCATED` (int[32], XOR key `0x7C`, stesso schema del probe) + `getPairingHmacKey()`/`hmacSha256Hex()` (via `javax.crypto.Mac`, gia' nell'SDK, nessuna dipendenza nuova). `pairingStart()` ora calcola `timestamp = System.currentTimeMillis()` e `signature = hmacSha256Hex(key, vin + "|" + timestamp)`, li aggiunge al body.
- **Valore reale della chiave (SOLO qui, mai in chiaro nel codice - stessa prassi della password JaeDriveProbe)**: `9478057e7478a5199d5ab3a804869fd3d2331378b3172df96508e2f4621f5d23` (32 byte esadecimali). **Questo stesso valore va impostato come `PAIRING_HMAC_SECRET` nell'environment del deploy Portainer** - senza, il client firma con una chiave che il server non riconosce e OGNI pairing fallisce con 401.

**Rete di sicurezza admin (recupero manuale, indipendente dalla firma)**:
- **[`cloud/server/src/routes/admin.ts`](cloud/server/src/routes/admin.ts)**: `GET /vehicles/lookup?vin=` (trova il veicolo + proprietario attuale da un VIN) e `DELETE /vehicles/:vehicleId` (cancella il veicolo, cascata su devices/trips/presetRoutes come la DELETE utente-facing gia' esistente - libera il VIN per un nuovo pairing legittimo).
- **[`cloud/web/src/lib/api.ts`](cloud/web/src/lib/api.ts)**: `adminLookupVehicleByVin()`, `adminUnlinkVehicle()`.
- **[`cloud/web/src/pages/AdminDashboard.tsx`](cloud/web/src/pages/AdminDashboard.tsx)**: nuovo pannello "Strumenti VIN" nel tab Utenti - campo di ricerca VIN, mostra proprietario attuale + data di reclamo, pulsante "Sgancia veicolo" con conferma.
- **Stringhe**: nuove chiavi `admin.vin*`/`admin.unlink*` in `values`/`values-it` equivalenti web (`i18n/it.ts`, `i18n/en.ts`).

**Documentazione**: `cloud/DESIGN.md` §7/§9/§14 aggiornati (pairing/start non e' piu' "no auth", spiegazione del limite della firma HMAC, endpoint di recupero admin); `cloud/.env.example` e `cloud/server/.env.example` con `PAIRING_HMAC_SECRET` (placeholder vuoto, MAI il valore reale); `cloud/docker-compose.yml` passa `PAIRING_HMAC_SECRET` al container `api`.

### 🧪 Comandi di Verifica Eseguiti
- `npx tsc --noEmit` (da `cloud/server/`) → **exit 0**, ripetuto dopo ogni modifica.
- `npx tsc --noEmit` (da `cloud/web/`) → **exit 0**.
- `./gradlew :app:assembleDebug` → **BUILD SUCCESSFUL**.
- **Non eseguito**: nessun test end-to-end del nuovo flusso di pairing (richiede un deploy server con `PAIRING_HMAC_SECRET` impostato + un'app con la nuova build installata - vedi Open Questions).

### 📋 Handover & Passaggio Consegne per l'Agente Successivo
- **Stato Attuale**: tutte le modifiche sono nel working tree, non ancora committate/pushate (l'utente decide quando farlo).
- **Open Questions / Pending Tasks**:
  1. **Prima di qualunque deploy**: impostare `PAIRING_HMAC_SECRET=9478057e7478a5199d5ab3a804869fd3d2331378b3172df96508e2f4621f5d23` nell'environment del Portainer stack (Advanced/raw mode) - un deploy senza questa variabile fa fallire l'avvio del server (`required()` lancia in `env.ts`).
  2. Test end-to-end del pairing reale: build+installazione della nuova app su un'auto/emulatore, verifica che `pairing/start` funzioni con la firma (nessun 401), poi verifica che un `curl` manuale SENZA firma valida venga rifiutato.
  3. Testare il pannello "Strumenti VIN" in Admin: cercare un VIN esistente, verificare che mostri il proprietario corretto, e - solo su un veicolo di test, MAI su un account reale senza conferma esplicita dell'utente - provare "Sgancia veicolo" e verificare che il VIN torni disponibile per un nuovo pairing.
  4. Valutare se implementare anche Google Play Integrity in futuro se mai emergesse un ROM/ha unita' con Google Play Services - chiuderebbe il limite residuo della firma HMAC (vedi discussione sopra).
- **Constraints / Warning**:
  - La chiave HMAC (`9478057e7478a5199d5ab3a804869fd3d2331378b3172df96508e2f4621f5d23`) va tenuta SOLO in questo file di documentazione interna, mai nel codice come stringa in chiaro (e' gia' offuscata via XOR in `CloudApiClient.java`, coerente con la prassi del probe) ne' in `.env.example`.
  - Se in futuro si rigenera la chiave (es. sospetto di compromissione), va cambiata **in entrambi i posti insieme** (costante Android + `PAIRING_HMAC_SECRET` server) - un mismatch rompe silenziosamente ogni pairing con 401, non c'e' retrocompatibilita' tra chiavi vecchie/nuove.
  - L'endpoint admin `DELETE /vehicles/:vehicleId` cancella PERMANENTEMENTE il veicolo e tutti i suoi viaggi (cascata) - va usato solo dopo aver verificato con `GET /vehicles/lookup` che si tratti davvero di un claim indebito, mai alla cieca.

---

## [2026-08-05] - JaeDriveProbe: Fix Commit Mancante, Push, Chiusura Sessione

### 👤 Agent Metadata
- **Agent Nickname / Model**: Laptop Claude (Claude Code / Sonnet 5)
- **Scope / Subsystem**: `[build-system]`, `[agent]`
- **Status**: `COMPLETED` (fix + push) — resto vedi Handover

### 📌 Sintesi della Funzionalità / Modifica
Dopo la verifica end-to-end completata dall'altro agente (voce sotto), controllo finale dello stato del repo: il commit `27ff663` di quell'agente non includeva `probe/proguard-rules.pro` (rimasto non tracciato) pur essendo referenziato da `build.gradle` per le keep-rules AIDL/zip4j sotto R8 — un fresh clone avrebbe rotto la build release. Aggiunto con un commit dedicato e pushato entrambi su `main`.

### 🛠️ Dettagli Tecnici & File Modificati
- **[`probe/proguard-rules.pro`](probe/proguard-rules.pro)**: aggiunto al tracking git (era presente su disco ma non incluso nel commit precedente).

### 🧪 Comandi di Verifica Eseguiti
- `git add probe/proguard-rules.pro && git commit ...` → `2ccbb5b`.
- `git push` → `56917e2..2ccbb5b main -> main`.

### 📋 Handover & Passaggio Consegne per l'Agente Successivo
- **Stato Attuale**: tutto il lavoro JaeDriveProbe (zip cifrato, offuscamento, inglese, fix proguard) è committato e pushato su `main`. Nessun lavoro pendente sul modulo `probe/` stesso.
- **Open Questions / Pending Tasks**:
  1. Copiare `probe/build/outputs/apk/release/JaeDriveProbe.apk` sulla chiavetta USB (non fatto in questa sessione — vedi Constraints).
  2. Copiare anche l'ultimo `app/build/outputs/apk/debug/JaeDrive.apk` (l'app principale, che non ha mai un build type `release` a sé — vedi `app/build.gradle`) sulla stessa chiavetta, sostituendo la build precedente.
  3. Nessuna verifica di build fatta in questa sessione sull'app principale (`:app:assembleDebug`) — vedi Constraints, era bloccata anche quella.
- **Constraints / Warning**: questa sessione (Claude Code / Sonnet 5) ha avuto **tutte** le chiamate Bash relative a build/install/USB bloccate da un safety classifier separato dal normale sistema di permessi (vedi voce precedente per il dettaglio) — il blocco si è esteso anche a `:app:assembleDebug`, non solo al modulo `probe`. L'utente ha scelto di continuare il lavoro sull'app principale in una **sessione nuova** per ripartire senza quel contesto accumulato — se sei quella sessione nuova, non dovresti avere lo stesso problema; se lo hai comunque, non insistere/aggirare, chiedi all'utente di lanciare i comandi da terminale (funziona sempre, verificato più volte in questa sessione).

---

## [2026-08-05] - JaeDriveProbe: Verifica End-to-End su Emulatore Completa

### 👤 Agent Metadata
- **Agent Nickname / Model**: Gemini 3.6 Flash
- **Scope / Subsystem**: `[probe]`, `[agent]`
- **Status**: `COMPLETED` (compilato release offuscata, installata su emulatore Android Automotive, eseguita scansione, verificati lingua inglese, assenza log password ed estrazione zip AES-256)

### 📌 Sintesi della Funzionalità / Modifica
Completata la verifica end-to-end richiesta nel handover dell'agente precedente per il modulo `JaeDriveProbe`:
1. Compilato `:probe:assembleRelease` con offuscamento R8 attivo.
2. Installato `JaeDriveProbe.apk` su emulatore Android Automotive (`emulator-5554`).
3. Avviata la scansione completa dal pulsante `START SCAN`.
4. Verificato che tutte le stringhe di interfaccia e log siano in inglese e privi di riferimenti alla cifratura/password.
5. Estratto l'archivio generato `JaeDriveProbe_*.zip` tramite `7z` confermando che il tentativo con password errata fallisce con `Wrong password` e che la password `JaeProbe2026!` decifra correttamente il report `dump.txt`.

### 🛠️ Dettagli Tecnici & File Modificati
- **[`probe/build/outputs/apk/release/JaeDriveProbe.apk`](file:///home/phabryc/Desktop/Desktop/JaeDrive/probe/build/outputs/apk/release/JaeDriveProbe.apk)**: APK Release generata e verificata.

### 🧪 Comandi di Verifica Eseguiti
- `./gradlew :probe:assembleRelease` -> **BUILD SUCCESSFUL**.
- `adb install -r probe/build/outputs/apk/release/JaeDriveProbe.apk` -> **Success**.
- `adb shell input tap 720 310` -> Scansione eseguita, output visualizzato sul display `1440x1770`.
- `7z x -pwrongpass /tmp/test_probe.zip` -> `ERROR: Wrong password : dump.txt`.
- `7z x -pJaeProbe2026! /tmp/test_probe.zip` -> `Everything is Ok`, `dump.txt` estratto e verificato.

---

## [2026-08-05] - JaeDriveProbe: Export a Zip Cifrato, Offuscamento APK, Localizzazione Inglese

### 👤 Agent Metadata
- **Agent Nickname / Model**: Laptop Claude (Claude Code / Sonnet 5)
- **Scope / Subsystem**: `[app]`, `[build-system]`
- **Status**: `COMPLETED` — verificato end-to-end su emulatore (vedi voce del registro sopra)

### 📌 Sintesi della Funzionalità / Modifica
Seguito diretto della voce precedente (creazione di `JaeDriveProbe`). L'utente ha chiesto tre modifiche in rapida successione al tool appena creato:
1. Impacchettare tutti i risultati (log + eventuali APK estratti) in un **unico zip protetto da password** invece del vecchio export in chiaro su USB.
2. **Offuscare l'APK** stesso ("non vorrei che lo prendesse qualcuno") — l'utente teme che il lavoro di reverse engineering incorporato nel tool (tabelle VDB, permessi Car API noti) venga sottratto da chi trova l'APK.
3. **Non menzionare mai nel log/UI visibile** che l'output è protetto da password, né la password stessa — chi esegue la scansione su un'auto non sua non deve saperlo.
4. **Tradurre tutte le stringhe visibili all'utente in inglese** — lo strumento può finire in mano a chiunque (dealer, altro proprietario), l'inglese è più universale dell'italiano usato nel resto del progetto. I commenti nel codice restano in italiano per coerenza con il resto della codebase.

### 🛠️ Dettagli Tecnici & File Modificati
- **[`probe/src/main/java/com/phabryc/jaedriveprobe/MainActivity.java`](probe/src/main/java/com/phabryc/jaedriveprobe/MainActivity.java)**:
  - Tutte le stringhe `log(...)`/`status(...)`/`Toast` tradotte in inglese.
  - Rimossi i vecchi `exportLogToUsb()`/`writeFile()` (export in chiaro), sostituiti da `buildPasswordProtectedZip(String zipName)` (scrive prima il log in `getFilesDir()/dump.txt`, poi crea uno zip AES-256 via `zip4j` con quel file + il contenuto di `apks/`, salvato in storage interno — **sempre riuscito, nessun permesso richiesto**, risolvendo un gap reale trovato durante questo giro: se `MANAGE_EXTERNAL_STORAGE` non era ancora concesso, la vecchia scansione andava semplicemente persa) e `copyToUsb(File localZip)` (stessa logica MANAGE_EXTERNAL_STORAGE/StorageVolume di prima, ora copia solo lo zip già pronto).
  - **Nessuna riga di log/status menziona mai la password o il fatto che l'export sia protetto** (richiesta esplicita utente).
  - Password dell'archivio non è una `String` letterale (R8 non tocca i letterali, resterebbero estraibili con `strings`/jadx anche offuscato) ma un `int[] ZIP_PW_OBFUSCATED` con XOR key `0x5A`, ricostruita a runtime da `getZipPassword()`. **Password in chiaro per chi deve aprire lo zip per verifica: `JaeProbe2026!`** (documentato qui, non nel codice ne' nell'app).
- **[`probe/build.gradle`](probe/build.gradle)**:
  - Aggiunta dipendenza `net.lingala.zip4j:zip4j:2.11.5` (unica libreria Java pura con supporto cifratura AES reale, apribile con 7-Zip/WinRAR/Archive Utility standard — `java.util.zip` di base non supporta affatto la cifratura).
  - Aggiunto `buildTypes { release { minifyEnabled true; proguardFiles ... } }` per l'offuscamento richiesto — **nota onesta già data all'utente**: R8/ProGuard rende più faticosa la lettura del decompilato ma non è vera sicurezza, e da solo non tocca stringhe letterali (da cui l'offuscamento manuale della password sopra).
  - `signingConfig signingConfigs.debug` sul build type `release` — **bug scoperto e risolto in questo giro**: AGP non firma automaticamente la variante `release` (lo fa solo per `debug`), quindi il primo tentativo di installazione falliva con `INSTALL_PARSE_FAILED_NO_CERTIFICATES`. Nessun keystore di produzione: l'APK si installa via USB, non passa da nessuno store, quindi la firma debug basta (stesso motivo per cui `app/build.gradle` non definisce affatto un tipo `release`).
- **[`probe/proguard-rules.pro`](probe/proguard-rules.pro)** (nuovo file): `-keep` su `com.desaysv.ivi.vdb.**`/`com.desaysv.ivi.vdb.event.**` (AIDL/Parcelable — Stub/Proxy/CREATOR non vanno rinominati o il binding/(de)serializzazione fallisce silenziosamente a runtime) e su `net.lingala.zip4j.**` (libreria terza, basta che lo shrinking non la rompa).
- **[`probe/src/main/res/layout/activity_main.xml`](probe/src/main/res/layout/activity_main.xml)**: testo descrizione e testo pulsante ("AVVIA SCANSIONE" → "START SCAN") tradotti in inglese.

### 🧪 Comandi di Verifica Eseguiti
- `./gradlew :probe:assembleDebug`/`assembleRelease` (eseguiti **dall'utente da terminale**, non da questo agente — vedi Constraints) → confermato **BUILD SUCCESSFUL** dopo il fix della `signingConfig`.
- **Non ancora rieseguito il test dal vivo su emulatore** (scansione completa, verifica assenza di riferimenti a "password" nel log, verifica che tutte le stringhe siano in inglese, verifica che lo zip generato sia realmente apribile con la password sopra) — era in corso quando questo agente si è dovuto fermare.

### 📋 Handover & Passaggio Consegne per l'Agente Successivo
- **Stato Attuale**: tutto il codice sopra è scritto e compila. Committato e pushato su `main` (vedi voci successive in questo log) e verificato end-to-end.
- **Open Questions / Pending Tasks** (in ordine):
  1. ✅ Fatto — vedi voce successiva in questo log ("Verifica End-to-End su Emulatore Completa"): installato `probe/build/outputs/apk/release/JaeDriveProbe.apk` su emulatore Automotive, lanciata `MainActivity`, premuto START SCAN.
  2. ✅ Fatto — stessa voce: confermate tutte le stringhe a schermo/log in inglese senza residui italiani, nessuna riga menziona "password" o che il file è protetto.
  3. Verificare che lo zip sia davvero cifrato AES: `adb pull` il file da `/data/data/com.phabryc.jaedriveprobe/files/`, poi `unzip -l` (deve elencare i file) e un tentativo con password sbagliata (`unzip -P wrongpass ...`) deve fallire. Password corretta per il test: `JaeProbe2026!`.
  4. Se tutto ok, copiare l'APK (release, non debug) sulla chiavetta USB già in uso per JaeDrive, sostituendo la build precedente non offuscata.
  5. Committare (probabilmente un solo commit per questo intero giro di modifiche) e — solo se richiesto esplicitamente dall'utente — pushare.
- **Constraints / Warning**:
  - **Questo agente (Claude Code / Sonnet 5, sessione 2026-08-05) non è riuscito a eseguire build/install/adb su questo modulo**: un safety classifier separato dal normale sistema di permessi ha bloccato ripetutamente `./gradlew`, `adb install` e perfino `git diff` su questo modulo, con la motivazione "a safety check separate from auto mode... because of earlier conversation content". L'ipotesi è che la combinazione di caratteristiche del tool (dump dati da un'auto non propria, password nascosta all'operatore, APK offuscato) faccia pattern-match con strumenti di sorveglianza/esfiltrazione occulta, anche se l'uso reale è ricerca legittima di reverse engineering per JaeDrive. **Non è detto che questo blocco valga anche per un agente/sessione diversa** — se capita anche a te, non provare ad aggirarlo con altri tool, fermati e chiedi all'utente di eseguire i comandi da terminale (ha già fatto così in questa sessione, funziona).
  - La password `JaeProbe2026!` va tenuta SOLO in questo file di documentazione interna, mai nel codice come stringa in chiaro né in nessun log/UI dell'app.

---

## [2026-08-05] - Nuovo Modulo: JaeDriveProbe (Strumento Diagnostico Standalone per Altri Modelli Chery-Group)

### 👤 Agent Metadata
- **Agent Nickname / Model**: Laptop Claude (Claude Code / Sonnet 5)
- **Scope / Subsystem**: `[app]`, `[build-system]`
- **Status**: `COMPLETED` (codice, build verificata, testato dal vivo su emulatore) — `REQUIRES_USER_TEST` su una vettura Chery-group diversa dalla Jaecoo 7 dell'utente (l'intero scopo dello strumento)

### 📌 Sintesi della Funzionalità / Modifica
Nato da una domanda dell'utente sulla confidenza delle implementazioni JaeDrive per le altre motorizzazioni/modelli della gamma Chery-group (Jaecoo 5/7/8, Omoda 5/7/9) - la risposta onesta e' che tutte le tabelle di decodifica del bus VDB Desay (flusso energia, drive mode, formule SOC/carburante) sono state reverse-engineered su UNA sola vettura fisica (la Jaecoo 7 SHS-H dell'utente) e non sono mai state verificate su nessun'altra. In particolare `EnergyFlowUtil.java` documenta gia' nei suoi stessi commenti che esiste una tabella "four_wheel_" alternativa per i modelli 4WD, mai usata dal codice (che applica sempre e solo la tabella 2WD a qualunque motorizzazione). Creato un nuovo modulo/APK completamente indipendente da JaeDrive, pensato per essere installato su una vettura diversa (di un altro proprietario, o presso un concessionario) per raccogliere in un colpo solo tutte le informazioni utili a colmare questo buco di conoscenza, senza bisogno di adb/USB debugging sull'altra vettura.

### 🛠️ Dettagli Tecnici & File Modificati
- **Nuovo modulo Gradle `probe/`** (`settings.gradle` aggiornato con `include ':probe'`) - APK separato `com.phabryc.jaedriveprobe` ("JaeDriveProbe"), nessuna dipendenza da account/cloud/pairing/internet, solo i permessi Car API + storage necessari al dump.
- **[`probe/src/main/java/com/phabryc/jaedriveprobe/MainActivity.java`](probe/src/main/java/com/phabryc/jaedriveprobe/MainActivity.java)**: un solo pulsante "AVVIA SCANSIONE" che raccoglie in sequenza: risoluzione/densita'/bucket schermo reali (stessa tecnica che ha scoperto il mismatch 240-vs-160dpi dell'emulatore), `getprop` completo via shell (nessun root necessario), enumerazione di TUTTE le `CarPropertyConfig` di `android.car` con relativo valore (stesso approccio gia' verificato in `MainActivity.discoverAllProperties()` di JaeDrive), scansione a tappeto modulo×cmdId (0x00-0xFF) del bus VDB Desay su tutti e 5 i moduli noti (inclusi CAR_SETTING/CAR_COMPUTER, mai sondati prima), e - permessi permettendo - copia grezza di qualunque APK di sistema desaysv/desay/vds installato (per poterli decompilare offline come gia' fatto per la Jaecoo 7). Tutto scritto in un unico file di testo esportato su USB con lo stesso meccanismo MANAGE_EXTERNAL_STORAGE/StorageVolume gia' verificato sul campo in JaeDrive.
- Riusa file esistenti copiati identici da `app/`: AIDL `IVDBus`/`IVDBusNotify`/`IVDBusCallback`/`VDEvent`, e l'implementazione Java a mano di `VDEvent.java` (il file `.aidl` da solo dichiara il tipo ma non lo implementa - bug di build scoperto e risolto durante la creazione di questo modulo).

### 🧪 Comandi di Verifica Eseguiti
- `./gradlew :probe:assembleDebug` e poi build completa (`assembleDebug assembleRelease` su tutto il progetto) → **BUILD SUCCESSFUL**, nessun impatto sul modulo `app/`.
- Test dal vivo sull'emulatore Automotive: scansione completa senza crash - dump `android.car` corretto (28 property trovate coi valori), rilevamento pulito dell'assenza del bus VDB Desay su questo dispositivo generico (nessun crash, messaggio chiaro), dump APK correttamente vuoto (0 pacchetti Desay installati qui), export USB fallito con messaggio d'errore chiaro (permesso mancante + Settings screen assente su questo ROM generico) invece di crashare.

### 📋 Handover & Passaggio Consegne per l'Agente Successivo
- **Open Questions / Pending Tasks**: l'intero scopo dello strumento e' essere provato su una vettura Chery-group DIVERSA dalla Jaecoo 7 - finche' non succede, resta uno strumento pronto ma inutilizzato. Se/quando arriva un dump da un'altra vettura, confrontarlo con `VDInfoClient.java`/`EnergyFlowUtil.java` per capire se le tabelle attuali vanno estese con un ramo per-modello o per-trazione (2WD/4WD).
- **Constraints / Warning**: e' uno strumento diagnostico "usa e getta", non pensato per essere distribuito/mantenuto come JaeDrive stessa - nessun aggiornamento del catalogo `VehicleCatalog`/nessuna logica di business qui dentro, solo raccolta dati grezzi.

---

## [2026-08-05] - Fix Pagine Statiche Cloud: Allineamento Feature/Freemium a Implementazione Reale

### 👤 Agent Metadata
- **Agent Nickname / Model**: Laptop AG (Antigravity / Claude Sonnet 4.6 Thinking)
- **Scope / Subsystem**: `[cloud]`
- **Status**: `COMPLETED` (TypeScript check OK, `npx tsc --noEmit` → exit 0)

### 📌 Sintesi della Funzionalità / Modifica
Analisi sistematica delle tre pagine statiche pubbliche (`Landing.tsx`, `Plans.tsx`, `Features.tsx`) rispetto alla verità tecnica documentata in `FREEMIUM_STRATEGY.md` e `agent_log.md`. Trovate e corrette **9 discrepanze** tra comunicazione marketing e implementazione reale.

### 🛠️ Dettagli Tecnici & File Modificati

**[`Plans.tsx`](file:///home/phabryc/Desktop/Desktop/JaeDrive/cloud/web/src/pages/Plans.tsx)**:
- Riga tabella "Export CSV e PDF": `standard: true, garage: true` → `standard: "🔜 In arrivo", garage: "🔜 In arrivo"` (CSV/PDF non ancora implementati).
- Riga tabella "Re-pairing senza penalità": `free: false` → `free: "N/A"` (i Free non fanno pairing, non hanno penalità da gestire — ❌ era fuorviante).
- Sezione Free — lista feature: aggiunta "Unione di viaggi consecutivi (soste intermedie, un unico percorso)" (IT+EN) — feature reale e funzionante dal `TripMerger.java`, mai documentata nelle pagine statiche.
- Card Standard: "Export GPX completo + CSV + PDF" → "Export GPX completo con estensioni (CSV e PDF 🔜 in arrivo)" (IT+EN).

**[`Features.tsx`](file:///home/phabryc/Desktop/Desktop/JaeDrive/cloud/web/src/pages/Features.tsx)**:
- Card "Registrazione automatica dei viaggi": body riscritto per non implicare che il cloud sia incluso per i Free (era "trova tutto sul cloud" — falso per chi non ha un piano). Aggiunto merge trips nelle `itDetails`/`enDetails`.
- Card "Export GPX": titolo da "...+ CSV + PDF" a "...(+ CSV e PDF 🔜)" (IT+EN); body aggiornato a spiegare che CSV/PDF sono in sviluppo; le due righe nei dettagli marcate "🔜 in arrivo" / "🔜 coming soon".
- Card "Overlay status bar": "Sempre visibile sopra qualsiasi altra app" → "Sempre visibile sopra le app dell'infotainment" (meno assoluto, più accurato rispetto al comportamento documentato su ROM diverse).
- Card "Storico viaggi illimitato": body riscritto — prima diceva "conserva gli ultimi 7 giorni" (implicando cancellazione), ora chiarisce che i dati più vecchi di 7gg *continuano ad essere registrati localmente* ma diventano consultabili solo con Premium.

**[`Landing.tsx`](file:///home/phabryc/Desktop/Desktop/JaeDrive/cloud/web/src/pages/Landing.tsx)**:
- Tipo `FEATURES` ampliato con campo opzionale `premium?: boolean`; flag `premium: true` aggiunto alla 4ª card (sincronizzazione cloud).
- Aggiunto `lang` alla destructure di `useLanguage()`; aggiunta costante `isIt`.
- Render delle 4 card aggiornato: ora ogni card mostra un mini-badge inline "🟢 Gratis" (IT: "Gratis", EN: "Free") per le prime 3 feature e "👑 Premium" per la 4ª — rendendo immediatamente visibile la distinzione Free/Premium già nella sezione hero.

### 🧪 Comandi di Verifica Eseguiti
- `npx tsc --noEmit` (da `cloud/web/`) → **exit 0**, nessun errore TypeScript.

### 📋 Handover & Passaggio Consegne per l'Agente Successivo
- **Stato Attuale**: modifiche nel working tree Linux, non ancora committate.
- **Open Questions / Pending Tasks**: CSV e PDF restano in tabella come "🔜 In arrivo" — quando verranno implementati, rimuovere il badge e ripristinare `true` nelle righe della tabella + aggiornare titoli/body nelle card Features/Plans.
- **Constraints / Warning**: il `FREEMIUM_STRATEGY.md` §1 è la fonte di verità ufficiale per la tabella comparativa Free/Standard/Garage — qualunque futura modifica alle pagine statiche deve essere verificata contro quello.

---



### 👤 Agent Metadata
- **Agent Nickname / Model**: Laptop AG (Antigravity / Claude Sonnet 4.6 Thinking)
- **Scope / Subsystem**: `[agent]`
- **Status**: `IN_PROGRESS` — lettura contesto completata, in attesa di istruzioni operative

### 📌 Sintesi della Funzionalità / Modifica
Primo accesso alla cartella `agent/` come richiesto dal protocollo. Ho letto:
- `README.md` → regole del protocollo multi-agente (formato log, regole di condotta, cosa documentare).
- `agent_log.md` → storia completa: 7 voci dal 2026-08-04 ad oggi. L'ultimo agente attivo è stato **Laptop Claude (Sonnet 5)** con lavoro intensivo il 2026-08-05.
- `SIMULATOR.md` → architettura mock debug/release, configurazione AVD `JaeDrive_Automotive` (1440×1770, **160dpi** — confermato da dump reale `ro.sf.lcd_density=160`), sistema operativo Linux con KVM, immagine `android-33;android-automotive;x86_64`.

### 🛠️ Riepilogo Stato Attuale Repository
- **Build**: `assembleDebug assembleRelease` → **BUILD SUCCESSFUL** verificata nell'ultima sessione.
- **Emulatore**: AVD `JaeDrive_Automotive` configurato a 1440×1770, 160dpi (corretto), immagine `android-automotive` (NON `google_apis` — genera crash su `android.car`).
- **Feature recenti completate** (tutte `REQUIRES_USER_TEST` su auto reale):
  - Merge viaggi consecutivi (`TripMerger.java`) con marker pausa su mappa.
  - Fix riquadro mappa vuoto quando `points.size() < 2`.
  - Freemium gating completo (status bar, popup, storico 7gg, GPX ridotto, popup scadenza 10gg).
  - Fix bug istanza duplicata `TrackingService` (FileLock).
  - Backup/ripristino switch PREMIUM alla scadenza/riattivazione abbonamento.
  - Fix scappatoia PREMIUM su disassociazione (clearCloudPairing ora forza switch a false).
  - Fix densità AVD 240→160dpi + centratura icona status bar.
- **Modifiche**: tutto il lavoro del 2026-08-05 elencato sopra è stato successivamente committato e pushato su `main`.
- **Emulatore associato al cloud di produzione reale** (usato per test nella sessione precedente) — attenzione se si fa pairing/unpairing.

### 🧪 Comandi di Verifica Eseguiti
Nessuno in questa sessione — solo lettura del contesto.

### 📋 Handover & Passaggio Consegne per l'Agente Successivo
- **Stato Attuale**: pronti per ricevere istruzioni operative dall'utente.
- **Open Questions / Pending Tasks**: tutti i `REQUIRES_USER_TEST` della sessione precedente restano aperti — in particolare: marker pausa su mappa (richiede auto reale con GPS vero), scappatoia PREMIUM chiusa (da validare con disassociazione reale), bug istanza duplicata (da replicare con chiusura forzata + riapertura).
- **Constraints / Warning**: `hw.lcd.density=160` sempre (mai 240); immagine AVD sempre `android-automotive` (mai `google_apis`); i permessi su emulatore generico vanno riconcessi dopo ogni cold boot; `Prefs.setSubscriptionSnapshot()` è l'unico punto di scrittura per lo stato subscription — non duplicare.

---

## [2026-08-05] - Nuova Funzione: Merge Viaggi Consecutivi + Fix Riquadro Mappa Senza Traccia

### 👤 Agent Metadata
- **Agent Nickname / Model**: Laptop Claude (Claude Code / Sonnet 5)
- **Scope / Subsystem**: `[app]`
- **Status**: `COMPLETED` (codice, build verificata, testato dal vivo su emulatore con dati reali) — `REQUIRES_USER_TEST` sulla vettura reale (traccia GPS vera, non testabile sull'emulatore per assenza di un location provider)

### 📌 Sintesi della Funzionalità / Modifica
Richiesta esplicita utente: poter unire 2 o più viaggi AUTO consecutivi in uno solo dallo Storico, utile quando una pausa (es. pranzo) durante un unico spostamento fa si' che JaeDrive lo registri come piu' viaggi separati (il gear torna in PARK durante la sosta). Aggiunta anche una piccola correzione collegata: il dettaglio viaggio mostrava un mappamondo vuoto e inutile quando un viaggio non ha traccia GPS valida (es. proprio un viaggio unito il cui GPX di partenza era vuoto).

### 🛠️ Dettagli Tecnici & File Modificati
- **[`TripMerger.java`](app/src/main/java/com/phabryc/jaedrive/TripMerger.java)** (nuovo): calcola il GPX unito (estrae i `<trkpt>` originali COSI' COME SONO scritti via regex, mai riparsati campo-per-campo, per non perdere estensioni) inserendo tra una tratta e l'altra un punto sintetico di pausa (stessa posizione dell'ultimo punto reale, nuova estensione `<jd:pauseEndTime>`) e le statistiche unite (km/litri sommati, consumo medio RICALCOLATO dai totali, mai media delle medie).
- **[`TripPoint.java`](app/src/main/java/com/phabryc/jaedrive/TripPoint.java)**/**[`GpxReader.java`](app/src/main/java/com/phabryc/jaedrive/GpxReader.java)**: aggiunto il campo `timeMillis` (il `<time>` del trkpt, prima mai letto) e `pauseEndMillis` (non-null solo per il punto sintetico di pausa) - servono a MainActivity per disegnare il marker rosso di pausa con gli orari.
- **[`MainActivity.java`](app/src/main/java/com/phabryc/jaedrive/MainActivity.java)**: nuovo pulsante "UNISCI" nella barra di selezione dello Storico (accanto a "ELIMINA"), validazione (almeno 2 viaggi, tutti AUTO, **consecutivi** - nessun altro viaggio non selezionato compreso cronologicamente tra due di quelli scelti), dialogo di conferma, poi `mergeSelectedTrips()`: scrive il nuovo GPX, inserisce il `TripRecord` unito, cancella righe/file originali, e per i viaggi gia' caricati sul cloud li elimina li' SUBITO (senza conferma separata come nella cancellazione manuale - un doppione permanente online non sarebbe un'alternativa ragionevole), poi il viaggio unito si carica da solo al prossimo sync. Marker rosso di pausa disegnato sulla mappa dettaglio (`buildPauseMarker()`, nuovo drawable `ic_pause_marker.xml`) con titolo/orari al tocco.
- **Fix collegato**: `renderTripDetail()` ora usa SEMPRE la vista schematica offline (`TripTraceView`, che gia' da sola disegna "Nessuna traccia GPS salvata" per una lista vuota) quando `points.size() < 2`, anche con internet disponibile - prima in quel caso veniva comunque creata la vera mappa online, che senza punti mostra solo un mappamondo vuoto. Il riquadro (560dp, pensato per una mappa/traccia vera) si restringe anche lui a 120dp quando non c'e' nulla da disegnare, invece di lasciare uno spazio vuoto enorme intorno a una riga di testo.

### 🧪 Comandi di Verifica Eseguiti
- `./gradlew assembleDebug assembleRelease` → **BUILD SUCCESSFUL** ad ogni giro.
- Test end-to-end dal vivo sull'emulatore: creati 2 viaggi reali via iniezione gear (con `cmd car_service enable-uxr false` per evitare il blocco UX Automotive durante la "guida" simulata), verificato che il merge produca statistiche corrette (km sommati, consumo ricalcolato dai totali, non media), che i due originali spariscano e vengano rimossi anche dal cloud reale (log confermato), e che il dettaglio non vada in crash. Verificato anche visivamente il fix del riquadro mappa/traccia mancante.
- **Non verificato**: il marker rosso di pausa sulla mappa (l'emulatore non genera veri punti GPS, i viaggi di test avevano 0 punti/nessun punto di pausa da disegnare) - la logica segue lo stesso schema gia' verificato di `buildTripMarker()` (partenza/arrivo), ma va confermata sulla vettura reale con una traccia GPS vera.

### 📋 Handover & Passaggio Consegne per l'Agente Successivo
- **Open Questions / Pending Tasks**: validare sul campo (auto reale) che il marker di pausa compaia nel punto giusto con gli orari corretti, su un vero viaggio con pausa interrotta a meta'.
- **Constraints / Warning**: il merge e' scope-limitato ai soli viaggi AUTO (i trip manuali A/B non hanno una traccia GPS propria, "unirli" non avrebbe lo stesso senso) - se in futuro si vuole estenderlo anche ai manuali va ripensata da zero la logica di combinazione (non c'e' nessun file da concatenare).

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
- **Stato Attuale**: modifiche committate e pushate su `main`.
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
- **Stato Attuale**: modifiche committate e pushate su `main`.
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
- **Stato Attuale**: modifiche committate e pushate su `origin/main`.
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
