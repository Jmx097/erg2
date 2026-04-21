# Staging Validation Report Template

Date:
Environment:
Operator:
Commit:

## Preflight

- `npm run typecheck`:
- `npm test`:
- `npm run build`:
- `npm run test:integration:local`:
  Note whether this passed or failed fast because Docker Desktop or another local Docker engine was unavailable.

## Environment Bring-Up

- `bootstrap-vps.sh`:
- `install-vps-assets.sh`:
- `staging:prepare-env`:
- `staging:audit`:
- service restart status:

## Health and Smoke

- `/v1/health`:
- `/v1/ready`:
- `npm run staging:validate`:
- `npm run staging:contract`:
- pairing session creation:

## Manual Auth and Relay Flow

- pairing redeem:
- device register:
- refresh rotation:
- websocket ticket issue:
- websocket `hello` -> `ready`:
- prompt -> `reply.delta` / `reply.final`:
- revoke -> `revoked` disconnect:

## Recovery Rehearsal

- bridge restart reconnect:
- upstream outage fail-closed readiness:
- upstream restore:
- Postgres backup:
- Postgres restore:
- access-token key rotation:

## Findings

- `deployment/ops gap`:
- `bridge contract bug`:
- `external dependency gap`:

## Outcome

- overall result:
- blockers before promotion:
- next follow-up milestone:
