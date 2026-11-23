import { ptBR } from "@/modules/messages/pt-BR";
import type { AiReviewRunStatus, PrAiReviewRunDto } from "@/modules/pr-ai-review/lib/domain";

const copy = ptBR.aiReview;

export type AiReviewBadgeKind = "running" | "approve" | "comment" | "request_changes" | "failed" | "stale" | "none";

export type AiReviewBadge = { kind: AiReviewBadgeKind; label: string | null };

/** Pill modifier classes (globals.css), shared by the card badge and the logs sheet. */
export const AI_REVIEW_BADGE_CLASS: Record<Exclude<AiReviewBadgeKind, "none">, string> = {
  running: "review-queue-card__ai--running",
  approve: "review-queue-card__ai--approve",
  comment: "review-queue-card__ai--comment",
  request_changes: "review-queue-card__ai--changes",
  failed: "review-queue-card__ai--failed",
  stale: "review-queue-card__ai--stale"
};

function sameUrl(left: string, right: string): boolean {
  return left.replace(/\/+$/, "").toLowerCase() === right.replace(/\/+$/, "").toLowerCase();
}

export function runsForPr(runs: PrAiReviewRunDto[], prUrl: string): PrAiReviewRunDto[] {
  return runs
    .filter((run) => sameUrl(run.prUrl, prUrl))
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
}

/**
 * What the card shows about the AI: a running run wins; otherwise the latest run decides.
 * A verdict on a head that is no longer the PR head is stale.
 */
export function aiReviewBadgeFor(runs: PrAiReviewRunDto[], prUrl: string, headSha: string | undefined): AiReviewBadge {
  const mine = runsForPr(runs, prUrl);
  if (mine.some((run) => run.status === "running")) {
    return { kind: "running", label: copy.badgeRunning };
  }
  const latest = mine[0];
  if (!latest) {
    return { kind: "none", label: null };
  }
  if (latest.status === "failed") {
    return { kind: "failed", label: copy.badgeFailed };
  }
  if (!latest.verdict) {
    return { kind: "none", label: null };
  }
  if (headSha && latest.headSha && latest.headSha !== headSha) {
    return { kind: "stale", label: copy.badgeStale };
  }
  const kind = latest.verdict === "APPROVE" ? "approve" : latest.verdict === "COMMENT" ? "comment" : "request_changes";
  return { kind, label: copy.badgeVerdict[latest.verdict] };
}

export function hasRunningAiReviewRun(runs: PrAiReviewRunDto[]): boolean {
  return runs.some((run) => run.status === "running");
}

export function aiReviewRunLabel(run: Pick<PrAiReviewRunDto, "repository" | "prNumber">): string {
  const slash = run.repository.lastIndexOf("/");
  const repo = slash === -1 ? run.repository : run.repository.slice(slash + 1);
  return `${repo}#${run.prNumber}`;
}

export function aiReviewStatusLabel(status: AiReviewRunStatus): string {
  if (status === "running") {
    return copy.statusRunning;
  }
  return status === "succeeded" ? copy.statusSucceeded : copy.statusFailed;
}

/** Outcome line for the end toast and the logs list. */
export function aiReviewOutcomeLabel(run: Pick<PrAiReviewRunDto, "status" | "verdict">): string {
  if (run.status === "failed") {
    return copy.statusFailed;
  }
  if (run.status === "running") {
    return copy.statusRunning;
  }
  return run.verdict ? copy.verdictLabel[run.verdict] : copy.noVerdict;
}

/** Badge kind for a single run in the logs sheet (same palette as the card badge). */
export function aiReviewRunBadgeKind(run: Pick<PrAiReviewRunDto, "status" | "verdict">): AiReviewBadgeKind {
  if (run.status === "running") {
    return "running";
  }
  if (run.status === "failed") {
    return "failed";
  }
  if (run.verdict === "APPROVE") {
    return "approve";
  }
  if (run.verdict === "COMMENT") {
    return "comment";
  }
  return run.verdict === "REQUEST_CHANGES" ? "request_changes" : "none";
}

/** "38 s", "4 min 12 s", "1 h 3 min"; null while the run has no end. */
export function formatAiReviewDuration(startedAt: string, finishedAt: string | null): string | null {
  if (!finishedAt) {
    return null;
  }
  const totalSeconds = Math.max(0, Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000));
  if (!Number.isFinite(totalSeconds)) {
    return null;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes} min ${seconds} s` : `${minutes} min`;
  }
  return `${seconds} s`;
}

/** Last cycle = the newest run that belongs to a cycle, with how many PRs that cycle reviewed. */
export function lastCycleSummary(runs: PrAiReviewRunDto[]): { startedAt: string; count: number } | null {
  const latest = [...runs]
    .filter((run) => run.cycleId)
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))[0];
  if (!latest) {
    return null;
  }
  const cycleRuns = runs.filter((run) => run.cycleId === latest.cycleId);
  const startedAt = cycleRuns.reduce(
    (earliest, run) => (Date.parse(run.startedAt) < Date.parse(earliest) ? run.startedAt : earliest),
    latest.startedAt
  );
  return { startedAt, count: cycleRuns.length };
}

const startNotifiedRunIds = new Set<string>();

export function resetAiReviewStartNotificationsForTests(): void {
  startNotifiedRunIds.clear();
}

/** Returns true the first time a run id is seen; later calls return false. */
export function claimAiReviewStartNotification(runId: string): boolean {
  if (startNotifiedRunIds.has(runId)) {
    return false;
  }
  startNotifiedRunIds.add(runId);
  return true;
}

export function seedAiReviewStartNotifications(runIds: string[]): void {
  for (const id of runIds) {
    startNotifiedRunIds.add(id);
  }
}
