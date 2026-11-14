/** 管理统计的浏览器安全聚合模型；不包含账号、会话或存档正文。 */
export type StatisticCount = { key: string; count: number };
export type StatisticDay = {
  date: string;
  newUsers: number;
  readingStarts: number;
  saveRevisions: number;
  shares: number;
  operations: number;
};
export type InternalStatisticsView = {
  generatedAt: string;
  period: {
    days: 7 | 30 | 90;
    timeZone: "Asia/Shanghai";
    start: string;
    end: string;
  };
  totals: {
    users: number;
    admins: number;
    publicProfiles: number;
    validSessions: number;
    passkeys: number;
    libraryEntries: number;
    readingStarts: number;
    readingSeconds: number;
    recentReaders: number;
    saveProfiles: number;
    saveRevisions: number;
    registeredSaveBytes: number;
    referencedSaveBytes: number;
    activeShares: number;
    pendingReviews: number;
    openReports: number;
    internalReads: number;
    likes: number;
    favorites: number;
    operations: number;
  };
  window: {
    newUsers: number;
    readingStarts: number;
    saveRevisions: number;
    shares: number;
    operations: number;
  };
  trend: StatisticDay[];
  catalog: {
    works: number;
    versions: number;
    engines: StatisticCount[];
    versionStatus: StatisticCount[];
    pageSuitability: StatisticCount[];
  } | null;
  distributions: {
    library: StatisticCount[];
    shares: StatisticCount[];
    eligibility: StatisticCount[];
  };
  topWorks: {
    id: string;
    title: string;
    readingSeconds: number;
    readingStarts: number;
    internalReads: number;
    likes: number;
    favorites: number;
  }[];
};
