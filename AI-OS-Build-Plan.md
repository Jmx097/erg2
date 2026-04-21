# AI OS on OpenClaw - Legacy Research Brief

This file is preserved as historical background only.

The canonical build brief for this repo is now
[docs/openclaw-mobile-companion-architecture.md](docs/openclaw-mobile-companion-architecture.md).

## Why This Document Is Superseded

The earlier brief was useful for exploration, but it is no longer the source of
truth because it assumed several things that do not match the current product
direction:

- it treated web, desktop, and glasses surfaces as peers instead of making the
  mobile companion the primary client
- it allowed designs where clients could talk more directly to OpenClaw with
  bearer tokens
- it focused on per-surface token handling instead of pairing, renewable device
  identity, revocation, and websocket relay lifecycle
- it leaned on Cloudflare Worker and Caddy examples instead of the now-chosen
  Node/TypeScript + Hono + Postgres + nginx VPS reference stack

## What Is Still Useful Here

- general OpenClaw background and MCP framing
- product ideas for future surfaces such as desktop and web dashboards
- source links that may still be useful during implementation

## Use This File For

- background reading
- source discovery
- historical context on earlier repo thinking

## Do Not Use This File For

- auth design
- pairing flows
- websocket session lifecycle
- production deployment decisions
- repo alignment decisions

## Background Sources

- [OpenClaw - OpenAI Chat Completions docs](https://docs.openclaw.ai/gateway/openai-http-api)
- [OpenClaw - Session Management docs](https://docs.openclaw.ai/concepts/session)
- [OpenClaw - Skills docs](https://docs.openclaw.ai/tools/skills)
- [How to Add MCP Servers on OpenClaw](https://openclawvps.io/blog/add-mcp-openclaw)
- [How to Self-Host OpenClaw and Access It Remotely](https://localtonet.com/blog/how-to-self-host-openclaw)
- [Mem0 - Add Persistent Memory to OpenClaw](https://mem0.ai/blog/add-persistent-memory-openclaw)
- [freema/openclaw-mcp - MCP bridge between Claude.ai and self-hosted OpenClaw](https://github.com/freema/openclaw-mcp)
- [openclaw-skills-even-g2-bridge - Lobehub skill listing](https://lobehub.com/skills/openclaw-skills-even-g2-bridge)
- [Even Realities Developer Docs (Even Hub)](https://hub.evenrealities.com/docs/)
- [Even Hub launch coverage - 9to5Google](https://9to5google.com/2026/03/26/even-realities-even-hub-apps-and-better-conversate-mode/)
- [fabioglimb/even-toolkit - G2 SDK utilities](https://github.com/fabioglimb/even-toolkit)
- [i-soxi/even-g2-protocol - BLE reverse engineering](https://github.com/i-soxi/even-g2-protocol)
- [MCP - Architecture overview](https://modelcontextprotocol.io/docs/learn/architecture)
