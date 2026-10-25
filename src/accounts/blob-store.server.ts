import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, statfsSync, readFileSync, openSync, writeSync, fsyncSync, closeSync, linkSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AccountError } from './errors.server.ts';
export interface BlobStore {
  free(): Promise<number>;
  read(ownerHash: string, hash: string): Promise<Buffer>;
  write(ownerHash: string, hash: string, bytes: Uint8Array): Promise<void>;
  remove(ownerHash: string, key: string): Promise<void>;
}
export class LocalBlobStore implements BlobStore {
  readonly root: string;
  constructor(root: string, private available?: () => number) {
    this.root = resolve(root); mkdirSync(this.root, { recursive: true, mode: 0o700 });
  }
  private path(owner: string, key: string) {
    if (!/^[a-f0-9]{64}$/.test(owner) || !/^(?:[a-f0-9]{64}\.bin|[a-f0-9-]{36}\.upload)$/.test(key)) throw new AccountError();
    return join(this.root, owner, key);
  }
  async free() { const s = statfsSync(this.root); return this.available ? this.available() : s.bavail * s.bsize; }
  async read(owner: string, hash: string) { return readFileSync(this.path(owner, hash + '.bin')); }
  async remove(owner: string, key: string) { try { unlinkSync(this.path(owner, key)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; } }
  async write(owner: string, hash: string, bytes: Uint8Array) {
    if (bytes.length > 32 * 1024 ** 2 || createHash('sha256').update(bytes).digest('hex') !== hash) throw new AccountError(400, 'FILE_HASH_MISMATCH');
    if (await this.free() < 62 * 1024 ** 3 + bytes.length) throw new AccountError(507, 'SPACE_STOP');
    const target = this.path(owner, hash + '.bin'), temp = this.path(owner, randomUUID() + '.upload');
    mkdirSync(join(this.root, owner), { recursive: true, mode: 0o700 });
    let fd: number | undefined;
    try {
      fd = openSync(temp, 'wx', 0o600);
      let offset = 0;
      while (offset < bytes.length) { const n = writeSync(fd, bytes, offset, bytes.length - offset); if (n < 1) throw Error('Incomplete write'); offset += n; }
      fsyncSync(fd); closeSync(fd); fd = undefined;
      try { linkSync(temp, target); } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        const existing = readFileSync(target);
        if (existing.length !== bytes.length || createHash('sha256').update(existing).digest('hex') !== hash) throw new AccountError(503, 'FILE_CORRUPT');
      }
    } finally { if (fd !== undefined) closeSync(fd); try { unlinkSync(temp); } catch {} }
  }
}
