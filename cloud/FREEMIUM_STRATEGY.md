# JaeDrive — Modello Freemium & Architettura Sottoscrizioni Implementata

Questo documento costituisce la specifica tecnica finale ed ufficiale del modello **Freemium**, della **Gestione Abbonamenti**, della **Prevenzione Abuse/Account Sharing**, del **Sistema Email Transazionali** e dell'**Interfaccia Amministrativa** implementati nel monorepo JaeDrive.

---

## 📋 1. Tabella Comparativa dei Piani

| Ambito | 🟢 FREE (Solo Headunit) | 👑 PREMIUM STANDARD | 🏎️ PREMIUM GARAGE |
| :--- | :--- | :--- | :--- |
| **Destinazione** | App Android Headunit (Locale) | App Android + WebApp Cloud | App Android + WebApp Cloud (Multi-Auto) |
| **Posti Auto (Garage)** | 0 Posti Cloud (No Pairing) | **1 Posto Auto Attivo** | **Fino a 3 Posti Auto Attivi** |
| **Quota Cambio Headunit** | N/A | **Max 2 Headunit distinte / 365 giorni** | **Max 5 Headunit distinte / 365 giorni** |
| **Storico Viaggi** | Max 7 giorni (Locali) | **Illimitato** (Sincronizzato Cloud) | **Illimitato** (Sincronizzato Cloud) |
| **Analisi & Telemetria** | Base locale | **Completa** (Heatmap, SOC, Costi, Efficienza) | **Completa** (Tutti i veicoli del garage) |
| **Esportazione Dati** | Solo GPX base | **GPX completo con estensioni**, CSV e PDF | **GPX completo con estensioni**, CSV e PDF |
| **Supporto Lifetime** | N/A | Supported (`expiresAt = null`) | Supported (`expiresAt = null`) |

> ⚠️ **Stato implementazione (2026-08-05)**: l'esportazione **GPX** (base vs completo con estensioni) è già implementata lato Android - vedi §4.4. **CSV e PDF non esistono ancora da nessuna parte** (né Android né WebApp) - restano un obiettivo di roadmap, non funzionalità già disponibili.

---

## 🔒 2. Prevenzione Abuse & Controllo Headunit Swaps

Per prevenire la condivisione impropria di un singolo account tra utenti diversi o l'abuso dei cambi dispositivo:

1. **Binding per Hardware / Headunit ID**:
   - Ogni richiesta di pairing ed ogni chiamata di sincronizzazione verifica l'ID hardware unico dell'Headunit Android (`headunitId`).
2. **Re-pairing Senza Penalità**:
   - Ri-accoppiare un dispositivo già registrato nella cronologia dell'utente (`DeviceHistory`) **NON consuma alcuna quota** di cambio dispositivo.
3. **Quota Cambi nei 365 Giorni**:
   - **Piano Standard**: Fino a 2 Headunit distinte nell'arco di 365 giorni.
   - **Piano Garage**: Fino a 5 Headunit distinte nell'arco di 365 giorni.
   - **Extra Swaps ManuaIi**: Gli Amministratori possono concedere quota extra di cambi dall'Admin Panel (`extraDeviceSwaps`).

---

## 🎟️ 3. Sistema Codici Sconto & Promozionali

Il sistema di codici promo integrato supporta:

- **Generatore Automatico 8 Caratteri**: Generazione istantanea di codici alfanumerici univoci (es. `K8X9P2M4`) con pulsante di copia rapida nella clipboard negli appositi moduli Admin.
- **Tipi di Sconto**:
  - `FREE_DAYS`: Giorni di abbonamento Premium gratuiti aggiunti alla data corrente o di scadenza residua.
  - `PERCENT`: Sconto percentuale applicato.
  - `FIXED_AMOUNT`: Sconto a cifra fissa.
- **Multiuso vs Ad Personam**:
  - **Globali**: Utilizzabili da più utenti, ma **monouso per singolo utente** (tracciato tramite la tabella `DiscountCodeRedemption`).
  - **Ad Personam**: Vincolati ad uno specifico indirizzo email (`assignedEmail`). La creazione di un codice ad personam invia automaticamente un'email al destinatario con il codice ed i dettagli del vantaggio.

---

## 📲 4. Integrazione & Handshake App Android

Per consentire all'App Android Headunit di conoscere in tempo reale lo stato dell'abbonamento dell'utente e bloccare/sbloccare le funzionalità Cloud:

- **Endpoint Handshake**:
  - `GET /api/device/owner`
  - `POST /api/device/heartbeat`
- **Payload Risposta**:
  ```json
  {
    "subscription": {
      "status": "PREMIUM",
      "tier": "STANDARD",
      "expiresAt": "2027-08-04T00:00:00.000Z",
      "isActive": true
    }
  }
  ```
- **Documentazione Integrazione Android**: `cloud/ANDROID_SUBSCRIPTION_HANDSHAKE.md` (dettaglio tecnico completo: classi, metodi, gating esatto - qui solo il riassunto decisionale).

### 4.1 Comportamento di Sincronizzazione (Heartbeat-First)
- `heartbeat()` prima non veniva mai invocato (codice morto, risposta scartata). Ora viene chiamato **prima** di ogni tentativo di upload viaggio, aggiorna subito lo snapshot locale dell'abbonamento e - se non attivo - **blocca la sincronizzazione in modo pulito** (nessun retry), invece del comportamento precedente che, su un `403`, ritentava all'infinito con backoff crescente martellando il server.
- Il controllo gira almeno una volta per accensione (`TrackingService.onCreate()`) e dopo ogni viaggio chiuso - sufficiente perché l'app torni "attiva" non appena l'abbonamento lo è, senza bisogno di riaprire le Impostazioni.

### 4.2 Funzionalità Premium Aggiuntive Lato Android
Decisione presa in questa sessione, non presente nello schema originale del punto 1: oltre al blocco upload/pairing (già server-side, vedi tabella §1), l'app rende **Premium-exclusive tre funzioni in background**, con gate puramente client-side su `subscription.isActive` - nessuna nuova rotta server necessaria:
- Barra di stato overlay in background.
- Popup livello rigenerazione.
- Popup rilevamento rifornimento.

Gli switch corrispondenti in Impostazioni si disattivano **da soli** quando l'abbonamento non è attivo (scritto in un unico punto, `Prefs.setSubscriptionSnapshot()`, condiviso da heartbeat e da `/owner`). Comportamento uniformato su tutte e 3 le card (rivisto il 2026-08-05, prima la barra di stato aveva un trattamento diverso - segnalato come incoerente): switch bloccati e sezione ingrigita (opacità ridotta) insieme, un solo badge "PREMIUM" sull'intestazione della sezione, mai uno per singola riga.

**Configurazione utente preservata alla riattivazione** (2026-08-05, richiesta esplicita utente): prima, spegnere i 3 switch alla scadenza sovrascriveva per sempre la scelta reale dell'utente - riattivando l'abbonamento restavano tutti spenti a prescindere da cosa fosse impostato prima. Ora `Prefs.setSubscriptionSnapshot()` salva un backup dei 3 valori la prima volta che vede l'abbonamento non attivo (una sola volta per scadenza, non ad ogni heartbeat successivo) e lo ripristina automaticamente non appena l'abbonamento torna attivo, cancellando poi il backup. Il backup viene azzerato anche in caso di rimozione associazione, così un'auto riassociata a un account diverso non eredita le preferenze salvate per l'account precedente.

### 4.3 Storico Viaggi (Free: ultimi 7 giorni)
I viaggi continuano ad essere **registrati e mostrati in lista per tutti gli utenti**, Free compresi - nessun dato viene eliminato o nascosto. Per gli account Free/scaduti, le sole righe più vecchie di 7 giorni diventano non cliccabili, senza la riga statistiche, con un piccolo badge "PREMIUM" al posto della freccia di espansione. Il conto rientra automaticamente non appena l'abbonamento torna attivo, senza bisogno di alcuna azione lato server.

### 4.4 Esportazione GPX (base vs completa)
Il file GPX generato localmente (`TrackingService.buildGpx()`) include per ogni punto traccia dei tag `<extensions>` custom (`jd:energyFlow`, `jd:batteryPct`, `jd:fuelPct`, `jd:driveMode`, `jd:speedKmh`, `jd:instConsumption`, `jd:regenLevel`). L'esportazione manuale su USB **rimuove questi tag per gli account Free/scaduti**, lasciando un GPX 1.1 standard valido (lat/lon/quota/orario invariati) - i Premium ricevono il file completo, invariato.

### 4.5 Avviso Scadenza Imminente (10 giorni)
Nuovo popup overlay locale (funziona anche con l'app in background, stesso meccanismo dei popup rigenerazione/rifornimento) quando un abbonamento **attivo** scade entro 10 giorni. Due pulsanti: **OK** (richiude solo per ora, ricompare al prossimo controllo) e **Non ricordare più** (silenzia solo per quella specifica `expiresAt` - un rinnovo con nuova data la rende di nuovo eleggibile, invece di restare silenziata per sempre). Calcolato interamente lato client dal campo `expiresAt` già fornito da `/owner` e `/heartbeat` - nessuna nuova logica server, complementare (non sostitutivo) al cron email `SUBSCRIPTION_EXPIRING` già esistente lato server (§6).

### 4.6 Limite noto: enforcement solo lato client
I punti 4.3 e 4.4 sono applicati **esclusivamente nel codice dell'app Android**, su dati che il dispositivo ha comunque in locale (i viaggi più vecchi di 7 giorni e il GPX completo restano nel DB SQLite/filesystem del dispositivo indipendentemente dall'abbonamento) - un client modificato o l'accesso diretto ai file del dispositivo potrebbe aggirare entrambi i limiti. Le uniche restrizioni davvero non aggirabili restano quelle già server-side elencate in cima alla tabella §1 (upload viaggio, claim del pairing) - un vincolo più forte su storico/export richiederebbe una policy di retention/cifratura sul dispositivo, esplicitamente fuori scope per questo giro.

### 4.7 Bugfix dal campo (2026-08-05)
Due problemi segnalati dopo un giro di test reale, entrambi corretti lo stesso giorno:
- **Km/litri raddoppiati**: una chiusura forzata dell'app mentre `TrackingService` era già attivo in background ha fatto coesistere due istanze del servizio per un'intera giornata, ciascuna sottoscritta per conto proprio al bus veicolo e ciascuna che sommava lo stesso identico dato reale nello stesso accumulatore condiviso (`TripConsumption`) - confermato confrontando il GPX del viaggio (distanza reale calcolata dai punti) con quanto registrato dal bus veicolo, quasi esattamente doppio. Risolto con un lock di sistema (`java.nio.FileLock`) che garantisce una sola istanza viva alla volta, indipendentemente da quale dei tre punti di avvio del servizio (boot, accessibility anchor, apertura app) ci riesca per primo - le istanze in eccesso si fermano subito da sole. Dettaglio tecnico completo in `ANDROID_SUBSCRIPTION_HANDSHAKE.md` §4.4.
- **Stato abbonamento non live ad app aperta**: un cambio fatto dal pannello Admin (upgrade/downgrade, data di scadenza, attivazione/disattivazione) non si rifletteva nell'app finché non veniva chiusa e riaperta, perché il controllo verso il server partiva solo all'apertura di Impostazioni. Aggiunto un controllo automatico ogni 5 minuti più un pulsante di refresh manuale (icona freccia circolare) nella card CLOUD - entrambi aggiornano badge abbonamento, sezione Popup/barra di stato e Storico viaggi nello stesso momento. Dettaglio tecnico in `ANDROID_SUBSCRIPTION_HANDSHAKE.md` §4.5.

---

## 🖥️ 5. Pannello Amministratore & UX WebApp

L'interfaccia utente ed il pannello Admin implementano:

1. **Layout Widescreen Responsivo**:
   - Container espanso su monitor desktop (`max-w-7xl`).
   - Sezione Impostazioni/Profilo organizzata su griglia a 2 colonne.
2. **Menu Profilo & Modali Solidi al 100%**:
   - Menu a comparsa dell'Avatar e finestra modale dell'Admin con sfondo solido opaco (`bg-[#14161a]`) per prevenire trasparenze o sovrapposizioni di testo.
3. **Selezione Rapida Scadenze & Lifetime**:
   - Modale abbonamento con pulsanti rapidi `+1m`, `+3m`, `+1y` ed il tasto **`∞ A Vita`** (`expiresAt: null`).
4. **Contatore Reale Auto nel Garage**:
   - Lettura diretta dei veicoli reali salvati nel database PostgreSQL (`prisma.vehicle.count({ where: { userId } })`) per garantire il conteggio accurato sia di auto pregresse che di nuovi pairing.
5. **Schede Pannello Admin**:
   - `Utenti & Abbonamenti`: Ricerca, modifica ruoli, concessione/estensione abbonamento e cambi extra.
   - `Codici Sconto`: Generazione, filtro per indirizzo email e cancellazione.
   - `Statistiche Sistema`: Metric cards di sintesi (Utenti totali, Abbonamenti attivi, Dispositivi, Viaggi registrati).
   - `✉️ Test Email`: Tab dedicato all'invio e test dei template email.

---

## 📧 6. Email Transazionali HTML & Resend

Sistema di notifiche via email integrato con il servizio **Resend** e fallback automatico in console per lo sviluppo locale.

### Configurazione Ambiente:
- `RESEND_API_KEY`: API Key ottenuta da Resend (`re_...`).
- `FROM_EMAIL`: Indirizzo mittente autorizzato (es. `JaeDrive <noreply@jaedrive.com>`).

### 8 Template HTML Multilingua (IT 🇮🇹 / EN 🇬🇧):
1. **`SUBSCRIPTION_ACTIVATED`**: Inviata all'attivazione del piano Premium.
2. **`SUBSCRIPTION_RENEWED`**: Inviata alla proroga dell'abbonamento.
3. **`SUBSCRIPTION_EXPIRING`**: Avviso di scadenza imminente (inviato a **10 giorni** ed a **3 giorni** dalla data di fine).
4. **`SUBSCRIPTION_EXPIRED`**: Notifica di avvenuta scadenza dell'abbonamento.
5. **`PAIRING_NEW_VEHICLE`**: Notifica di associazione di un nuovo veicolo (con Nome Veicolo e VIN).
6. **`VEHICLE_DELETED`**: Notifica di rimozione di un'auto dal garage.
7. **`ACCOUNT_DELETED`**: Notifica di conferma cancellazione account e pulizia dati.
8. **`DISCOUNT_CODE_ASSIGNED`**: Inviata alla generazione di un codice sconto riservato.

### Automazione & Test:
- **Notifier Cron (`subscriptionNotifier.ts`)**: Eseguito ogni 6 ore per controllare gli abbonamenti in scadenza o scaduti.
- **Tab Admin `✉️ Test Email`**: Consente agli Amministratori di inviare qualsiasi template ad un'email a scelta per verificarne la resa grafica e le traduzioni.

---

## 🗄️ 7. Struttura Tabelle Database Prisma (`schema.prisma`)

```prisma
model User {
  id                    String            @id @default(uuid())
  email                 String?           @unique
  role                  String            @default("USER") // USER | ADMIN
  subscriptionStatus    String            @default("FREE") // FREE | PREMIUM
  subscriptionTier      String            @default("STANDARD") // STANDARD | GARAGE
  subscriptionExpiresAt DateTime?
  extraDeviceSwaps      Int               @default(0)
  vehicles              Vehicle[]
  deviceHistories       DeviceHistory[]
  subscriptionLogs      SubscriptionLog[]
}

model DiscountCode {
  id            String   @id @default(uuid())
  code          String   @unique
  discountType  String   // FREE_DAYS | PERCENT | FIXED_AMOUNT
  value         Float
  maxUses       Int?
  usedCount     Int      @default(0)
  expiresAt     DateTime?
  isGlobal      Boolean  @default(false)
  assignedEmail String?
  createdAt     DateTime @default(now())
}

model DiscountCodeRedemption {
  id             String       @id @default(uuid())
  discountCodeId String
  userId         String
  createdAt      DateTime     @default(now())
  discountCode   DiscountCode @relation(fields: [discountCodeId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([discountCodeId, userId])
}
```
