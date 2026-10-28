export type SearchDocument = {
  id: string; title: string; originalTitle: string; aliases: string[]; titles: string[];
  tags: string[]; engines: string[]; states: string[]; numbers: string[];
};
export type MeiliSearch = { hits: { id: string }[]; estimatedTotalHits: number };
type Task = { taskUid: number };
export class MeiliError extends Error {
  constructor(readonly code: string, readonly status?: number) { super('Meilisearch operation failed: ' + code); }
}
export function indexName(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,180}$/.test(value)) throw new Error('Invalid search index name');
  return value;
}

/** 仅供后端：密钥不进入响应、索引文档或报错文本。 */
export class MeiliClient {
  private readonly url: string;
  private readonly apiKey: string;
  private readonly requestTimeoutMs: number;
  private readonly taskTimeoutMs: number;
  constructor(options: { url: string; apiKey: string; requestTimeoutMs?: number; taskTimeoutMs?: number }) {
    const url = new URL(options.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new Error('Invalid Meilisearch server URL');
    this.url = url.href.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.taskTimeoutMs = options.taskTimeoutMs ?? 120_000;
  }
  private async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    try {
      const response = await fetch(this.url + path, { method,
        headers: { Authorization: 'Bearer ' + this.apiKey, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(this.requestTimeoutMs) });
      const value = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new MeiliError(typeof value.code === 'string' ? value.code : 'http_error', response.status);
      return value as T;
    } catch (error) {
      if (error instanceof MeiliError) throw error;
      throw new MeiliError('transport_error');
    }
  }
  async wait(task: Task): Promise<void> {
    if (!Number.isSafeInteger(task.taskUid)) throw new MeiliError('invalid_task');
    const end = Date.now() + this.taskTimeoutMs;
    while (Date.now() < end) {
      const status = await this.request<{ status: string; error?: { code?: string } }>('/tasks/' + task.taskUid);
      if (status.status === 'succeeded') return;
      if (status.status === 'failed' || status.status === 'canceled') throw new MeiliError(status.error?.code ?? status.status);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new MeiliError('task_timeout');
  }
  async createIndex(uid: string, primaryKey = 'id') {
    await this.wait(await this.request<Task>('/indexes', 'POST', { uid: indexName(uid), primaryKey }));
  }
  async ensureIndex(uid: string) {
    try { await this.request('/indexes/' + indexName(uid)); }
    catch (error) {
      if (!(error instanceof MeiliError) || error.code !== 'index_not_found') throw error;
      try { await this.createIndex(uid); }
      catch (creation) { if (!(creation instanceof MeiliError) || creation.code !== 'index_already_exists') throw creation; }
    }
  }
  async settings(uid: string) {
    await this.wait(await this.request<Task>('/indexes/' + indexName(uid) + '/settings', 'PATCH', {
      searchableAttributes: ['id', 'numbers', 'title', 'originalTitle', 'aliases', 'titles', 'tags', 'engines'],
      displayedAttributes: ['id'], filterableAttributes: ['engines', 'tags', 'states'],
      pagination: { maxTotalHits: 10_000 },
    }));
  }
  async replace(uid: string, documents: SearchDocument[]) {
    if (!documents.length) return;
    await this.wait(await this.request<Task>('/indexes/' + indexName(uid) + '/documents', 'POST', documents));
  }
  async remove(uid: string, id: string) {
    await this.wait(await this.request<Task>('/indexes/' + indexName(uid) + '/documents/' + encodeURIComponent(id), 'DELETE'));
  }
  async swap(a: string, b: string) {
    await this.wait(await this.request<Task>('/swap-indexes', 'POST', [{ indexes: [indexName(a), indexName(b)] }]));
  }
  async deleteIndex(uid: string) {
    await this.wait(await this.request<Task>('/indexes/' + indexName(uid), 'DELETE'));
  }
  async count(uid: string) {
    return (await this.request<{ numberOfDocuments: number }>('/indexes/' + indexName(uid) + '/stats')).numberOfDocuments;
  }
  async listIndexes() {
    const results: { uid: string }[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = await this.request<{ results: { uid: string }[] }>('/indexes?limit=100&offset=' + offset);
      results.push(...page.results);
      if (page.results.length < 100) return results;
    }
  }
  search(uid: string, body: { q: string; limit: number; offset: number; filter?: string[] }) {
    return this.request<MeiliSearch>('/indexes/' + indexName(uid) + '/search', 'POST', {
      ...body, attributesToRetrieve: ['id'], attributesToHighlight: [], attributesToCrop: [],
    });
  }
}
