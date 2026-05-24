# How to Verify Operator Surfaces

Use this guide to verify the GBrain, Hermes Kanban, cron, costs, and supply-chain changes in this PR.

## Prerequisites

- Run from the repository root.
- Install root and frontend dependencies if you need a build.
- Start Mission Control with `npm start` before using `curl` against local endpoints.
- Optional live tools: `gbrain`, `hermes`, `openclaw`, `sqlite3`, and local Ollama.

## Steps

1. Run the focused server tests.

   ```bash
   node tests/gbrainOverview.test.js
   node tests/costSanity.test.js
   node tests/openclawUsageScript.test.js
   node tests/checkNpmSupplyChain.test.mjs
   ```

   These cover GBrain live normalization, cost normalization, OpenClaw usage parsing, and the advisory parser used by CI.

2. Check syntax for changed server files.

   ```bash
   node --check server.js
   node --check server/routes/gbrain.js
   node --check server/routes/hermesKanban.js
   node --check server/routes/cron.js
   node --check server/routes/costs.js
   node --check server/services/cronData.js
   node --check server/services/costSanity.js
   ```

3. Build the frontend.

   ```bash
   cd frontend
   npm run build
   cd ..
   ```

4. Start the server.

   ```bash
   npm start
   ```

5. Verify GBrain endpoints.

   ```bash
   curl -s http://127.0.0.1:3333/api/gbrain/overview
   curl -s http://127.0.0.1:3333/api/gbrain/health
   curl -s http://127.0.0.1:3333/api/gbrain/sources
   ```

   Confirm that errors are redacted and that absolute home paths are not returned in live failure messages.

6. Verify Hermes Kanban endpoints.

   ```bash
   curl -s http://127.0.0.1:3333/api/hermes-kanban
   ```

   If the board has a task id, inspect its detail:

   ```bash
   curl -s http://127.0.0.1:3333/api/hermes-kanban/tasks/TASK_ID
   ```

7. Verify cron endpoints.

   ```bash
   curl -s http://127.0.0.1:3333/api/cron
   ```

   Check that each job has `scheduler`, `schedulerLabel`, `sourceId`, and `actions`. Hermes jobs should have `run: false`, `delete: false`, `toggle: true`, and `model: true`.

8. Verify cost endpoint behavior.

   ```bash
   curl -s 'http://127.0.0.1:3333/api/costs?period=7d'
   ```

   Check the `meta` object. It should make source availability visible with fields such as `openclawStatus`, `hermesStatus`, `stale`, and `refreshing`.

9. Verify the supply-chain gate.

   ```bash
   node scripts/check-npm-supply-chain.mjs
   ```

   This command fetches the configured advisory and fails closed if it cannot parse npm indicators of compromise. Use it when network access is available.

## Verification

The minimum local verification for this PR is:

```bash
node tests/gbrainOverview.test.js
node tests/costSanity.test.js
node tests/openclawUsageScript.test.js
node tests/checkNpmSupplyChain.test.mjs
git diff --check
```

Use the frontend build and local `curl` checks when the change affects browser behavior or live runtime data.

## Troubleshooting

If `/api/gbrain/health` returns `ok: false`, verify that `gbrain` is on PATH and that local database connectivity works:

```bash
gbrain health --json
gbrain jobs stats --json
```

If `/api/hermes-kanban` returns an empty board with an error, verify the Hermes profile and binary:

```bash
HERMES_PROFILE=hmudur hermes --profile hmudur kanban list --status ready --json
```

If `/api/cron` does not show Hermes jobs, inspect the Hermes profile cron file for the active profile. Mission Control reads Hermes jobs from the local profile state and maps them into the same API shape as OpenClaw jobs.

If costs show stale OpenClaw data, that is intentional when the detailed OpenClaw usage command is slow or unavailable. The response should mark `stale: true` and preserve previous detailed OpenClaw data while continuing to use fresh Hermes data when possible.

If the supply-chain gate fails with no parsed indicators, check `NPM_INCIDENT_ADVISORY_URL`. The gate fails closed because an empty advisory parse is not useful evidence.
