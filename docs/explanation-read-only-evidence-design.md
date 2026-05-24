# Read-Only Evidence Design

Mission Control is an operator console. Its job is not to make local automation look healthy. Its job is to show what is known, where that proof came from, and which action is safe next.

## The problem

The PR adds surfaces that read from several local systems: GBrain, Hermes, OpenClaw, local SQLite data, cron files, and Ollama. Those systems can be slow, unavailable, or partially configured. A page that goes fully green because one command returned cached data would mislead the operator.

The failure modes are practical:

- GBrain can be installed but temporarily unable to reach its database.
- Hermes Kanban can be absent on a machine where Mission Control still runs.
- OpenClaw usage can take long enough that a short API timeout turns real usage into zeroes.
- Hermes cron jobs can be visible from disk but should not be run or deleted from this app yet.
- Supply-chain checks can miss the real incident if the advisory parser silently returns no indicators.

## The approach

The new surfaces use read-only probes, bounded commands, cached snapshots, and explicit source status.

```text
Browser page
  |
  | fetches local API
  v
Mission Control route
  |
  | read-only command, file, SQLite, or cache lookup
  v
Normalized response
  |
  | includes source, freshness, caveat, and action metadata
  v
Operator sees proof-backed state
```

GBrain is the clearest example. `/api/gbrain/overview` attempts live read-only probes but keeps the result separate from the static audit model. The UI can then say "Live check unavailable" instead of pretending the saved audit is current.

Cron uses a similar split. OpenClaw jobs keep full run, toggle, delete, and model controls. Hermes jobs are visible and can be toggled or have their model updated, but run and delete actions stay disabled because the write boundary is different.

Costs favor useful partial truth over fake precision. If OpenClaw usage is unavailable while Hermes usage works, Mission Control preserves previous OpenClaw detail and marks it stale. That keeps the chart useful without erasing source reliability.

The supply-chain gate fails closed when it cannot parse indicators. A green result only means exact malicious package/version matches were not found among parsed indicators. It does not replace npm audit or broader vulnerability management.

## Trade-offs

- The UI can show more yellow states. That is intentional. Yellow with proof is better than green without proof.
- Some actions are unavailable from Mission Control even when the underlying system supports them. That keeps mutation boundaries clear while the read model stabilizes.
- Cached data can remain visible after a source fails. The response must mark it stale so the operator knows what changed.
- The GBrain view still uses saved bridge proof for Hermes and OpenClaw until bridge smokes are stored as structured JSON.

## Alternatives considered

The GBrain handoff proposed a static fixture first, then live endpoints. This PR connects the live read-only endpoints but keeps the saved audit as the fallback language. That avoids a false binary choice between "live or nothing" and "static forever."

Another path would have been to make Mission Control a full control plane for memory repair, queue actions, and Hermes cron execution. That would increase the blast radius before the read surfaces have earned trust. This PR keeps v1 operationally honest: observe first, mutate only where the current app already has a bounded command path.

## Related

- [Operator Surfaces Reference](reference-operator-surfaces.md)
- [How to Verify Operator Surfaces](how-to-verify-operator-surfaces.md)
- [GBrain Hybrid Brain View Handoff](gbrain-hybrid-brain-view-handoff-20260524.md)
