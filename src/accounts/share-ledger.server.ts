import { DeletionLedger } from "./deletion.server.ts";
// A separate durable deny ledger; IDs here are share IDs, never account IDs.
export class ShareLedger extends DeletionLedger {}
