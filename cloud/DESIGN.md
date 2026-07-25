# JaeDrive Cloud — Technical Design Document

Status: design phase, no code written yet. This document is meant to be handed to a coding agent (or a human dev) to implement the **webapp + server** side of JaeDrive. It assumes the reader has zero prior context on the project beyond what's written here.

## 1. What this is

JaeDrive is an Android app running on the head unit of the author's Jaecoo 7 SHS-H (a plug-in hybrid), reading real vehicle signals (speed, gear, fuel, SOC, hybrid drive mode, energy flow) via a reverse-engineered vendor bus (Desay VDB), plus a GPS trip logger that writes GPX tracks with a custom per-point `<jd:energyFlow>` extension. It already works standalone, storing everything locally on the device (SQLite trip DB + GPX files on USB/internal storage).

This document specifies a **cloud companion**: a server that receives trip data uploaded from the car app, and a responsive web app where the user reviews trip history, maps, and statistics from any device. Everything here is new — the existing Android app is a separate codebase (`~/Desktop/Desktop/JaeDrive`) that will gain a thin sync client on top of what it already does, but is not the subject of this document.

### Explicitly out of scope for this doc
- The Android app's internal reverse-engineering work (VDB decoding, GPX generation) — already done, treat trip data as a given input.
- Reverse proxy / TLS: the target VPS already runs **nginx** for other sites. This stack does **not** include a reverse proxy — it exposes one internal port for the host's existing nginx to proxy_pass to.
- Real-time/live telemetry streaming while driving. V1 syncs only at trip-close (see §7). A live "car is driving now" view is a possible future iteration, not now.

## 2. Architecture overview

```
┌─────────────────┐        HTTPS (device token)        ┌─────────────────────────────┐
│  JaeDrive        │ ───────────────────────────────────▶│  api (Node/Fastify)         │
│  Android app     │  POST /api/device/trips             │  serves REST API            │
│  (car head unit) │  POST /api/device/pairing/start      │  + serves built SPA static  │
└─────────────────┘  GET  /api/device/pairing/status      │  files at all other paths   │
                                                            │                              │
┌─────────────────┐        HTTPS (Firebase ID token)      │  ┌────────────────────────┐  │
│  Web app (SPA)   │ ───────────────────────────────────▶│  │ Postgres               │  │
│  React + Vite    │  GET/POST /api/user/...              │  └────────────────────────┘  │
└─────────────────┘                                        └─────────────────────────────┘
                                                                      ▲
                                                                      │ existing host nginx
                                                                      │ proxy_pass 127.0.0.1:4300
                                                              (outside this Docker stack)
```

Two containers only: `api` and `postgres`. The `api` container serves both the JSON API and the built frontend static files (no separate frontend container, no reverse proxy inside the stack — one process, one exposed port, simplest possible integration with the existing nginx).

Auth is external (Firebase Authentication) — this service never stores passwords. See §5.

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend runtime | Node.js + TypeScript | Same language as the frontend — DTOs/types can be shared, one language across the whole stack for a solo dev iterating fast. |
| Backend framework | Fastify | Native JSON Schema validation (needed for the trip/GPX upload payloads), fast, small. |
| ORM | Prisma | Type-safe queries + migrations, low ceremony. |
| Database | PostgreSQL 16 | Relational, mature, trivial to run in Docker. |
| Auth | Firebase Authentication | Free tier with no realistic cap for this use case, email/password + Google/Apple login, offloads credential storage/legal liability off this project. |
| Frontend framework | React + Vite + TypeScript | Responsive SPA, fast dev loop. |
| Styling | Tailwind CSS + shadcn/ui | Utility-first responsive styling + accessible unstyled component primitives, easy to theme to the existing dark "Aetheris Automotive" look. |
| Charts | ECharts (`echarts-for-react`) | Built-in calendar-heatmap and gauge components map directly onto the stats we want (days-driven heatmap, %EV gauge); responsive on mobile out of the box. |
| Map | Leaflet + `react-leaflet` + OSM raster tiles | Mirrors what the Android app already does with osmdroid (same tile provider, no API key), simplest option for polyline + markers. |

## 4. Data model

```sql
-- Mirrors a Firebase-authenticated identity. This table is NOT the source of truth for
-- credentials — Firebase is. Row is created/updated lazily on first successful token verification.
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid    TEXT NOT NULL UNIQUE,
    email           TEXT,
    display_name    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at   TIMESTAMPTZ
);

-- One physical car, identified by VIN, owned by one user.
CREATE TABLE vehicles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vin             TEXT NOT NULL UNIQUE,
    nickname        TEXT NOT NULL DEFAULT 'La mia auto',
    model           TEXT,
    model_year      INT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One head-unit app install. A device belongs to at most one vehicle at a time.
-- Re-pairing the same VIN (reinstall, factory reset) re-links to the existing vehicle row.
CREATE TABLE devices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id          UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    device_token_hash   TEXT NOT NULL UNIQUE,   -- sha256 of the bearer token; raw token is never stored
    app_version         TEXT,
    last_seen_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Short-lived pairing session, "Netflix-style" code flow. See §7.
CREATE TABLE pairing_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT NOT NULL UNIQUE,          -- 8 alnum chars shown on the car screen
    vin             TEXT NOT NULL,
    device_hint     TEXT,                          -- app version / android id, cosmetic only
    status          TEXT NOT NULL DEFAULT 'pending', -- pending | claimed | expired
    device_id       UUID REFERENCES devices(id),
    expires_at      TIMESTAMPTZ NOT NULL,
    claimed_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trips (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id          UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    device_id           UUID REFERENCES devices(id),
    kind                TEXT NOT NULL,             -- 'auto' | 'manual_a' | 'manual_b'
    started_at          TIMESTAMPTZ NOT NULL,
    ended_at            TIMESTAMPTZ,
    label               TEXT,                       -- reverse-geocoded destination, or manual slot label snapshot
    km                  DOUBLE PRECISION,
    liters              DOUBLE PRECISION,
    avg_consumption     DOUBLE PRECISION,           -- km/l
    pct_ev              DOUBLE PRECISION,           -- energy-flow breakdown, 0-100, null if no GPX/energy data
    pct_series          DOUBLE PRECISION,
    pct_parallel        DOUBLE PRECISION,
    pct_other           DOUBLE PRECISION,
    gpx_raw             TEXT,                       -- full GPX file (with jd:energyFlow extensions), null for manual trips
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (vehicle_id, kind, started_at)           -- idempotency guard: safe to retry the same upload
);

CREATE INDEX idx_trips_vehicle_started ON trips (vehicle_id, started_at DESC);
```

Notes:
- `gpx_raw` stored directly as a Postgres column (`text`). A full trip GPX is a few tens of KB — no need for object storage (MinIO/S3) at this scale. Revisit only if storage genuinely grows into GBs.
- `trips.kind` intentionally mirrors the Android app's existing three trip types (auto gear-triggered, manual slot A, manual slot B).
- The `UNIQUE(vehicle_id, kind, started_at)` constraint is what makes retried uploads (from the Android WorkManager backoff, see §8) safe to fire more than once — insert becomes an upsert on conflict.

## 5. Authentication

**Firebase Authentication**, free tier, no expiry. Two completely separate auth schemes, distinguished by route prefix (never by trying to guess the token type):

- **`/api/user/*`** — web app routes. Client sends `Authorization: Bearer <firebase_id_token>` (obtained via the Firebase JS SDK after login). Server verifies it with `firebase-admin`'s `verifyIdToken()` on every request (short-lived token, ~1h, the client SDK refreshes it automatically — no server-side session needed). On first successful verification for a given `firebase_uid`, lazily create the `users` row.
- **`/api/device/*`** — car app routes. Client sends `Authorization: Bearer <device_token>`, a random 32-byte token minted at pairing time (§7), verified by looking up its sha256 hash in `devices.device_token_hash`. This has nothing to do with Firebase — the car app never talks to Firebase directly.

Frontend: use the Firebase JS SDK's prebuilt `FirebaseUI` or a simple custom email/password + "Sign in with Google" form — either is fine, this is not a design-sensitive area.

## 6. GDPR / privacy note

Offloading auth to Firebase does not remove this project's obligations for the *rest* of the data — GPS trip tracks are quite sensitive personal data (they reveal home/work addresses). Minimum viable compliance for v1:
- A short, honest privacy policy page (what's collected, why, who can see it — realistically just the account owner).
- `DELETE /api/user/vehicles/{id}` cascades to devices and trips (satisfies "right to erasure" for that vehicle's data).
- Don't log GPX contents or precise coordinates in application logs.

## 7. Pairing flow ("Netflix-style")

This is the OAuth 2.0 **Device Authorization Grant** pattern (RFC 8628 — the same flow Netflix/YouTube/Apple TV use), built directly rather than relying on a provider's implementation, so it works regardless of auth provider:

1. Car app reads the VIN (see §12 — **not yet confirmed reachable**, flagged as an open risk) and calls `POST /api/device/pairing/start { vin, appVersion }` (no auth required — this is the entry point).
2. Server generates an 8-character alnum code (excluding ambiguous chars `0/O/1/I`), creates a `pairing_requests` row with `status='pending'`, `expires_at = now() + 10 minutes`. Returns `{ pairingRequestId, code, expiresAt }`.
3. Car app displays the code full-screen and polls `GET /api/device/pairing/status/{pairingRequestId}` every 3–5s (no auth — the `pairingRequestId` itself, a UUID, is the bearer secret for this specific poll).
4. User, already logged into the web app on phone/PC, opens "Add vehicle" and enters the code. Web app calls `POST /api/user/pairing/claim { code }` (Firebase-authenticated).
5. Server validates the code is `pending` and not expired. Resolution by VIN:
   - VIN unseen before → create a new `vehicles` row owned by the calling user.
   - VIN already belongs to **this** user (reinstall / new head unit) → reuse the existing `vehicles` row.
   - VIN already belongs to **another** user → reject with a clear error (prevents account collision on a resold/shared car).
   - Creates (or reuses) a `devices` row, generates a fresh device token, stores its hash, marks the pairing request `claimed` with `device_id` set.
6. Car app's next poll to `/api/device/pairing/status/{pairingRequestId}` sees `status: claimed` and receives the plaintext device token **once** (never returned again). Stores it in `SharedPreferences`. All subsequent `/api/device/*` calls use this token.

Rate-limit `pairing/start` and `pairing/claim` per IP to prevent code brute-forcing (8-char alnum with a 10-minute window is already fairly strong, but cheap to add a max-attempts lockout per code too).

## 8. Android client responsibilities (contract only — implementation lives in the existing app)

The car app needs to know **when** to upload and **how to guarantee** eventual delivery even when offline at trip-close. This is the answer to "is there a system event for connectivity restored?":

- Yes, at the OS level it's `ConnectivityManager.NetworkCallback.onAvailable()` — but the recommended mechanism is one layer above: **`WorkManager`**, which is purpose-built for "run this when a network is available, retry with backoff, survive process death/reboot" and uses that callback internally.
- Design: on trip close, add a `pending_upload boolean` flag (new column) to the local `TripRecord`. Try an immediate upload if `NetUtils.hasInternet()` (existing utility) is true. Whether it succeeds or not, enqueue a single `SyncWorker` (`WorkManager`, unique work name, constraint `NetworkType.CONNECTED`, exponential backoff) that queries all `pending_upload=true` trips and POSTs each to `/api/device/trips`, clearing the flag on a `2xx` response. Because the upload is idempotent (§4 unique constraint), retries are always safe.
- This is a small, self-contained addition to the existing app — a new `pending_upload` column, a `SyncWorker`, and a thin HTTP client using the stored device token. Not otherwise covered here since it's part of the existing Android codebase, not this doc's scope.

## 9. API specification

Device-facing (car app, no Firebase involved):

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/api/device/pairing/start` | none | `{ vin, appVersion }` | `{ pairingRequestId, code, expiresAt }` |
| GET | `/api/device/pairing/status/:id` | none | — | `{ status, deviceToken? }` |
| POST | `/api/device/trips` | device token | trip payload, see §10 | `{ tripId }` |
| POST | `/api/device/heartbeat` | device token | — | `{ ok: true }` (updates `last_seen_at`, powers a "last synced" indicator in the webapp) |

User-facing (web app, Firebase ID token):

| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | `/api/user/me` | — | profile |
| GET | `/api/user/vehicles` | — | list of vehicles owned by the user |
| PATCH | `/api/user/vehicles/:id` | `{ nickname }` | updated vehicle |
| DELETE | `/api/user/vehicles/:id` | — | cascades devices + trips |
| POST | `/api/user/pairing/claim` | `{ code }` | `{ vehicleId }` |
| GET | `/api/user/vehicles/:id/trips` | `?from=&to=&kind=&page=` | paginated trip list |
| GET | `/api/user/trips/:id` | — | full trip incl. `gpxRaw` for map rendering |
| DELETE | `/api/user/trips/:id` | — | — |
| GET | `/api/user/vehicles/:id/stats` | `?range=7d\|30d\|90d\|all` | aggregated stats bundle, see §11 |
| GET | `/api/user/vehicles/:id/stats/calendar` | `?year=` | `{ date, km }[]` for the heatmap chart |

## 10. Trip upload payload

Deliberately mirrors what the Android app already computes locally (no new computation invented) — summary fields as indexed columns, full GPX (with the existing `jd:energyFlow` extensions) as one blob:

```json
{
  "kind": "auto",
  "startedAt": "2026-07-23T07:12:00Z",
  "endedAt": "2026-07-23T07:41:00Z",
  "label": "Via Dante, Milano",
  "km": 24.8,
  "liters": 1.14,
  "avgConsumption": 21.8,
  "pctEv": 62.0,
  "pctSeries": 21.0,
  "pctParallel": 17.0,
  "pctOther": 0.0,
  "pctEco": 40.0,
  "pctNormal": 55.0,
  "pctSport": 5.0,
  "kmEv": 12.4,
  "kmHev": 10.9,
  "gpxRaw": "<?xml version=\"1.0\"...>"
}
```

**IMPLEMENTED (2026-07-25):** `pctEco`/`pctNormal`/`pctSport` (drive-mode share, computed client-side by `SyncWorker.computeDriveModeBreakdown()` from the GPX `jd:driveMode` extension, same scheme as `pctEv`/... above) and `kmEv`/`kmHev` (real EV/HEV km split, from `ID_EV_MILEAGE`/`ID_HEV_MILEAGE` odometer-style counters sampled at trip start/end, complementary to the time-weighted `pctEv`/`pctSeries`/`pctParallel` estimate) — closing the "drive-mode share... flagged as a natural follow-up" note in §12 below. GPX points also now carry `jd:speedKmh`/`jd:instConsumption`/`jd:regenLevel` extensions (the last two are raw values, scale unconfirmed — see `VDInfoClient.java`), consumed by the web app's per-trip charts (§11) but not stored as their own Trip columns (no server-side aggregate needs them yet).

`gpxRaw` is omitted for manual-slot trips (they never had GPS tracking to begin with). Server computes nothing beyond storing these fields — all derived numbers already exist on the client, matching the "don't invent new logic" principle.

## 11. Frontend architecture

Routes:
- `/login` — Firebase Auth (email/password + Google).
- `/pair` — enter pairing code; shown automatically after first login if the user has zero vehicles.
- `/` (dashboard) — vehicle switcher (hidden if only one vehicle), KPI row, charts.
- `/trips` — filterable/paginated trip list.
- `/trips/:id` — detail: map with energy-flow-colored polyline + breakdown bar + stats, mirroring the Android app's Storico detail panel.
- `/settings` — vehicle nickname, account, delete-my-data.

Key components:
- `VehicleSwitcher` — dropdown, only rendered if `vehicles.length > 1`.
- `KpiCard` — big tabular-nums number + label + trend chip (reuses the same trend-color logic as the Android app's `updateConsumptionTrendColor`: green improving / orange mild-worse / red strong-worse).
- `ConsumptionTrendChart` — ECharts line, km/l over time.
- `EnergyFlowDonut` — ECharts donut/gauge, EV/series/parallel/other %, colors matching `EnergyFlowUtil` (grey=series, red=parallel, blue=EV).
- `CalendarHeatmap` — ECharts calendar component, days-driven, backed by `/stats/calendar`.
- `TripMap` — Leaflet, one 2-point `Polyline` per GPX segment colored by that segment's starting point's `energyFlow` value (identical logic/coloring rule to the Android app's `showOnMap`/`TripTraceView` — same "colors from start-point, hard cutover, not a gradient" behavior, for visual consistency between the app and the web view).
- `TripList` / `TripRow` — paginated list, same label/subtitle pattern as the Android Storico list (bold destination or slot label, date/time range subtitle).

Visual direction: dark theme by default, glassmorphic cards, same accent palette as the existing "Aetheris Automotive" design system already defined in `colors.xml` (background `#0A0A0A`, accent `#00BFFF`, trend colors green `#2E7D32`/orange `#FB8C00`/red `#C62828`) — the web app should feel like the same product as the in-car app, not a reskin.

## 12. Statistics

**IMPLEMENTED (2026-07-25)**, `GET /api/user/vehicles/:id/stats` (+ `/stats/calendar`), computed at request time over a plain `findMany` (no precompute job/materialized view — fast enough at personal-vehicle scale, and the only practical way to get the km-weighted averages and best/worst-trip logic below without fighting Prisma's `groupBy`):

- Consumption trend: daily average km/l (unweighted mean across trips the same day) — `VehicleStatsPanel`/`ConsumptionTrendChart` on `/vehicles/:id/trips` (web).
- Aggregate %EV / %series / %parallel across all trips in range, weighted by km (a 200km trip counts more than a 2km one) — `EnergyFlowDonut`.
- Aggregate %ECO / %NORMAL / %SPORT, same km-weighting — `DriveModeDonut` (the drive-mode share flagged below as a v1 follow-up, now shipped alongside the `pctEco`/... payload fields in §10).
- Real EV/HEV km split (`evHevKmSplit`, from the `kmEv`/`kmHev` sums) — `null` if no trip has it yet (older trips predate the field).
- Totals: km, liters, trip count, estimated CO₂ (`liters * 2.31`, the standard petrol emission factor — an estimate vs. an all-fuel baseline, not a real hybrid-powertrain emissions measurement).
- Best/worst single trip by consumption in range (`km >= 1` filter, to keep a half-km noise trip from winning by a fluke).
- Kind breakdown (auto / manual_a / manual_b — count + km each).
- Days-driven calendar, one year at a time (`/stats/calendar?year=`) — `CalendarHeatmap`, ECharts calendar+heatmap coordinate system, single-hue sequential color scale (accent, light→dark by km that day).

Per-trip charts (not fleet-wide, `TripDetail`/`/trips/:id`): `BatteryFuelChart` (SOC%+fuel%, share one 0-100 axis), `SpeedChart`, `ElevationChart` (each its own chart — different unit/scale than %, never combined on a dual axis), `CategoryBand` (energy-flow bucket and drive-mode, as hard-cutover color strips along distance, same convention as the map polyline), and a collapsed "dati sperimentali" section for the raw/unconfirmed-scale `instConsumption`/`regenLevel` signals.

## 13. Deployment

Single Docker Compose stack, two services, deployable as one Portainer stack on the existing VPS:

```yaml
version: "3.9"
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: jaedrive
      POSTGRES_USER: jaedrive
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - jaedrive_pgdata:/var/lib/postgresql/data
    networks:
      - internal

  api:
    build: ./server
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://jaedrive:${POSTGRES_PASSWORD}@postgres:5432/jaedrive
      FIREBASE_PROJECT_ID: ${FIREBASE_PROJECT_ID}
      FIREBASE_SERVICE_ACCOUNT_JSON: ${FIREBASE_SERVICE_ACCOUNT_JSON}
      NODE_ENV: production
    ports:
      - "127.0.0.1:4300:3000"   # host nginx proxy_passes here; not published publicly by Docker itself
    depends_on:
      - postgres
    networks:
      - internal

volumes:
  jaedrive_pgdata:

networks:
  internal:
```

The `api` container serves the built React static files (Fastify `@fastify/static`, catch-all fallback to `index.html` for client-side routing) *and* the `/api/*` routes from the same process — one exposed port, no separate frontend container, no reverse proxy inside the stack.

Host-side nginx (outside this stack, not managed by it) needs a `server {}` block proxying the new subdomain to `127.0.0.1:4300`, with `client_max_body_size` raised (e.g. `10m`) to comfortably fit GPX uploads, and standard TLS via whatever certbot/ACME setup already handles the VPS's other sites.

## 14. Security considerations

- Device tokens: 32 random bytes, base64url-encoded, shown to the client once at pairing time, stored server-side only as a sha256 hash (never the raw token) — same principle as password hashing.
- Pairing codes: 8 alnum chars, 10-minute expiry, rate-limited `start`/`claim` endpoints, lock out a code after a few failed claim attempts.
- Firebase ID tokens verified on every request via `firebase-admin` (no custom JWT signing needed).
- No secrets in the repo — `POSTGRES_PASSWORD`/`FIREBASE_SERVICE_ACCOUNT_JSON` supplied via the Portainer stack's environment, not committed.

## 15. Open decisions / flagged risks

- **VIN readability is unconfirmed.** Nothing in this project's VDB reverse-engineering work so far has confirmed a working VIN source (neither the standard `android.car` `INFO_VIN` property nor a VDB `CAR_INFO` signal has been tested). This is the first thing to verify before building the pairing flow for real — if it turns out blocked/stubbed like `PERF_ODOMETER`/`FUEL_LEVEL` were, the fallback is a one-time manual VIN entry by the user during pairing (still works, just less "magic").
- PostGIS: skipped for v1 (no genuine geospatial queries needed yet — "which roads do I drive most" would justify it later).
- Object storage (MinIO/S3) for GPX blobs: skipped for v1, Postgres `text` column is fine at this data volume; revisit only if it becomes a real cost/size issue.
- Drive-mode share statistic needs a small addition to the trip upload payload (per-trip ECO/NORMAL/SPORT time split) that the Android app doesn't currently compute — not blocking for v1, just noted as a likely next payload field.
