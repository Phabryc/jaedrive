# JaeDrive — Architettura Commerciale e Tecnica (Guida per Agenti e Sviluppatori)

Questo documento costituisce la specifica tecnica e commerciale di riferimento per la piattaforma **JaeDrive** (App Android Headunit + Cloud WebApp). Tutti gli agenti AI e gli sviluppatori che lavorano su questo repository devono attenersi alle definizioni qui descritte.

---

## 1. VISIONE E DESCRIZIONE COMMERCIALE

### 1.1 Il Modello "Local-First Free / Cloud-Only Premium"
Per azzerare i costi d'infrastruttura generati da utenti non paganti (database, storage GPX, reverse geocoding, banda), la piattaforma adotta una rigida suddivisione:
- **Free**: L'App Android sull'Headunit dell'auto funziona al 100% come cruscotto diagnostico locale e registratore offline (storico max 7 giorni locale, export GPX standard senza estensioni telemetriche). **Nessun dato viene inviato al Cloud** e l'utente non può accedere alla WebApp. Costo server per JaeDrive: **0,00 €**.
- **Premium**: Sblocca la sincronizzazione automatica Cloud, l'accesso alla WebApp (`jaedrive.com`), le mappe interattive con telemetria sincrona, lo storico illimitato, le analisi energetiche/finanziarie e l'export GPX avanzato.

### 1.2 Piani di Abbonamento

| Caratteristica | 🟢 FREE | 👑 PREMIUM STANDARD | 🏎️ PREMIUM GARAGE |
| :--- | :--- | :--- | :--- |
| **Prezzo Indicativo** | 0,00 € | 2,99 €/mese o 24,99 €/anno | 4,99 €/mese o 39,99 €/anno |
| **Accesso WebApp Cloud** | ❌ Disattivato | ✅ Completo | ✅ Completo |
| **Posti Garage (Headunit Contemporanee)** | 0 | **1 Headunit** | **Fino a 3 Headunit** |
| **Cambi Headunit Distinte all'Anno** | 0 | **2 cambi / 365 giorni** | **5 cambi / 365 giorni** |
| **Storico Viaggi** | 7 giorni (locale) | Illimitato (Cloud) | Illimitato (Cloud) |
| **Export GPX** | Solo standard (no SOC/Power) | Completo di estensioni | Completo di estensioni |

### 1.3 Gestione Manuale dei Pagamenti (Fase Iniziale)
Finché non saranno attivi gateway di pagamento automatici (Stripe/In-App Purchases), le iscrizioni avvengono autonomamente tramite **Firebase Auth**, ma la sincronizzazione rimane bloccata finché l'Amministratore non attiva **manualmente** il piano Premium dal Pannello Admin al ricevimento del pagamento (PayPal, Bonifico, Satispay).

---

## 2. ARCHITETTURA E SPECIFICHE TECNICHE

### 2.1 Riconoscimento Ruoli e Utenti Admin (RBAC)
- **Bootstrap Admin (`ADMIN_EMAILS`)**: Nel file `.env` del server (`cloud/server/.env`) è presente la variabile `ADMIN_EMAILS="email1@domain.com,email2@domain.com"`.
- **Propagazione Ruolo**: All'autenticazione del token Firebase (`requireUser.ts`), se l'email coincide con una in `ADMIN_EMAILS`, il campo `role` nella tabella Postgres `users` viene impostato ad `"ADMIN"`.
- **Middleware Protezione API (`requireAdmin.ts`)**: Tutti gli endpoint `/api/admin/*` richiedono `req.authUser.role === 'ADMIN'`, restituendo `403 Forbidden` per utenti standard.

### 2.2 Schema Database Prisma (`cloud/server/prisma/schema.prisma`)
I campi e modelli chiave aggiunti per la monetizzazione:

```prisma
model User {
  id                    String    @id @default(uuid())
  firebaseUid           String    @unique @map("firebase_uid")
  email                 String?
  role                  String    @default("USER") // "USER" | "ADMIN"
  subscriptionStatus    String    @default("FREE") // "FREE" | "PREMIUM"
  subscriptionTier      String    @default("STANDARD") // "STANDARD" | "GARAGE"
  subscriptionExpiresAt DateTime? @map("subscription_expires_at")
  extraDeviceSwaps      Int       @default(0) @map("extra_device_swaps")
  // ... relazioni con Vehicle, PairingRequest, ecc.
}

model DeviceHistory {
  id            String   @id @default(uuid())
  userId        String   @map("user_id")
  headunitId    String   @map("headunit_id")
  firstPairedAt DateTime @default(now()) @map("first_paired_at")
  lastPairedAt  DateTime @default(now()) @map("last_paired_at")
  isActive      Boolean  @default(true) @map("is_active")

  @@unique([userId, headunitId])
}

model DiscountCode {
  id            String    @id @default(uuid())
  code          String    @unique
  discountType  String    @map("discount_type") // "PERCENT" | "FIXED_AMOUNT" | "FREE_DAYS"
  value         Float
  maxUses       Int?      @map("max_uses")
  usedCount     Int       @default(0) @map("used_count")
  expiresAt     DateTime? @map("expires_at")
  isGlobal      Boolean   @default(true) @map("is_global")
  assignedEmail String?   @map("assigned_email")
  createdAt     DateTime  @default(now()) @map("created_at")
}
```

### 2.3 Algoritmo Conteggio Cambi Headunit (365 Giorni Sliding Window)
1. Quando l'utente richiede il pairing (`POST /api/pairing/claim`), il backend estrae il `headunitId` inviato dal dispositivo.
2. Controlla `DeviceHistory`:
   - Se l'Headunit ID è **già associato** a quell'utente nel suo storico (anche se disattivato), viene riattivato a **costo zero** (quote consumate = 0).
   - Se l'Headunit ID è **NUOVO**, il backend conta quanti `headunitId` distinti sono stati registrati dall'utente negli ultimi 365 giorni.
   - Se `distinctCount >= maxAllowedSwaps` (dove `maxAllowedSwaps` = 2 per Standard, 5 per Garage + `extraDeviceSwaps`), la richiesta viene rifiutata con `403 SWAP_LIMIT_EXCEEDED`.

### 2.4 Integrazione Resend per Email Transazionali (`cloud/server/src/lib/email.ts`)
- Utilizza la libreria SDK `resend` con la chiave `RESEND_API_KEY`.
- Se la chiave API non è configurata, il sistema esegue un fallback di logging senza interrompere le operazioni.
- Email inviate:
  1. **Conferma Attivazione/Rinnovo Premium**: inviata automaticamente quando l'Admin attiva o proroga un abbonamento.
  2. **Invio Codice Sconto Personalizzato**: inviata all'utente quando viene creato un codice *ad personam*.

---

## 3. RIEPILOGO ENDPOINT API DEGLI ADMIN

| Metodo | Endpoint | Descrizione |
| :--- | :--- | :--- |
| `GET` | `/api/admin/users` | Elenco utenti con ricerca e filtro per stato abbonamento |
| `POST` | `/api/admin/users/:userId/subscription` | Attivazione/Proroga manuale abbonamento Premium |
| `POST` | `/api/admin/users/:userId/extra-swaps` | Concessione cambi Headunit straordinari |
| `PATCH` | `/api/admin/users/:userId/role` | Promozione/Revoca ruolo Admin |
| `GET` | `/api/admin/discount-codes` | Lista codici sconto globali e ad personam |
| `POST` | `/api/admin/discount-codes` | Creazione nuovo codice sconto |
| `DELETE` | `/api/admin/discount-codes/:id` | Eliminazione/Disattivazione codice sconto |
| `GET` | `/api/admin/stats` | Statistiche piattaforma (utenti, abbonamenti attivi, viaggi) |
