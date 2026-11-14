import { createORPCClient } from '@orpc/client';
import type { ContractRouterClient, AnyContractRouter } from '@orpc/contract';
import { OpenAPILink } from '@orpc/openapi-client/fetch';

export type ApiCallContext = { owner?: string };
export class ApiResponseError extends Error {
  constructor(public code: string, public data: unknown, public status: number) {
    super(typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : code);
  }
}
export type ApiClientOptions = {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  beforeRequest?: (context: ApiCallContext) => void;
  aroundCall?: <T>(context: ApiCallContext, invoke: () => Promise<T>) => Promise<T>;
};

/** 请求与响应来自同一契约；调用方可注入带身份保护的传输。 */
export function createContractClient<T extends AnyContractRouter>(contract: T, options: ApiClientOptions = {}): ContractRouterClient<T, ApiCallContext> {
  const link = new OpenAPILink<ApiCallContext>(contract, {
    url: options.baseUrl ?? (typeof window === 'undefined' ? 'http://localhost' : window.location.origin),
    interceptors: [({ context, next }) => options.aroundCall ? options.aroundCall(context, next) : next()],
    fetch: async (request, init, call) => {
      options.beforeRequest?.(call.context);
      const response = await (options.fetch ?? globalThis.fetch)(request, { ...init, headers: request.headers, cache: 'no-store' });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const code = typeof data === 'object' && data !== null && 'code' in data && typeof data.code === 'string'
          ? data.code : `HTTP_${response.status}`;
        throw new ApiResponseError(code, data, response.status);
      }
      return response;
    },
  });
  return createORPCClient(link);
}
