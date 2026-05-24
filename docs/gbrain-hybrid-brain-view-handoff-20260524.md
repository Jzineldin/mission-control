# Handoff: GBrain Hybrid Brain View

Date: 2026-05-24
Origin thread: Hermes workspace / office-hours
Target project: Mission Control
Status: Ready for Mission Control implementation planning

## Implementation Docs

The first Mission Control implementation landed on the `codex/gbrain` branch.
Use these docs for the live operator surface:

- [First Operator Check](tutorial-first-operator-check.md) - tutorial for opening Mission Control and checking the new pages.
- [How to Verify Operator Surfaces](how-to-verify-operator-surfaces.md) - task guide for local endpoint, test, and troubleshooting checks.
- [Operator Surfaces Reference](reference-operator-surfaces.md) - exact routes, API endpoints, action boundaries, and defaults.
- [Read-Only Evidence Design](explanation-read-only-evidence-design.md) - rationale for read-only probes and explicit stale/unavailable states.

## Why This Belongs Here

This idea should live in Mission Control, not Hermes workspace. Hermes is currently the conversational way Yordam asks about GBrain health and behavior, but the product surface belongs at `http://127.0.0.1:3333/`: Mission Control should make GBrain visible as the shared digital memory layer for Hermes, OpenClaw, and Codex.

## Product Direction Chosen

Chosen approach: Cockpit + Living Map Split.

The first screen should combine:

- A trust cockpit: health, embeddings, queues, source freshness, bridge proof, warnings.
- A living Brain Map: GBrain at the center, with Hermes, OpenClaw, Codex, and source systems around it.
- An evidence drawer: every visual state links to concrete proof such as last smoke, source status, counts, errors, or artifact paths.

## User Intent Captured

Yordam wants GBrain to become his general digital memory/brain. Hermes, OpenClaw, and Codex should all feed from it. This structure mostly exists already; the missing piece is a visual Mission Control surface that makes it understandable and trustworthy without asking Hermes Agent first.

Visual quality matters. The map is not decoration. It is the explanatory model that lets the user trust the system.

## V1 Constraints

- Read-only first version.
- No memory mutation, repair, consolidation, or queue actions in v1.
- Every green/yellow/red state must have a proof source.
- Do not present review signals as execution proof, especially for trading-related enrichments.
- Avoid turning this into a static admin table. It should feel like a living shared brain while staying operationally honest.

## Suggested First View

### Top Bar

- Title: GBrain
- Subtitle: Shared memory for Hermes, OpenClaw, and Codex
- Global trust badge: Trusted / Degraded / Needs Attention
- Last verified timestamp

### Left Trust Rail

- Health score
- Embed coverage and missing embeddings
- Queue: waiting, active, stalled
- Autopilot status
- Bridge proof: Hermes, OpenClaw, Codex
- Warnings and diagnostic mismatches

### Main Brain Map

- Center: GBrain Core
- Inner ring: Hermes hmudur, OpenClaw, Codex
- Outer ring: sources and enrichment queues
- Edge labels: read, write, sync, enrich, recall
- Edge states:
  - Green: verified recently with proof
  - Yellow: stale, partial, or diagnostic mismatch
  - Red: failing or blocked
  - Gray: configured but inactive/deferred

### Right Evidence Drawer

Selecting a node or edge should show:

- What this thing is
- Why it matters
- Last known proof
- Freshness
- Counts
- Recent events
- Known risks
- Next safe action, read-only in v1

## Current Evidence From Hermes Audit

From `/Users/yordamkocatepe/hermes-workspace/reports/gbrain-full-audit-20260524.md`:

- Installed GBrain: 0.40.2.0
- Engine: Postgres-backed local brain
- Brain stats: 15,713 pages, 191,638 chunks, 191,638 embedded chunks
- Health: 9/10
- Embed coverage: 100%, missing embeddings 0
- Minions queue: 0 waiting, 0 active, 0 stalled
- Hermes hmudur read smoke passed through GBrain MCP
- OpenClaw read smoke passed through GBrain tool with failures 0
- Sources include clawd, hermes-agent, gbrain, codex-memories, finance-analyzer, mission-control, PDFQuickFix, JapaneseBuddy, gstack
- Known warning: official integrations doctor does not represent the custom local Google bridge
- Known warning: `sources_status clawd` can report `clone_state: corrupted` even when local git fsck and dry-run sync are clean

## Original Design Doc

Full office-hours design doc:

`/Users/yordamkocatepe/.gstack/projects/hermes-workspace/yordamkocatepe-unknown-design-20260524-133359.md`

## Implementation Planning Questions

1. Does Mission Control already expose enough backend endpoints for GBrain health/source/bridge state, or do we need a read-only `gbrainOverview` route?
2. Where should live bridge proof be stored so the UI does not parse human-written reports?
3. Should Codex be represented as one node or split into Codex App, Codex memories, and local workspace sessions?
4. What refresh interval gives current state without causing false negatives or extra GBrain load?
5. Which graph library or existing visualization pattern best fits the current frontend without bloating the app?

## Recommended Next Slice

Create a Mission Control implementation plan for a read-only `/gbrain` or equivalent route:

1. Inspect existing frontend routes and data-fetching patterns.
2. Define a typed `GBrainOverview` response shape.
3. Implement static fixture rendering first using the audit evidence above.
4. Add live health/source endpoints after the UI skeleton is clear.
5. Add evidence drawer last, once the node/edge model is stable.

## Design Review Addendum

Status: reviewed before PR review on `codex/gbrain`.

Initial design completeness: 6.5/10.
Target design completeness for PR: 9/10.

The plan has the right product direction: cockpit, living map, and evidence drawer. The missing work is not more visual decoration. The missing work is precision: state language, mobile behavior, accessibility, and proof semantics.

### What Already Exists

- Reuse Mission Control's compact operator-console language, not a marketing-page style.
- Reuse `GlassCard`, `PageTransition`, `useApi`, route metadata, and the existing sidebar section model.
- Reuse the Memory page's proven "overview plus selected detail" information pattern.
- Keep the surface dense, quiet, and scan-first. The user is checking trust, not browsing a gallery.

### Not In Scope

- Memory mutation, repair, consolidation, queue actions, or source sync controls.
- Full graph authoring, graph editing, zoom/pan, or canvas-style interaction.
- Treating trading review signals as broker/order/execution proof.
- Replacing Mission Control's existing visual system with a new design system.
- Solving live GBrain health ingestion in the first UI slice.

### Pass 1: Information Architecture

Rating: 7/10 -> 9/10 after this addendum.

The screen should have one primary job: answer "Can I trust GBrain right now, and why?"

Desktop hierarchy:

```text
GBrain top bar
  title + subtitle
  global trust badge + last verified timestamp

Main grid
  left: Trust Cockpit
    health
    embeddings
    queue
    autopilot/read-only status
    bridge proof
    caveats

  center: Living Brain Map
    GBrain Core as the visual anchor
    Hermes, OpenClaw, Codex as inner ring
    sources, queues, bridge caveats as outer/supporting nodes
    edge labels stay secondary to node state

  right: Evidence Drawer
    selected node title
    what it is
    proof source
    metrics/counts
    caveats/risks
    next safe action
```

Scan order:

1. Global trust badge.
2. Health, embeddings, queue.
3. Map node colors.
4. Evidence drawer proof source.

Constraint rule: if only three things can be shown, show trust badge, embedding coverage, and selected proof source.

### Pass 2: Interaction State Coverage

Rating: 5/10 -> 9/10 after this addendum.

Every state must describe what the user sees, not just what the backend returns.

| Feature | Loading | Empty | Error | Success | Partial/Stale |
|---|---|---|---|---|---|
| Overview payload | Skeleton cards in the three columns; no fake green states | "No GBrain overview available" with link/path to the handoff source | Red inline panel with HTTP/status text and retry affordance | Filled cockpit, map, drawer | Badge says "Saved audit" or "Stale audit"; timestamp remains visible |
| Trust badge | "Loading trust state" neutral gray | "No trust state" gray | "Overview unavailable" red | "Trusted", "Trusted with caveats", or "Degraded" | "Saved audit" or "Needs refresh" yellow |
| Trust cockpit | Disabled metric cards with shimmer or quiet placeholders | Empty-state copy: "No proof metrics loaded yet" | Individual cards show failing source when known | Metrics link to evidence drawer | Yellow cards use "Caveat", not "Needs proof", when proof exists |
| Brain map | Nodes hidden until payload exists; grid can show neutral placeholder | Centered empty map with one line of context | Map replaced by error panel if no nodes are usable | Nodes and edges render with selectable states | Caveat nodes remain selectable and evidence-backed |
| Evidence drawer | "Loading evidence..." | "Select a node to inspect proof" | Shows selected error detail if node proof failed | Shows proof, metrics, risks, next action | Shows stale or caveat explanation before next action |
| Node selection | First valid node selected after payload loads | No selected node | Selection preserved if possible after retry | Click and keyboard selection update drawer | If selected node disappears, select GBrain Core and show a short note |

Terminology rules:

- `Verified`: proof exists and no caveat is attached.
- `Verified caveat`: proof exists, but interpretation has a known mismatch or limitation.
- `Degraded`: live proof or saved audit indicates reduced function.
- `Failing`: a required proof path is red or unavailable.
- `No proof`: only when no proof source exists.

### Pass 3: User Journey And Emotional Arc

Rating: 6/10 -> 8.5/10 after this addendum.

```text
STEP | USER DOES | USER FEELS | PLAN SPECIFIES
-----|-----------|------------|---------------
1 | Opens /gbrain | "Is memory healthy?" | Trust badge and core metrics answer immediately.
2 | Scans cockpit | "What changed or needs attention?" | Caveats are visible without reading the map.
3 | Looks at map | "How do Hermes/OpenClaw/Codex relate?" | GBrain Core anchors the system model.
4 | Clicks a node | "Show me the evidence" | Drawer explains proof source, count, freshness, risk.
5 | Sees caveat | "Is this broken?" | Copy says caveat when proof exists, degraded/failing when it does not.
6 | Leaves page | "I know the next safe action" | Drawer ends with a read-only next safe action.
```

Time horizons:

- First 5 seconds: user must know trusted/degraded/caveat and whether embeddings/queue are healthy.
- First 5 minutes: user can inspect the exact proof source for each node.
- Long-term: the surface teaches how GBrain connects Hermes, OpenClaw, Codex, and sources.

### Pass 4: AI Slop Risk

Rating: 7/10 -> 9/10 after this addendum.

Classifier: app UI, not landing page.

Hard rules:

- No hero section, no marketing headline, no generic card mosaic.
- Cards are allowed only for cockpit metrics and evidence chunks because those are the interaction units.
- The map is an explanatory operational model, not decoration.
- Color is status language first, brand mood second.
- Copy must be utility language: status, proof, risk, action.
- Avoid large decorative gradients, floating shapes, or "AI brain" ornamentation.

Litmus checks:

- Brand/product unmistakable in first screen: yes, GBrain title and nav entry.
- One strong visual anchor: yes, GBrain Core node.
- Page understandable by scanning headings only: yes after caveat language is formalized.
- Each section has one job: cockpit = status, map = relationships, drawer = proof.
- Cards necessary: yes for metric and proof units; not for page sections.
- Motion improves hierarchy: optional only, never required for understanding.
- Premium without shadows: must still work via spacing, contrast, and hierarchy.

### Pass 5: Design System Alignment

Rating: 6/10 -> 8/10 after this addendum.

No `DESIGN.md` exists. Until one exists, calibrate to observed Mission Control patterns:

- Background: dark macOS operator console.
- Panels: existing `.macos-panel` and `GlassCard`.
- Radius: 8px for panels and cards, circular only for GBrain Core.
- Typography: compact operator labels, no oversized marketing text.
- Icons: lucide icons only when they clarify function.
- Accent colors: green for verified, yellow for caveat, red for failing, gray for inactive.
- Navigation: use existing sidebar section `Intelligence`.

New component vocabulary introduced by this feature:

- Trust metric card.
- Brain map node.
- Edge label.
- Evidence drawer section.

These must remain local to `/gbrain` until another page needs them.

### Pass 6: Responsive And Accessibility

Rating: 4/10 -> 8.5/10 after this addendum.

Responsive behavior:

- Desktop, 1120px and up: three-column layout: cockpit, map, drawer.
- Tablet, below 1120px: stack vertically in this order: cockpit, drawer, map. Evidence comes before map because proof is more important than the visual model on cramped screens.
- Mobile, below 720px: map becomes a compact node list plus optional mini-map. If the map remains visible, nodes must not overlap and labels must fit.
- No text may rely on hover to be understandable.
- Touch targets must be at least 44px.

Keyboard behavior:

- Trust metric cards and map nodes are buttons.
- Tab order follows scan order: trust badge, cockpit metrics, map nodes, drawer actions if any.
- Selected node has a visible focus state and selected state.
- Enter/Space selects a node and updates the evidence drawer.

Screen-reader behavior:

- Map container needs an accessible name: "GBrain relationship map".
- Each node button label should include label, status, and short proof state.
- Edge lines are decorative unless individually selectable; hide non-interactive SVG edges from screen readers.
- Evidence drawer should announce selected node changes via polite live region if implemented later.

Contrast:

- Body text must meet 4.5:1 where practical.
- Tiny secondary labels may be muted, but not if they carry status or proof meaning.

### Pass 7: Unresolved Design Decisions

Rating: 5/10 -> 8/10 after this addendum.

| Decision Needed | Recommendation | If Deferred |
|---|---|---|
| Should Codex be one node or split into Codex App, memories, and sessions? | Keep one node in V1; split only when live data distinguishes the parts. | Map grows before the proof model can support it. |
| What is the mobile map fallback? | Use cockpit + evidence first, then compact node list/mini-map. | Mobile users get a pretty but low-legibility graph. |
| What does "caveat" mean visually? | Yellow status, "Verified caveat" label, proof still visible. | Users read caveats as failures or missing proof. |
| How fresh is too stale? | V1 shows saved-audit timestamp; live endpoint later defines freshness thresholds. | Users may mistake old audit data for live health. |
| Are edge labels selectable? | No in V1; node selection owns drawer updates. | Edge interactions add complexity without enough evidence data. |

### PR Design Acceptance Criteria

Before PR review, verify:

- `/gbrain` has no "Needs proof" language for evidence-backed caveats.
- Every yellow state has a proof source and caveat copy.
- Every metric card and map node is keyboard-selectable.
- Drawer updates when selecting at least GBrain Core, Source Systems, and Google Bridge.
- API error state is visible and does not leave stale green UI in place.
- Mobile below 720px does not overlap node labels or clip drawer text.
- Build passes.
- Focused lint on touched GBrain frontend files passes.

Overall design completeness after this addendum: 8.5/10.

Remaining risk: visual mockups were not generated because the gstack designer binary was unavailable. Run a live `/design-review` after implementation to catch pixel-level spacing, contrast, and responsive issues.
