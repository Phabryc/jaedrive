# JaeDrive Freemium Strategy

Cross-cutting reference for the Free/Premium model: what each tier gets, and where each
restriction is actually enforced (cloud API, web app, or the Android head-unit client). This
file didn't exist before 2026-08-05 - created now to track the Android-side decisions made
this session, alongside a factual summary of the cloud/web side already in the codebase. Keep
it updated as either side changes; don't let it drift from the code like a stale design doc.

---

## 1. Subscription model (source of truth: `cloud/server/prisma/schema.prisma`)

- **Status**: `FREE` (default) or `PREMIUM`, plus `subscriptionExpiresAt` (nullable). A
  subscription counts as *active* when `status == PREMIUM && (expiresAt == null || expiresAt >
  now)` - this `isActive` boolean is computed server-side and handed to every client (device
  and web) instead of being recomputed independently in multiple places.
- **Tiers**: `STANDARD` (1 active vehicle, 2 headunit swaps/365 days) and `GARAGE` (3 vehicles,
  5 swaps/365 days), plus a per-user `extraDeviceSwaps` grant an admin can add on top (see
  `POST /api/admin/users/:userId/extra-swaps`).
- **Admin control**: `cloud/server/src/routes/admin.ts` - set a user's status/tier/expiresAt,
  grant extra swaps, generate/list/delete single-use discount codes, view aggregate stats.
  Changing a subscription triggers a Resend email (see `admin.ts` around the `/subscription`
  route).
- **Self-service**: `POST /api/user/redeem-discount-code` lets a signed-in user redeem a code
  themselves (one redemption per user, enforced server-side).

## 2. Where each restriction actually lives

| Restriction | Enforced in | Notes |
|---|---|---|
| Trip upload from device | `POST /api/device/trips` (server) | Hard `403 SUBSCRIPTION_REQUIRED` if not active - real enforcement, can't be bypassed by the device. |
| Claiming a pairing code (linking a car) | `POST /api/user/redeem...`/pairing claim (server, `user.ts`) | Requires active Premium AND checks vehicle-count/headunit-swap limits for the tier before allowing the claim. |
| Background status bar overlay | Android (`StatusBarOverlay` + `TrackingService.refreshStatusBar()`) | Client-side gate on `subscription.isActive` - see §3. |
| Regen-level / refuel-detected popups | Android (`OverlayPopup`, Settings toggles) | Client-side gate - see §3. |
| Trip history older than 7 days | Android (Storico list, `MainActivity.buildTripRow()`) | Client-side only - see §3.3, known limitation in §4. |
| Full GPX (with telemetry extensions) on USB export | Android (`MainActivity.exportTripRecord()`) | Client-side only - see §3.4, known limitation in §4. |
| Subscription-expiring-soon reminder | Android (`SubscriptionExpiryNotifier`) | Purely local, computed from `expiresAt` already returned by the API - no server involvement. |

The first two rows are real, server-enforced restrictions (the device/browser has no way
around them). Everything below the line is Android deciding to restrict its *own* UI/export
based on a signal (`subscription.isActive`) the server already provides for other reasons -
see §4 for why that's a softer guarantee.

## 3. Android-side implementation (this session, 2026-08-04/05)

Full technical detail (classes, methods, exact gating logic) is in
`cloud/ANDROID_SUBSCRIPTION_HANDSHAKE.md` §4 - this is the condensed decision log.

### 3.1 Sync behavior
- `heartbeat()` was dead code (never called, response discarded) - now drives the whole
  local subscription snapshot (`Prefs`), checked once per drive session minimum (`TrackingService.
  onCreate()`) and after every trip close.
- A `403`/inactive subscription now pauses sync cleanly (`Result.success()`, no retry) instead
  of retrying forever with exponential backoff - the old behavior would have hammered the
  server indefinitely for every Free user with queued trips.

### 3.2 Premium-only features (decided this session, not in the original handshake doc)
Three background features were made Premium-exclusive, gated purely on `subscription.
isActive` with no server changes:
1. Background status bar overlay.
2. Regen-level popup.
3. Refuel-detected popup.

All three Settings switches force themselves off the moment the subscription snapshot reports
inactive (single write-point: `Prefs.setSubscriptionSnapshot()`). The status bar switch stays
user-togglable (reactivates itself once Premium is active again); the two popup switches sit
in a section that's fully grayed out/disabled with a "PREMIUM" badge while inactive - a
deliberately stricter treatment, since they're visually grouped under one section header.

### 3.3 Trip history window (Free: last 7 days only)
Free/expired accounts keep recording and listing every trip as before - nothing is deleted or
hidden from the list. Trips older than 7 days just become inert in the UI: not clickable, no
stats row, a small "PREMIUM" badge instead of the expand arrow. Premium removes the window
entirely (no server round-trip needed to decide this, it's a local timestamp comparison).

### 3.4 GPX export tiering
The on-device GPX writer (`TrackingService.buildGpx()`) already embeds custom `jd:*` extension
tags per track point (energy flow bucket, battery %, fuel %, drive mode, speed, instant
consumption, regen level) for JaeDrive's own re-import/coloring. USB export now strips those
extensions for Free/expired accounts, leaving a plain, standard-compliant GPX 1.1 track
(lat/lon/ele/time only). Premium exports the file untouched.

### 3.5 Expiry reminder
New: an overlay popup (works with the app backgrounded) when an active subscription is within
10 days of `expiresAt`. "OK" dismisses until the next check; "Don't remind me again" is scoped
to that exact `expiresAt` value, so it stops re-silencing itself after a renewal changes the
date.

## 4. Known limitation: soft (client-side) vs hard (server-side) enforcement

§3.3 and §3.4 are enforced only in the Android app's own code, on data the device already has
locally (the 7-day-old trips and the full GPX are still sitting in the local SQLite DB /
filesystem regardless of subscription state) - a modified client or someone with direct device/
file access could bypass both. This is an accepted trade-off, not an oversight: this device
client is upload-only (it never reads trips back down from the server), so there's no
symmetric server-side check to add for parity, and encrypting/purging local data past the
free window was explicitly treated as out of scope for this round. If this ever needs to be a
hard guarantee rather than a soft default, that's a bigger change (on-device retention/
encryption policy), not a quick follow-up.

The two truly hard restrictions remain the ones enforced server-side (§2, top two rows):
trip upload and pairing/claiming a car both require an active subscription checked by the API
itself, independent of what the device client does or doesn't enforce on its own UI.

## 5. Open questions for the cloud/web side (not decided here)

- Does the web app (`jaedrive.com`) itself restrict anything for Free accounts once a car is
  already linked (e.g. viewing historical trips/maps/stats beyond some window), or is Free
  effectively "view whatever was already synced while Premium was active, forever"? Not
  addressed by the Android work in this document - whoever owns the web app should confirm and
  add a section here.
- Pricing/plan copy, checkout flow, and how a user actually *becomes* Premium (Stripe or
  manual/admin-granted only?) aren't covered here either - this file only tracks feature
  gating, not commercial mechanics.
