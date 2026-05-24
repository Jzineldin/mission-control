const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createCronService } = require('../server/services/cronData');

function makeCronServiceWithJobs(initialJobs) {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-cron-data-'));
  const jobsDir = path.join(homeDir, '.hermes', 'profiles', 'hmudur', 'cron');
  fs.mkdirSync(jobsDir, { recursive: true });
  const jobsFile = path.join(jobsDir, 'jobs.json');
  fs.writeFileSync(jobsFile, `${JSON.stringify({ jobs: initialJobs }, null, 2)}\n`, 'utf8');

  const service = createCronService({
    openclawExec: async () => ({ stdout: '[]', stderr: '' }),
    gatewayPort: 18789,
    gatewayToken: '',
    getOpenclawDefaultModelKey: () => '',
    calendarFile: path.join(homeDir, 'calendar.json'),
    homeDir,
    hermesProfile: 'hmudur',
  });

  return { service, jobsFile };
}

(function testHermesCodexModelRefKeepsOpenAiNamespace() {
  const { service, jobsFile } = makeCronServiceWithJobs([{
    id: 'job-1',
    provider: 'openai-codex',
    model: 'openai/gpt-5.4',
    base_url: null,
  }]);

  const updated = service.updateHermesCronJobModel('job-1', 'openai-codex/gpt-5.5');
  const persisted = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));

  assert.equal(updated.payload.model, 'openai-codex/openai/gpt-5.5');
  assert.equal(persisted.jobs[0].provider, 'openai-codex');
  assert.equal(persisted.jobs[0].model, 'openai/gpt-5.5');
})();

(function testHermesCronPatchPreservesRuntimeFields() {
  const { service, jobsFile } = makeCronServiceWithJobs([{
    id: 'job-1',
    enabled: true,
    provider: 'openai-codex',
    model: 'openai/gpt-5.5',
    last_run_at: '2026-05-24T09:01:05+03:00',
    next_run_at: '2026-05-25T09:00:00+03:00',
  }, {
    id: 'job-2',
    enabled: true,
    last_run_at: '2026-05-24T10:00:00+03:00',
  }]);

  service.updateHermesCronJobEnabled('job-1', false);
  const persisted = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));

  assert.equal(persisted.jobs[0].enabled, false);
  assert.equal(persisted.jobs[0].last_run_at, '2026-05-24T09:01:05+03:00');
  assert.equal(persisted.jobs[0].next_run_at, '2026-05-25T09:00:00+03:00');
  assert.equal(persisted.jobs[1].last_run_at, '2026-05-24T10:00:00+03:00');
})();

(function testHermesCronPatchPreservesFilePermissions() {
  const { service, jobsFile } = makeCronServiceWithJobs([{ id: 'job-1', enabled: true }]);
  fs.chmodSync(jobsFile, 0o600);

  service.updateHermesCronJobEnabled('job-1', false);

  assert.equal(fs.statSync(jobsFile).mode & 0o777, 0o600);
})();

(function testCronServiceDefaultsToConfiguredHostHome() {
  const previousHome = process.env.MC_USER_HOME;
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-cron-home-'));
  const jobsDir = path.join(homeDir, '.hermes', 'profiles', 'hmudur', 'cron');
  fs.mkdirSync(jobsDir, { recursive: true });
  fs.writeFileSync(path.join(jobsDir, 'jobs.json'), `${JSON.stringify({ jobs: [{ id: 'job-1', enabled: true }] }, null, 2)}\n`, 'utf8');

  try {
    process.env.MC_USER_HOME = homeDir;
    const service = createCronService({
      openclawExec: async () => ({ stdout: '[]', stderr: '' }),
      gatewayPort: 18789,
      gatewayToken: '',
      getOpenclawDefaultModelKey: () => '',
      calendarFile: path.join(homeDir, 'calendar.json'),
      hermesProfile: 'hmudur',
    });

    service.updateHermesCronJobEnabled('job-1', false);
    const persisted = JSON.parse(fs.readFileSync(path.join(jobsDir, 'jobs.json'), 'utf8'));
    assert.equal(persisted.jobs[0].enabled, false);
  } finally {
    if (previousHome === undefined) delete process.env.MC_USER_HOME;
    else process.env.MC_USER_HOME = previousHome;
  }
})();

console.log('cronData tests passed');
