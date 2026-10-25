// 只读导出指定 WG 资源；每个文件独立压缩并校验，已完成文件可续传。
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';
const roots = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const resume = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : {};
async function line(type, value) {
  const text = type + ' ' + (typeof value === 'string' ? value : Buffer.from(JSON.stringify(value)).toString('base64')) + '\n';
  if (!process.stdout.write(text)) await once(process.stdout, 'drain');
}
let files = 0, bytes = 0, skipped = 0;
async function digestFile(source) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(source, { highWaterMark: 1024 * 1024 })) hash.update(chunk);
  return hash.digest('hex');
}
async function walk(root, prefix, relative = '') {
  const directory = path.join(root, relative);
  const priority = prefix === 'games' && !relative ? ['clannad', 'atri', 'saya', 'eden'] : [];
  const rank = name => priority.includes(name) ? priority.indexOf(name) : priority.length;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a,b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))) {
    const name = path.join(relative, entry.name), source = path.join(root, name);
    if (entry.isSymbolicLink()) throw Error('资源中发现符号链接，请人工核对：' + source);
    if (entry.isDirectory()) { await walk(root, prefix, name); continue; }
    if (!entry.isFile()) throw Error('不是普通资源文件：' + source);
    const stat = fs.statSync(source), target = prefix + '/' + name.split(path.sep).join('/');
    files++; bytes += stat.size;
    if (resume[target]?.bytes === stat.size && resume[target]?.mtime === stat.mtimeMs) {
      const sha256 = await digestFile(source), after = fs.statSync(source);
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw Error('续传校验期间源文件变化：' + source);
      if (sha256 === resume[target].sha256) { await line('S', { path: target, bytes: stat.size, mtime: stat.mtimeMs, sha256 }); skipped++; continue; }
    }
    await line('F', { path: target, bytes: stat.size, mtime: stat.mtimeMs });
    const hash = createHash('sha256'), input = fs.createReadStream(source, { highWaterMark: 1024 * 1024 }), gzip = createGzip({ level: 1, chunkSize: 256 * 1024 });
    input.on('data', chunk => hash.update(chunk));
    input.on('error', error => gzip.destroy(error));
    input.pipe(gzip);
    for await (const chunk of gzip) await line('D', chunk.toString('base64'));
    const after = fs.statSync(source);
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw Error('资源在复制期间变化：' + source);
    await line('E', hash.digest('hex'));
  }
}
try {
  for (const [prefix, root] of Object.entries(roots)) await walk(root, prefix);
  await line('Z', { files, bytes, skipped, completedAt: new Date().toISOString() });
} catch (error) { await line('X', { error: error.message }); process.exitCode = 1; }
