import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const origin = 'https://127.0.0.1:28444';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage','--origin-to-force-quic-on=127.0.0.1:28443'], ...(process.env.ROOMS_QA_CHROMIUM ? { executablePath: process.env.ROOMS_QA_CHROMIUM } : {}) });
const report = { at: new Date().toISOString(), boundary: '同一远程构建机回环；不代表公网/NAT/跨设备验收', checks: [] };
async function pair(name, { wt = false, relay = false, fallback = false } = {}) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const a = await context.newPage(), b = await context.newPage();
  const errors = [];
  for (const page of [a,b]) { page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') console.log('浏览器诊断: ' + message.text()); }); await page.goto(origin); }
  const users = [name + '-owner', name + '-member'];
  const id = await a.evaluate(async ({ user }) => {
    const r = await fetch('/api/rooms', { method: 'POST', headers: { 'x-rooms-qa': user, 'content-type': 'application/json' }, body: JSON.stringify({ versionId: 'qa-published-version' }) });
    if (r.status !== 201) throw new Error('create failed ' + r.status);
    return (await r.json()).id;
  }, { user: users[0] });
  await b.evaluate(async ({ id, user }) => {
    const r = await fetch('/api/rooms/' + id + '/join', { method: 'POST', headers: { 'x-rooms-qa': user } });
    if (r.status !== 200) throw new Error('join failed ' + r.status);
  }, { id, user: users[1] });
  if (fallback) for (const page of [a,b]) await page.route('**/api/rooms/*/ticket', async route => {
    const response = await route.fetch(), json = await response.json();
    await route.fulfill({ response, json: { ...json, webTransportUrl: 'https://127.0.0.1:28449/rooms' } });
  });
  for (let i = 0; i < 2; i++) await [a,b][i].evaluate(async ({ id, user, wt, relay }) => {
    const { RoomClient } = await import('/room-client.mjs');
    const info = await (await fetch('/qa-info')).json();
    const hash = Uint8Array.from(atob(info.certificateHash), c => c.charCodeAt(0));
    window.room = new RoomClient({ roomId: id, headers: { 'x-rooms-qa': user }, preferWebTransport: wt, relayOnly: relay, reconnect: false, transportTimeoutMs: 4000, serverCertificateHashes: [{ algorithm: 'sha-256', value: hash }] });
    window.roomEvents = [];
    for (const type of ['event','peerdata','peeropen','error','datagram','fallback']) window.room.addEventListener(type, event => roomEvents.push({ type, detail: event.detail }));
    await window.room.connect();
  }, { id, user: users[i], wt, relay });
  const transports = await Promise.all([a,b].map(page => page.evaluate(() => window.room.transport)));
  if (transports.some(t => t !== (wt && !fallback ? 'webtransport' : 'websocket'))) console.log(JSON.stringify({ name, diagnostics: await a.evaluate(() => ({ available: typeof WebTransport, secure: isSecureContext, events: roomEvents.filter(e => ['fallback','error'].includes(e.type)) })) }));
  assert.deepEqual(transports, [wt && !fallback ? 'webtransport' : 'websocket', wt && !fallback ? 'webtransport' : 'websocket']);
  const state = { qa: name, chapter: 7 };
  const seq = await a.evaluate(async state => (await window.room.publishState(state)).seq, state);
  await b.waitForFunction(({ seq, name }) => roomEvents.some(e => e.type === 'event' && e.detail.seq === seq && e.detail.kind === 'state' && e.detail.data.qa === name), { seq, name }, { timeout: 15000 });
  const check = { name, transports, authoritativeSequence: seq };
  if (wt && !fallback) {
    for (const page of [a,b]) {
      await page.evaluate(() => window.room.pingDatagram());
      await page.waitForFunction(() => roomEvents.some(e => e.type === 'datagram' && e.detail.type === 'pong'), null, { timeout: 8000 });
    }
    check.quicDatagram = '认证后经Node房间协议返回pong';
  }
  if (!fallback) {
    await a.evaluate(async ({ target, relay }) => window.room.openPeer(target, { relayOnly: relay }), { target: users[1], relay });
    await a.waitForFunction(target => window.room.peers.get(target)?.channel?.readyState === 'open', users[1], { timeout: 20000 });
    await a.evaluate(({ target, name }) => window.room.sendPeer(target, { probe: name }), { target: users[1], name });
    await b.waitForFunction(name => roomEvents.some(e => e.type === 'peerdata' && e.detail.data.probe === name && e.detail.authoritative === false), name, { timeout: 10000 });
    check.candidates = await a.evaluate(async target => {
      const stats = await window.room.peers.get(target).pc.getStats();
      let selected;
      stats.forEach(r => { if (r.type === 'transport' && r.selectedCandidatePairId) selected = stats.get(r.selectedCandidatePairId); });
      if (!selected) stats.forEach(r => { if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) selected = r; });
      const local = stats.get(selected.localCandidateId), remote = stats.get(selected.remoteCandidateId);
      return { local: local.candidateType, remote: remote.candidateType, protocol: local.protocol, bytesSent: selected.bytesSent, bytesReceived: selected.bytesReceived };
    }, users[1]);
    if (relay) { assert.equal(check.candidates.local, 'relay'); assert.equal(check.candidates.remote, 'relay'); }
    else assert.notEqual(check.candidates.local, 'relay');
    check.dataChannel = '真实双浏览器临时数据送达';
  }
  assert.deepEqual(errors, []);
  report.checks.push(check); console.log(JSON.stringify(check));
  for (const page of [a,b]) await page.evaluate(() => window.room.close());
  await context.close();
}
try {
  // 第一项也用于网关实现前的RED，必须真实协商WebTransport，不能静默把WS当作通过。
  await pair('wt-relay', { wt: true, relay: true });
  await pair('ws-direct');
  await pair('wt-blocked-fallback', { wt: true, fallback: true });
  await writeFile('reports/rooms/browser-connectivity.json', JSON.stringify(report, null, 2) + '\n');
} finally { await browser.close(); }
