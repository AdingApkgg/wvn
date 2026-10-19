export type CleanupContext = {
  request: {
    get: (
      url: string,
      options?: any,
    ) => Promise<{ status(): number; json(): Promise<any> }>;
    delete: (
      url: string,
      options: any,
    ) => Promise<{ status(): number; json(): Promise<any> }>;
  };
};
export type CleanupEntry = {
  context: CleanupContext;
  label: string;
  accountId: string | null;
  retainOnSuccess: boolean;
  state: string;
  attempts: number;
};
export class PreviewCleanup {
  constructor(options: { directory: string; origin: string; runId?: string });
  origin: string;
  runId: string;
  report: string;
  accounts: CleanupEntry[];
  begin(
    context: CleanupContext,
    label: string,
    retainOnSuccess?: boolean,
  ): CleanupEntry;
  identify(entry: CleanupEntry, id: string): void;
  recordFailure(stage: string, error: unknown): void;
  remove(
    entry: CleanupEntry,
  ): Promise<{ ok: boolean; phase: string; status?: number; code?: string }>;
  finish(input: {
    passed: boolean;
    stage: string;
    error?: unknown;
  }): Promise<{
    status: string;
    runId: string;
    deleted: number;
    remaining: number;
    report: string;
  }>;
}
