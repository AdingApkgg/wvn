// 临时迁移接收端：仅绑定 Tailscale 地址，单次传输互斥；不提供任何文件读取接口。
import fs from 'node:fs';
import https from 'node:https';
import { timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const expected = Buffer.from('Bearer ' + config.token);
let busy = false;
const server = https.createServer({ key: fs.readFileSync(config.key), cert: fs.readFileSync(config.certificate), minVersion: 'TLSv1.3' }, async (req, res) => {
  const header = Buffer.from(req.headers.authorization ?? '');
  if (req.method !== 'POST' || req.url !== '/ingest' || header.length !== expected.length || !timingSafeEqual(header, expected)) { res.writeHead(403); res.end(); return; }
  if (busy) { res.writeHead(409); res.end(); return; }
  busy = true;
  const child = spawn('python3', [config.receiver, config.target], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', error = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { error = (error + chunk).slice(-4000); });
  try {
    const exit = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(Error(error || '接收进程失败：' + code))); });
    await Promise.all([pipeline(req, child.stdin), exit]);
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(output);
  } catch (failure) { child.kill(); res.writeHead(500); res.end(JSON.stringify({ error: failure.message })); }
  finally { busy = false; }
});
server.requestTimeout = 0;
server.headersTimeout = 15000;
server.listen(config.port, config.bind, () => console.log('WG 私网迁移接收端已启动'));
