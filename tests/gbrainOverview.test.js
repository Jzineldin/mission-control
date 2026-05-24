const assert = require('node:assert/strict');

const {
  buildGBrainOverview,
  buildLiveGBrainHealth,
  buildLiveGBrainSources,
} = require('../server/routes/gbrain');

(function testOverviewIsReadOnlyAndEvidenceBacked() {
  const overview = buildGBrainOverview();

  assert.equal(overview.ok, true);
  assert.equal(overview.mode, 'read-only-fixture');
  assert.equal(overview.title, 'GBrain');
  assert.equal(overview.trust.status, 'warning');
  assert.equal(overview.trust.label, 'Trusted with caveats');
  assert.ok(overview.nodes.length >= 6);
  assert.ok(overview.edges.length >= 5);
  assert.equal(overview.warnings.length, 0);
  assert.ok(overview.caveats.length >= 2);

  for (const node of overview.nodes) {
    assert.ok(node.proof?.source, `${node.id} is missing proof source`);
    assert.ok(node.proof?.detail, `${node.id} is missing proof detail`);
    assert.ok(node.nextSafeAction, `${node.id} is missing read-only next action`);
  }
})();

(function testCaveatNodesAreEvidenceBackedNotProofless() {
  const overview = buildGBrainOverview();
  const sources = overview.nodes.find((node) => node.id === 'sources');
  const googleBridge = overview.nodes.find((node) => node.id === 'google-bridge');

  assert.ok(sources);
  assert.ok(googleBridge);
  assert.equal(sources.status, 'warning');
  assert.equal(googleBridge.status, 'warning');
  assert.match(sources.summary, /verified/i);
  assert.match(googleBridge.proof.label, /caveat/i);
  assert.doesNotMatch(sources.nextSafeAction, /missing proof/i);
  assert.doesNotMatch(googleBridge.nextSafeAction, /missing proof/i);
})();

(function testCoreAuditNumbersArePresent() {
  const overview = buildGBrainOverview();
  const core = overview.nodes.find((node) => node.id === 'gbrain-core');
  const queues = overview.nodes.find((node) => node.id === 'queues');

  assert.ok(core);
  assert.ok(queues);
  assert.equal(core.metrics.find((metric) => metric.label === 'Pages')?.value, '15,713');
  assert.equal(core.metrics.find((metric) => metric.label === 'Embedded')?.value, '191,638');
  assert.equal(queues.metrics.find((metric) => metric.label === 'Missing')?.value, '0');
  assert.equal(overview.cockpit.embeddings.value, '100%');
})();

async function testLiveHealthNormalizesReadOnlyProbe() {
  const execFilePromise = async (bin, args) => {
    assert.equal(bin, 'gbrain');
    if (args.join(' ') === 'health --json') {
      return {
        stdout: JSON.stringify({
          status: 'healthy',
          health_score: 100,
          pages: 12,
          chunks: 34,
          embedded: 34,
          missing_embeddings: 0,
          embed_coverage: 1,
        }),
        stderr: '',
      };
    }
    if (args.join(' ') === 'jobs stats --json') {
      return { stdout: JSON.stringify({ waiting: 0, active: 0, stalled: 0 }), stderr: '' };
    }
    throw new Error(`Unexpected command ${args.join(' ')}`);
  };

  const health = await buildLiveGBrainHealth({ execFilePromise });
  const overview = buildGBrainOverview({ health });

  assert.equal(health.ok, true);
  assert.equal(health.mode, 'live-read-only');
  assert.equal(health.metrics.pages, 12);
  assert.equal(overview.mode, 'live-read-only');
  assert.equal(overview.cockpit.health.value, '100/100');
  assert.equal(overview.cockpit.queue.value, '0 / 0 / 0');
  assert.equal(overview.nodes.find((node) => node.id === 'gbrain-core')?.proof.source, 'gbrain health --json');
}

async function testLiveSourcesDoNotExposeLocalPaths() {
  const execFilePromise = async (bin, args) => {
    assert.equal(bin, 'gbrain');
    assert.deepEqual(args, ['sources', 'list', '--json']);
    return {
      stdout: JSON.stringify({
        sources: [
          { id: 'mission-control', status: 'clean', pages: 10, local_path: '/Users/example/secret' },
          { id: 'clawd', clone_state: 'corrupted', chunks: 20 },
          { id: 'gbrain', federated: true, page_count: 5, last_sync_at: '2026-05-24T12:00:00.000Z' },
        ],
      }),
      stderr: '',
    };
  };

  const sources = await buildLiveGBrainSources({ execFilePromise });
  const serialized = JSON.stringify(sources);

  assert.equal(sources.ok, true);
  assert.equal(sources.count, 3);
  assert.equal(sources.totalPages, 15);
  assert.equal(sources.healthyCount, 2);
  assert.equal(sources.warningCount, 1);
  assert.doesNotMatch(serialized, /\/Users\/example/);
  assert.deepEqual(sources.sources[0], {
    id: 'mission-control',
    status: 'clean',
    pages: 10,
    chunks: null,
  });
}

async function testLiveSourcesFallsBackToTextOutput() {
  const calls = [];
  const execFilePromise = async (bin, args) => {
    assert.equal(bin, 'gbrain');
    calls.push(args.join(' '));
    if (args.join(' ') === 'sources list --json') {
      const error = new Error('unknown option --json');
      error.stderr = error.message;
      throw error;
    }
    return {
      stdout: [
        'id path status',
        'mission-control /Users/example/mission-control clean',
        'clawd /Users/example/clawd corrupted',
      ].join('\n'),
      stderr: '',
    };
  };

  const sources = await buildLiveGBrainSources({ execFilePromise });
  const serialized = JSON.stringify(sources);

  assert.deepEqual(calls, ['sources list --json', 'sources list']);
  assert.equal(sources.ok, true);
  assert.equal(sources.count, 2);
  assert.equal(sources.warningCount, 1);
  assert.doesNotMatch(serialized, /\/Users\/example/);
}

async function testLiveHealthFallsBackToTextOutput() {
  const execFilePromise = async (bin, args) => {
    assert.equal(bin, 'gbrain');
    if (args.join(' ') === 'health --json') {
      return {
        stdout: [
          'Health score: 7/10',
          'Embed coverage: 100.0%',
          'Missing embeddings: 1',
          'Stale pages: 11',
        ].join('\n'),
        stderr: '',
      };
    }
    if (args.join(' ') === 'jobs stats --json') {
      return {
        stdout: [
          'Job Stats (last 24h):',
          '  Queue health: 0 waiting, 0 active, 0 stalled',
        ].join('\n'),
        stderr: '',
      };
    }
    throw new Error(`Unexpected command ${args.join(' ')}`);
  };

  const health = await buildLiveGBrainHealth({ execFilePromise });
  const overview = buildGBrainOverview({ health });

  assert.equal(health.ok, true);
  assert.equal(health.score, 70);
  assert.equal(health.metrics.embeddingCoverage, 100);
  assert.equal(health.metrics.missingEmbeddings, 1);
  assert.equal(health.metrics.queue.waiting, 0);
  assert.equal(overview.cockpit.health.value, '70/100');
  assert.equal(overview.cockpit.embeddings.value, '100%');
  assert.equal(overview.cockpit.embeddings.detail, '1 missing');
  assert.equal(overview.cockpit.queue.value, '0 / 0 / 0');
}

async function testOverviewUsesLiveSourcePageTotalWhenHealthOmitsPages() {
  const checkedAt = '2026-05-24T12:15:00.000Z';
  const overview = buildGBrainOverview({
    health: {
      ok: true,
      mode: 'live-read-only',
      checkedAt,
      status: 'healthy',
      score: 70,
      metrics: {
        pages: null,
        chunks: null,
        embedded: null,
        missingEmbeddings: 1,
        embeddingCoverage: 100,
        queue: { waiting: 0, active: 0, stalled: 0 },
      },
    },
    sources: {
      ok: true,
      mode: 'live-read-only',
      checkedAt,
      count: 2,
      totalPages: 123,
      healthyCount: 1,
      warningCount: 0,
      sources: [],
    },
  });

  const core = overview.nodes.find((node) => node.id === 'gbrain-core');
  const sources = overview.nodes.find((node) => node.id === 'sources');

  assert.equal(core.metrics.find((metric) => metric.label === 'Pages')?.value, '123');
  assert.equal(sources.metrics.find((metric) => metric.label === 'Source pages')?.value, '123');
}

async function testLiveFailureIsSafeJson() {
  const execFilePromise = async () => {
    const error = new Error('Cannot connect to database: connect ECONNREFUSED 127.0.0.1:5432 in /Users/example/.gbrain');
    error.stderr = error.message;
    throw error;
  };

  const health = await buildLiveGBrainHealth({ execFilePromise });

  assert.equal(health.ok, false);
  assert.equal(health.status, 'unavailable');
  assert.match(health.error, /ECONNREFUSED/);
  assert.doesNotMatch(health.error, /\/Users\/example/);
}

async function testOverviewShowsLiveAttemptWhenRuntimeUnavailable() {
  const checkedAt = '2026-05-24T12:10:00.000Z';
  const overview = buildGBrainOverview({
    health: {
      ok: false,
      mode: 'live-read-only',
      checkedAt,
      status: 'unavailable',
      error: 'Cannot connect to database',
    },
    sources: {
      ok: false,
      mode: 'live-read-only',
      checkedAt,
      status: 'unavailable',
      error: 'Cannot connect to database',
      sources: [],
    },
  });

  const core = overview.nodes.find((node) => node.id === 'gbrain-core');
  const sources = overview.nodes.find((node) => node.id === 'sources');

  assert.equal(overview.mode, 'live-read-only');
  assert.equal(overview.refreshedAt, checkedAt);
  assert.equal(overview.trust.lastVerifiedAt, checkedAt);
  assert.equal(overview.trust.label, 'Live check unavailable');
  assert.equal(overview.trust.status, 'critical');
  assert.equal(overview.cockpit.health.value, 'Unavailable');
  assert.equal(overview.cockpit.queue.value, 'Unavailable');
  assert.equal(overview.cockpit.embeddings.detail, 'health probe unavailable');
  assert.equal(overview.cockpit.caveats.detail, 'Static caveats; source probe unavailable');
  assert.equal(core.status, 'critical');
  assert.equal(core.proof.source, 'gbrain health --json');
  assert.match(core.proof.detail, /unavailable/i);
  assert.equal(sources.status, 'critical');
  assert.match(overview.handoff.recommendedNextSlice, /connected read-only/i);
}

(async () => {
  await testLiveHealthNormalizesReadOnlyProbe();
  await testLiveSourcesDoNotExposeLocalPaths();
  await testLiveSourcesFallsBackToTextOutput();
  await testLiveHealthFallsBackToTextOutput();
  await testOverviewUsesLiveSourcePageTotalWhenHealthOmitsPages();
  await testLiveFailureIsSafeJson();
  await testOverviewShowsLiveAttemptWhenRuntimeUnavailable();

  console.log('gbrainOverview tests passed');
})();
