import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { generateOpenApiDocument } from '../src/api/openapi.server.ts';

// 与在线 Scalar 共用契约生成器；CLI 保留独立私有 listener 的完整导出。
const document = await generateOpenApiDocument({ privateListeners: true });
const destination = resolve(process.argv[2] ?? 'reports/openapi.json');
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, JSON.stringify(document, null, 2) + '\n');
console.log(JSON.stringify({ file: destination, paths: Object.keys(document.paths ?? {}).length }));
