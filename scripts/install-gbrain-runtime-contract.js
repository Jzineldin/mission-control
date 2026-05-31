#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MARKER = 'mission-control-gbrain-contract';

const CONTRACT_BODY = [
  '## GBrain Shared-Brain Tool Contract',
  '',
  '- Keep local memory local: Hermes profile memory and OpenClaw native memory remain the first place for private/session memory.',
  '- Use GBrain as the shared machine brain when work needs cross-system recall, search, synthesis, or durable handoff across Hermes, OpenClaw, Codex, and Mission Control.',
  '- Prefer GBrain MCP tools for shared-brain work: get_page, put_page, query, recall, think, sources_list, get_health.',
  '- Before relying on shared context, check get_health and sources_list when freshness or runtime health matters.',
  '- Use query and recall for cross-agent context discovery; use get_page for known shared-memory pages; use think for multi-hop synthesis that needs cited source context.',
  '- Use put_page only for curated, tagged, durable records: decisions, handoffs, playbooks, and verified task outcomes.',
  '- Never put raw transcripts, secrets, credentials, cookies, API keys, or untagged private memory into GBrain.',
  '- OpenClaw promotions should stay tagged (#gbrain, #shared-memory, or #cross-agent) and flow through main_memory_to_gbrain_bridge.py before GBrain sync.',
  '- Hermes promotions should stay curated/secret-safe and flow through hermes_hmudur_memory_bridge.py before GBrain sync.',
].join('\n');

function managedBlock() {
  return [
    `<!-- ${MARKER}:start -->`,
    CONTRACT_BODY,
    `<!-- ${MARKER}:end -->`,
    '',
  ].join('\n');
}

function replaceManagedBlock(text, block = managedBlock()) {
  const expression = new RegExp(`\\n?<!-- ${MARKER}:start -->[\\s\\S]*?<!-- ${MARKER}:end -->\\n?`, 'm');
  if (expression.test(text)) {
    const next = text.replace(expression, `\n${block}`);
    return next.startsWith('\n') ? next.slice(1) : next;
  }
  const separator = text.endsWith('\n') || text.length === 0 ? '' : '\n\n';
  return `${text}${separator}${block}`;
}

function targetPathExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function evaluateTarget(target, apply) {
  if (!targetPathExists(target.path)) {
    return {
      id: target.id,
      path: target.path,
      exists: false,
      installed: false,
      changed: false,
      status: 'missing',
    };
  }

  const before = fs.readFileSync(target.path, 'utf8');
  const after = replaceManagedBlock(before);
  const changed = before !== after;

  if (apply && changed) {
    fs.writeFileSync(target.path, after);
  }

  return {
    id: target.id,
    path: target.path,
    exists: true,
    installed: after.includes(`<!-- ${MARKER}:start -->`),
    changed,
    status: changed ? (apply ? 'updated' : 'would-update') : 'current',
  };
}

function buildTargets(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const clawdRoot = options.clawdRoot || path.join(homeDir, 'clawd');
  const hermesProfileDir = options.hermesProfileDir || path.join(homeDir, '.hermes/profiles/hmudur');
  return [
    {
      id: 'openclaw',
      path: path.join(clawdRoot, 'AGENTS.md'),
    },
    {
      id: 'hermes',
      path: path.join(hermesProfileDir, 'memories/MEMORY.md'),
    },
  ];
}

function installContract(options = {}) {
  const apply = Boolean(options.apply);
  const targets = buildTargets(options).map((target) => evaluateTarget(target, apply));
  return {
    ok: targets.every((target) => target.exists && target.installed),
    mode: apply ? 'apply' : 'dry-run',
    marker: MARKER,
    changedCount: targets.filter((target) => target.changed).length,
    targets,
  };
}

function parseArgs(argv) {
  const options = { apply: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--dry-run' || arg === '--check') options.apply = false;
    else if (arg === '--json') options.json = true;
    else if (arg === '--home') options.homeDir = argv[++index];
    else if (arg === '--clawd-root') options.clawdRoot = argv[++index];
    else if (arg === '--hermes-profile-dir') options.hermesProfileDir = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = installContract(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  for (const target of result.targets) {
    process.stdout.write(`${target.id}: ${target.status} ${target.path}\n`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  MARKER,
  buildTargets,
  installContract,
  replaceManagedBlock,
};
