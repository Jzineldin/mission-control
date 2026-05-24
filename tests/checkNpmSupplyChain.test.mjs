import assert from 'node:assert/strict';

import { decodeJsString, extractItemsFromJs, packageNameFromLockPath } from '../scripts/check-npm-supply-chain.mjs';

(function testPlainTextRoundTrips() {
  assert.equal(decodeJsString('hello world'), 'hello world');
})();

(function testApostropheEscapeIsCollapsed() {
  // JS source `'don\'t'` lands here as raw `don\'t` (4 chars: d o n \ ' t).
  assert.equal(decodeJsString("don\\'t"), "don't");
})();

(function testBareDoubleQuoteIsEscapedForJson() {
  // JS single-quoted strings allow bare " — JSON must see it escaped.
  assert.equal(decodeJsString('say "hi"'), 'say "hi"');
})();

(function testBackslashEscapesPreserved() {
  // Newline escape: raw `\n` (2 chars: \ n) must decode to a literal newline,
  // not to the two-char sequence backslash+n.
  assert.equal(decodeJsString('line1\\nline2'), 'line1\nline2');
  // Literal backslash: raw `\\` (2 chars) decodes to one backslash.
  assert.equal(decodeJsString('a\\\\b'), 'a\\b');
})();

(function testBackslashBeforeBareQuoteDoesNotCorruptDecoder() {
  // The original bug: raw was `\\"` (backslash + bare quote) — the naive
  // replacer escaped only the quote, producing `\\\"` which JSON decoded as
  // backslash+quote instead of backslash+quote. The new decoder must escape
  // the bare quote independently and leave the prior \\ alone.
  assert.equal(decodeJsString('path\\\\"x'), 'path\\"x');
})();

(function testNuxtAdvisoryFixtureExtractsPackageItems() {
  // Approximate the Nuxt-emitted shape: a JSON.parse('...') call containing
  // a JSON array of advisory items.
  const advisoryArray = JSON.stringify([
    { package_name: 'tanstack-evil', package_manager: 'npm', vulnerable: '{=1.2.3, =1.2.4}' },
    { package_name: 'noise', vulnerable: '', package_manager: 'npm' },
  ]);
  // Escape for embedding in a JS single-quoted string literal.
  const jsLiteralBody = advisoryArray
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
  const fakeBundle = `window.__NUXT__=(function(){return JSON.parse('${jsLiteralBody}')})();`;
  const items = extractItemsFromJs(fakeBundle);
  assert.ok(items.length >= 1, 'should extract at least one advisory item');
  assert.equal(items[0].package_name, 'tanstack-evil');
  assert.equal(items[0].package_manager, 'npm');
  assert.equal(items[0].vulnerable, '{=1.2.3, =1.2.4}');
})();

(function testPackageLockPathExtractionHandlesNestedAndScopedPackages() {
  assert.equal(packageNameFromLockPath('node_modules/pkg'), 'pkg');
  assert.equal(packageNameFromLockPath('node_modules/parent/node_modules/pkg'), 'pkg');
  assert.equal(packageNameFromLockPath('node_modules/parent/node_modules/@scope/pkg'), '@scope/pkg');
})();

console.log('checkNpmSupplyChain tests passed');
