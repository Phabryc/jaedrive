# JaeDrive Android Headunit - Subscription & Sync Integration Guide

This document outlines the API contracts, response payloads, and data flow for the Android Headunit App to sync trip data and display Cloud subscription status (FREE vs PREMIUM, Tier, Expiration Date).

---

## 1. Overview of Subscription Tiers & Behavior

The JaeDrive Cloud supports two subscription statuses and two tiers:

- **Status**:
  - `FREE`: Cloud features disabled. Trip sync will return `403 SUBSCRIPTION_REQUIRED`.
  - `PREMIUM`: Active subscription with full cloud sync enabled.
- **Tiers**:
  - `STANDARD`: Allows 1 active vehicle in garage, max 2 distinct Headunit swaps per 365 days.
  - `GARAGE`: Allows 3 active vehicles in garage, max 5 distinct Headunit swaps per 365 days.

---

## 2. API Endpoints & Response Contracts for Android App

### A. Device Owner Info: `GET /api/device/owner`
**Headers**: `Authorization: Bearer <deviceToken>`

**Response Payload (`200 OK`)**:
```json
{
  "firstName": "Mario",
  "lastName": "Rossi",
  "email": "mario.rossi@example.com",
  "photoUrl": "https://lh3.googleusercontent.com/a/...",
  "subscription": {
    "status": "PREMIUM",
    "tier": "STANDARD",
    "expiresAt": "2027-08-04T22:30:00.000Z",
    "isActive": true
  }
}
```

If the account is on the `FREE` tier, `subscription` will return:
```json
{
  "firstName": "Mario",
  "lastName": "Rossi",
  "email": "mario.rossi@example.com",
  "photoUrl": null,
  "subscription": {
    "status": "FREE",
    "tier": "STANDARD",
    "expiresAt": null,
    "isActive": false
  }
}
```

---

### B. Device Heartbeat & Sync Check: `POST /api/device/heartbeat`
**Headers**: `Authorization: Bearer <deviceToken>`

**Response Payload (`200 OK`)**:
```json
{
  "ok": true,
  "subscription": {
    "status": "PREMIUM",
    "tier": "GARAGE",
    "expiresAt": "2027-12-31T23:59:59.000Z",
    "isActive": true
  }
}
```

---

### C. Trip Sync / Upload: `POST /api/device/trips`
**Headers**: `Authorization: Bearer <deviceToken>`

**Success (`200 OK`)**:
```json
{
  "tripId": "c0a80101-0000-0000-0000-000000000001"
}
```

**Subscription Expired or Required Error (`403 Forbidden`)**:
```json
{
  "error": "SUBSCRIPTION_REQUIRED"
}
```

> **Android Action on 403 `SUBSCRIPTION_REQUIRED`**:
> 1. Mark local sync status as "Paused / Subscription Required".
> 2. Display a banner in the app: *"Cloud Sync Paused - Active Premium Subscription Required. Manage subscription or redeem promo code at jaedrive.com/settings"*.
> 3. Retry when `heartbeat` or `owner` indicates `subscription.isActive === true`.

---

## 3. Recommended Android Implementation Flow (original proposal - see §4 for what was actually built)

### 1. Data Model (Kotlin Data Classes)
```kotlin
data class SubscriptionInfo(
    val status: String,      // "FREE" or "PREMIUM"
    val tier: String,        // "STANDARD" or "GARAGE"
    val expiresAt: String?,  // ISO 8601 string or null
    val isActive: Boolean    // Convenience flag (status == "PREMIUM" && not expired)
)

data class DeviceOwnerResponse(
    val firstName: String?,
    val lastName: String?,
    val email: String?,
    val photoUrl: String?,
    val subscription: SubscriptionInfo?
)

data class HeartbeatResponse(
    val ok: Boolean,
    val subscription: SubscriptionInfo?
)
```

### 2. UI Updates in Android Settings ("CLOUD" Card)
In the Android app's Settings screen:
- **Connected Account**: Show `firstName`, `lastName`, `email`, and `photoUrl`.
- **Subscription Badge**:
  - `PREMIUM STANDARD`: Green badge, show expiration date formatted in local format (`dd/MM/yyyy`).
  - `PREMIUM GARAGE`: Emerald badge with 3-car garage icon.
  - `FREE`: Orange/Gray badge *"Free Plan (Cloud Sync Inactive)"*.
- **Action Button**: Provide a QR Code or link to `https://jaedrive.com/settings` to renew or enter promo codes.

---

## 4. Actual Android Implementation (2026-08-04/05)

The app's codebase is Java (not Kotlin) - the flow above was adapted to that, and the Android
side ended up making product decisions beyond what this doc originally specified (new premium
feature gates, not just sync/UI). This section is the source of truth for what actually ships;
§3 above is kept only as the original proposal for context. Full rationale/business framing
lives in `cloud/FREEMIUM_STRATEGY.md`.

### 4.1 Sync & subscription plumbing
- `CloudApiClient.SubscriptionInfo` (plain class, not a Kotlin data class) mirrors the JSON
  `subscription` object 1:1. `heartbeat()` used to discard the response entirely (dead code,
  never even called) - it now returns the parsed `SubscriptionInfo`, and `getOwnerProfile()`'s
  `OwnerProfile` gained a `subscription` field.
- `SyncWorker.doWork()` calls `heartbeat()` **before** attempting any trip upload (previously
  heartbeat was never invoked anywhere). If `!isActive`, it stops immediately without
  retrying - a `403` used to fall into the generic error branch and retry forever with growing
  backoff; now both the heartbeat path and a `403` mid-upload-loop mark `Prefs` sync as
  "paused" and return `Result.success()` (no error, just idle until the next check).
- `SyncScheduler.enqueueSync()` (already existed, triggered after every trip close) is also
  called once at `TrackingService.onCreate()` - this is what gives the heartbeat/subscription
  check at least one run per drive session even if no trip closes during it.
- `Prefs.setSubscriptionSnapshot(status, tier, expiresAt, isActive)` is the single write-point
  used by both `SyncWorker` (background) and `MainActivity.fetchOwnerProfile()` (Settings
  open) - whichever runs last wins. **It also force-disables the three Premium-gated feature
  toggles (see §4.2) whenever `isActive` is false**, so they can never appear "on" while the
  underlying feature is blocked elsewhere.
- Local subscription snapshot defaults to `FREE`/inactive until the first successful
  heartbeat/owner call in a given install (fail-closed).

### 4.2 New Premium feature gates (not part of the original spec)
Requested after the initial handshake, layered on top of the same `subscription.isActive`
signal - **no new server endpoints needed**, all client-side gating on data the device
already has:

- **Background status bar overlay** (`StatusBarOverlay`): only shown if
  `Prefs.isSubscriptionActive()`. The Settings switch stays user-togglable (it turns itself
  back on automatically once Premium is active) and shows a "PREMIUM" badge; toggling it on
  while Free shows an explanatory toast instead of silently doing nothing.
- **Regen-level popup + refuel-detected popup** (Settings "Popups" section): both switches are
  force-disabled and the whole section is grayed out (50% alpha, non-interactive) with its own
  "PREMIUM" badge on the section header when not active - a stricter treatment than the status
  bar row, since these two are visually grouped under one section title.
- **Trip history window (Storico)**: Free/expired accounts can only interact with trips from
  the last 7 days. Older trips are still recorded and still listed (nothing is hidden from the
  list, nothing is deleted) but the row becomes non-clickable, its stats line is hidden, and a
  small "PREMIUM" badge replaces the expand chevron.
- **GPX export**: manual USB export (`MainActivity.exportTripRecord()`) still works for
  everyone, but Free/expired accounts get the `<extensions>` blocks (the `jd:*` energyFlow/
  batteryPct/fuelPct/driveMode/speedKmh/instConsumption/regenLevel data - see
  `TrackingService.buildGpx()`) stripped out before writing to USB. The file is still a valid
  GPX 1.1 track (lat/lon/ele/time intact); Premium gets the full file untouched.
- **Expiry warning popup** (`SubscriptionExpiryNotifier`, new class): when an active
  subscription has `expiresAt` within 10 days, shows an overlay popup (works even with the app
  in background, same mechanism as the refuel/regen popups) with **OK** / **Don't remind me
  again**. OK just dismisses for now (reappears at the next heartbeat/session); "Don't remind
  me again" is remembered *for that specific `expiresAt` value* - if the user renews (new
  `expiresAt`), the warning becomes eligible again instead of staying silenced forever. No new
  server field was needed - it's computed purely from the `expiresAt` already returned by
  `/owner` and `/heartbeat`.

### 4.3 Known limitation: these are client-side gates only
The 7-day history window and the GPX-extensions stripping are enforced **in the Android UI/
export code only** - the full data still exists in the device's local SQLite DB and on-disk GPX
files (a technically capable user with device/file access could bypass both). This mirrors how
this device client works today (it only ever pushes data up via `POST /trips`, never reads it
back down), so there is no server-side equivalent restriction to keep in sync. If stronger
enforcement is ever needed, the only options are DB-level encryption or not persisting the data
past the window locally, both explicitly out of scope for now - the trust boundary being relied
on here is "an unmodified app on an unmodified device", same as every other client-side
preference in this app.
