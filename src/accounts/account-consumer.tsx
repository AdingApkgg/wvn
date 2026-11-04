import type { ReactNode } from "react";
import { useContentAccess } from "../content/client";
import { useAccount } from "./client";

export type ReaderAccount = ReturnType<typeof useAccount>;

/** 同页只使用一个账号状态来源，避免多个探测器互相触发失效事件。 */
export function AccountConsumer({ children }: { children: (account: ReaderAccount) => ReactNode }) {
  const content=useContentAccess();
  return content.account ? children(content.account) : <StandaloneAccount>{children}</StandaloneAccount>;
}

function StandaloneAccount({ children }: { children: (account: ReaderAccount) => ReactNode }) {
  const account=useAccount();
  return children(account);
}
