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

## Production deploy (Portainer, git-based, domain: jaedrive.com)

Actual deployed setup: **Portainer** (git-based stack, no shell access needed) + **Nginx
Proxy Manager** (NPM, itself a Docker container) as the reverse proxy/TLS terminator.

**Portainer → Stacks → Add stack:**

| Field | Value |
|---|---|
| Build method | Repository |
| Repository URL | `https://github.com/<your-username>/jaedrive.git` |
| Repository reference | `refs/heads/main` |
| Compose path | `cloud/docker-compose.yml` |
| Authentication | ON — Username + a GitHub fine-grained PAT scoped to this repo only, **Contents: Read-only** (repo is private) |

**Environment variables** → Advanced/raw mode → paste the full contents of a local
`cloud/.env` (copy `.env.example`, fill in every value — see "External accounts needed"
below; the Postgres password can be anything random).

Redeploying after a new commit: use the stack's "Pull and redeploy" (force rebuild) —
a plain restart reuses the old cached image. `docker compose up`'s container `CMD` runs
`prisma migrate deploy` automatically on every start, so new migrations apply with no
separate manual step.

**Networking**: the `api` service joins two Docker networks — its own private `internal`
one (talks to `postgres`) and `npm_default` (**external**, already created by the Nginx
Proxy Manager stack) so NPM can reach it directly by service name, no host port needed.
If your NPM stack's network has a different name, change the `npm_default: external: true`
block at the bottom of `docker-compose.yml` to match (Portainer → Networks lists them).

**In Nginx Proxy Manager's UI**, add a Proxy Host:
- Domain Names: `jaedrive.com`, `www.jaedrive.com`
- Scheme: `http`, Forward Hostname/IP: `api` (the compose service name — resolvable over
  `npm_default` via Docker's built-in DNS), Forward Port: `3000`
- SSL tab → Request a new SSL Certificate (NPM's built-in Let's Encrypt) → Force SSL

Point `jaedrive.com`'s DNS **A record** (and `www`) at the VPS's public IP first, or the
Let's Encrypt HTTP-01 challenge will fail.

<details>
<summary>Alternative: bare-metal nginx + certbot (no Portainer/NPM)</summary>

```bash
git clone git@github.com:<your-username>/jaedrive.git
cd jaedrive/cloud
cp .env.example .env   # fill in every value
docker compose build && docker compose up -d
```

This assumes the `api` service is reached via its published `127.0.0.1:4300` port instead
of `npm_default` (drop the `npm_default` network from `docker-compose.yml` if not using
NPM). An example host nginx server block is in
[`deploy/nginx-jaedrive.com.conf`](deploy/nginx-jaedrive.com.conf):

```bash
sudo cp deploy/nginx-jaedrive.com.conf /etc/nginx/sites-available/jaedrive.com
sudo ln -s /etc/nginx/sites-available/jaedrive.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d jaedrive.com -d www.jaedrive.com
```
</details>

## External accounts needed

See the end of the implementation summary in the conversation, or `DESIGN.md` §5/§14 —
short version: one Firebase project (free Spark plan is enough), Email/Password + Google
sign-in methods enabled, a Web app registered for the `VITE_FIREBASE_*` values, and a
service account key for `FIREBASE_SERVICE_ACCOUNT_JSON`.
