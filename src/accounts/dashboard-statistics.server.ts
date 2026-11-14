import { statisticsContract } from "../api/contracts/statistics.ts";
import { registerJsonRoute } from "../api/route.server.ts";
import { CONTENT_POLICY_VERSION } from "../content/quiz.ts";
import type { PgDatabase } from "../database/postgres.ts";
import type { Store } from "../server/store.ts";
import { ABSOLUTE_MS } from "./auth.server.ts";
import type {
  InternalStatisticsView,
  StatisticCount,
  StatisticDay,
} from "./dashboard-statistics.ts";
import { AccountError } from "./errors.server.ts";
import { adminIds } from "./profiles.server.ts";
import type { AccountService } from "./service.server.ts";

const DAY = 86400000,
  OFFSET = 8 * 3600000;
const value = (input: unknown) => {
  const n = Number(input ?? 0);
  if (!Number.isSafeInteger(n) || n < 0) throw Error("Invalid aggregate");
  return n;
};
const counts = (rows: Record<string, unknown>[]): StatisticCount[] =>
  rows.map((r) => ({ key: String(r.key), count: value(r.count) }));
function distribution(keys: string[], values: string[]) {
  return keys.map((key) => ({
    key,
    count: values.filter((v) => v === key).length,
  }));
}

export class InternalStatistics {
  constructor(
    private db: PgDatabase,
    private bootstrap: () => Set<string>,
    private catalog?: Pick<Store, "list">,
    private now = Date.now,
    private policyVersion: () => string = () => CONTENT_POLICY_VERSION,
  ) {}
  async read(days: number): Promise<InternalStatisticsView> {
    if (![7, 30, 90].includes(days))
      throw new AccountError(400, "STATISTICS_RANGE_INVALID");
    const now = this.now(),
      today = Math.floor((now + OFFSET) / DAY) * DAY - OFFSET,
      start = today - (days - 1) * DAY;
    // 目录使用已有有效分类投影，指纹失效的页面不会被误计为已审核。
    const catalog = (await this.catalog?.list(true).catch(() => null)) ?? null;
    try {
      return await this.db.transaction(async () => {
        await this.db.exec(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
        );
        await this.db.exec("SET LOCAL statement_timeout='5s'");
        const totals = await this.db
          .prepare(`SELECT
    (SELECT count(*) FROM "user") AS users,
    (SELECT count(*) FROM "user" u WHERE u.id=ANY($1::text[]) OR EXISTS(SELECT 1 FROM wg_admin_roles a WHERE a.user_id=u.id AND a.active)) AS admins,
    (SELECT count(*) FROM wg_public_profiles WHERE published) AS public_profiles,
    (SELECT count(*) FROM session WHERE "expiresAt">$2 AND "createdAt">$3 AND "createdAt"<=$2) AS valid_sessions,
    (SELECT count(*) FROM passkey) AS passkeys,
    (SELECT count(*) FROM wg_library) AS library_entries,
    (SELECT count(*) FROM wg_plays) AS reading_starts,
    (SELECT COALESCE(sum(seconds),0) FROM wg_plays) AS reading_seconds,
    (SELECT count(DISTINCT user_id) FROM wg_plays WHERE active=1 AND last_at BETWEEN $4 AND $5) AS recent_readers,
    (SELECT count(*) FROM wg_save_profiles WHERE deleted=0) AS save_profiles,
    (SELECT count(*) FROM wg_save_revisions) AS save_revisions,
    (SELECT COALESCE(sum(bytes),0) FROM wg_save_blobs) AS registered_save_bytes,
    (SELECT COALESCE(sum(b.bytes),0) FROM wg_save_blobs b WHERE EXISTS(SELECT 1 FROM wg_save_refs r WHERE r.owner=b.owner AND r.hash=b.hash)) AS referenced_save_bytes,
    (SELECT count(*) FROM wg_save_shares WHERE state='active' AND (expires IS NULL OR expires>$5)) AS active_shares,
    (SELECT count(*) FROM wg_save_shares WHERE state IN ('active','pending') AND pending IS NOT NULL AND (expires IS NULL OR expires>$5)) AS pending_reviews,
    (SELECT count(*) FROM wg_save_share_reports WHERE status='open') AS open_reports,
    (SELECT COALESCE(sum(reads),0) FROM wg_work_counts) AS internal_reads,
    (SELECT count(*) FROM wg_work_reactions WHERE kind='like') AS likes,
    (SELECT count(*) FROM wg_work_reactions WHERE kind='favorite') AS favorites,
    (SELECT count(*) FROM wg_dashboard_audit) AS operations`)
          .get(
            [...this.bootstrap()],
            new Date(now),
            new Date(now - ABSOLUTE_MS),
            now - 15 * 60000,
            now,
          );
        if (!totals) throw Error("Missing aggregate");
        const grouped = await this.db
          .prepare(`SELECT day,kind,count(*) AS count FROM (
    SELECT to_char("createdAt" AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS day,'newUsers' AS kind FROM "user" WHERE "createdAt">=$1 AND "createdAt"<=$2
    UNION ALL SELECT to_char(to_timestamp(started_at/1000.0) AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD'),'readingStarts' FROM wg_plays WHERE started_at BETWEEN $3 AND $4
    UNION ALL SELECT to_char(to_timestamp(created/1000.0) AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD'),'saveRevisions' FROM wg_save_revisions WHERE created BETWEEN $3 AND $4
    UNION ALL SELECT to_char(to_timestamp(created/1000.0) AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD'),'shares' FROM wg_save_shares WHERE created BETWEEN $3 AND $4
    UNION ALL SELECT to_char(created_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD'),'operations' FROM wg_dashboard_audit WHERE created_at BETWEEN $1 AND $2
   ) events GROUP BY day,kind ORDER BY day`)
          .all(new Date(start), new Date(now), start, now);
        const trend: StatisticDay[] = Array.from({ length: days }, (_, i) => ({
          date: new Date(start + i * DAY + OFFSET).toISOString().slice(0, 10),
          newUsers: 0,
          readingStarts: 0,
          saveRevisions: 0,
          shares: 0,
          operations: 0,
        }));
        for (const row of grouped) {
          const day = trend.find((d) => d.date === row.day);
          if (
            day &&
            [
              "newUsers",
              "readingStarts",
              "saveRevisions",
              "shares",
              "operations",
            ].includes(row.kind)
          )
            day[row.kind as Exclude<keyof StatisticDay, "date">] = value(
              row.count,
            );
        }
        const library = await this.db
          .prepare(
            "SELECT CASE WHEN status IN ('wanted','playing','completed','paused','dropped') THEN status ELSE 'other' END AS key,count(*) AS count FROM wg_library GROUP BY 1 ORDER BY 1",
          )
          .all();
        const shares = await this.db
          .prepare(
            `SELECT CASE WHEN state IN ('active','pending') AND expires IS NOT NULL AND expires<=$1 THEN 'expired' WHEN state IN ('active','pending','expired','revoked','blocked') THEN state ELSE 'other' END AS key,count(*) AS count FROM wg_save_shares GROUP BY 1 ORDER BY 1`,
          )
          .all(now);
        const eligibility = await this.db
          .prepare(
            "SELECT CASE WHEN e.status='qualified' AND e.policy_version IS DISTINCT FROM $1 THEN 'needs_retest' WHEN e.status IN ('qualified','suspended','needs_retest') THEN e.status ELSE 'unqualified' END AS key,count(*) AS count FROM \"user\" u LEFT JOIN wg_content_eligibility e ON e.user_id=u.id GROUP BY 1 ORDER BY 1",
          )
          .all(this.policyVersion());
        const ranked = await this.db
          .prepare(`WITH played AS(SELECT work_id,count(*) AS starts,COALESCE(sum(seconds),0) AS seconds FROM wg_plays GROUP BY work_id),
    reactions AS(SELECT work_id,count(*) FILTER(WHERE kind='like') AS likes,count(*) FILTER(WHERE kind='favorite') AS favorites FROM wg_work_reactions GROUP BY work_id),
    ids AS(SELECT work_id FROM played UNION SELECT work_id FROM wg_work_counts UNION SELECT work_id FROM reactions)
    SELECT i.work_id,COALESCE(p.starts,0) AS starts,COALESCE(p.seconds,0) AS seconds,COALESCE(c.reads,0) AS reads,COALESCE(r.likes,0) AS likes,COALESCE(r.favorites,0) AS favorites
    FROM ids i LEFT JOIN played p ON p.work_id=i.work_id LEFT JOIN wg_work_counts c ON c.work_id=i.work_id LEFT JOIN reactions r ON r.work_id=i.work_id
    ORDER BY seconds DESC,reads DESC,i.work_id LIMIT 10`)
          .all();
        const versions = catalog?.flatMap((w) => w.versions) ?? [];
        const output: InternalStatisticsView = {
          generatedAt: new Date(now).toISOString(),
          period: {
            days: days as 7 | 30 | 90,
            timeZone: "Asia/Shanghai",
            start: new Date(start).toISOString(),
            end: new Date(now).toISOString(),
          },
          totals: {
            users: value(totals.users),
            admins: value(totals.admins),
            publicProfiles: value(totals.public_profiles),
            validSessions: value(totals.valid_sessions),
            passkeys: value(totals.passkeys),
            libraryEntries: value(totals.library_entries),
            readingStarts: value(totals.reading_starts),
            readingSeconds: value(totals.reading_seconds),
            recentReaders: value(totals.recent_readers),
            saveProfiles: value(totals.save_profiles),
            saveRevisions: value(totals.save_revisions),
            registeredSaveBytes: value(totals.registered_save_bytes),
            referencedSaveBytes: value(totals.referenced_save_bytes),
            activeShares: value(totals.active_shares),
            pendingReviews: value(totals.pending_reviews),
            openReports: value(totals.open_reports),
            internalReads: value(totals.internal_reads),
            likes: value(totals.likes),
            favorites: value(totals.favorites),
            operations: value(totals.operations),
          },
          window: {
            newUsers: 0,
            readingStarts: 0,
            saveRevisions: 0,
            shares: 0,
            operations: 0,
          },
          trend,
          catalog: catalog
            ? {
                works: catalog.length,
                versions: versions.length,
                engines: distribution(
                  ["ONS", "Artemis", "RenPy", "Tyrano"],
                  versions.map((v) => v.engine),
                ),
                versionStatus: distribution(
                  ["published", "hidden", "deleted"],
                  versions.map(
                    (v) =>
                      (v as typeof v & { status?: string }).status ??
                      "published",
                  ),
                ),
                pageSuitability: distribution(
                  ["sfw", "nsfw", "unknown"],
                  catalog.map(
                    (w) => w.classification?.pageSuitability ?? "unknown",
                  ),
                ),
              }
            : null,
          distributions: {
            library: counts(library),
            shares: counts(shares),
            eligibility: counts(eligibility),
          },
          topWorks: ranked.map((r) => ({
            id: r.work_id,
            title: catalog?.find((w) => w.id === r.work_id)?.title ?? r.work_id,
            readingSeconds: value(r.seconds),
            readingStarts: value(r.starts),
            internalReads: value(r.reads),
            likes: value(r.likes),
            favorites: value(r.favorites),
          })),
        };
        for (const key of [
          "newUsers",
          "readingStarts",
          "saveRevisions",
          "shares",
          "operations",
        ] as const)
          output.window[key] = trend.reduce((sum, d) => sum + d[key], 0);
        return output;
      });
    } catch (error) {
      if (error instanceof AccountError) throw error;
      throw new AccountError(503, "STATISTICS_UNAVAILABLE");
    }
  }
}

export function mountInternalStatistics(
  service: AccountService,
  catalog?: Pick<Store, "list">,
) {
  const stats = new InternalStatistics(
    service.db,
    () => adminIds(service.config),
    catalog,
    Date.now,
    service.config.content?.policyVersion ?? (() => CONTENT_POLICY_VERSION),
  );
  service.app.use("/api/dash/statistics", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    c.header("Vary", "Cookie");
    const { session } = await service.player(c);
    if (!(await service.admins.isAdmin(session.user.id)))
      throw new AccountError(403, "ADMIN_REQUIRED");
    await next();
  });
  registerJsonRoute(
    service.app,
    statisticsContract.dashStatistics,
    async (c) => {
      const query = new URL(c.req.url).searchParams;
      if (
        [...query.keys()].some((k) => k !== "days") ||
        query.getAll("days").length > 1 ||
        (query.has("days") &&
          !["7", "30", "90"].includes(query.get("days") ?? ""))
      )
        throw new AccountError(400, "STATISTICS_RANGE_INVALID");
      return c.json(await stats.read(Number(query.get("days") ?? 30)));
    },
    { invalidCode: "STATISTICS_RANGE_INVALID" },
  );
}
