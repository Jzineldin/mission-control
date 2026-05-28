# Mission Control - OpenClaw Ops Console

Mission Control is the local operator console for OpenClaw. It runs at
`http://127.0.0.1:3333` and gives one fast surface for active sessions, cron
jobs, cost usage, local models, Digital Office state, governance history, and
runtime health.

This app is meant to answer the operator question first: what is running, what
needs attention, what changed recently, and which action is safe to take next.

![Dashboard](screenshot.png)

## Current Version

The current release is an operator-focused overhaul:

- **Dashboard / Operator Briefing** - active calls, live session counts, channel
  heartbeat, evidence feed, quick actions, and "needs attention" signals.
- **Cost Tracker** - OpenClaw + Hermes usage, budget posture, model/service
  breakdowns, and fast cached responses that preserve stale-but-useful data when
  a background usage refresh fails.
- **Cron Jobs + Calendar** - recurring job status, failed/overdue jobs, compact
  model display, manual run/toggle controls, and schedule-oriented scanning.
- **Hermes Kanban** - profile-backed task board with triage, ready, running,
  blocked, and done columns plus bounded card actions.
- **GBrain** - trust cockpit, living brain map, evidence drawer, and bounded
  local maintenance actions for shared memory health, sources, queues, and caveats.
- **Governance Archive** - read-only view of council/governance records. Council
  mutations are disabled by default because the old council flow was not earning
  its operational weight.
- **Digital Office / Team Structure / Agent Hub** - office telemetry, desks,
  active sessions, team registry, runtime ownership, and agent attention cues.
- **Ollama Monitor** - local model inventory, health, memory posture, and tuning
  surfaces for local LLM operations.
- **Memory / Scout / AWS / Settings** - supporting diagnostics and configuration
  surfaces kept available where useful.

## Pages

| Route | Page | Purpose |
| --- | --- | --- |
| `/` | Dashboard | Operator briefing, live health, active sessions, heartbeat, evidence feed |
| `/conversations` | Conversations | Session browser and transcript review |
| `/workshop` | Workshop | Task board and execution queue |
| `/kanban` | Hermes Kanban | Hermes profile task board, card detail, and bounded task actions |
| `/costs` | Cost Tracker | OpenClaw/Hermes usage, budgets, daily/model breakdowns |
| `/cron` | Cron Jobs | Cron health, toggles, manual runs, model visibility |
| `/calendar` | Calendar | Schedule-first view of recurring work |
| `/gbrain` | GBrain | Shared memory trust, source, queue, and bridge proof |
| `/ollama` | Ollama Monitor | Local model and runtime readiness |
| `/councils` | Governance Archive | Read-only governance/council history and state |
| `/team` | Team Structure | Team registry and role/ownership view |
| `/office` | Digital Office | Desk telemetry, attention queue, office session state |
| `/memory` | Memory | Memory and documentation inspection |
| `/scout` | Scout | Opportunity and web-signal scanning |
| `/agents` | Agent Hub | Active agents, sessions, and runtime inventory |
| `/settings` | Settings | Mission Control configuration |
| `/aws` | AWS | Optional AWS cost and Bedrock surfaces |
| `/skills` | Skills | Route still exists, but it is hidden from sidebar until it has useful data |

## Quick Start

### Requirements

- Node.js 18+
- An OpenClaw workspace on the same machine
- Optional: Brave Search API key for Scout
- Optional: local Ollama install for the Ollama Monitor page

### Install

```bash
git clone https://github.com/ykcoatepe/mission-control.git
cd mission-control

npm install
cd frontend
npm install
npm run build
cd ..

cp mc-config.default.json mc-config.json
npm start
```

Open `http://127.0.0.1:3333`.

The Setup page can auto-detect the local OpenClaw config and write
`mc-config.json`. Keep `mc-config.json` local; it is intentionally gitignored.

## Runtime Data

Mission Control intentionally keeps live operator state out of git:

- `mc-config.json` - local app configuration
- `data/` - runtime snapshots and local state
- `tasks.json` - local workshop/task queue state
- `logs/` and `*.log` - server/runtime logs
- `frontend/dist/` - generated frontend build
- `node_modules/` and `frontend/node_modules/` - installed dependencies

Do not commit live OpenClaw, Hermes, token, or personal runtime data.

## Configuration

Common environment switches:

| Variable | Purpose |
| --- | --- |
| `PORT` | Override the default `3333` server port |
| `MC_USER_HOME` | Explicit host home for OpenClaw usage lookups |
| `MC_OPENCLAW_USAGE_TIMEOUT_MS` | Timeout for OpenClaw usage summary collection |
| `MISSION_CONTROL_ENABLE_COUNCIL_ACTIONS=1` | Re-enable council action endpoints |

Council action endpoints return `410 Gone` unless
`MISSION_CONTROL_ENABLE_COUNCIL_ACTIONS=1` is set. Keep the default archive-only
mode unless a real OpenClaw operation needs active council mutations again.

## Documentation

| Document | Use it when |
| --- | --- |
| [First Operator Check](docs/tutorial-first-operator-check.md) | You want a first end-to-end walkthrough of the new operator surfaces |
| [How to Verify Operator Surfaces](docs/how-to-verify-operator-surfaces.md) | You need commands to verify GBrain, Hermes Kanban, cron, costs, and supply-chain behavior |
| [Operator Surfaces Reference](docs/reference-operator-surfaces.md) | You need the exact browser routes, API endpoints, actions, defaults, and constraints |
| [Read-Only Evidence Design](docs/explanation-read-only-evidence-design.md) | You want the rationale behind read-only probes, explicit stale state, and bounded actions |
| [GBrain Hybrid Brain View Handoff](docs/gbrain-hybrid-brain-view-handoff-20260524.md) | You need the product handoff that shaped the `/gbrain` implementation |

## Architecture

```text
mission-control/
├── server.js                 # Express entrypoint and static serving
├── server/
│   ├── routes/               # API route modules
│   └── services/             # Runtime, session, cron, team, and cache services
├── scripts/                  # Local helpers and usage summarizers
├── mc-config.default.json    # Safe config template
├── frontend/
│   ├── src/
│   │   ├── appRoutes.tsx     # Route and sidebar registry
│   │   ├── pages/            # Operator pages
│   │   ├── components/       # Shared UI primitives and layout
│   │   └── lib/              # Hooks and client helpers
│   └── dist/                 # Generated build served by Express
└── mission-control.service   # systemd template
```

**Stack:** React 19, Vite 7, TypeScript, Framer Motion, Recharts, lucide-react,
and Express.

The backend favors bounded reads, cached snapshots, and explicit fallbacks so the
UI remains useful when a slow runtime source stalls. User-facing health should
come from evidence-bearing API responses, not from optimistic labels alone.
Cost responses merge fresh Hermes data with cached OpenClaw data when OpenClaw
collection fails, and stale responses carry explicit metadata instead of silently
looking fresh. Chat fallback requests are abortable on client disconnect so a
closed browser tab does not leave child agent work running in the background.

## Validation

Useful local checks:

```bash
npm run build
cd frontend && npm run build
node --check server.js
node --check server/routes/chat.js
node --check server/routes/costs.js
```

For UI changes, verify the running app at `http://127.0.0.1:3333` and inspect
the relevant API endpoint directly with `curl`.

## Feature Notes

- Dashboard should remain compact and decision-first. Avoid decorative surfaces
  that make runtime state harder to scan.
- Cost Tracker should continue to return a usable fallback quickly, then refresh
  richer OpenClaw/Hermes usage in the background. If one source fails, keep the
  fresh source data and mark any cached source data as stale.
- GBrain write actions must stay allowlisted, local-first, and visibly separated
  from evidence probes. The `/api/gbrain/actions` catalog is the source of truth
  for the operator buttons shown on `/gbrain`.
- Hermes Kanban actions should keep argument boundaries explicit. Do not pass
  user-controlled values that can be interpreted as CLI flags.
- Chat and agent fallback routes should pass abort signals through to child work
  and listen for response close events before cancelling that work.
- Governance Archive is intentionally quieter than the old council workflow. If
  the council becomes operationally useful again, improve and re-enable it behind
  the existing environment gate.
- Skills is still available as a direct route but hidden from navigation while
  it has no meaningful operator workflow.

## License

[Business Source License 1.1](LICENSE)

- Free to use, modify, and self-host
- Personal and internal commercial use allowed
- Cannot be offered as a hosted SaaS to third parties
- Converts to MIT on 2030-02-07

Maintained for local OpenClaw operations.
