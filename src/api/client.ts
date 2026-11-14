import { createContractClient, type ApiClientOptions } from './client-base.ts';
import { accountContract } from './contracts/account.ts';
import { savesContract } from './contracts/saves.ts';
import { shareContract } from './contracts/shares.ts';
import { adminContract } from './contracts/admin.ts';
import { catalogContract } from './contracts/catalog.ts';
import { sessionContract } from './contracts/session.ts';
export { createContractClient, ApiResponseError } from './client-base.ts';
export type { ApiCallContext, ApiClientOptions } from './client-base.ts';
export const apiContract = { ...catalogContract, ...sessionContract, ...accountContract, ...savesContract, ...shareContract, ...adminContract };
export function createApiClient(options: ApiClientOptions = {}) { return createContractClient(apiContract, options); }
export type ApiClient = ReturnType<typeof createApiClient>;
