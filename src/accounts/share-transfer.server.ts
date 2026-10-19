import { AccountError } from "./errors.server.ts";
export class TransferBudget {
  private owners = new Map<string, number>();
  private peers = new Map<string, number>();
  private total = 0;
  private next = 0;
  acquire(owner: string, peer: string) {
    if (
      (this.owners.get(owner) ?? 0) >= 2 ||
      (this.peers.get(peer) ?? 0) >= 8 ||
      this.total >= 16
    )
      throw new AccountError(429, "TRY_LATER");
    this.owners.set(owner, (this.owners.get(owner) ?? 0) + 1);
    this.peers.set(peer, (this.peers.get(peer) ?? 0) + 1);
    this.total++;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.owners.set(owner, this.owners.get(owner)! - 1);
      this.peers.set(peer, this.peers.get(peer)! - 1);
      this.total--;
      if (!this.owners.get(owner)) this.owners.delete(owner);
      if (!this.peers.get(peer)) this.peers.delete(peer);
    };
  }
  async pace(bytes: number) {
    const now = Date.now(),
      start = Math.max(now, this.next);
    this.next = start + (bytes / (16 * 1024 ** 2)) * 1000;
    if (start > now) await new Promise((r) => setTimeout(r, start - now));
  }
}
