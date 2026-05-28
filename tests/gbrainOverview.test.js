const assert = require('node:assert/strict');

const {
  buildGBrainOverview,
  buildLiveGBrainHealth,
  buildLiveGBrainSources,
  buildLiveGBrainVersion,
  listGBrainActions,
  runGBrainAction,
  sanitizeMessage,
} = require('../server/routes/gbrain');

(function testOverviewIsReadOnlyAndEvidenceBacked() {
  const overview = buildGBrainOverview();

  assert.equal(overview.ok, true);
  assert.equal(overview.mode, 'read-only-fixture');
  assert.equal(overview.title, 'GBrain');
  assert.equal(overview.trust.status, 'warning');
  assert.equal(overview.trust.label, 'Trusted');
  assert.ok(overview.nodes.length >= 6);
  assert.ok(overview.edges.length >= 5);
  assert.equal(overview.warnings.length, 0);
  assert.equal(overview.caveats.length, 0);

  for (const node of overview.nodes) {
    assert.ok(node.proof?.source, `${node.id} is missing proof source`);
    assert.ok(node.proof?.detail, `${node.id} is missing proof detail`);
    assert.ok(node.nextSafeAction, `${node.id} is missing read-only next action`);
  }
})();

(function testBridgeNodesAreEvidenceBackedNotProofless() {
  const overview = buildGBrainOverview();
  const sources = overview.nodes.find((node) => node.id === 'sources');
  const googleBridge = overview.nodes.find((node) => node.id === 'google-bridge');

  assert.ok(sources);
  assert.ok(googleBridge);
  assert.equal(sources.status, 'warning');
  assert.equal(googleBridge.status, 'healthy');
  assert.match(sources.summary, /verified/i);
  assert.match(googleBridge.proof.label, /proof/i);
  assert.doesNotMatch(googleBridge.summary, /caveat/i);
  assert.doesNotMatch(googleBridge.proof.detail, /does not represent/i);
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

(function testSanitizeMessageRedactsMacAndLinuxHomePaths() {
  const message = sanitizeMessage('failed in /Users/example/.gbrain and /home/alice/.gbrain with sk-secret');

  assert.doesNotMatch(message, /\/Users\/example/);
  assert.doesNotMatch(message, /\/home\/alice/);
  assert.doesNotMatch(message, /sk-secret/);
  assert.match(message, /~/);
})();

async function testLiveHealthNormalizesReadOnlyProbe() {
  const execFilePromise = async (bin, args) => {
    assert.equal(bin, 'gbrain');
    if (args.join(' ') === 'call get_health') {
      return {
        stdout: JSON.stringify({
          status: 'healthy',
          brain_score: 100,
          health_score: 8,
          page_count: 12,
          chunk_count: 34,
          embedded_count: 34,
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
  assert.equal(health.score, 100);
  assert.equal(health.metrics.pages, 12);
  assert.equal(overview.mode, 'live-read-only');
  assert.equal(overview.cockpit.health.value, '100/100');
  assert.equal(overview.cockpit.queue.value, '0 / 0 / 0');
  assert.equal(overview.nodes.find((node) => node.id === 'gbrain-core')?.proof.source, 'gbrain call get_health');
}

async function testLiveHealthBackfillsInventoryFromStatsText() {
  const execFilePromise = async (bin, args) => {
    assert.equal(bin, 'gbrain');
    if (args.join(' ') === 'call get_health') {
      return {
        stdout: JSON.stringify({
          status: 'healthy',
          brain_score: 100,
          page_count: 16452,
          missing_embeddings: 0,
          stale_pages: 0,
          embed_coverage: 1,
        }),
        stderr: '',
      };
    }
    if (args.join(' ') === 'jobs stats --json') {
      return { stdout: 'Queue health: 0 waiting, 0 active, 0 stalled', stderr: '' };
    }
    if (args.join(' ') === 'stats --json') {
      return {
        stdout: ['Pages:     16452', 'Chunks:    196692', 'Embedded:  196692'].join('\n'),
        stderr: '',
      };
    }
    throw new Error(`Unexpected command ${args.join(' ')}`);
  };

  const health = await buildLiveGBrainHealth({ execFilePromise });
  const overview = buildGBrainOverview({ health });
  const core = overview.nodes.find((node) => node.id === 'gbrain-core');

  assert.equal(health.metrics.chunks, 196692);
  assert.equal(health.metrics.embedded, 196692);
  assert.equal(core.metrics.find((metric) => metric.label === 'Chunks')?.value, '196,692');
  assert.equal(core.metrics.find((metric) => metric.label === 'Embedded')?.value, '196,692');
}

async function testLiveVersionAppearsInOverview() {
  const execFilePromise = async (bin, args) => {
    assert.equal(bin, 'gbrain');
    assert.deepEqual(args, ['--version']);
    return { stdout: 'gbrain 0.41.14.0\n', stderr: '' };
  };

  const version = await buildLiveGBrainVersion({ execFilePromise });
  const overview = buildGBrainOverview({ version });
  const core = overview.nodes.find((node) => node.id === 'gbrain-core');

  assert.equal(version.ok, true);
  assert.equal(version.version, '0.41.14.0');
  assert.equal(overview.cockpit.version.label, 'Active version');
  assert.equal(overview.cockpit.version.value, '0.41.14.0');
  assert.equal(core.metrics.find((metric) => metric.label === 'Version')?.value, '0.41.14.0');
}

async function testLiveSourcesDoNotExposeLocalPaths() {
  const freshAt = new Date().toISOString();
  const execFilePromise = async (bin, args) => {
    assert.equal(bin, 'gbrain');
    assert.deepEqual(args, ['sources', 'list', '--json']);
    return {
      stdout: JSON.stringify({
        sources: [
          { id: 'mission-control', status: 'clean', pages: 10, local_path: '/Users/example/secret', last_sync_at: freshAt },
          { id: 'clawd', clone_state: 'corrupted', chunks: 20 },
          { id: 'gbrain', federated: true, page_count: 5, last_sync_at: freshAt },
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
  assert.equal(sources.freshness.staleCount, 1);
  assert.doesNotMatch(serialized, /\/Users\/example/);
  assert.equal(sources.sources[0].id, 'mission-control');
  assert.equal(sources.sources[0].status, 'clean');
  assert.equal(sources.sources[0].pages, 10);
  assert.equal(sources.sources[0].chunks, null);
  assert.equal(sources.sources[0].freshness.status, 'healthy');
}

async function testDefaultSourceWithoutPathIsNotFreshnessStale() {
  const freshAt = new Date().toISOString();
  const execFilePromise = async (bin, args) => {
    assert.equal(bin, 'gbrain');
    assert.deepEqual(args, ['sources', 'list', '--json']);
    return {
      stdout: JSON.stringify({
        sources: [
          { id: 'default', name: 'default', local_path: null, federated: false, page_count: 3091, last_sync_at: null },
          { id: 'mission-control', status: 'clean', pages: 10, local_path: '/Users/example/secret', last_sync_at: freshAt },
        ],
      }),
      stderr: '',
    };
  };

  const sources = await buildLiveGBrainSources({ execFilePromise });
  const overview = buildGBrainOverview({ sources });
  const defaultSource = sources.sources.find((source) => source.id === 'default');

  assert.equal(sources.count, 2);
  assert.equal(sources.warningCount, 0);
  assert.equal(sources.freshness.staleCount, 0);
  assert.equal(sources.freshness.untrackedCount, 1);
  assert.equal(defaultSource.freshness.status, 'inactive');
  assert.match(defaultSource.freshness.label, /not applicable/i);
  assert.equal(overview.cockpit.freshness.value, 'Fresh');
  assert.match(overview.cockpit.freshness.detail, /sync-tracked sources fresh/i);
}

async function testLiveSourcesCountsUnknownStatusesAsWarnings() {
  const freshAt = new Date().toISOString();
  const execFilePromise = async (bin, args) => {
    assert.equal(bin, 'gbrain');
    assert.deepEqual(args, ['sources', 'list', '--json']);
    return {
      stdout: JSON.stringify({
        sources: [
          { id: 'mission-control', status: 'clean', pages: 10, last_sync_at: freshAt },
          { id: 'clawd', status: 'unknown', pages: 0 },
          { id: 'hermes', federated: false, pages: 0, last_sync_at: freshAt },
        ],
      }),
      stderr: '',
    };
  };

  const sources = await buildLiveGBrainSources({ execFilePromise });
  const overview = buildGBrainOverview({ sources });
  const sourceNode = overview.nodes.find((node) => node.id === 'sources');

  assert.equal(sources.count, 3);
  assert.equal(sources.healthyCount, 2);
  assert.equal(sources.warningCount, 1);
  assert.equal(sources.freshness.staleCount, 1);
  assert.equal(sourceNode.status, 'warning');
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
  assert.equal(sources.warningCount, 2);
  assert.equal(sources.freshness.staleCount, 2);
  assert.doesNotMatch(serialized, /\/Users\/example/);
}

async function testLiveHealthFallsBackToTextOutput() {
  const execFilePromise = async (bin, args) => {
    assert.equal(bin, 'gbrain');
    if (args.join(' ') === 'call get_health') {
      const error = new Error('raw get_health unavailable');
      error.stderr = error.message;
      throw error;
    }
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
  assert.equal(overview.cockpit.health.status, 'warning');
  assert.equal(overview.cockpit.embeddings.value, '100%');
  assert.equal(overview.cockpit.embeddings.detail, '11 stale pages');
  assert.equal(overview.cockpit.queue.value, '0 / 0 / 0');
  assert.equal(overview.nodes.find((node) => node.id === 'gbrain-core')?.status, 'warning');
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

async function testOverviewDoesNotMarkUnknownLiveSourcesHealthy() {
  const checkedAt = '2026-05-24T12:18:00.000Z';
  const overview = buildGBrainOverview({
    sources: {
      ok: true,
      mode: 'live-read-only',
      checkedAt,
      count: 2,
      totalPages: 0,
      healthyCount: 1,
      warningCount: 1,
      sources: [
        { id: 'mission-control', status: 'unknown', pages: null, chunks: null },
        { id: 'clawd', status: 'isolated', pages: null, chunks: null },
      ],
    },
  });

  const sources = overview.nodes.find((node) => node.id === 'sources');
  const edge = overview.edges.find((item) => item.id === 'edge-sources-gbrain');

  assert.equal(sources.status, 'warning');
  assert.equal(edge.status, 'warning');
  assert.equal(overview.cockpit.caveats.detail, '1 live source reported a warning status.');
}

async function testStaleSourceFreshnessDowngradesLiveTrust() {
  const execFilePromise = async (bin, args) => {
    assert.equal(bin, 'gbrain');
    assert.deepEqual(args, ['sources', 'list', '--json']);
    return {
      stdout: JSON.stringify({
        sources: [
          { id: 'mission-control', status: 'clean', pages: 10, last_sync_at: '2000-01-01T00:00:00.000Z' },
          { id: 'codex-memories', status: 'clean', pages: 2, last_sync_at: new Date().toISOString() },
        ],
      }),
      stderr: '',
    };
  };

  const sources = await buildLiveGBrainSources({ execFilePromise });
  const overview = buildGBrainOverview({
    health: {
      ok: true,
      mode: 'live-read-only',
      checkedAt: sources.checkedAt,
      status: 'healthy',
      score: 100,
      metrics: {
        pages: 12,
        chunks: 20,
        embedded: 20,
        missingEmbeddings: 0,
        stalePages: 0,
        embeddingCoverage: 100,
        queue: { waiting: 0, active: 0, stalled: 0 },
      },
    },
    sources,
  });

  const sourceNode = overview.nodes.find((node) => node.id === 'sources');
  const sourceEdge = overview.edges.find((edge) => edge.id === 'edge-sources-gbrain');

  assert.equal(sources.freshness.status, 'warning');
  assert.equal(sources.freshness.staleCount, 1);
  assert.equal(sources.sources[0].freshness.thresholdHours, 12);
  assert.equal(sourceNode.status, 'warning');
  assert.equal(sourceEdge.status, 'warning');
  assert.equal(overview.trust.label, 'Live data stale');
  assert.equal(overview.cockpit.freshness.value, '1 stale');
  assert.match(overview.cockpit.freshness.detail, /1 source stale/i);
  assert.match(sourceNode.nextSafeAction, /Refresh stale source syncs/i);
  assert.match(overview.caveats.join(' '), /exceeded freshness thresholds/i);
  assert.match(JSON.stringify(overview.live.sources), /mission-control/);
}

async function testHealthStalePagesDowngradesLiveTrust() {
  const overview = buildGBrainOverview({
    health: {
      ok: true,
      mode: 'live-read-only',
      checkedAt: '2026-05-24T12:20:00.000Z',
      status: 'healthy',
      score: 100,
      metrics: {
        pages: 10,
        chunks: 20,
        embedded: 20,
        missingEmbeddings: 0,
        stalePages: 3,
        embeddingCoverage: 100,
        queue: { waiting: 0, active: 0, stalled: 0 },
      },
    },
  });

  const core = overview.nodes.find((node) => node.id === 'gbrain-core');

  assert.equal(overview.trust.label, 'Live data stale');
  assert.equal(overview.trust.status, 'warning');
  assert.equal(overview.cockpit.embeddings.detail, '3 stale pages');
  assert.equal(core.status, 'warning');
  assert.equal(core.metrics.find((metric) => metric.label === 'Stale pages')?.value, '3');
}

async function testMissingEmbeddingsDowngradesQueueTrust() {
  const overview = buildGBrainOverview({
    health: {
      ok: true,
      mode: 'live-read-only',
      checkedAt: '2026-05-26T14:52:00.000Z',
      status: 'healthy',
      score: 100,
      metrics: {
        pages: 10,
        chunks: 20,
        embedded: 18,
        missingEmbeddings: 2,
        stalePages: 0,
        embeddingCoverage: 100,
        queue: { waiting: 0, active: 0, stalled: 0 },
      },
    },
  });

  const queues = overview.nodes.find((node) => node.id === 'queues');

  assert.equal(overview.cockpit.embeddings.detail, '2 missing');
  assert.equal(overview.cockpit.embeddings.status, 'warning');
  assert.equal(queues.status, 'warning');
  assert.match(queues.summary, /2 missing embeddings/i);
  assert.match(queues.risks.join(' '), /2 missing embeddings/i);
  assert.match(queues.nextSafeAction, /repair\/backfill/i);
  assert.match(overview.caveats.join(' '), /2 missing embeddings/i);
}

async function testOverviewDoesNotDefaultMissingLiveQueueToZero() {
  const checkedAt = '2026-05-24T12:20:00.000Z';
  const overview = buildGBrainOverview({
    health: {
      ok: true,
      mode: 'live-read-only',
      checkedAt,
      status: 'healthy',
      score: 100,
      metrics: {
        pages: 10,
        chunks: 20,
        embedded: 20,
        missingEmbeddings: 0,
        embeddingCoverage: 100,
        queue: { waiting: null, active: null, stalled: null },
      },
    },
  });

  const queues = overview.nodes.find((node) => node.id === 'queues');

  assert.equal(overview.cockpit.queue.value, 'Unavailable');
  assert.equal(overview.cockpit.queue.detail, 'jobs stats unavailable');
  assert.equal(overview.cockpit.queue.status, 'warning');
  assert.equal(queues.status, 'warning');
  assert.equal(queues.metrics.find((metric) => metric.label === 'Stalled')?.value, 'Unavailable');
  assert.match(queues.proof.detail, /jobs stats counters were unavailable/i);
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

async function testGBrainActionRunsOnlyAllowlistedCommand() {
  const expected = new Map([
    ['doctor-fast', ['doctor', '--json', '--fast']],
    ['preview-sync', ['sync', '--all', '--no-pull', '--parallel', '1', '--dry-run', '--json', '--yes']],
    ['sync-sources', [
      ['sync', '--all', '--no-pull', '--parallel', '1', '--json', '--yes'],
      ['embed', '--stale'],
    ]],
    ['retry-failed-sync', [
      ['sync', '--all', '--retry-failed', '--serial', '--no-pull', '--json', '--yes'],
      ['embed', '--stale'],
    ]],
    ['embed-stale', ['embed', '--stale']],
    ['check-resolvable', ['check-resolvable', '--json']],
    ['storage-status', ['storage', 'status', '--json']],
  ]);

  for (const [action, expectedCalls] of expected.entries()) {
    const calls = [];
    const optionsByCall = [];
    const execFilePromise = async (bin, args, options) => {
      assert.equal(bin, 'gbrain');
      calls.push(args);
      optionsByCall.push(options);
      return {
        stdout: JSON.stringify({
          ok_count: 2,
          error_count: 0,
          repoPath: '/Users/example/private',
          nested: { secret: 'sk-secret' },
          '/Users/example/private/file.md': { reason: 'sk-secret' },
        }),
        stderr: 'Synced /Users/example/private with sk-secret',
      };
    };

    const result = await runGBrainAction(action, { execFilePromise });
    const serialized = JSON.stringify(result);

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'live-write');
    assert.deepEqual(calls, Array.isArray(expectedCalls[0]) ? expectedCalls : [expectedCalls]);
    if (action === 'sync-sources' || action === 'retry-failed-sync') {
      assert.equal(optionsByCall[0].timeout, undefined);
      assert.equal(optionsByCall[1].timeout, 120000);
    }
    assert.doesNotMatch(serialized, /\/Users\/example/);
    assert.doesNotMatch(serialized, /sk-secret/);
    assert.match(serialized, /~\/private\/file\.md/);
  }
}

function testGBrainActionCatalogMatchesAllowlist() {
  const actions = listGBrainActions();
  const actionIds = actions.map((action) => action.id);

  assert.deepEqual(actionIds, [
    'doctor-fast',
    'preview-sync',
    'sync-sources',
    'retry-failed-sync',
    'embed-stale',
    'check-resolvable',
    'storage-status',
  ]);

  for (const action of actions) {
    assert.ok(action.label, `${action.id} missing label`);
    assert.ok(action.description, `${action.id} missing description`);
    assert.ok(action.kind, `${action.id} missing kind`);
    assert.match(action.command, /^gbrain /);
  }
}

async function testGBrainActionRejectsUnknownAction() {
  let called = false;
  const result = await runGBrainAction('delete-everything', {
    execFilePromise: async () => {
      called = true;
      return { stdout: '', stderr: '' };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'rejected');
  assert.equal(called, false);
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
  assert.equal(overview.trust.label, 'Health probe unavailable');
  assert.equal(overview.trust.status, 'warning');
  assert.equal(overview.cockpit.health.value, 'Unavailable');
  assert.equal(overview.cockpit.queue.value, 'Unavailable');
  assert.equal(overview.cockpit.embeddings.detail, 'health probe unavailable');
  assert.equal(overview.cockpit.queue.detail, 'health probe unavailable');
  assert.equal(overview.cockpit.caveats.detail, 'Live health probe unavailable. Live source probe unavailable.');
  assert.equal(core.status, 'warning');
  assert.equal(core.proof.source, 'gbrain call get_health');
  assert.match(core.proof.detail, /unavailable/i);
  assert.equal(core.metrics.find((metric) => metric.label === 'Version')?.value, '0.40.2.0');
  assert.equal(core.metrics.find((metric) => metric.label === 'Chunks')?.value, 'Unavailable');
  assert.equal(sources.status, 'warning');
  assert.equal(overview.nodes.find((node) => node.id === 'queues')?.metrics.find((metric) => metric.label === 'Coverage')?.value, 'Unavailable');
  assert.match(overview.nodes.find((node) => node.id === 'queues')?.risks.join(' '), /queue counters are not current/i);
  assert.match(overview.handoff.recommendedNextSlice, /connected read-only/i);
}

function testOverviewAddsTimelineSummaryAndIncidentBanner() {
  const overview = buildGBrainOverview({}, {
    timelineSummary: {
      enabled: true,
      status: 'healthy',
      lastCapturedAt: '2026-05-24T12:00:00.000Z',
      lastCaptureReason: 'changed',
      skippedDuplicateCount: 0,
      malformedLineCount: 0,
      retainedEntryCount: 1,
      warning: '',
      diff: { kind: 'first-snapshot', changes: [], summary: 'First timeline proof captured.' },
      incidentBanner: null,
    },
    incidentBanner: {
      status: 'warning',
      title: 'Trust evidence changed',
      detail: 'Caveats increased.',
    },
  });

  assert.equal(overview.timelineSummary.enabled, true);
  assert.equal(overview.timelineSummary.retainedEntryCount, 1);
  assert.equal(overview.incidentBanner.title, 'Trust evidence changed');
}

(async () => {
  await testLiveHealthNormalizesReadOnlyProbe();
  await testLiveHealthBackfillsInventoryFromStatsText();
  await testLiveVersionAppearsInOverview();
  await testLiveSourcesDoNotExposeLocalPaths();
  await testDefaultSourceWithoutPathIsNotFreshnessStale();
  await testLiveSourcesCountsUnknownStatusesAsWarnings();
  await testLiveSourcesFallsBackToTextOutput();
  await testLiveHealthFallsBackToTextOutput();
  await testOverviewUsesLiveSourcePageTotalWhenHealthOmitsPages();
  await testOverviewDoesNotMarkUnknownLiveSourcesHealthy();
  await testStaleSourceFreshnessDowngradesLiveTrust();
  await testHealthStalePagesDowngradesLiveTrust();
  await testMissingEmbeddingsDowngradesQueueTrust();
  await testOverviewDoesNotDefaultMissingLiveQueueToZero();
  await testLiveFailureIsSafeJson();
  await testGBrainActionRunsOnlyAllowlistedCommand();
  testGBrainActionCatalogMatchesAllowlist();
  await testGBrainActionRejectsUnknownAction();
  await testOverviewShowsLiveAttemptWhenRuntimeUnavailable();
  testOverviewAddsTimelineSummaryAndIncidentBanner();

  console.log('gbrainOverview tests passed');
})();
