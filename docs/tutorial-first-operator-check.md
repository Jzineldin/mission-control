# First Operator Check

This tutorial walks through the first useful Mission Control check after this PR: start the local console, verify GBrain trust, inspect Hermes Kanban work, and confirm cron and cost surfaces are returning operator-grade data.

## What you'll need

- Node.js 18 or newer.
- Dependencies installed at the repository root and in `frontend/`.
- A local OpenClaw or Hermes setup if you want live data instead of empty or unavailable states.
- Optional: `gbrain` on PATH for live GBrain probes.

## Step 1: Start Mission Control

From the repository root:

```bash
npm install
cd frontend
npm install
npm run build
cd ..
npm start
```

The server starts on `http://127.0.0.1:3333` unless `PORT` is set.

## Step 2: Open the GBrain page

Open:

```text
http://127.0.0.1:3333/gbrain
```

You should see a trust cockpit, a living brain map, and an evidence drawer. The first result appears as soon as `/api/gbrain/overview` responds.

If local GBrain is healthy, the trust cockpit uses live read-only probes. If local GBrain is unavailable, the page still renders the saved audit model and marks the live check as unavailable.

## Step 3: Verify the same data from the API

Run:

```bash
curl -s http://127.0.0.1:3333/api/gbrain/overview
```

Expected shape:

```json
{
  "ok": true,
  "mode": "live-read-only",
  "title": "GBrain",
  "cockpit": {},
  "nodes": [],
  "edges": []
}
```

`mode` can also be `read-only-fixture` when you call the overview builder without live probes in tests. In the running app, the server attempts live probes and reports either live data or unavailable live checks.

## Step 4: Inspect Hermes Kanban

Open:

```text
http://127.0.0.1:3333/kanban
```

The board shows `triage`, `todo`, `ready`, `running`, `blocked`, and `done` columns. If Hermes is not reachable, the API returns an empty board plus an error instead of crashing the page.

Check the backing endpoint:

```bash
curl -s http://127.0.0.1:3333/api/hermes-kanban
```

The response includes the active Hermes profile, column data, assignee totals, and summary counts.

## Step 5: Check cron and cost posture

Open:

```text
http://127.0.0.1:3333/cron
http://127.0.0.1:3333/costs
```

Cron should show both OpenClaw and Hermes jobs when available. Hermes jobs are editable for model and enabled state, but they are not runnable or deletable from Mission Control.

Costs should show OpenClaw and Hermes usage when both sources are available. If OpenClaw usage is slow or unavailable, Mission Control can preserve the last detailed OpenClaw data while still showing fresh Hermes usage.

## What you built

You started the local operator console and verified the new PR surfaces from both the browser and API:

- GBrain trust is visible with proof-backed read-only state.
- Hermes Kanban cards are visible in Mission Control.
- Cron jobs show scheduler ownership and safe actions.
- Cost data keeps stale and unavailable source states explicit.

For exact endpoint details, see [Operator Surfaces Reference](reference-operator-surfaces.md). For verification and troubleshooting commands, see [How to Verify Operator Surfaces](how-to-verify-operator-surfaces.md).
