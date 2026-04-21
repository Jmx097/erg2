# Thin Even Hub OpenClaw Client

This repo is the boring-lane proof for an Even Realities G2 client that talks to
OpenClaw without shipping the OpenClaw operator token to the phone.

## Layout

- `bridge/` is a small Hono service for the DigitalOcean droplet.
- `glasses/` is a Vite + TypeScript Even Hub app that uses the official SDK.

## v0 Flow

1. The G2 app boots inside the Even Realities App WebView.
2. It waits for `waitForEvenAppBridge()`.
3. It creates one full-screen text container.
4. It gets or creates a stable `installId` in Even local storage.
5. It calls the bridge `/health` endpoint.
6. A click sends one canned prompt through `/v0/turn`.
7. The bridge maps the install id to `x-openclaw-session-key: g2:<installId>`
   and calls OpenClaw `/v1/chat/completions`.

## Setup

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

The bridge auto-loads `bridge/.env` when you run it from either the repo root or
the `bridge/` workspace. Vite auto-loads `glasses/.env`.

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

Set `VITE_BRIDGE_BASE_URL` and `VITE_G2_BRIDGE_TOKEN` before building or packing
the glasses app. The phone cannot use a computer-local `127.0.0.1` bridge URL on
hardware; use the HTTPS droplet bridge domain there.

## Deployment Notes

- Keep OpenClaw bound to loopback where possible.
- Expose the bridge over HTTPS.
- Put only `G2_BRIDGE_TOKEN` in the glasses build.
- Never put `OPENCLAW_GATEWAY_TOKEN` in the glasses app.
- Replace the placeholder network whitelist in `glasses/app.json` before packing.
- If the simulator framebuffer PNG looks like a solid green pane, inspect the
  alpha channel or the WebView screenshot; the simulator currently stores lit
  pixels in alpha.
