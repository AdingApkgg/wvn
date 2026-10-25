import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pilots } from '../public/ons/registry.mjs';
import { nativeRecipes } from './lib/ons-native-recipes.mjs';
import { nativeTextCheckpoint, sameNativeStory } from './lib/ons-native-checkpoint.mjs';
const root = 'reports/ons-native-all';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const hash = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const results = [];
for (const pilot of pilots.filter(p => !['clannad', 'saya'].includes(p.id))) {
  const item = read(`${root}/${pilot.id}-native-case.json`);
  assert.equal(item.status, 'passed', pilot.id);
  assert(Date.parse(item.checkedAt)>=fs.statSync('build/server/index.js').mtimeMs, pilot.id+' predates current app build');
  for (const key of ['historyRetained', 'legacyUnchanged', 'nativeBytesAndMtimeRetained', 'nativeEnvelopeExact']) assert.equal(item[key], true, `${pilot.id} ${key}`);
  for (const key of ['reads', 'restartReads']) assert(item[key].some(r => r.path.endsWith('/save1.dat') && r.flags === 32768), `${pilot.id} actual native read`);
  const files = read(`${root}/${pilot.id}-native-fixture.json`);
  const a = nativeTextCheckpoint(files.find(f => f.path === 'save1.dat').data);
  const d = nativeTextCheckpoint(files.find(f => f.path === 'save4.dat').data);
  const hook = nativeRecipes[pilot.workId].loadHookLine;
  assert(sameNativeStory(a, d, hook), `${pilot.id} actual restarted slot must match original A`);
  // Earlier receipts recorded line/colon; verify all recorded C fields against
  // actual A/D too, rather than upgrading missing text hashes by assumption.
  const projectedA = Object.fromEntries(Object.keys(item.saved).map(k => [k, a[k]]));
  const projectedD = Object.fromEntries(Object.keys(item.afterRestart).map(k => [k, d[k]]));
  assert.deepEqual(projectedA, item.saved);
  assert.deepEqual(projectedD, item.afterRestart);
  assert.deepEqual(item.reloaded, item.afterRestart, `${pilot.id} initial and restarted native loads agree`);
  assert.notDeepEqual(item.advanced, item.saved, `${pilot.id} actual script advancement`);
  assert.notDeepEqual(item.advanced, item.reloaded, `${pilot.id} native rollback`);
  results.push({ id: pilot.id, route: pilot.route, title: pilot.title, status: 'passed', checkedAt: item.checkedAt, original: a, restored: d, loadHookLine: hook, legacyUnchanged: true, historyRetained: true, exactBytesMtime: true });
}
const content = read(`${root}/tested-content.json`);
for (const [p, sha] of Object.entries(content.build)) assert.equal(hash(p), sha, 'Tested build changed: ' + p);
for (const [p, sha] of Object.entries(content.appSource)) if (/^(src\/|public\/|(?:accounts-)?server\.ts$|package(?:-lock)?\.json$|vite\.config\.ts$|tsconfig\.json$|react-router\.config\.ts$)/.test(p)) assert.equal(hash(p), sha, 'Tested app source changed: ' + p);
assert.equal(results.length, 24);
fs.writeFileSync(`${root}/native-results.json`, JSON.stringify({ status: 'passed', checkedAt: new Date().toISOString(), total: results.length, results, testedBuildSHA256: hash('build/server/index.js') }, null, 2));
console.log('NATIVE_RESULTS_PASSED ' + results.length);
