import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
test('RenPy Web bootstrap retains pinned Python packages instead of extracting old game runtime',()=>{
 const r=spawnSync('python3',['-B','tests/renpy-runtime-test.py'],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
});
