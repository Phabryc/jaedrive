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
  `Prefs.isSubscriptionActive()`. As of 2026-08-05 its Settings switch is treated identically to
  the two Popup switches below (see next bullet) - force-disabled and grayed out together, one
  shared "PREMIUM" badge on the section header. (Originally this switch stayed user-togglable
  with its own inline badge and a toast when tapped while Free - flagged as visually
  inconsistent and unified with the rest of the section.)
- **Regen-level popup + refuel-detected popup** (Settings "Popups" section): all three switches
  in this section (status bar included, see above) are force-disabled and the whole section is
  grayed out (50% alpha, non-interactive), with a single "PREMIUM" badge on the section header
  when not active.
- **User configuration is preserved across an expiry/reactivation cycle** (2026-08-05, explicit
  user request): forcing the three switches to `false` used to overwrite the user's actual
  choice permanently - reactivating a subscription always left all three off regardless of what
  the user had configured before it expired. `Prefs.setSubscriptionSnapshot()` now backs up the
  current value of all three switches (`*_BACKUP` keys) the first time it sees `isActive=false`
  for a given expiry (guarded by `SharedPreferences.contains()`, so repeated heartbeats/refreshes
  while still inactive don't keep overwriting the backup with the already-zeroed live values),
  then restores and clears that backup the next time it sees `isActive=true`. The backup is also
  cleared on unpairing (`clearCloudPairing()`), so a later pairing to a different account never
  inherits another account's saved preferences.
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

### 4.4 Bugfix (2026-08-05): duplicate `TrackingService` instance doubling km/liters
Field-tested on 2026-08-05: a force-close of the app followed by reopening it while
`TrackingService` was already alive in the background left **two** service instances running
concurrently in the same process for the rest of the day (confirmed by every single log line -
`GEAR_SELECTION`, `ID_TRIP`/`SUM_FUEL` reads, trip open/close - appearing exactly twice with
identical timestamps). Both instances independently subscribed to the vehicle bus and both fed
the same real delta into the same shared `TripConsumption` accumulator (`SharedPreferences`),
so every km and every liter got counted twice - confirmed against the GPX track's own
haversine-computed distance, which matched the real trip length exactly while the vehicle-bus
figure was ~2x too high. Three independent call sites can start this service (`BootReceiver`,
`JaeDriveAccessibilityService.onServiceConnected()`, `MainActivity.onCreate()`) with no guard
against an already-running instance.

Fixed with a `java.nio.FileLock` on a dedicated file in `getFilesDir()`, acquired as the first
thing in `onCreate()` (right after `startForeground()`, which must still run unconditionally to
satisfy the `startForegroundService()` contract even for a losing instance). The lock is
exclusive for the whole JVM/process - a second `FileChannel.tryLock()` from the same process
throws `OverlappingFileLockException` rather than silently succeeding, and from a different
process the OS-level `flock()` correctly serializes it too - so it catches both a same-process
double `onCreate()` and any genuine cross-process duplicate. Any instance that loses the race
logs it and calls `stopSelf()` immediately, before touching the vehicle bus or `TripConsumption`
at all. The lock needs no manual cleanup on crash: file locks are released by the OS when the
holding process dies.

### 4.5 Subscription status: periodic + on-demand refresh (2026-08-05)
Field-tested gap: changing the subscription server-side (via the admin panel) while the app was
already open and in the foreground never showed up in the app until it was force-closed and
reopened - `fetchOwnerProfile()` (the only call that hits `/owner` for a fresh value) used to run
exactly once, in `onCreate()`; `onResume()` only re-rendered the last cached `Prefs` snapshot,
never asked the server again. Fixed two ways, both calling the same `fetchOwnerProfile()`:
- **Automatic**: a 5-minute repeating `Handler` (`subscriptionRefreshRunnable`), started in
  `onCreate()` alongside the existing trip-consumption refresh loop and stopped in `onDestroy()`.
- **On-demand**: a refresh icon button in the CLOUD card (`btn_cloud_refresh`, visible only when
  paired), spinning continuously while the request is in flight and calling
  `fetchOwnerProfile(Runnable onDone)` - the same method, now with an optional completion
  callback so the icon reliably stops spinning on both success and failure.

Either path re-renders the subscription badge, the premium-gated switches/section (§4.2), and -
new in this fix - the Storico trip list if it's currently on screen (the 7-day lock in §4.3
depends on the same `isSubscriptionActive()` value, so a stale list could keep showing rows as
locked/unlocked past their real state otherwise).

### 4.6 Bugfix (2026-08-05): premium features stayed usable forever after unpairing
Field-tested exploit reported by the user: pair once with any subscription, turn the 3 premium
switches on, unpair - and the regen-popup/refuel-popup kept firing indefinitely, with zero active
subscription, forever (repeatable: pair/enable/unpair in a loop = free premium). Root cause:
`Prefs.clearCloudPairing()` only ever removed the subscription-status keys - it never reset
`KEY_STATUS_BAR_ENABLED`/`KEY_REGEN_POPUP_ENABLED`/`KEY_REFUEL_POPUP_ENABLED` back to `false`
the way `setSubscriptionSnapshot(..., isActive=false)` does (§4.2), and the regen/refuel popup
triggers in `TrackingService` only ever checked the switch itself, never `isSubscriptionActive()`
directly - so a switch left stuck at `true` had nothing else stopping it.

Investigating this surfaced a second, deeper bug behind it: if the vehicle is unpaired from the
**website** (not the app's own "unlink" button), the only network call that runs regularly while
the app is open and idle - `MainActivity.fetchOwnerProfile()`, every 5 minutes (§4.5) - silently
swallowed the resulting `409 "Device is not paired to a vehicle"` in a blanket `catch (Exception)`.
`SyncWorker` already handled this same 409 correctly on both its heartbeat and trip-upload calls
(clearing local pairing via `Prefs.clearCloudPairingRemotely()`), but `SyncWorker` only runs after
a trip closes - so in practice, idle-but-open, `fetchOwnerProfile()` was the one path that mattered
and it did nothing, leaving the stale local token/subscription snapshot (and thus
`isSubscriptionActive()`) valid indefinitely, with no user-facing warning at all.

Fixed on three levels:
- `Prefs.clearCloudPairing()` now always forces the 3 switches to `false` - deliberately with
  **no** backup/restore (unlike §4.2's temporary-expiry case): unpairing is a hard reset, not a
  suspension, so nothing is preserved that a future pair/unpair cycle could exploit again.
- The regen-popup and refuel-popup trigger conditions in `TrackingService` now also check
  `Prefs.isSubscriptionActive()` directly at the moment they're about to fire, not just the
  switch - defense in depth, matching what the status bar already did (the one of the 3 that
  was never exploitable, precisely because of this live re-check).
- `fetchOwnerProfile()` now catches `CloudApiClient.ApiException` and, on `httpCode == 409`, calls
  `Prefs.clearCloudPairingRemotely()` and immediately refreshes the CLOUD card, premium switches,
  and Storico list, then shows the pre-existing (but until now unreachable from this path)
  "unpaired remotely" warning dialog - the same one `SyncWorker`'s 409 handling already wired up
  via `Prefs.consumeCloudUnpairedRemotelyFlag()`, just never triggered from here before.
