import { OpenAPIGenerator } from '@orpc/openapi';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { apiContract } from './client.ts';
import { managementContract, moderationContract } from './contracts/admin.ts';

const generator = new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] });
function generate(privateListeners: boolean) {
  const contract = privateListeners ? {
    ...apiContract,
    privateManagement: managementContract(),
    privateModeration: moderationContract(),
  } : apiContract;
  return generator.generate(contract, {
    info: { title: 'WVN Business API', version: '1.0.0' },
    servers: [{ url: '/' }],
  });
}
const documents = new Map<boolean, ReturnType<typeof generate>>();

/** 在线文档仅描述当前账号 listener；离线完整导出可包含独立私有 listener。 */
export function generateOpenApiDocument(options: { privateListeners?: boolean } = {}) {
  const privateListeners = options.privateListeners === true;
  let document = documents.get(privateListeners);
  if (!document) {
    document = generate(privateListeners);
    documents.set(privateListeners, document);
    void document.catch(() => { if (documents.get(privateListeners) === document) documents.delete(privateListeners); });
  }
  return document;
}
