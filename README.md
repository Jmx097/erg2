# OpenClaw Mobile Companion for Even Realities G2

This repo currently contains a prototype `v0` bridge and an Even Hub glasses app.
They are useful reference assets, but they are not the production auth model.

The canonical implementation brief for what this project is actually building now
lives in [docs/openclaw-mobile-companion-architecture.md](docs/openclaw-mobile-companion-architecture.md).

## Current Repo State

- `bridge/` is a thin Hono prototype that forwards prompts to OpenClaw.
- `glasses/` is a Vite + TypeScript Even Hub prototype for the G2 display.
- Both directories are transition-era assets until they are rebuilt around the
  mobile-companion-first pairing, auth, refresh, revocation, and websocket model
  described in the canonical architecture doc.

Important:

- Do not treat `VITE_G2_BRIDGE_TOKEN` or `G2_BRIDGE_TOKEN` as production client auth.
- Do not expose OpenClaw directly to mobile or glasses clients.
- Production architecture uses one-time pairing, short-lived access tokens,
  rotating refresh tokens, single-use websocket tickets, and a VPS relay in front
  of localhost-bound services.

## Layout

- `bridge/` - current prototype relay service
- `glasses/` - current Even Hub prototype app
- `docs/openclaw-mobile-companion-architecture.md` - canonical product and
  systems architecture brief
- `AI-OS-Build-Plan.md` - legacy background note and source list

## Prototype Quick Start

The current code still runs as a prototype simulator setup:

```bash
npm install
cp bridge/.env.example bridge/.env
cp glasses/.env.example glasses/.env
npm run typecheck
npm test
```

Run locally:

```bash
npm run dev:bridge
npm run dev:glasses
```

Then point the EvenHub simulator at the Vite URL:

```bash
npx @evenrealities/evenhub-simulator http://localhost:5173 --automation-port 9898
```

For a production-like simulator run without Vite hot reload:

```bash
npm run build -w glasses
npx vite preview --host 127.0.0.1 --port 4173
npx @evenrealities/evenhub-simulator http://127.0.0.1:4173 --automation-port 9898
```

## Transition Guidance

- Use the current `glasses/` app as a UI and integration reference, not as the
  final mobile product.
- Use the current `bridge/` service as a starting point for a future
  Node/TypeScript relay, not as the final auth or session architecture.
- If a document or implementation detail conflicts with the canonical architecture
  doc, follow the canonical architecture doc.
