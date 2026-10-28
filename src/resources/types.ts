export type ResourceMetadata = { key: string; sha256: string; bytes: number; contentType: string };
export type Resource = ResourceMetadata & { url: string };
export interface ResourceCache {
  getMany(keys: string[]): Promise<Map<string, ResourceMetadata>>;
  setMany(values: ResourceMetadata[]): Promise<void>;
}

export const SHA256 = /^[0-9a-f]{64}$/;
export const RESOURCE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export class ResourceRequestError extends Error {}

export function validNamespace(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 512 && !/[\u0000-\u001f\u007f]/.test(value);
}
export function validContentType(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && !/[\u0000-\u001f\u007f]/.test(value);
}
export function publicResource(metadata: ResourceMetadata): Resource {
  // 公共地址仅由已验证的完整摘要生成，存储位置和请求输入均不能提供 URL。
  return { key: metadata.key, url: 'https://wg-b2.saop.cc/' + metadata.sha256 + '.bin', sha256: metadata.sha256, bytes: metadata.bytes, contentType: metadata.contentType };
}
export function validMetadata(value: unknown, key: string): value is ResourceMetadata {
  if (!value || typeof value !== 'object') return false;
  const row = value as ResourceMetadata;
  return row.key === key && RESOURCE_KEY.test(row.key) && SHA256.test(row.sha256) && Number.isSafeInteger(row.bytes) && row.bytes >= 0 && validContentType(row.contentType);
}
