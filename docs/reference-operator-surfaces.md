# Operator Surfaces Reference

This reference describes the public routes, API endpoints, local commands, and safety behavior added or changed by the `codex/gbrain` PR.

## Browser Routes

| Route | Page | Data source | Purpose |
| --- | --- | --- | --- |
| `/gbrain` | GBrain | `/api/gbrain/overview` | Proof-backed view of GBrain trust, sources, queues, and bridge caveats |
| `/kanban` | Hermes Kanban | `/api/hermes-kanban` | Hermes task board with detail drawer and bounded write actions |
| `/cron` | Cron Jobs | `/api/cron`, `/api/models` | OpenClaw and Hermes cron visibility with scheduler-specific actions |
| `/costs` | Cost Tracker | `/api/costs`, `/api/costs/codexbar` | OpenClaw, Hermes, and CodexBar usage with source reliability metadata |
| `/ollama` | Ollama Monitor | `/api/ollama/*`, `/api/costs` | Local model telemetry plus model token usage context |

## GBrain API

GBrain probe endpoints are read-only. `GET /api/gbrain/actions` exposes the
safe action catalog, and `POST /api/gbrain/actions` is a bounded local
maintenance surface with an explicit action allowlist.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/gbrain/overview` | Returns the cockpit, nodes, edges, caveats, and live probe payloads used by `/gbrain` |
| `GET` | `/api/gbrain/health` | Runs `gbrain health --json` and `gbrain jobs stats --json`, then normalizes health, embeddings, and queue counters |
| `GET` | `/api/gbrain/sources` | Runs `gbrain sources list --json`, falling back to `gbrain sources list` text parsing |
| `GET` | `/api/gbrain/version` | Runs `gbrain --version` and normalizes the active CLI version |
| `GET` | `/api/gbrain/actions` | Returns the allowlisted action catalog rendered by `/gbrain` |
| `POST` | `/api/gbrain/actions` | Runs one allowlisted local maintenance action and returns redacted command evidence |

Runtime details:

- Command timeout: `7000` ms.
- PATH includes `~/.bun/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, then the process PATH.
- Error messages redact bearer tokens, `sk-` API keys, and `/Users/<name>` paths.
- Live failure returns JSON with `ok: false`, `mode: live-read-only`, `status: unavailable`, `checkedAt`, and a redacted `error`.

Supported action payloads for `POST /api/gbrain/actions`:

| Action | CLI effect |
| --- | --- |
| `doctor-fast` | `gbrain doctor --json --fast` |
| `preview-sync` | `gbrain sync --all --no-pull --parallel 1 --dry-run --json --yes` |
| `sync-sources` | `gbrain sync --all --no-pull --parallel 1 --json --yes` |
| `retry-failed-sync` | `gbrain sync --all --retry-failed --serial --no-pull --json --yes` |
| `embed-stale` | `gbrain embed --stale` |
| `check-resolvable` | `gbrain check-resolvable --json` |
| `storage-status` | `gbrain storage status --json` |

Action safety constraints:

- No arbitrary command or source id is accepted from the browser.
- Only one GBrain action may run at a time from Mission Control.
- Action timeout is action-specific: 30000 ms for fast diagnostics, 60000 ms
  for previews and routing checks, and 120000 ms for maintenance or repair.
- Action output uses the same token, key, and home-path redaction as probes.

The overview payload has these top-level fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `ok` | boolean | Whether the overview model was built |
| `mode` | string | `live-read-only` when live probes were attempted, otherwise `read-only-fixture` |
| `refreshedAt` | ISO string | Live probe time or saved audit timestamp |
| `trust` | object | Global label, status, score, proof source, and timestamp |
| `cockpit` | object | Metric cards keyed by health, embeddings, queue, autopilot, bridge, and caveats |
| `nodes` | array | Brain map nodes with proof, metrics, risks, and next safe action |
| `edges` | array | Relationships between nodes and proof node ids |
| `caveats` | array | Known caveats that do not invalidate the whole surface |
| `live` | object | Raw normalized live health and source probe results |

Node status values are `healthy`, `warning`, `critical`, and `inactive`.

## Hermes Kanban API

Mission Control shells out to:

```bash
hermes --profile PROFILE kanban ...
```

The profile is selected from `HERMES_PROFILE`, `mcConfig.hermes.profile`, or `hmudur`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/hermes-kanban` | Lists all board columns, stats, assignees, and summary counts |
| `GET` | `/api/hermes-kanban/tasks/:taskId` | Shows one task with normalized events, comments, and runs |
| `POST` | `/api/hermes-kanban/actions` | Runs one bounded Kanban action |

Supported action payloads for `POST /api/hermes-kanban/actions`:

| Action | Required fields | Optional fields | CLI effect |
| --- | --- | --- | --- |
| `create` | `title` | `body`, `assignee`, `workspace`, `tenant`, `priority`, `triage`, `skills` | `kanban create ... --created-by mission-control --json` |
| `assign` | `taskId`, `assignee` | none | `kanban assign TASK_ID ASSIGNEE` |
| `comment` | `taskId`, `text` | none | `kanban comment --author mission-control TASK_ID TEXT` |
| `block` | `taskId` | `reason` | `kanban block TASK_ID REASON` |
| `unblock` | `taskId` | none | `kanban unblock TASK_ID` |
| `archive` | `taskId` | none | `kanban archive TASK_ID` |
| `dispatch` | none | none | `kanban dispatch --max 1 --json` |

Safety constraints:

- `taskId`, `title`, `assignee`, `workspace`, `tenant`, and `skill` values cannot start with `-`.
- The action timeout is normally `15000` ms.
- `dispatch` uses a `30000` ms timeout.

## Cron API

The cron surface merges OpenClaw jobs and Hermes profile jobs into one API shape.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/cron` | Returns cached or live cron jobs |
| `POST` | `/api/cron/:id/toggle` | Enables or disables OpenClaw or Hermes jobs |
| `POST` | `/api/cron/:id/run` | Runs an OpenClaw job |
| `POST` | `/api/cron/create` | Creates an OpenClaw cron job |
| `DELETE` | `/api/cron/:id` | Deletes an OpenClaw job |
| `PATCH` | `/api/cron/:id/model` | Updates an OpenClaw model/thinking setting or a Hermes model setting |

Job ids are normalized as:

```text
openclaw:<sourceId>
hermes:<sourceId>
```

If the prefix is missing, Mission Control treats the job as OpenClaw unless a scheduler hint is provided.

Hermes action matrix:

| Action | Supported |
| --- | --- |
| Toggle enabled state | Yes |
| Update model | Yes |
| Update thinking | No |
| Run now | No |
| Delete | No |

Hermes model aliases:

| Input | Stored provider/model/base URL |
| --- | --- |
| `ollama/qwen3.6:35b-a3b-nvfp4` | `custom`, `qwen3.6:35b-a3b-nvfp4`, `http://127.0.0.1:11434/v1` |
| `custom/qwen3.6:35b-a3b-nvfp4` | `custom`, `qwen3.6:35b-a3b-nvfp4`, `http://127.0.0.1:11434/v1` |
| `openai/gpt-5.5` | `openai-codex`, `openai/gpt-5.5`, no base URL |
| `openai-codex/openai/gpt-5.5` | `openai-codex`, `openai/gpt-5.5`, no base URL |

## Costs API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/costs?period=day|7d|month` | Returns combined OpenClaw and Hermes usage |
| `GET` | `/api/costs/codexbar` | Returns CodexBar usage when local data is available |

Cost collection behavior:

- OpenClaw usage runs through `scripts/openclaw-usage-summary.js`.
- Default OpenClaw timeout is `120000` ms and can be overridden with `MC_OPENCLAW_USAGE_TIMEOUT_MS`.
- Hermes usage reads the active profile SQLite state database.
- Detailed results are cached in `MC_COSTS_CACHE_DIR` or the OS temp directory.
- If a refresh is already running, the API returns the best cached result with `meta.refreshing: true`.
- If OpenClaw is unavailable but previous detailed OpenClaw data exists, Mission Control preserves it and marks `meta.stale: true`.

Cost normalization rules:

- Local models and subscription-included GPT-5.5 usage are not treated as billable spend.
- Implausible micro-cost cloud rows are normalized to included spend.
- Unknown zero-cost cloud models remain `unknown`, not estimated spend.
- Estimated daily spend is only applied to rows with tokens for that day.

## Supply-Chain Gate

The PR adds `.github/workflows/supply-chain.yml` and `scripts/check-npm-supply-chain.mjs`.

The script:

- Fetches `NPM_INCIDENT_ADVISORY_URL`, defaulting to the Snyk TanStack/Mini Shai-Hulud advisory page.
- Extracts exact npm package and version indicators from embedded Nuxt JavaScript.
- Scans `package-lock.json`, `pnpm-lock.yaml`, and `yarn.lock`.
- Fails only on exact malicious package/version matches.
- Fails closed when no npm indicators can be parsed.

CI also runs:

```bash
npm ci --ignore-scripts
(cd frontend && npm ci --ignore-scripts)
npm audit signatures
(cd frontend && npm audit signatures)
```

## Related

- [First Operator Check](tutorial-first-operator-check.md)
- [How to Verify Operator Surfaces](how-to-verify-operator-surfaces.md)
- [Read-Only Evidence Design](explanation-read-only-evidence-design.md)
- [GBrain Hybrid Brain View Handoff](gbrain-hybrid-brain-view-handoff-20260524.md)
