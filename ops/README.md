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

- `REPO_DIR=/opt/openclaw/erg2 APP_USER=openclaw ./ops/scripts/install-vps-assets.sh`:
  install nginx, systemd, and env templates onto an Ubuntu/Debian VPS
- `RELAY_BASE_URL=https://<staging-host> ADMIN_API_TOKEN=<admin-token> npm run staging:validate`:
  run the ordered host health, readiness, smoke, and pairing-session checks
- `RELAY_BASE_URL=https://<staging-host> DATABASE_URL=postgres://... npm run staging:rehearsal`:
  run the restart, outage, backup, restore, and key-rotation rehearsal flow
