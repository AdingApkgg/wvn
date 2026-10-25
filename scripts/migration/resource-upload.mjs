// 通过 Tailscale 私网直接上传，固定信任本轮证书；认证信息仅从私有配置读取。
import fs from 'node:fs';
import https from 'node:https';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const source = spawn(process.execPath, [config.exporter, config.roots, config.resume], { stdio: ['ignore', 'pipe', 'inherit'] });
const request = https.request(config.url, { method: 'POST', servername: 'localhost', ca: fs.readFileSync(config.certificate), headers: { authorization: 'Bearer ' + config.token, 'content-type': 'application/octet-stream' } });
const response = new Promise((resolve, reject) => {
  request.on('error', reject);
  request.on('response', res => {
    let text = '';
    res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; });
    res.on('end', () => res.statusCode === 200 ? resolve(text) : reject(Error('资源上传失败：HTTP ' + res.statusCode + ' ' + text)));
  });
});
try {
  const exit = new Promise((resolve, reject) => { source.on('error', reject); source.on('close', code => code === 0 ? resolve() : reject(Error('资源导出进程失败：' + code))); });
  const [, , result] = await Promise.all([pipeline(source.stdout, request), exit, response]);
  console.log(result);
} catch (error) { source.kill(); request.destroy(); console.error(error.message); process.exitCode = 1; }
