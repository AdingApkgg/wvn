export type AccountConfig = {
  revision?: string;
  shareLedger?: string;
  catalogProvider?: () => Promise<import("./library.server.ts").CatalogItem[]>;
  origin: string;
  database: string;
  secret: string;
  signupInvite: string;
  catalogOrigin?: string;
  blobRoot?: string;
  deletionLedger?: string;
  catalog?: import("./library.server.ts").CatalogItem[];
};
export function validateAccountConfig(config: AccountConfig): AccountConfig {
  const url = new URL(config.origin);
  if (
    url.protocol !== "https:" ||
    url.origin !== config.origin ||
    url.username ||
    url.password
  )
    throw new Error("WG_ACCOUNT_ORIGIN must be an exact HTTPS origin");
  if (config.secret.length < 48)
    throw new Error("Account secret must be at least 48 characters");
  if (config.signupInvite.length < 8)
    throw new Error("Account preview requires an invitation");
  return config;
}
