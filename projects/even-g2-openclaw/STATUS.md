## Even G2 OpenClaw Progress

Snapshot date: 2026-04-20

### What is in this snapshot

- Monorepo workspace with `bridge/` and `glasses/`
- Bridge service for `/health` and `/v0/turn`
- Even Hub glasses app that boots, checks bridge health, and sends a canned prompt on click
- Tests for bridge config/auth/session handling and glasses bridge/display/session behavior
- Build plan and local setup docs

### Verified locally

- `npm run typecheck` passes
- `npm test` passes
- `npm run build` passes
- Local bridge can reach `https://glasses.plinkosolutions.com/v1/chat/completions`
- Bridge now normalizes `wss://...` config input to HTTP fetch usage
- Bridge retries only the known transient upstream replies with short backoff
- Bridge emits structured per-attempt and final-result JSON logs with a per-turn `requestId`

### Current blocker

The remaining issue looks upstream rather than local wiring:

- the upstream host authenticates successfully
- some requests return transient assistant text such as:
  - `Even AI is busy with another request. Please retry shortly.`
  - `Even AI request failed upstream. Please try again.`
- some requests time out before a usable reply is returned

### Recent bridge-side improvements

- auto-load `bridge/.env` for local runs
- map websocket-style base URLs to HTTP/HTTPS for fetch
- treat missing `/v1/models` as reachable health for this host
- remove the `stream: false` field from the upstream request body
- add narrow retry/backoff only for the two known transient reply texts
- add structured logging for upstream attempts and final result classification

### Follow-up items

- rotate exposed tokens after debugging
- inspect upstream logs using the new `requestId`-based attempt/result logs
- tune timeout/backoff only if the logs show a stable failure pattern
