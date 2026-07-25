# Privacy Policy — JaeDrive / JaeDrive Cloud

Last updated: 2026-07-26

## 1. Data Controller
Fabrizio Cucci, reachable at privacy@jaedrive.com.

## 2. Data collected
- **Account data**: email (via Firebase Authentication — email/password or Google login); first and last name, entered by the user on first login; profile photo, only if available via Google login (no user-uploaded photos).
- **Vehicle data**: VIN (or, if unavailable/not entered, an identifier generated automatically on the device, not linked to any real vehicle-identifying data); brand, model and powertrain, chosen by the user during setup; nickname assigned by the user.
- **Trip data**: start/end date and time, trip type (automatic GPS-tracked trip or manual trip), distance driven, fuel used, average consumption, percentage breakdown of the hybrid powertrain's operating modes (pure electric / series hybrid / parallel hybrid / regeneration), percentage breakdown of driving modes (ECO/NORMAL/SPORT), estimated km driven in electric/hybrid mode. For GPS-tracked trips: a GPX file containing, for each point, coordinates, elevation, timestamp, and — when available from the vehicle — speed, battery charge percentage, and remaining fuel percentage.
- **Technical data**: app version, device token (stored only as a hash, never in plain text).

Some experimental diagnostic signals (e.g. related to tire pressure) are currently used for testing purposes only, stay on the device, and are **never uploaded to the server or synced to the cloud**.

## 3. Purpose and legal basis
Data is processed to provide the requested service (trip history, statistics, maps) — legal basis: **performance of a contract / service delivery** (Art. 6.1.b GDPR), as JaeDrive Cloud is an opt-in service.

Data is not used for advertising profiling and is not sold to third parties.

## 4. Sub-processors
- **Google Firebase** (Google LLC / Google Ireland Ltd) — authentication. Any transfer outside the EU is covered by Standard Contractual Clauses (SCC) under Google's Data Processing Addendum.
- **Fabrizio Cucci / VPS hosting (IONOS)** — server and database infrastructure, located in the European Union.

## 5. Data retention
Data is kept as long as the account is active. Upon account deletion, all related data (vehicles, paired devices, trips, GPX tracks) is deleted **immediately and permanently**.

## 6. User rights
At any time you can request: access to your data, correction, deletion (also directly from the app's "Settings" section), portability, objection to processing. Requests via email to privacy@jaedrive.com.

You also have the right to lodge a complaint with your national data protection authority (in Italy: Garante per la Protezione dei Dati Personali, www.garanteprivacy.it).

## 7. Security
Device tokens are stored only as hashes (never in plain text). Communication between the app, web app, and server occurs over HTTPS.

## 8. Maps
Maps use **OpenStreetMap** tiles (© OpenStreetMap contributors, ODbL license) — no trip data is shared with OpenStreetMap; tiles are used purely as a map background.

## 9. Minors
The service is not intended for users under 16 years of age.

## 10. Changes
This policy may be updated; material changes will be communicated via email or in-app notice.
