import { appendQuickNoteToToday } from "@/modules/journal/lib/note-service";
import { ptBR } from "@/modules/messages/pt-BR";
import type { ReviewerQueueApiResponse, ReviewerQueuePr } from "@/modules/prs/lib/domain";
import { listPullRequestReviews } from "@/modules/prs/lib/gh-client";
import { getReviewerQueueData } from "@/modules/prs/lib/reviewer-queue-service";
import type { BinaryProbe } from "@/modules/pr-ai-review/lib/agent-registry";
import { runReviewAgent, truncateOutput } from "@/modules/pr-ai-review/lib/agent-runner";
import { selectAiReviewCandidates } from "@/modules/pr-ai-review/lib/candidates";
import { resolveAiReviewSettings } from "@/modules/pr-ai-review/lib/env-defaults";
import type { CommandRunner } from "@/modules/pr-ai-review/lib/command-runner";
import type {
  AiReviewPr,
  AiReviewSlackReaction,
  AiReviewTrigger,
  AiReviewVerdict,
  PrAiReviewConfigDto
} from "@/modules/pr-ai-review/lib/domain";
import { renderAiReviewPrompt } from "@/modules/pr-ai-review/lib/prompt-template";
import {
  failStaleAiReviewRuns,
  finalizeAiReview,
  getAiReviewConfig,
  hasRunningAiReview,
  insertRunningAiReview,
  listReviewedHeads,
  updateAiReviewConfig
} from "@/modules/pr-ai-review/lib/repository";
import { reactToAiReviewVerdict } from "@/modules/pr-ai-review/lib/slack-reaction";
import { pickAiReviewVerdict } from "@/modules/pr-ai-review/lib/verdict";

export type AiReviewDeps = {
  readQueue?: () => Promise<ReviewerQueueApiResponse>;
  listReviews?: typeof listPullRequestReviews;
  react?: (input: { prUrl: string; verdict: AiReviewVerdict }) => Promise<AiReviewSlackReaction>;
  appendJournal?: (text: string) => Promise<unknown>;
  run?: CommandRunner;
  probe?: BinaryProbe;
  now?: () => Date;
};

type QueueRead = { ok: true; queue: ReviewerQueuePr[]; githubLogin: string } | { ok: false; error: string };

/** In-process lock: covers the gap between two PRs of a cycle, when no row is `running`. */
let jobInProgress = false;

export function resetAiReviewLockForTests(): void {
  jobInProgress = false;
}

/**
 * Takes the lock before the first await so two concurrent starts cannot both pass the check.
 * Returns false when another review owns it or a `running` row exists.
 */
async function acquireLock(deps: AiReviewDeps): Promise<boolean> {
  if (jobInProgress) {
    return false;
  }
  jobInProgress = true;
  try {
    await failStaleAiReviewRuns((deps.now ?? (() => new Date()))());
    if (await hasRunningAiReview()) {
      jobInProgress = false;
      return false;
    }
    return true;
  } catch (error) {
    jobInProgress = false;
    throw error;
  }
}

async function readQueue(deps: AiReviewDeps): Promise<QueueRead> {
  const response = await (deps.readQueue ?? (() => getReviewerQueueData()))();
  if (response.status === "ok" || response.status === "stale") {
    return { ok: true, queue: response.data, githubLogin: response.githubLogin };
  }
  return { ok: false, error: response.message };
}

function toAiReviewPr(pr: ReviewerQueuePr): AiReviewPr {
  return {
    url: pr.url,
    repository: pr.repository,
    number: pr.number,
    title: pr.title,
    authorLogin: pr.authorLogin ?? "",
    headSha: pr.headSha ?? ""
  };
}

export function verdictLabel(verdict: AiReviewVerdict): string {
  return ptBR.aiReview.verdictLabel[verdict];
}

export function buildAiReviewJournalNote(pr: AiReviewPr, verdict: AiReviewVerdict, reviewUrl: string | null): string {
  const head = `Revisor IA — ${pr.repository}#${pr.number}: ${verdictLabel(verdict)}`;
  return reviewUrl ? `${head}\n${reviewUrl}` : head;
}

async function reviewOnePr(input: {
  pr: AiReviewPr;
  config: PrAiReviewConfigDto;
  githubLogin: string;
  cycleId: string | null;
  trigger: AiReviewTrigger;
  deps: AiReviewDeps;
}): Promise<string> {
  const { pr, config, deps } = input;
  const now = deps.now ?? (() => new Date());
  const startedAt = now();
  const row = await insertRunningAiReview({
    cycleId: input.cycleId,
    prUrl: pr.url,
    repository: pr.repository,
    prNumber: pr.number,
    prTitle: pr.title,
    headSha: pr.headSha,
    trigger: input.trigger,
    startedAt
  });

  try {
    const agent = await runReviewAgent({
      agentId: config.agentId,
      prompt: renderAiReviewPrompt(config.promptTemplate, pr),
      cwd: resolveAiReviewSettings(config).cwd,
      run: deps.run,
      probe: deps.probe
    });

    if (agent.status === "failed") {
      await finalizeAiReview({
        runId: row.id,
        status: "failed",
        reason: agent.reason,
        stdout: agent.stdout,
        stderr: agent.stderr,
        costUsd: agent.costUsd
      });
      return row.id;
    }

    let verdict: AiReviewVerdict | null = null;
    let reviewUrl: string | null = null;
    let stderr = agent.stderr;
    try {
      const reviews = await (deps.listReviews ?? listPullRequestReviews)({ repository: pr.repository, number: pr.number });
      const picked = pickAiReviewVerdict(reviews, input.githubLogin, startedAt);
      verdict = picked?.verdict ?? null;
      reviewUrl = picked?.reviewUrl ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stderr = truncateOutput(`${stderr}\n[pr-flow] Falha ao ler as reviews da PR: ${message}`.trim());
    }

    let slackReaction: AiReviewSlackReaction | null = null;
    if (verdict) {
      slackReaction = await (deps.react ?? reactToAiReviewVerdict)({ prUrl: pr.url, verdict });
      try {
        await (deps.appendJournal ?? ((text: string) => appendQuickNoteToToday({ text })))(
          buildAiReviewJournalNote(pr, verdict, reviewUrl)
        );
      } catch {
        // Journal failure must not fail the review.
      }
    }

    await finalizeAiReview({
      runId: row.id,
      status: "succeeded",
      verdict,
      reviewUrl,
      slackReaction,
      stdout: agent.stdout,
      stderr,
      costUsd: agent.costUsd
    });
  } catch (error) {
    await finalizeAiReview({
      runId: row.id,
      status: "failed",
      reason: "exec_error",
      stderr: truncateOutput(error instanceof Error ? error.message : String(error))
    });
  }
  return row.id;
}

async function runSequentially(input: {
  prs: ReviewerQueuePr[];
  config: PrAiReviewConfigDto;
  githubLogin: string;
  cycleId: string | null;
  trigger: AiReviewTrigger;
  deps: AiReviewDeps;
  advanceSchedule: boolean;
}): Promise<string[]> {
  const runIds: string[] = [];
  try {
    for (const pr of input.prs) {
      runIds.push(
        await reviewOnePr({
          pr: toAiReviewPr(pr),
          config: input.config,
          githubLogin: input.githubLogin,
          cycleId: input.cycleId,
          trigger: input.trigger,
          deps: input.deps
        })
      );
    }
  } finally {
    if (input.advanceSchedule) {
      const finished = (input.deps.now ?? (() => new Date()))();
      await updateAiReviewConfig({
        nextRunAt: new Date(finished.getTime() + input.config.intervalMinutes * 60_000)
      });
    }
    jobInProgress = false;
  }
  return runIds;
}

type PreparedCycle =
  | { ok: true; prs: ReviewerQueuePr[]; config: PrAiReviewConfigDto; githubLogin: string }
  | { ok: false; status: 409 | 502; error: string };

/** Takes the lock and picks candidates. On success the caller must run `runSequentially`. */
async function prepareCycle(deps: AiReviewDeps): Promise<PreparedCycle> {
  if (!(await acquireLock(deps))) {
    return { ok: false, status: 409, error: ptBR.aiReview.conflict };
  }
  try {
    const config = await getAiReviewConfig();
    const read = await readQueue(deps);
    if (!read.ok) {
      jobInProgress = false;
      return { ok: false, status: 502, error: read.error };
    }
    const reviewedHeads = await listReviewedHeads(read.queue.map((pr) => pr.url));
    const prs = selectAiReviewCandidates(read.queue, resolveAiReviewSettings(config), reviewedHeads);
    return { ok: true, prs, config, githubLogin: read.githubLogin };
  } catch (error) {
    jobInProgress = false;
    throw error;
  }
}

export type AiReviewCronResult =
  | { status: "disabled" | "not_due" | "busy" }
  | { status: "queue_error"; error: string }
  | { status: "ran"; reviewed: number; runIds: string[] };

/** Cron tick: runs a cycle when enabled and due; waits for the whole cycle. */
export async function runAiReviewCronTick(deps: AiReviewDeps = {}): Promise<AiReviewCronResult> {
  const now = (deps.now ?? (() => new Date()))();
  await failStaleAiReviewRuns(now);
  const config = await getAiReviewConfig();
  if (!config.enabled) {
    return { status: "disabled" };
  }
  if (Date.parse(config.nextRunAt) > now.getTime()) {
    return { status: "not_due" };
  }

  const prepared = await prepareCycle(deps);
  if (!prepared.ok) {
    if (prepared.status === 409) {
      return { status: "busy" };
    }
    // Retry after one interval instead of hammering GitHub every minute.
    await updateAiReviewConfig({ nextRunAt: new Date(now.getTime() + config.intervalMinutes * 60_000) });
    return { status: "queue_error", error: prepared.error };
  }

  const runIds = await runSequentially({
    prs: prepared.prs,
    config: prepared.config,
    githubLogin: prepared.githubLogin,
    cycleId: crypto.randomUUID(),
    trigger: "cron",
    deps,
    advanceSchedule: true
  });
  return { status: "ran", reviewed: runIds.length, runIds };
}

export type ManualStartResult =
  | { ok: true; prUrls: string[]; done: Promise<string[]> }
  | { ok: false; status: 404 | 409 | 502; error: string };

/** "Rodar agora": same selection as the cron, ignoring enabled and next run. Execution continues in `done`. */
export async function startManualAiReviewCycle(deps: AiReviewDeps = {}): Promise<ManualStartResult> {
  const prepared = await prepareCycle(deps);
  if (!prepared.ok) {
    return prepared;
  }
  if (prepared.prs.length === 0) {
    jobInProgress = false;
    return { ok: true, prUrls: [], done: Promise.resolve([]) };
  }
  const done = runSequentially({
    prs: prepared.prs,
    config: prepared.config,
    githubLogin: prepared.githubLogin,
    cycleId: crypto.randomUUID(),
    trigger: "manual",
    deps,
    advanceSchedule: true
  });
  return { ok: true, prUrls: prepared.prs.map((pr) => pr.url), done };
}

function normalizePrUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

/** "Revisar com IA" on one card: ignores the author/repo filter and the same-SHA rule. */
export async function startManualAiReviewForPr(prUrl: string, deps: AiReviewDeps = {}): Promise<ManualStartResult> {
  if (!(await acquireLock(deps))) {
    return { ok: false, status: 409, error: ptBR.aiReview.conflict };
  }
  try {
    const read = await readQueue(deps);
    if (!read.ok) {
      jobInProgress = false;
      return { ok: false, status: 502, error: read.error };
    }
    const pr = read.queue.find((item) => normalizePrUrl(item.url) === normalizePrUrl(prUrl));
    if (!pr) {
      jobInProgress = false;
      return { ok: false, status: 404, error: ptBR.aiReview.prNotInQueue };
    }
    const config = await getAiReviewConfig();
    const done = runSequentially({
      prs: [pr],
      config,
      githubLogin: read.githubLogin,
      cycleId: null,
      trigger: "manual",
      deps,
      advanceSchedule: false
    });
    return { ok: true, prUrls: [pr.url], done };
  } catch (error) {
    jobInProgress = false;
    throw error;
  }
}
