import type { AccountView } from "./client";

/** Consume anonymous replies too so the connection and browser request finish. */
export async function readAccountView(response: Response): Promise<AccountView | null> {
  if (response.status === 401) {
    await response.arrayBuffer();
    return null;
  }
  if (!response.ok) throw new Error("NETWORK");
  return response.json() as Promise<AccountView>;
}
