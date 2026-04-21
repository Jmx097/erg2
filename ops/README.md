# Ops Assets

These files are the starting point for a single-VPS deployment:

- `env/`: production environment templates
- `nginx/`: reverse proxy and rate-limit config
- `systemd/`: service units for the bridge and localhost OpenClaw
- `scripts/`: bootstrap, local Postgres integration, backup, restore, rotation,
  smoke-test helpers, VPS install helpers, and staging rehearsal helpers

All public traffic should terminate at nginx on `80/443`. The bridge, Postgres,
and OpenClaw should stay bound to localhost or a private interface.

Useful local commands:

- `npm run test:integration:local`: start a disposable Docker-backed Postgres,
  run the bridge integration suite, then tear the container down
- `npm run local:postgres:up`: start the standard local test Postgres container
- `npm run local:postgres:down`: remove the standard local test Postgres container

Useful host commands:

- `RELAY_BASE_URL=https://staging.example.com DATABASE_URL=postgres://... OPENCLAW_GATEWAY_TOKEN=... npm run staging:prepare-env`:
  generate a first-pass `/etc/openclaw/bridge.env` with fresh operator, hardware,
  hash, and access-token signing secrets
- `REPO_DIR=/opt/openclaw/erg2 APP_USER=openclaw ./ops/scripts/install-vps-assets.sh`:
  install nginx, systemd, and env templates onto an Ubuntu/Debian VPS
- `npm run staging:audit`:
  verify the host has a built bridge, non-placeholder env values, installed
  nginx/systemd assets, and valid TLS paths before restarting services
- `RELAY_BASE_URL=https://<staging-host> ADMIN_API_TOKEN=<admin-token> npm run staging:contract`:
  run the end-to-end pairing, refresh-rotation, websocket, prompt, and revoke
  contract checks against staging and emit a machine-readable report
- `RELAY_BASE_URL=https://<staging-host> ADMIN_API_TOKEN=<admin-token> npm run staging:validate`:
  run the ordered host health, readiness, smoke, and pairing-session checks
- `RELAY_BASE_URL=https://<staging-host> DATABASE_URL=postgres://... npm run staging:rehearsal`:
  run the restart, outage, backup, restore, and key-rotation rehearsal flow

Recommended first bring-up order:

1. `REPO_DIR=/opt/openclaw/erg2 APP_USER=openclaw ./ops/scripts/bootstrap-vps.sh`
2. `REPO_DIR=/opt/openclaw/erg2 APP_USER=openclaw ./ops/scripts/install-vps-assets.sh`
3. `RELAY_BASE_URL=https://staging.example.com DATABASE_URL=postgres://... OPENCLAW_GATEWAY_TOKEN=... npm run staging:prepare-env`
4. Edit `/etc/nginx/sites-available/openclaw-mobile.conf` for the real hostname and certificate paths.
5. `npm run staging:audit`
6. Restart `openclaw-upstream`, `openclaw-bridge`, and `nginx`
7. `npm run staging:validate`
8. `npm run staging:contract`
9. `npm run staging:rehearsal`
