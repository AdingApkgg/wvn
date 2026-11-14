import type { AnyContractProcedure } from '@orpc/contract';
import { implement } from '@orpc/server';
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import type { Context, Hono } from 'hono';

type RouteContext = { hono: Context; response?: Response; error?: unknown; thrown?: boolean };
const authentication = new WeakMap<Hono, (context: Context) => Promise<unknown>>();

/** 先认证再校验输入，保留匿名、失效 binding 与业务校验的拒绝顺序。 */
export function configureJsonRouteAuth(app: Hono, authenticate: (context: Context) => Promise<unknown>) {
  authentication.set(app, authenticate);
}

type LegacyHandler = (context: Context) => Response | Promise<Response>;

/** 在原 Hono 路由位置执行契约，保留安全中间件、锁、审计、Cookie 和业务错误。 */
export function registerJsonRoute<C extends AnyContractProcedure>(
  app: Hono,
  contract: C,
  handler: LegacyHandler,
  options: { invalidCode?: string; invalidResponse?: (context: Context) => Response } = {},
) {
  const route = contract['~orpc'].route;
  if (!route?.path || !route.method) throw new Error('JSON contract requires an explicit HTTP route');
  const procedure = implement(contract).$context<RouteContext>().handler(async ({ context }) => {
    try {
      const response = await handler(context.hono);
      context.response = response;
      // 业务拒绝（包括带数据的 409）保留原协议，不作为成功输出解析。
      if (!response.ok) throw new Error('Business response');
      // 外部 handler 的类型由运行时输出 schema 校验；不将未验证 JSON 暴露为静态契约。
      return await response.clone().json() as never;
    } catch (error) {
      if (!context.response) { context.thrown = true; context.error = error; }
      throw error;
    }
  });
  const api = new OpenAPIHandler({ operation: procedure });
  const path = route.path.replace(/\{([^}]+)\}/g, ':$1');
  app.on(route.method, path, async c => {
    if (route.path === '/api/me' || route.path?.startsWith('/api/me/')) await authentication.get(app)?.(c);
    const context: RouteContext = { hono: c };
    // Hono bodyLimit 和领域 handler 共用其请求体缓存，避免重复消费流。
    const parsers = new Set(['json', 'text', 'arrayBuffer', 'blob', 'formData']);
    // Hono 的 GET 路由也接收 HEAD；向 oRPC 匹配器提供 GET，外层仍负责空响应正文。
    const source = c.req.method === 'HEAD' && route.method === 'GET'
      ? new Request(c.req.raw, { method: 'GET' }) : c.req.raw;
    const request = new Proxy(source, {
      get(target, property) {
        if (property === 'bodyUsed') return false;
        if (typeof property === 'string' && parsers.has(property)) {
          return () => (c.req[property as 'json'])();
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const result = await api.handle(request, { context });
    if (context.thrown) throw context.error;
    if (context.response && (!context.response.ok || result.response?.ok)) return context.response;
    if (context.response) {
      console.error('JSON API response failed contract validation', { method: route.method, path: route.path });
      return c.json({ code: 'RESPONSE_INVALID' }, 500);
    }
    return options.invalidResponse?.(c) ?? c.json({ code: options.invalidCode ?? 'INVALID_REQUEST' }, 400);
  });
}
