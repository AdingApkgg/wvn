import { z } from "zod";
import type { InternalStatisticsView } from "../../accounts/dashboard-statistics.ts";
import { endpoint } from "../endpoint.ts";

const count = z.number().int().nonnegative();
const distribution = z.array(z.object({ key: z.string(), count }));
const events = {
  newUsers: count,
  readingStarts: count,
  saveRevisions: count,
  shares: count,
  operations: count,
};
export const internalStatisticsSchema = z.object({
  generatedAt: z.string(),
  period: z.object({
    days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
    timeZone: z.literal("Asia/Shanghai"),
    start: z.string(),
    end: z.string(),
  }),
  totals: z.object({
    users: count,
    admins: count,
    publicProfiles: count,
    validSessions: count,
    passkeys: count,
    libraryEntries: count,
    readingStarts: count,
    readingSeconds: count,
    recentReaders: count,
    saveProfiles: count,
    saveRevisions: count,
    registeredSaveBytes: count,
    referencedSaveBytes: count,
    activeShares: count,
    pendingReviews: count,
    openReports: count,
    internalReads: count,
    likes: count,
    favorites: count,
    operations: count,
  }),
  window: z.object(events),
  trend: z.array(z.object({ date: z.string(), ...events })),
  catalog: z
    .object({
      works: count,
      versions: count,
      engines: distribution,
      versionStatus: distribution,
      pageSuitability: distribution,
    })
    .nullable(),
  distributions: z.object({
    library: distribution,
    shares: distribution,
    eligibility: distribution,
  }),
  topWorks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      readingSeconds: count,
      readingStarts: count,
      internalReads: count,
      likes: count,
      favorites: count,
    }),
  ),
}) satisfies z.ZodType<InternalStatisticsView>;
export const statisticsContract = {
  dashStatistics: endpoint(
    "GET",
    "/api/dash/statistics",
    z.object({
      query: z
        .object({ days: z.enum(["7", "30", "90"]).optional() })
        .strict()
        .optional(),
    }),
    internalStatisticsSchema,
  ),
};
