// 只生成 SHA-256 对象及独立 SQLite 路径索引；不修改源文件或调用云服务。
import { createHash, randomUUID } from 'node:crypto';
import { constants, createWriteStream } from 'node:fs';
import { lstat, realpath, readdir, open, mkdir, mkdtemp, link, unlink, rm } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname, basename, join, sep, extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const applicationId = 0x57564e43; // WVNC，与目录库、账号库区分。
const mime = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.zip': 'application/zip',
};

function contains(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep));
}
async function canonical(path) {
  try { return await realpath(path); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return join(await canonical(dirname(path)), basename(path));
  }
}
async function noSymlink(path) {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw Error('不接受符号链接：' + path);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
async function paths(options) {
  for (const key of ['source', 'objects', 'database', 'namespace']) {
    if (typeof options[key] !== 'string' || !options[key].trim()) throw Error('缺少参数：' + key);
  }
  if (options.namespace.length > 512 || /[\u0000-\u001f\u007f]/.test(options.namespace)) throw Error('命名空间无效');
  const inputs = ['source', 'objects', 'database'].map(key => resolve(options[key]));
  for (const input of inputs) await noSymlink(input);
  const [source, objects, database] = await Promise.all(inputs.map(canonical));
  if (!(await lstat(source)).isDirectory()) throw Error('源路径必须是目录');
  if (contains(source, objects) || contains(objects, source)) throw Error('源目录与对象目录不能重叠');
  if (contains(source, database) || contains(objects, database)) throw Error('数据库不能位于源目录或对象目录中');
  return { source, objects, database };
}
async function* files(root, prefix = '') {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const entry of entries) {
    const path = join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw Error('不接受符号链接：' + path);
    if (entry.isDirectory()) yield* files(root, path);
    else if (entry.isFile()) yield path;
    else throw Error('不接受非普通资源文件：' + path);
  }
}
async function hashFile(path, staged) {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) throw Error('资源不是普通文件：' + path);
    const hash = createHash('sha256');
    let bytes = 0;
    async function* observe(source) {
      for await (const chunk of source) {
        bytes += chunk.length;
        if (!Number.isSafeInteger(bytes)) throw Error('资源大小超出安全整数范围');
        hash.update(chunk);
        yield chunk;
      }
    }
    const stream = handle.createReadStream({ autoClose: false });
    if (staged) await pipeline(stream, observe, createWriteStream(staged, { flags: 'wx', mode: 0o644 }));
    else for await (const _ of observe(stream)) { /* 预演只计算摘要，不写文件。 */ }
    const after = await handle.stat({ bigint: true });
    if (before.size !== BigInt(bytes) || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
      throw Error('读取期间源文件发生变化：' + path);
    }
    return { sha256: hash.digest('hex'), bytes };
  } finally { await handle.close(); }
}
async function publish(staged, destination, expected) {
  try {
    // 硬链接只用于同一输出目录内的暂存文件，保证已有对象绝不被替换。
    await link(staged, destination);
    return true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    try {
      const info = await lstat(destination);
      if (!info.isFile() || info.isSymbolicLink() || info.size !== expected.bytes) throw Error('属性不符');
      const actual = await hashFile(destination);
      if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) throw Error('摘要不符');
    } catch { throw Error('已有对象校验失败，未覆盖：' + expected.sha256); }
    return false;
  }
}
async function mappingDatabase(file) {
  await mkdir(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  try {
    const id = db.prepare('PRAGMA application_id').get().application_id;
    const version = db.prepare('PRAGMA user_version').get().user_version;
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    if (!((id === 0 && version === 0 && tables.length === 0) || (id === applicationId && version === 1))) {
      throw Error('目标必须是本工具创建的独立资源映射库');
    }
    db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS resource_objects(
        sha256 TEXT PRIMARY KEY NOT NULL CHECK(length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
        bytes INTEGER NOT NULL CHECK(bytes>=0 AND bytes<=9007199254740991)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS resource_paths(
        namespace TEXT NOT NULL CHECK(length(namespace)>0),
        original_path TEXT NOT NULL CHECK(length(original_path)>0),
        sha256 TEXT NOT NULL REFERENCES resource_objects(sha256),
        content_type TEXT NOT NULL CHECK(length(content_type)>0),
        PRIMARY KEY(namespace, original_path)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS resource_paths_sha256 ON resource_paths(sha256);
      PRAGMA application_id=${applicationId}; PRAGMA user_version=1;
      COMMIT;`);
    return db;
  } catch (error) { db.close(); throw error; }
}

export async function stageResources(options) {
  const { source, objects, database } = await paths(options);
  const apply = options.apply === true;
  const report = { mode: apply ? 'apply' : 'dry-run', namespace: options.namespace,
    files: 0, sourceBytes: 0, uniqueObjects: 0, uniqueBytes: 0, writtenObjects: 0, reusedObjects: 0 };
  const seen = new Map();
  let db, staging;
  try {
    if (apply) {
      db = await mappingDatabase(database);
      await mkdir(objects, { recursive: true });
      staging = await mkdtemp(join(objects, '.sha256-'));
      db.exec('BEGIN IMMEDIATE');
    }
    const existingPath = db?.prepare('SELECT sha256 FROM resource_paths WHERE namespace=? AND original_path=?');
    const existingObject = db?.prepare('SELECT bytes FROM resource_objects WHERE sha256=?');
    const insertObject = db?.prepare('INSERT OR IGNORE INTO resource_objects(sha256, bytes) VALUES(?, ?)');
    const insertPath = db?.prepare('INSERT OR IGNORE INTO resource_paths(namespace, original_path, sha256, content_type) VALUES(?, ?, ?, ?)');
    for await (const path of files(source)) {
      const original = path.split(sep).join('/');
      const temporary = apply ? join(staging, randomUUID()) : undefined;
      const object = await hashFile(join(source, path), temporary);
      const previous = existingPath?.get(options.namespace, original);
      if (previous && previous.sha256 !== object.sha256) throw Error('已有路径对应不同内容，请使用新的命名空间：' + original);
      const recorded = existingObject?.get(object.sha256);
      if ((recorded && recorded.bytes !== object.bytes) || (seen.has(object.sha256) && seen.get(object.sha256) !== object.bytes)) {
        throw Error('同一 SHA-256 的大小不一致，已停止：' + object.sha256);
      }
      if (!seen.has(object.sha256)) {
        if (apply) {
          const created = await publish(temporary, join(objects, object.sha256), object);
          if (created) report.writtenObjects++; else report.reusedObjects++;
        }
        seen.set(object.sha256, object.bytes);
        report.uniqueObjects++;
        report.uniqueBytes += object.bytes;
      }
      if (temporary) await unlink(temporary);
      insertObject?.run(object.sha256, object.bytes);
      insertPath?.run(options.namespace, original, object.sha256, mime[extname(original).toLowerCase()] ?? 'application/octet-stream');
      report.files++;
      report.sourceBytes += object.bytes;
      if (report.files % 1000 === 0) options.onProgress?.({ ...report });
    }
    if (db) db.exec('COMMIT');
    return report;
  } catch (error) {
    if (db?.isTransaction) db.exec('ROLLBACK');
    throw error;
  } finally {
    db?.close();
    if (staging) await rm(staging, { recursive: true, force: true });
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    source: { type: 'string' }, objects: { type: 'string' }, database: { type: 'string' },
    namespace: { type: 'string' }, apply: { type: 'boolean', default: false }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('用法：node scripts/migration/resource-cas.mjs --source <源目录> --objects <对象目录> --database <独立SQLite文件> --namespace <游戏版本或资源批次> [--apply]\n默认只预演；--apply 生成无后缀 SHA-256 对象和 SQLite 映射，保留所有源文件。');
    return;
  }
  const result = await stageResources({ ...values, onProgress: progress => {
    console.error(`已处理 ${progress.files} 个文件，${progress.uniqueObjects} 个唯一对象，${progress.sourceBytes} 字节`);
  } });
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
