export type EligibilityStatus = "unqualified" | "qualified" | "suspended" | "needs_retest";
export type DisplayMode = "public" | "restricted";
export type ContentAccess = {
  /** 仅SSR快照携带的会话摘要，用于与首次账号确认比较；不能用于认证。 */
  sessionIdentity?: string;
  authenticated: boolean;
  eligibility: EligibilityStatus;
  displayMode: DisplayMode;
  canViewRestricted: boolean;
  requiredPolicyVersion: string;
  nextAttemptAt: number | null;
  attemptsRemaining: number;
};
export type ClassificationEvidence = { reason: string; source: string; reviewedAt: string; revision: number };
export type WorkClassification = ClassificationEvidence & { pageSuitability: "sfw" | "nsfw" | "unknown" };
export type VersionClassification = ClassificationEvidence & { sexualContent: "none" | "present" | "unknown"; titleSafe: boolean; ageRating?: string };
export type MediaClassification = ClassificationEvidence & { sexual: "safe" | "suggestive" | "explicit" | "unknown"; violence: "tame" | "violent" | "brutal" | "unknown"; spoiler: boolean; rawSexual?: number; rawViolence?: number; voteCount?: number };
export type QuizChoice = { id: string; text: string };
export type QuizQuestion = { id: string; text: string; choices: QuizChoice[] };
export type QuizAttempt = { id: string; policyVersion: string; quizVersion: string; expiresAt: number; questions: QuizQuestion[] };
export type QuizResult = { passed: boolean; incorrect: { questionId: string; explanation: string }[]; access: ContentAccess };
