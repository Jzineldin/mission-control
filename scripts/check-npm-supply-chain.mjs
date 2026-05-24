#!/usr/bin/env node
/*
 * Supply-chain gate for live npm incidents.
 * - Fetches a Snyk zero-day advisory page (default: TanStack/Mini Shai-Hulud May 2026)
 * - Extracts exact package+version IOCs from embedded Nuxt data without executing remote JS
 * - Scans package-lock.json, pnpm-lock.yaml, and yarn.lock under this repo
 * - Fails only on exact malicious package+version matches; ordinary CVEs belong to npm/pnpm audit.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ADVISORY_URL = 'https://security.snyk.io/packages/tanstack-npm-packages-compromise';
const advisoryUrl = process.env.NPM_INCIDENT_ADVISORY_URL || DEFAULT_ADVISORY_URL;
const repoRoot = process.env.SUPPLY_CHAIN_REPO_ROOT || process.cwd();
const pruneDirs = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.turbo', '.cache', 'coverage', 'playwright-report', 'test-results']);
const lockNames = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);

function decodeJsString(raw) {
  // Decode JS string escapes from JSON.parse('...') without evaluating remote code.
  return JSON.parse('"' + raw.replace(/"/g, '\\"') + '"');
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'npm-supply-chain-gate/1.0' } });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  return await res.text();
}

function extractItemsFromJs(js) {
  const items = [];
  const re = /JSON\.parse\('((?:\\'|[^'])+)'\)/g;
  for (const match of js.matchAll(re)) {
    let decoded;
    try { decoded = decodeJsString(match[1]); } catch { continue; }
    if (!decoded.includes('package_name') || !decoded.includes('vulnerable')) continue;
    try {
      const parsed = JSON.parse(decoded);
      if (Array.isArray(parsed)) items.push(...parsed);
    } catch { /* not the advisory payload */ }
  }
  return items;
}

function parseVersions(vulnerable) {
  return String(vulnerable || '')
    .replace(/^\{/, '')
    .replace(/\}$/, '')
    .split(',')
    .map((v) => v.trim().replace(/^=/, '').replace(/^\[/, '').replace(/\]$/, ''))
    .filter(Boolean);
}

async function loadIocs() {
  const html = await fetchText(advisoryUrl);
  const scriptSrcs = [...new Set([...html.matchAll(/(?:src|href)="([^"]+\.js[^"]*)"/g)].map((m) => new URL(m[1], advisoryUrl).href))];
  const allItems = [];
  for (const src of scriptSrcs) {
    const js = await fetchText(src);
    allItems.push(...extractItemsFromJs(js));
  }
  const iocs = new Map();
  for (const item of allItems) {
    if ((item.package_manager || 'npm') !== 'npm') continue;
    const versions = parseVersions(item.vulnerable);
    if (!item.package_name || versions.length === 0) continue;
    if (!iocs.has(item.package_name)) iocs.set(item.package_name, new Set());
    for (const version of versions) iocs.get(item.package_name).add(version);
  }
  return iocs;
}

function findLockfiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!pruneDirs.has(entry.name)) findLockfiles(path, out);
    } else if (lockNames.has(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

function addFinding(findings, lockfile, name, version) {
  findings.push({ lockfile: relative(repoRoot, lockfile), package: name, version });
}

function scanPackageLock(lockfile, iocs, findings) {
  const data = JSON.parse(readFileSync(lockfile, 'utf8'));
  const seen = [];
  for (const [key, meta] of Object.entries(data.packages || {})) {
    if (key.startsWith('node_modules/')) seen.push([key.slice('node_modules/'.length), String(meta?.version || '')]);
  }
  for (const [name, meta] of Object.entries(data.dependencies || {})) {
    seen.push([name, String(meta?.version || '')]);
  }
  for (const [name, version] of seen) {
    if (iocs.get(name)?.has(version)) addFinding(findings, lockfile, name, version);
  }
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function scanTextLock(lockfile, iocs, findings) {
  const text = readFileSync(lockfile, 'utf8');
  for (const [name, versions] of iocs.entries()) {
    for (const version of versions) {
      const patterns = [
        new RegExp(`${escapeRe(name)}@${escapeRe(version)}(?:[\\s:'",)]|$)`),
        new RegExp(`/${escapeRe(name)}@${escapeRe(version)}(?:[\\s:'",)]|$)`),
        new RegExp(`${escapeRe(name)}:\\s*${escapeRe(version)}(?:\\s|$)`),
      ];
      if (patterns.some((p) => p.test(text))) addFinding(findings, lockfile, name, version);
    }
  }
}

const iocs = await loadIocs();
if (iocs.size === 0) throw new Error(`No npm IOCs parsed from ${advisoryUrl}; failing closed.`);
const lockfiles = findLockfiles(repoRoot);
const findings = [];
for (const lockfile of lockfiles) {
  if (lockfile.endsWith('package-lock.json')) scanPackageLock(lockfile, iocs, findings);
  else scanTextLock(lockfile, iocs, findings);
}

console.log(`Supply-chain gate: scanned ${lockfiles.length} lockfile(s), ${iocs.size} npm package IOC(s) from ${advisoryUrl}`);
if (findings.length > 0) {
  console.error('Exact malicious package/version match found:');
  for (const f of findings) console.error(`- ${f.lockfile}: ${f.package}@${f.version}`);
  process.exit(1);
}
console.log('Supply-chain gate: no exact malicious package/version matches.');
