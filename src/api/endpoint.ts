import { oc } from '@orpc/contract';
import type { z } from 'zod';

/** HTTP 方法与现有路径是兼容协议的一部分；查询保持 GET。 */
export function endpoint<I extends z.ZodType, O extends z.ZodType>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  input: I,
  output: O,
) {
  return oc.route({ method, path: path as `/${string}`, inputStructure: 'detailed' })
    .input(input).output(output);
}
