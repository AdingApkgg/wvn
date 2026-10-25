export type AccountConfig = {
  analytics?: import('../analytics/proxy.server.ts').AnalyticsConfig;
  revision?: string;
  deployment?: "preview"|"production";
  isolated?: boolean;
  publicResourcePreflight?: (path:string)=>boolean;
  shareLedger?: string;
  catalogProvider?: () => Promise<import("./library.server.ts").CatalogItem[]>;
  origin: string;
  cookiePrefix?: string;
  database: string;
  secret: string;
  catalogOrigin?: string;
  blobRoot?: string;
  blobBackend?: import("./blob-store.server.ts").BlobStore;
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
  if(config.cookiePrefix && !/^__Host-wg(?:-[a-z0-9-]{1,40})?$/.test(config.cookiePrefix)) throw new Error('Invalid account cookie prefix');
  return config;
}
