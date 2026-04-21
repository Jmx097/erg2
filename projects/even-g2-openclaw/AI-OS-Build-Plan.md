# AI OS on OpenClaw — Architecture & Build Plan

**Prepared for:** Jon McLemore
**Date:** 2026-04-20
**Status:** Research brief (v1) — for review before scoping the build

---

## 1. Executive summary

You already have the hardest part: a self-hosted OpenClaw Gateway running publicly on a DigitalOcean droplet. OpenClaw *is* the AI OS kernel. What's missing is the shell — the surfaces you interact with, the transport layer between them and the droplet, and the glue that keeps one brain coherent across web, desktop, and glasses.

The good news: this is a well-trodden path. OpenClaw exposes an OpenAI-compatible `/v1/chat/completions` endpoint, uses an `x-openclaw-session-key` header for session continuity, and supports MCP servers via a single config file. A community bridge pattern for exactly the Even G2 case already exists (a Cloudflare Worker that routes G2 voice input into an OpenClaw Gateway). Your job is less "invent" and more "assemble, harden, and personalize."

The build breaks into four layers: **(1) gateway hardening on the droplet**, **(2) a shared bridge/session service**, **(3) three clients** (web dashboard, desktop shell, G2 glasses app), and **(4) a memory + MCP tool stack** wired into all of them. Realistic effort for a working v1 across all three surfaces with voice, MCP, and persistent memory: **roughly 6–10 weeks of focused solo work**, or 3–5 weeks with help.

---

## 2. What you already have (and what it implies)

OpenClaw is an orchestration layer that speaks OpenAI-compatible HTTP on top of whatever models and tools you plug in. Because yours is running and publicly reachable, the design assumptions simplify considerably: clients can talk directly to `https://<your-droplet-domain>/v1/chat/completions` with a bearer token, and sessions can be keyed deterministically per user/surface rather than tunneled through a LAN broker.

A few properties of OpenClaw that shape the design:

The gateway owns all session state. Transcripts live under `~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl`, and sessions are identified by a platform-agnostic `sessionKey` string. That means your clients never need their own chat databases — they just pass the right session key and the gateway handles persistence, pruning (`pruneAfter`, `maxEntries`), and rotation. You will want to think carefully about how session keys are named so that "Jon on web," "Jon on desktop," and "Jon on glasses" either share a thread or deliberately fork, depending on the surface.

MCP tools are added by dropping server entries under `mcpServers` in `~/.openclaw/openclaw.json` and restarting the gateway. This is your tool orchestration layer — calendar, email, CRM, home automation, webhooks, your own custom servers all slot in here. Once a tool is registered at the gateway, *every* surface gets it for free. That's the single biggest architectural win of this approach: you don't re-integrate tools per client.

Persistent memory beyond the session log typically comes from bolting Mem0 (or equivalent) onto the gateway via MCP. This gives you cross-session recall without building a vector store yourself.

Critical HTTP endpoints including `POST /v1/chat/completions` are **disabled by default** in OpenClaw for security. If your gateway is publicly reachable, confirm you've explicitly enabled this in the gateway config and that you're fronting it with TLS + bearer auth (and ideally IP allowlist or Cloudflare Access in front).

---

## 3. Target architecture

Think of it as one brain, one bridge, three mouths:

```
                    ┌─────────────────────────────────────────┐
                    │   DigitalOcean Droplet                  │
                    │   ┌───────────────────────────────────┐ │
                    │   │ OpenClaw Gateway                  │ │
                    │   │  • /v1/chat/completions           │ │
                    │   │  • Session store (JSONL)          │ │
                    │   │  • MCP servers (tools)            │ │
                    │   │  • Mem0 (long-term memory)        │ │
                    │   │  • Model routing (Claude/GPT/etc) │ │
                    │   └───────────┬───────────────────────┘ │
                    │               │ loopback:18789          │
                    │   ┌───────────┴───────────────────────┐ │
                    │   │ Caddy (TLS + auth + rate-limit)   │ │
                    │   └───────────┬───────────────────────┘ │
                    └───────────────┼─────────────────────────┘
                                    │ HTTPS + Bearer token
                                    │ x-openclaw-session-key
                    ┌───────────────┼───────────────────────────┐
                    │               │                           │
             ┌──────▼──────┐  ┌─────▼──────┐  ┌─────────────────▼──┐
             │ Web         │  │ Desktop    │  │ G2 Bridge          │
             │ dashboard   │  │ shell      │  │ (CF Worker or      │
             │ (browser)   │  │ (Tauri/    │  │  phone-side relay) │
             │             │  │  Electron) │  │                    │
             │ • Chat UI   │  │ • Hotkey   │  │ STT on device      │
             │ • Tool logs │  │ • Voice    │  │ ↓ text             │
             │ • Memory    │  │ • Tray     │  │ OpenClaw Gateway   │
             │   browser   │  │ • Overlay  │  │ ↓ reply            │
             │ • Session   │  │            │  │ HUD render + TTS   │
             │   switcher  │  │            │  │                    │
             └─────────────┘  └────────────┘  └────────┬───────────┘
                                                       │ BLE
                                                       │
                                                ┌──────▼──────┐
                                                │ Even G2     │
                                                │  micro-LED  │
                                                │  HUD + mic  │
                                                └─────────────┘
```

The droplet is the only stateful thing. Clients are thin. You can add or swap any surface without touching the others, and every surface automatically inherits new tools, new memory, new model options.

---

## 4. Component breakdown

### 4.1 Droplet / gateway hardening

Even though OpenClaw is up and reachable, production-grade "AI OS" use implies a few things you may or may not have yet. You want TLS termination (Caddy is the lowest-friction option — auto-renews Let's Encrypt, one-line reverse proxy config), a firewalled admin surface so that only your chat endpoint is exposed publicly, token rotation discipline (one token per surface so you can revoke the glasses without killing the desktop), and request logging that flows into a place you can audit. Put the droplet behind Cloudflare if you want DDoS/bot protection and Access-style identity gating at the edge.

OpenClaw's chat endpoint is disabled by default; double-check yours is enabled only with auth on. A good test: from a laptop *not* on your network, `curl -H "Authorization: Bearer <token>" https://<droplet>/v1/chat/completions -d '{"model":"...","messages":[...]}'` should succeed, and the same call without the header should 401 — not 200, not 404.

Effort: **0.5–1.5 weeks** depending on whether you already have Caddy + DNS + monitoring in place.

### 4.2 Bridge / session service

You need a small service that sits between clients and the gateway doing three jobs: (a) minting and validating the right `x-openclaw-session-key` per surface/user, (b) holding the rolling context window the gateway should send on each call (the G2 bridge pattern uses a 20-message rolling window — worth copying), and (c) fanning out non-chat side-effects, like "this was a long task, push the result to Telegram / email / the glasses when it finishes."

For the glasses specifically, the existing `openclaw-skills-even-g2-bridge` pattern deploys as a Cloudflare Worker with secrets `GATEWAY_URL`, `GATEWAY_TOKEN`, `G2_TOKEN`, and an `ANTHROPIC_API_KEY` fallback for when the gateway is down. That's a reasonable starting point — clone it, rename, point it at your droplet. For web and desktop you don't strictly *need* a bridge (they can call the gateway directly), but centralizing session-key logic in one small service avoids drift.

Effort: **0.5–1 week** if you follow the Worker pattern, **1.5–2 weeks** if you build it as a Node/Hono service running on the droplet next to OpenClaw (more flexible, lets you hold state across clients).

### 4.3 Web dashboard

The web surface is your control plane — the place you configure tools, inspect memory, switch sessions, review logs, and chat when you're at a computer. Keep it boring: a Next.js or SvelteKit app that speaks the same OpenAI-compatible streaming API. Recommended panels: **Chat** (with session switcher and tool-call transcript), **Memory** (browse Mem0 entries, pin/forget), **Tools/MCP** (list registered servers, see recent invocations, health checks), **Sessions** (rename, fork, delete), **Logs** (gateway-level request log with token/latency/cost).

You'll want SSE/streamed responses from day one — OpenClaw supports streaming the same way OpenAI does, and a dashboard that feels laggy is a dashboard you won't use.

Effort: **2–3 weeks** for a polished v1. Halve that if you start from an open-source OpenAI-compatible chat UI (LibreChat, Open WebUI, Lobe Chat) and rebuild only the panels unique to your setup.

### 4.4 Desktop shell

This is the surface that earns the "AI OS" name. Build it in Tauri (small footprint, Rust backend, web frontend) or Electron if you want the larger ecosystem. Features that actually matter for daily use: a global hotkey (e.g., `Opt+Space`) that opens a spotlight-style prompt, push-to-talk voice capture with on-device STT for privacy (Whisper via `whisper.cpp` runs fine on an M-series Mac), a persistent tray menu with quick actions, and a translucent overlay for streaming responses that doesn't steal focus.

Deep OS integration is the hard, fun part: clipboard history access, screenshot → "explain this," file drop into chat, shell command execution, accessibility API to read the focused window. Scope v1 tightly — hotkey + voice + chat + clipboard is already useful; the rest can accrete.

Effort: **2–3 weeks** for v1 with Tauri. Add a week if this is your first Tauri project.

### 4.5 G2 glasses client

Two paths here, and you'll probably do both eventually.

**Path A: Even Hub app (official, sandboxed).** Even Hub launched April 3, 2026. Apps are regular web apps (HTML/TS) that use the Even Hub SDK to talk to the glasses, plus `even-toolkit` for components, icons, STT, and the glasses-SDK bridge. You ship this to the Hub and it installs OTA. This is the durable path — you get distribution, OTA updates, dashboard widget integration, and a proper manifest. Constraints: sandboxed, can only talk to the glasses through the SDK, which limits how exotic your interaction model can get.

**Path B: Direct BLE via the `even-g2-protocol` reverse-engineering.** If the Hub SDK doesn't expose something you need, the community has reverse-engineered the BLE protocol and you can talk to the glasses from your own phone app. More freedom, much more work, and you ship the client yourself.

For v1, start with Path A. Build an Even Hub app that does: STT on press (`even-toolkit`'s STT module), POST to your bridge with the user's session key, stream the first line of the response onto the HUD, route longer answers to a secondary channel (Telegram DM works well, matches the existing pattern; you could also push to the desktop overlay). Keep in mind the G2 display is monochrome green 640×350 at 60 Hz — design for short glanceable text, not rendered UI.

Effort: **1.5–2.5 weeks** for Path A. Path B adds 3–5 weeks and only unlocks incremental capability.

### 4.6 MCP + memory stack

Decide which tools the AI OS needs on day one and register them once at the gateway. A reasonable starter set: filesystem access (scoped), your email (Gmail MCP), calendar, a notes/Notion MCP, a browser/fetch MCP for web tasks, and one or two custom MCP servers for things specific to you (e.g., a "my businesses" server that exposes CRM queries, a home-automation server if you have one). Register them in `~/.openclaw/openclaw.json` under `mcpServers`, restart the gateway, done — all three surfaces get them.

For memory, the pragmatic move is Mem0 wired in via MCP. It gives you entity-extraction, cross-session recall, and a retrieval path without you owning a vector DB. Start with coarse memory (facts about you, ongoing projects, contacts) and let it grow.

Effort: **1 week** for tool registration + Mem0 + testing; add time per custom MCP server you need to build.

---

## 5. Phased roadmap

**Phase 0 — Harden the droplet (week 1).** Verify TLS, auth, endpoint exposure. Add monitoring and structured logging. One token per surface. If you want an extra safety layer, put Cloudflare in front.

**Phase 1 — Web dashboard + MCP foundation (weeks 2–3).** Ship the web control plane and get 3–4 MCP servers registered. This is your dogfood surface — you'll use it to test everything else.

**Phase 2 — Memory (week 4).** Add Mem0. Migrate any important context you're carrying in your head into long-term memory. Confirm recall works across sessions.

**Phase 3 — G2 glasses app (weeks 5–6).** Build the Even Hub app using `even-toolkit`. Wire it through a Cloudflare Worker bridge to the gateway. Push long outputs to Telegram (or to your web dashboard's notification channel).

**Phase 4 — Desktop shell (weeks 7–8).** Tauri app with hotkey, voice, overlay. This is the surface you'll end up using most.

**Phase 5 — Polish + custom MCPs (weeks 9–10).** Build the 1–2 custom MCP servers that make this feel *yours*. Tune memory pruning, session-key strategy, and model routing.

You can reorder Phase 3 and Phase 4 based on which surface excites you more; the dependencies run the other direction (both depend on Phase 1–2 being solid).

---

## 6. Effort & cost summary

Full v1 across all three surfaces: **~6–10 weeks solo, focused.** Dollar cost is modest — your droplet you already have; add Cloudflare (free tier likely fine), Mem0 (managed or self-host), model API spend (depends on your usage; Claude/GPT routing gives you knobs to tune this), and ~$99 one-time if you want an Apple developer cert for a signed Tauri build.

The non-obvious cost is MCP server quality. Off-the-shelf MCP servers vary wildly — the well-maintained ones (Gmail, Notion, filesystem) are great; others are flaky. Budget time to either fork-and-fix or write your own.

---

## 7. Risks & open questions

**Session-key strategy is the architectural fork in the road.** If you key by user only (`jon`), every surface writes into the same rolling window and you get a genuinely continuous conversation across web/desktop/glasses — but also a lot of cross-talk, and the glasses (with short bursts) pollute your long desktop sessions. If you key by user+surface (`jon.web`, `jon.glasses`), you get clean separation but lose continuity. The likely right answer is user+surface keys for transcripts but shared Mem0 memory — so facts persist across surfaces, but the working conversation doesn't. Worth deciding early; it's annoying to change later.

**OpenClaw's default chat endpoint is off.** Triple-check that yours is explicitly enabled, behind auth, and that your domain is not accidentally serving the admin surface to the public internet. Self-hosted AI gateways are attractive targets.

**G2 Hub sandbox limits.** Path A is cleaner but you may hit limits on things like long-lived connections, audio streaming out of the glasses, or custom gestures. Worth prototyping the riskiest interaction first (usually: "can I reliably stream voice in and text out within an acceptable latency budget?").

**Memory governance.** Mem0 will happily remember anything. You'll want a "forget this" flow and a periodic review pass — otherwise the memory store drifts and starts poisoning retrieval. Build the memory browser in the web dashboard early.

**Model routing is seductive, don't over-engineer.** Pick one default model (Claude Opus for most things, Haiku for cheap/fast) and add routing logic only when you see a specific workload that demands it. Premature routing logic is a top source of weird bugs in self-hosted AI stacks.

**Open question for you:** Do you want the G2 glasses app to also support the R1 ring as an input (push-to-talk, scroll), or voice-only for v1? Ring support adds a small amount of work but meaningfully changes the UX in noisy environments.

---

## 8. Recommended next steps

Before any code: decide the session-key strategy (my recommendation: surface-scoped transcripts + shared Mem0). Then verify Phase 0 — run a curl test against your droplet from outside your network and confirm the endpoint behaves as expected. Then pick whether you want to start with the web dashboard (faster feedback loop, foundational) or the G2 app (higher delight, more constrained).

If you want, the natural next step is for me to scaffold the repo — a monorepo with `gateway-config/`, `bridge/` (the Worker), `web/` (Next.js dashboard), `desktop/` (Tauri shell), `glasses/` (Even Hub app), and a shared `packages/client/` with the OpenClaw HTTP + session-key logic. Say the word and I'll set it up.

---

## Sources

- [OpenClaw — OpenAI Chat Completions docs](https://docs.openclaw.ai/gateway/openai-http-api)
- [OpenClaw — Session Management docs](https://docs.openclaw.ai/concepts/session)
- [OpenClaw — Skills docs](https://docs.openclaw.ai/tools/skills)
- [How to Add MCP Servers on OpenClaw](https://openclawvps.io/blog/add-mcp-openclaw)
- [How to Self-Host OpenClaw and Access It Remotely](https://localtonet.com/blog/how-to-self-host-openclaw)
- [Mem0 — Add Persistent Memory to OpenClaw](https://mem0.ai/blog/add-persistent-memory-openclaw)
- [freema/openclaw-mcp — MCP bridge between Claude.ai and self-hosted OpenClaw](https://github.com/freema/openclaw-mcp)
- [openclaw-skills-even-g2-bridge — Lobehub skill listing](https://lobehub.com/skills/openclaw-skills-even-g2-bridge)
- [Even Realities Developer Docs (Even Hub)](https://hub.evenrealities.com/docs/)
- [Even Hub launch coverage — 9to5Google](https://9to5google.com/2026/03/26/even-realities-even-hub-apps-and-better-conversate-mode/)
- [fabioglimb/even-toolkit — G2 SDK utilities](https://github.com/fabioglimb/even-toolkit)
- [i-soxi/even-g2-protocol — BLE reverse engineering](https://github.com/i-soxi/even-g2-protocol)
- [Caddy — Reverse proxy quick-start](https://caddyserver.com/docs/quick-starts/reverse-proxy)
- [MCP — Architecture overview](https://modelcontextprotocol.io/docs/learn/architecture)
