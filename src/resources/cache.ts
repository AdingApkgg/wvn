import { createClient } from 'redis';
import { validMetadata, type ResourceCache, type ResourceMetadata } from './types.ts';

/** 缓存错误只影响命中率；断连不排队、不无限重连，所有操作均有硬性时间上限。 */
export class RedisResourceCache implements ResourceCache {
  private client?: ReturnType<typeof createClient>;
  private connecting?: Promise<void>;
  private retryAt = 0;
  private inflight = 0;
  private closed = false;
  private readonly timeoutMs: number;
  private readonly ttl: number;
  private readonly prefix: string;
  constructor(private readonly options: { url: string; prefix?: string; ttlSeconds?: number; timeoutMs?: number }) {
    const url = new URL(options.url);
    if (!['redis:', 'rediss:'].includes(url.protocol)) throw new Error('Invalid Redis URL');
    this.timeoutMs = options.timeoutMs ?? 150;
    this.ttl = options.ttlSeconds ?? 300;
    this.prefix = options.prefix ?? 'wvn:resources:v1:';
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 20 || this.timeoutMs > 1000 || !Number.isSafeInteger(this.ttl) || this.ttl < 1 || this.ttl > 3600 || !/^[A-Za-z0-9:_-]{1,200}$/.test(this.prefix))
      throw new Error('Invalid Redis cache bounds');
  }

  private reset(client = this.client) {
    if (client?.isOpen) client.destroy();
    if (this.client === client) { this.client = undefined; this.connecting = undefined; }
    this.retryAt = Date.now() + 10_000;
  }

  private async perform<T>(operation: (client: ReturnType<typeof createClient>) => Promise<T>): Promise<T | undefined> {
    if (this.closed || this.inflight >= 64 || Date.now() < this.retryAt) return undefined;
    this.inflight++;
    let client = this.client;
    if (!client) {
      client = createClient({ url: this.options.url, disableOfflineQueue: true, commandsQueueMaxLength: 256, socket: { reconnectStrategy: false, connectTimeout: this.timeoutMs } });
      client.on('error', () => {});
      this.client = client;
      this.connecting = client.connect().then(() => {});
    }
    const selected = client;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => { await this.connecting; if (!selected.isReady) throw new Error('Cache unavailable'); return operation(selected); })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Cache timeout')), this.timeoutMs); }),
      ]);
    } catch { this.reset(selected); return undefined; }
    finally { clearTimeout(timer); this.inflight--; }
  }

  async getMany(keys: string[]) {
    const found = new Map<string, ResourceMetadata>();
    if (!keys.length || keys.length > 100) return found;
    const values = await this.perform(client => client.mGet(keys.map(key => this.prefix + key)));
    values?.forEach((encoded, i) => {
      if (!encoded || encoded.length > 2048) return;
      try {
        const value = JSON.parse(encoded);
        if (value.schema === 2 && validMetadata(value, keys[i])) found.set(keys[i], { key: value.key, sha256: value.sha256, bytes: value.bytes, contentType: value.contentType });
      } catch { /* 损坏的缓存视为未命中。 */ }
    });
    return found;
  }

  async setMany(values: ResourceMetadata[]) {
    if (!values.length || values.length > 100) return;
    await this.perform(async client => {
      const transaction = client.multi();
      for (const value of values) {
        if (!validMetadata(value, value.key)) continue;
        transaction.set(this.prefix + value.key, JSON.stringify({ schema: 2, key: value.key, sha256: value.sha256, bytes: value.bytes, contentType: value.contentType }), { EX: this.ttl });
      }
      await transaction.exec();
    });
  }

  close() { this.closed = true; this.reset(); }
}
