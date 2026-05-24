const express = require('express');

const AUDIT_REPORT_PATH = '/Users/yordamkocatepe/hermes-workspace/reports/gbrain-full-audit-20260524.md';
const DESIGN_HANDOFF_PATH = '/Users/yordamkocatepe/clawd/mission-control/docs/gbrain-hybrid-brain-view-handoff-20260524.md';
const AUDIT_VERIFIED_AT = '2026-05-24T00:00:00.000Z';

function buildGBrainOverview() {
  const nodes = [
    {
      id: 'gbrain-core',
      label: 'GBrain Core',
      kind: 'core',
      status: 'healthy',
      summary: 'Postgres-backed local shared memory for Hermes, OpenClaw, and Codex.',
      proof: {
        label: 'Hermes audit',
        source: AUDIT_REPORT_PATH,
        verifiedAt: AUDIT_VERIFIED_AT,
        detail: 'Installed GBrain 0.40.2.0; engine is Postgres-backed; health 9/10.',
      },
      metrics: [
        { label: 'Pages', value: '15,713' },
        { label: 'Chunks', value: '191,638' },
        { label: 'Embedded', value: '191,638' },
      ],
      risks: [
        'Green state is based on the latest saved audit, not a live mutation or repair run.',
      ],
      nextSafeAction: 'Add a live read-only health endpoint after the UI model settles.',
    },
    {
      id: 'hermes',
      label: 'Hermes hmudur',
      kind: 'agent',
      status: 'healthy',
      summary: 'Conversational operator surface reading GBrain through the MCP bridge.',
      proof: {
        label: 'Read smoke passed',
        source: AUDIT_REPORT_PATH,
        verifiedAt: AUDIT_VERIFIED_AT,
        detail: 'Hermes hmudur read smoke passed through GBrain MCP.',
      },
      metrics: [{ label: 'Bridge', value: 'MCP read' }],
      risks: [],
      nextSafeAction: 'Store bridge smoke results as structured JSON instead of report text.',
    },
    {
      id: 'openclaw',
      label: 'OpenClaw',
      kind: 'agent',
      status: 'healthy',
      summary: 'Runtime tool surface with verified GBrain tool-call reads.',
      proof: {
        label: 'Tool smoke passed',
        source: AUDIT_REPORT_PATH,
        verifiedAt: AUDIT_VERIFIED_AT,
        detail: 'OpenClaw read smoke passed through GBrain tool with failures 0.',
      },
      metrics: [{ label: 'Failures', value: '0' }],
      risks: [],
      nextSafeAction: 'Expose latest gateway bridge proof without writing to memory.',
    },
    {
      id: 'codex',
      label: 'Codex',
      kind: 'agent',
      status: 'healthy',
      summary: 'Local Codex memories and workspace sessions included as GBrain sources.',
      proof: {
        label: 'Source registered',
        source: AUDIT_REPORT_PATH,
        verifiedAt: AUDIT_VERIFIED_AT,
        detail: 'Sources include codex-memories and mission-control.',
      },
      metrics: [{ label: 'Mode', value: 'source' }],
      risks: ['Codex is represented as one node in v1; App, memories, and sessions may split later.'],
      nextSafeAction: 'Decide whether Codex needs separate app, memory, and workspace nodes.',
    },
    {
      id: 'sources',
      label: 'Source Systems',
      kind: 'source',
      status: 'warning',
      summary: 'Project sources feeding the shared brain, verified by the saved audit with one source-status caveat.',
      proof: {
        label: 'Source list captured',
        source: AUDIT_REPORT_PATH,
        verifiedAt: AUDIT_VERIFIED_AT,
        detail: 'Sources include clawd, hermes-agent, gbrain, codex-memories, finance-analyzer, mission-control, PDFQuickFix, JapaneseBuddy, gstack.',
      },
      metrics: [{ label: 'Known sources', value: '9' }],
      risks: ['sources_status clawd can report clone_state: corrupted even when git fsck and dry-run sync are clean. Treat this as a diagnostic mismatch, not missing proof.'],
      nextSafeAction: 'Add structured source freshness later; keep this node evidence-backed with a visible caveat.',
    },
    {
      id: 'queues',
      label: 'Embedding Queues',
      kind: 'queue',
      status: 'healthy',
      summary: 'Embedding coverage and minion queue are clean in the latest audit.',
      proof: {
        label: 'Queue audit',
        source: AUDIT_REPORT_PATH,
        verifiedAt: AUDIT_VERIFIED_AT,
        detail: 'Embed coverage 100%; missing embeddings 0; 0 waiting, 0 active, 0 stalled.',
      },
      metrics: [
        { label: 'Coverage', value: '100%' },
        { label: 'Missing', value: '0' },
        { label: 'Stalled', value: '0' },
      ],
      risks: [],
      nextSafeAction: 'Refresh at a conservative interval to avoid false negatives or extra load.',
    },
    {
      id: 'google-bridge',
      label: 'Google Bridge',
      kind: 'bridge',
      status: 'warning',
      summary: 'Custom local bridge caveat is documented: the official integrations doctor is not the proof source for it.',
      proof: {
        label: 'Bridge caveat captured',
        source: AUDIT_REPORT_PATH,
        verifiedAt: AUDIT_VERIFIED_AT,
        detail: 'Official integrations doctor does not represent the custom local Google bridge.',
      },
      metrics: [{ label: 'Doctor signal', value: 'mismatch' }],
      risks: ['Do not treat official doctor output as proof of this custom local bridge; use bridge-specific proof when available.'],
      nextSafeAction: 'Add a bridge-specific proof record later; do not block the overview on official doctor mismatch.',
    },
  ];

  const edges = [
    { id: 'edge-hermes-gbrain', from: 'hermes', to: 'gbrain-core', label: 'read', status: 'healthy', proofNodeId: 'hermes' },
    { id: 'edge-openclaw-gbrain', from: 'openclaw', to: 'gbrain-core', label: 'tool read', status: 'healthy', proofNodeId: 'openclaw' },
    { id: 'edge-codex-gbrain', from: 'codex', to: 'gbrain-core', label: 'source sync', status: 'healthy', proofNodeId: 'codex' },
    { id: 'edge-sources-gbrain', from: 'sources', to: 'gbrain-core', label: 'sync', status: 'warning', proofNodeId: 'sources' },
    { id: 'edge-queues-gbrain', from: 'queues', to: 'gbrain-core', label: 'embed', status: 'healthy', proofNodeId: 'queues' },
    { id: 'edge-google-gbrain', from: 'google-bridge', to: 'gbrain-core', label: 'bridge', status: 'warning', proofNodeId: 'google-bridge' },
  ];

  return {
    ok: true,
    mode: 'read-only-fixture',
    refreshedAt: new Date().toISOString(),
    evidenceFreshness: 'saved-audit',
    title: 'GBrain',
    subtitle: 'Shared memory for Hermes, OpenClaw, and Codex',
    trust: {
      label: 'Trusted with caveats',
      status: 'warning',
      score: 90,
      lastVerifiedAt: AUDIT_VERIFIED_AT,
      source: AUDIT_REPORT_PATH,
    },
    cockpit: {
      health: { label: 'Health', value: '9/10', status: 'healthy', proofNodeId: 'gbrain-core' },
      embeddings: { label: 'Embeddings', value: '100%', detail: '0 missing', status: 'healthy', proofNodeId: 'queues' },
      queue: { label: 'Queue', value: '0 / 0 / 0', detail: 'waiting / active / stalled', status: 'healthy', proofNodeId: 'queues' },
      autopilot: { label: 'Autopilot', value: 'Read-only', detail: 'No mutation controls in v1', status: 'inactive', proofNodeId: 'gbrain-core' },
      bridge: { label: 'Bridge proof', value: '2 passed', detail: 'Hermes + OpenClaw read smokes', status: 'healthy', proofNodeId: 'hermes' },
      caveats: { label: 'Caveats', value: '2', detail: 'Google bridge doctor mismatch; clawd clone_state mismatch', status: 'warning', proofNodeId: 'google-bridge' },
    },
    nodes,
    edges,
    caveats: [
      'Official integrations doctor does not represent the custom local Google bridge.',
      'sources_status clawd can report clone_state: corrupted even when local git fsck and dry-run sync are clean.',
    ],
    warnings: [],
    handoff: {
      source: DESIGN_HANDOFF_PATH,
      recommendedNextSlice: 'Add live health/source endpoints after the static overview proves the UI model.',
    },
  };
}

function buildGBrainRouter() {
  const router = express.Router();

  router.get('/api/gbrain/overview', (req, res) => {
    res.json(buildGBrainOverview());
  });

  return router;
}

module.exports = {
  buildGBrainOverview,
  buildGBrainRouter,
};
