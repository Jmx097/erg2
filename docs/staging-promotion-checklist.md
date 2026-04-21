# Staging Validation Runbook

Use this runbook to verify that the current bridge and mobile companion are
ready for staging promotion. Run the steps in order. Treat any failed check as a
stop condition until the underlying issue is understood.

## 1. Local Preflight

Run the shared repo checks first:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Run the Postgres-backed bridge integration path:

```bash
npm run test:integration:local
```

Pass signal:

- repo checks succeed
- integration runner completes with exit code `0`

Fail signal:

- typecheck, test, build, or integration run exits non-zero
- Docker Desktop is not running, so the local Postgres runner cannot start

## 2. Staging Environment Preparation

Confirm the production-style bridge environment is populated from:

- `ops/env/bridge.production.env.example`

Required staging assumptions:

- `BRIDGE_STORE_DRIVER=postgres`
- `STARTUP_REQUIRE_READY=true`
- `DATABASE_URL` points to the staging Postgres instance
- `OPENCLAW_BASE_URL` points to the localhost-bound upstream
- bridge listens on localhost and is reverse proxied through nginx
- Postgres is not public

Install and build on the staging host:

```bash
REPO_DIR=/opt/openclaw/erg2 APP_USER=openclaw ./ops/scripts/bootstrap-vps.sh
REPO_DIR=/opt/openclaw/erg2 APP_USER=openclaw ./ops/scripts/install-vps-assets.sh
```

Pass signal:

- packages install successfully
- repo build succeeds on the host
- nginx, Postgres, and system packages are present

Fail signal:

- bootstrap script exits non-zero
- the bridge cannot build on the target host

## 3. Service and Edge Validation

Install and enable the existing nginx and systemd assets:

- `ops/nginx/openclaw-mobile.conf`
- `ops/systemd/openclaw-bridge.service`
- `ops/systemd/openclaw-upstream.service`

Then verify the public edge:

```bash
curl --fail --silent https://<staging-host>/v1/health
curl --fail --silent https://<staging-host>/v1/ready
RELAY_BASE_URL=https://<staging-host> ADMIN_API_TOKEN=<admin-token> npm run staging:validate
```

Pass signal:

- `/v1/health` returns `200`
- `/v1/ready` returns `200`
- readiness JSON shows `storage=postgres`
- readiness JSON shows healthy `database` and `openclaw` checks

Fail signal:

- either endpoint is unavailable through nginx
- readiness returns `503`
- readiness reports `storage` other than `postgres`

## 4. Auth and Relay Smoke Flow

Run the scripted smoke precheck:

```bash
RELAY_BASE_URL=https://<staging-host> ADMIN_API_TOKEN=<admin-token> ./ops/scripts/smoke-test.sh
```

The same ordered host-side checks are also available through:

```bash
RELAY_BASE_URL=https://<staging-host> ADMIN_API_TOKEN=<admin-token> npm run staging:validate
```

Create a pairing session directly if needed:

```bash
npm run pair:create -w bridge -- --api-base-url https://<staging-host> --admin-token <admin-token> --platform ios --device-display-name-hint "Smoke Test iPhone"
```

Validate this sequence end to end using the mobile app or an equivalent client:

1. create pairing session
2. redeem `pairing_session_id` plus `pairing_code`
3. register the device
4. confirm access token and refresh token are returned
5. refresh and confirm the refresh token rotates
6. request a websocket ticket
7. connect to `/v1/relay/ws`
8. send `hello` and confirm `ready`
9. send a `prompt` and confirm `reply.delta` plus `reply.final`
10. revoke the device and confirm the client receives `revoked` and disconnects

Pass signal:

- every step above completes in order without manual DB edits or token hacks
- revoke closes the active session and forces the repair path

Fail signal:

- any auth step requires retrying with mutated server state
- websocket connect fails after a valid ticket is issued
- prompt flow never reaches `reply.final`
- revoke does not terminate the active session

## 5. Recovery Rehearsal

Restart the bridge and confirm reconnect behavior:

```bash
sudo systemctl restart openclaw-bridge
```

Temporarily stop the upstream and confirm readiness fails closed:

```bash
sudo systemctl stop openclaw-upstream
curl --silent --show-error https://<staging-host>/v1/ready
```

Restore the upstream and confirm readiness recovers:

```bash
sudo systemctl start openclaw-upstream
curl --fail --silent https://<staging-host>/v1/ready
```

Run backup and restore rehearsal:

```bash
DATABASE_URL=<staging-database-url> ./ops/scripts/backup-postgres.sh
DATABASE_URL=<staging-database-url> ./ops/scripts/restore-postgres.sh <backup-file>
```

Run key rotation rehearsal:

```bash
OUTPUT_DIR=/tmp/openclaw-keys ./ops/scripts/rotate-access-token-keys.sh
```

You can automate the ordered restart, outage, backup, optional restore, and key
rotation flow with:

```bash
RELAY_BASE_URL=https://<staging-host> DATABASE_URL=<staging-database-url> npm run staging:rehearsal
```

Add `BACKUP_FILE=<backup-file>` if you want the rehearsal script to perform the
restore step automatically.

Pass signal:

- the mobile client reconnects after bridge restart with a fresh websocket ticket
- `/v1/ready` returns unhealthy while the upstream is stopped
- `/v1/ready` returns healthy again after upstream restore
- backup file is created successfully
- restore completes successfully on staging or a staging-equivalent environment
- key rotation produces a fresh Ed25519 keypair without corrupting the active environment

Fail signal:

- reconnect requires re-pairing after bridge restart
- readiness remains healthy while the upstream is down
- restore or key rotation steps are untested or undocumented

## 6. Sign-Off

Do not promote until all of these are true:

- journal logs show structured JSON for requests, relay lifecycle, cleanup, and upstream calls
- secrets were generated from fresh material and not copied from development
- Postgres restore steps were rehearsed
- access-token key rotation was rehearsed
- any remaining gap is limited to G2-specific BLE UUID or protocol validation and is documented explicitly
