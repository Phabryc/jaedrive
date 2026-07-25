# JaeDrive Cloud

Server + web app implementing user accounts, vehicle pairing, and trip viewing. See
`DESIGN.md` for the full technical design; this file is just the practical run/deploy guide.

Scope of this implementation: user management (Firebase Auth), adding a vehicle (device
pairing flow), and viewing uploaded trips (list + map detail). Aggregate statistics/charts
(DESIGN.md §12) are intentionally not implemented yet. The Android app is untouched — the
device-facing API (`/api/device/*`) exists and is ready, but nothing currently calls it
until the app gains a sync client.

## Local development

Two independent npm projects, no monorepo tooling.

```bash
# 1. Postgres (only external dependency for local dev)
docker run --name jaedrive-pg -e POSTGRES_DB=jaedrive -e POSTGRES_USER=jaedrive \
  -e POSTGRES_PASSWORD=jaedrive -p 5432:5432 -d postgres:16-alpine

# 2. Server
cd server
cp .env.example .env   # fill in FIREBASE_PROJECT_ID / FIREBASE_SERVICE_ACCOUNT_JSON
npm install
npm run prisma:migrate  # creates tables, prompts for a migration name the first time
npm run dev              # http://localhost:3000

# 3. Web app (separate terminal)
cd web
cp .env.example .env.local   # fill in VITE_FIREBASE_* (see root README section below)
npm install
npm run dev               # http://localhost:5173, proxies /api to :3000
```

## Production deploy (VPS, git-based, domain: jaedrive.com)

One-time setup on the VPS:

```bash
# 1. Let the VPS pull this private repo: generate a read-only deploy key ON THE VPS
ssh-keygen -t ed25519 -C "jaedrive-vps-deploy" -f ~/.ssh/id_ed25519_jaedrive_deploy -N ""
cat ~/.ssh/id_ed25519_jaedrive_deploy.pub
# → paste this into GitHub: repo Settings > Deploy keys > Add deploy key (read-only is enough)

# 2. Clone
git clone git@github.com:<your-username>/jaedrive.git
cd jaedrive/cloud
cp .env.example .env   # fill in every value - see "External accounts needed" below

# 3. Build and start
docker compose build
docker compose up -d
```

Every subsequent deploy is just:

```bash
cd jaedrive && git pull && cd cloud && docker compose build && docker compose up -d
```

(`docker compose up`'s container `CMD` runs `prisma migrate deploy` automatically on every
start, so new migrations are applied without a separate manual step.)

The stack exposes `127.0.0.1:4300` only — it's the **host's existing nginx**, outside this
Compose stack, that terminates TLS and proxies the public domain to it (see `DESIGN.md`
§13). An example server block for `jaedrive.com` is in
[`deploy/nginx-jaedrive.com.conf`](deploy/nginx-jaedrive.com.conf) — copy it into your
nginx sites config, then:

```bash
sudo nginx -t && sudo systemctl reload nginx   # after copying the http-only block in
sudo certbot --nginx -d jaedrive.com -d www.jaedrive.com   # provisions TLS, rewrites the block to redirect http->https
```

Point `jaedrive.com`'s DNS **A record** (and `www`, either an A record or a CNAME to the
bare domain) at the VPS's public IP before running certbot, or the HTTP-01 challenge will
fail.

## External accounts needed

See the end of the implementation summary in the conversation, or `DESIGN.md` §5/§14 —
short version: one Firebase project (free Spark plan is enough), Email/Password + Google
sign-in methods enabled, a Web app registered for the `VITE_FIREBASE_*` values, and a
service account key for `FIREBASE_SERVICE_ACCOUNT_JSON`.
