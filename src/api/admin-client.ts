import { ApiResponseError, createContractClient } from './client-base.ts';
import { managementContract, moderationContract } from './contracts/admin.ts';
type Options = Parameters<typeof createContractClient>[1];
export function createManagementClient(prefix = '/api/manage', options?: Options) {
  return createContractClient(managementContract(prefix), options);
}
export function createModerationClient(prefix = '/api/share-admin', options?: Options) {
  return createContractClient(moderationContract(prefix), options);
}
export type ManagementClient = ReturnType<typeof createManagementClient>;
export type ModerationClient = ReturnType<typeof createModerationClient>;

/** 后台保留输入，把业务拒绝转换为可操作的中文提示。 */
export function adminErrorCopy(error: unknown, scope: 'catalog' | 'content' | 'shares' = 'catalog'): string {
  if (error instanceof ApiResponseError) {
    if (error.status === 401) return '管理员会话已失效，请重新登录；输入已保留。';
    if (error.status === 403) return error.code === 'CONTENT_SUSPENDED'
      ? '资格仍处于暂停状态，请先解除暂停；输入已保留。'
      : '当前账号无法执行此操作，请刷新页面确认管理权限；输入已保留。';
    if (error.status === 409) return scope === 'catalog'
      ? '记录已变化，请刷新列表后重新应用编辑；输入已保留。'
      : scope === 'shares'
        ? '分享无效、仍有待发布文案，或修订已变化。请刷新队列并核对当前状态；输入已保留。'
        : '账号或分享状态已变化，请重新查询并核对文案修订；输入已保留。';
    if (error.status === 404) return '未找到对应记录，请核对账号或分享标识；输入已保留。';
    if (error.status === 400) return scope === 'catalog'
      ? '请检查填写内容和修订号后重试；输入已保留。'
      : '请检查操作、文案修订和审核理由；理由须为1–1000字且不含控制字符。输入已保留。';
    return '管理服务暂不可用，请稍后重试；输入已保留。';
  }
  if (error instanceof TypeError) return '连接暂时中断，请重试；输入已保留。';
  return '操作未完成，请检查填写内容后重试；输入已保留。';
}
