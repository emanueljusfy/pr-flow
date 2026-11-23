export type ReviewState = "COMMENTED" | "APPROVED" | "CHANGES_REQUESTED" | "DISMISSED" | string;

export interface PrReview {
  login: string;
  state: ReviewState;
  submittedAt: string;
}

export interface MonitoredPrRaw {
  id: string;
  number: number;
  title: string;
  url: string;
  repository: string;
  createdAt: string;
  /** Branch the PR merges into. Used to detect stacked PRs. */
  baseRefName?: string;
  /** Branch the PR comes from. */
  headRefName?: string;
  /** Head commit SHA (`headRefOid`). */
  headSha?: string;
  isDraft?: boolean;
  authorLogin?: string;
  requestedReviewers: string[];
  reviews: PrReview[];
  hasConflicts?: boolean;
  hasUnresolvedComments?: boolean;
}

export interface PrSlackShareInfo {
  sharedAt: string;
  channel: string;
}

export interface PrReviewReminderScheduleInfo {
  intervalMinutes: number;
  nextRunAt: string;
}

export interface MonitoredPr {
  id: string;
  number: number;
  title: string;
  url: string;
  repository: string;
  createdAt: string;
  /** Optional for caches written before stacked-PR grouping existed. */
  baseRefName?: string;
  headRefName?: string;
  avaliou: string[];
  naoAvaliou: string[];
  semReviewersSolicitados: boolean;
  aprovou: string[];
  solicitouAlteracoes: string[];
  pendente: string[];
  /** Subset of `pendente` whose approval / change request was dismissed (e.g. stale after a push). Optional for caches written before this field. */
  dismissed?: string[];
  requestedReviewersCount: number;
  statusGeral: "approved" | "changes_requested" | "pending_review" | "no_reviewers";
  readyToMerge?: boolean;
  hasConflicts?: boolean;
  hasUnresolvedComments?: boolean;
  /** Preenchido na leitura do monitor quando a PR já foi enviada ao Slack. */
  slackShare?: PrSlackShareInfo | null;
  /** Agendamento ativo de lembrete de revisão na thread Slack. */
  reviewReminderSchedule?: PrReviewReminderScheduleInfo | null;
}

export type PrApiSuccess = {
  status: "ok";
  data: MonitoredPr[];
  fetchedAt: string;
  githubLogin: string;
};

export type PrApiUnauthenticated = {
  status: "unauthenticated";
  message: string;
};

export type PrApiError = {
  status: "error";
  message: string;
};

export type PrApiStale = {
  status: "stale";
  data: MonitoredPr[];
  fetchedAt: string;
  githubLogin: string;
  message: string;
};

export type PrApiResponse = PrApiSuccess | PrApiStale | PrApiUnauthenticated | PrApiError;

export type MyReviewStatus = "reviewed" | "pending" | "dismissed";

export interface ReviewerQueuePr {
  id: string;
  number: number;
  title: string;
  url: string;
  repository: string;
  myReviewStatus: MyReviewStatus;
  /** Optional for caches written before the AI reviewer existed. */
  authorLogin?: string;
  isDraft?: boolean;
  headSha?: string;
}

/** Minimal review snapshot persisted during sync for daily summaries. */
export interface PrReviewContextRecord {
  id: string;
  number: number;
  title: string;
  url: string;
  repository: string;
  authorLogin: string;
  reviews: PrReview[];
}

export type PrTimelineEventType =
  | "review_submitted"
  | "status_changed"
  | "pr_merged"
  | "pr_opened";

export type PrTimelineReviewPayload = {
  reviewerLogin: string;
  state: string;
  authorLogin: string;
};

export type PrTimelineStatusPayload = {
  previousStatus: MonitoredPr["statusGeral"];
  nextStatus: MonitoredPr["statusGeral"];
};

export type PrTimelineEventPayload = PrTimelineReviewPayload | PrTimelineStatusPayload | Record<string, never>;

export interface PrTimelineEventRecord {
  id: string;
  githubLogin: string;
  notebookDay: string;
  occurredAt: string;
  eventType: PrTimelineEventType;
  prId: string;
  prNumber: number;
  prTitle: string;
  repository: string;
  jiraIssueKey: string | null;
  payload: PrTimelineEventPayload;
  dedupeKey: string;
}

export type PrTimelineEventInsert = Omit<PrTimelineEventRecord, "id">;

/** Live GitHub history for the /prs side panel (not the sync-diff summary timeline). */
export type PrHistoryEventType =
  | "opened"
  | "commented"
  | "review_submitted"
  | "commit"
  | "merged"
  | "closed"
  | "reopened";

export interface PrHistoryEvent {
  id: string;
  type: PrHistoryEventType;
  occurredAt: string;
  actorLogin: string;
  url: string | null;
  /** Comment body or commit headline (truncated). */
  detail: string | null;
  /** Present when type is review_submitted. */
  reviewState: string | null;
}

export type PrHistoryApiSuccess = {
  status: "ok";
  data: { events: PrHistoryEvent[] };
  fetchedAt: string;
};

export type PrHistoryApiUnauthenticated = {
  status: "unauthenticated";
  message: string;
};

export type PrHistoryApiError = {
  status: "error";
  message: string;
};

export type PrHistoryApiResponse = PrHistoryApiSuccess | PrHistoryApiUnauthenticated | PrHistoryApiError;

export type ReviewerQueueApiSuccess = {
  status: "ok";
  data: ReviewerQueuePr[];
  fetchedAt: string;
  githubLogin: string;
};

export type ReviewerQueueApiUnauthenticated = {
  status: "unauthenticated";
  message: string;
};

export type ReviewerQueueApiError = {
  status: "error";
  message: string;
};

export type ReviewerQueueApiStale = {
  status: "stale";
  data: ReviewerQueuePr[];
  fetchedAt: string;
  githubLogin: string;
  message: string;
};

export type ReviewerQueueApiResponse =
  | ReviewerQueueApiSuccess
  | ReviewerQueueApiStale
  | ReviewerQueueApiUnauthenticated
  | ReviewerQueueApiError;
