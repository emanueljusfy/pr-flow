import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewerQueueApiResponse, ReviewerQueuePr } from "@/modules/prs/lib/domain";
import type { PullRequestReviewRecord } from "@/modules/prs/lib/gh-client";
import { AI_REVIEW_STALE_RUN_MS } from "@/modules/pr-ai-review/lib/domain";
import {
  getAiReviewConfig,
  insertRunningAiReview,
  listAiReviewRuns,
  updateAiReviewConfig
} from "@/modules/pr-ai-review/lib/repository";
import {
  resetAiReviewLockForTests,
  runAiReviewCronTick,
  startManualAiReviewCycle,
  startManualAiReviewForPr,
  type AiReviewDeps
} from "@/modules/pr-ai-review/lib/review-service";
import { withAiReviewTestDb } from "./pr-ai-review-test-db";

const LOGIN = "emanueljusfy";
const T0 = new Date("2026-11-23T10:00:00.000Z");

function queuePr(number: number, overrides: Partial<ReviewerQueuePr> = {}): ReviewerQueuePr {
  return {
    id: `id-${number}`,
    number,
    title: `PR ${number}`,
    url: `https://github.com/jusfy/justracker-thanos/pull/${number}`,
    repository: "jusfy/justracker-thanos",
    myReviewStatus: "pending",
    authorLogin: "cavanus",
    isDraft: false,
    headSha: `sha-${number}`,
    ...overrides
  };
}

function okQueue(prs: ReviewerQueuePr[]): () => Promise<ReviewerQueueApiResponse> {
  return async () => ({ status: "ok", data: prs, fetchedAt: T0.toISOString(), githubLogin: LOGIN });
}

type Harness = {
  deps: AiReviewDeps;
  run: ReturnType<typeof vi.fn>;
  react: ReturnType<typeof vi.fn>;
  appendJournal: ReturnType<typeof vi.fn>;
  reviewsByNumber: Map<number, PullRequestReviewRecord[]>;
  clock: { now: Date };
};

function harness(prs: ReviewerQueuePr[], overrides: Partial<AiReviewDeps> = {}): Harness {
  const clock = { now: new Date(T0) };
  const reviewsByNumber = new Map<number, PullRequestReviewRecord[]>();
  const run = vi.fn(async () => {
    clock.now = new Date(clock.now.getTime() + 60_000);
    return { stdout: JSON.stringify({ result: "feito", total_cost_usd: 0.5 }), stderr: "", code: 0 };
  });
  const react = vi.fn(async () => "reacted" as const);
  const appendJournal = vi.fn(async () => undefined);
  const deps: AiReviewDeps = {
    readQueue: okQueue(prs),
    listReviews: async ({ number }) => reviewsByNumber.get(number) ?? [],
    react,
    appendJournal,
    run,
    probe: async () => true,
    now: () => clock.now,
    ...overrides
  };
  return { deps, run, react, appendJournal, reviewsByNumber, clock };
}

function approvedAt(time: Date, state = "APPROVED"): PullRequestReviewRecord {
  return { login: LOGIN, state, submittedAt: new Date(time.getTime() + 30_000).toISOString(), url: "https://review/1" };
}

async function enable(nextRunAt: Date = T0) {
  await updateAiReviewConfig({
    enabled: true,
    intervalMinutes: 15,
    agentId: "claude",
    cwd: os.tmpdir(),
    authorLogins: [],
    repoPattern: "",
    nextRunAt
  });
}

afterEach(() => {
  resetAiReviewLockForTests();
});

describe("AI review cycle", () => {
  it("cron does nothing when disabled", async () => {
    await withAiReviewTestDb(async () => {
      const h = harness([queuePr(1)]);
      await enable();
      await updateAiReviewConfig({ enabled: false });
      await expect(runAiReviewCronTick(h.deps)).resolves.toEqual({ status: "disabled" });
      expect(h.run).not.toHaveBeenCalled();
      expect(await listAiReviewRuns({})).toEqual([]);
    });
  });

  it("cron runs when due and advances next run", async () => {
    await withAiReviewTestDb(async () => {
      const h = harness([queuePr(1)]);
      await enable(new Date(T0.getTime() + 60_000));
      await expect(runAiReviewCronTick(h.deps)).resolves.toEqual({ status: "not_due" });
      expect(h.run).not.toHaveBeenCalled();

      await updateAiReviewConfig({ nextRunAt: T0 });
      const result = await runAiReviewCronTick(h.deps);
      expect(result).toMatchObject({ status: "ran", reviewed: 1 });
      // Agent took one minute; next run = finish + 15 min.
      const config = await getAiReviewConfig();
      expect(config.nextRunAt).toBe(new Date(T0.getTime() + 60_000 + 15 * 60_000).toISOString());
    });
  });

  it("refuses while a run is running", async () => {
    await withAiReviewTestDb(async () => {
      const h = harness([queuePr(1)]);
      await enable();
      await insertRunningAiReview({
        cycleId: null,
        prUrl: queuePr(9).url,
        repository: "jusfy/justracker-thanos",
        prNumber: 9,
        prTitle: "x",
        headSha: "s",
        trigger: "manual",
        startedAt: T0
      });
      await expect(runAiReviewCronTick(h.deps)).resolves.toEqual({ status: "busy" });
      await expect(startManualAiReviewCycle(h.deps)).resolves.toMatchObject({ ok: false, status: 409 });
      await expect(startManualAiReviewForPr(queuePr(1).url, h.deps)).resolves.toMatchObject({ ok: false, status: 409 });
      expect(h.run).not.toHaveBeenCalled();
    });
  });

  it("refuses a second start while a cycle is between two PRs", async () => {
    await withAiReviewTestDb(async () => {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const h = harness([queuePr(1)], {
        readQueue: async () => {
          await gate;
          return okQueue([queuePr(1)])();
        }
      });
      await enable();
      const first = startManualAiReviewCycle(h.deps);
      await expect(startManualAiReviewForPr(queuePr(1).url, h.deps)).resolves.toMatchObject({ ok: false, status: 409 });
      release();
      const started = await first;
      if (started.ok) {
        await started.done;
      }
    });
  });

  it("reviews candidates sequentially", async () => {
    await withAiReviewTestDb(async () => {
      let active = 0;
      let maxActive = 0;
      const h = harness([queuePr(1), queuePr(2), queuePr(3)]);
      h.run.mockImplementation(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { stdout: "ok", stderr: "", code: 0 };
      });
      await enable();
      const result = await runAiReviewCronTick(h.deps);
      expect(result).toMatchObject({ status: "ran", reviewed: 3 });
      expect(maxActive).toBe(1);
      const runs = await listAiReviewRuns({});
      expect(runs).toHaveLength(3);
      expect(new Set(runs.map((run) => run.prNumber))).toEqual(new Set([1, 2, 3]));
      expect(new Set(runs.map((run) => run.cycleId)).size).toBe(1);
      expect(runs.every((run) => run.status === "succeeded" && run.trigger === "cron")).toBe(true);
    });
  });

  it("passes rendered prompt and cwd to agent", async () => {
    await withAiReviewTestDb(async () => {
      const h = harness([queuePr(7, { title: "feat: x", authorLogin: "felipegmotta", headSha: "abc123" })]);
      await enable();
      await updateAiReviewConfig({ promptTemplate: "rev {{pr_url}} {{repository}} {{number}} {{title}} {{author}} {{head_sha}}" });
      await runAiReviewCronTick(h.deps);
      expect(h.run).toHaveBeenCalledTimes(1);
      const [binary, args, options] = h.run.mock.calls[0] as unknown as [string, string[], { cwd: string }];
      expect(binary).toBe("claude");
      expect(args[0]).toBe("-p");
      expect(args[1]).toBe(
        "rev https://github.com/jusfy/justracker-thanos/pull/7 jusfy/justracker-thanos 7 feat: x felipegmotta abc123"
      );
      expect(options.cwd).toBe(os.tmpdir());
    });
  });

  it("uses env defaults for filters and cwd left empty", async () => {
    vi.stubEnv("PR_AI_REVIEW_AUTHORS", "felipegmotta");
    vi.stubEnv("PR_AI_REVIEW_REPO_PATTERN", "justracker-*");
    vi.stubEnv("PR_AI_REVIEW_CWD", os.tmpdir());
    try {
      await withAiReviewTestDb(async () => {
        const h = harness([
          queuePr(1, { authorLogin: "felipegmotta" }),
          queuePr(2, { authorLogin: "cavanus" }),
          queuePr(3, { authorLogin: "felipegmotta", repository: "jusfy/kor-dbjus" })
        ]);
        await enable();
        await updateAiReviewConfig({ cwd: null });
        const result = await runAiReviewCronTick(h.deps);
        expect(result).toMatchObject({ status: "ran", reviewed: 1 });
        const [, args, options] = h.run.mock.calls[0] as unknown as [string, string[], { cwd: string }];
        expect(args[1]).toContain("/pull/1");
        expect(options.cwd).toBe(os.tmpdir());
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("continues after a failed review", async () => {
    await withAiReviewTestDb(async () => {
      const h = harness([queuePr(1), queuePr(2)]);
      h.run
        .mockImplementationOnce(async () => ({ stdout: "", stderr: "boom", code: 1 }))
        .mockImplementationOnce(async () => ({ stdout: "ok", stderr: "", code: 0 }));
      await enable();
      await runAiReviewCronTick(h.deps);
      const runs = await listAiReviewRuns({});
      const byNumber = new Map(runs.map((run) => [run.prNumber, run]));
      expect(byNumber.get(1)).toMatchObject({ status: "failed", reason: "exit_nonzero", stderr: "boom" });
      expect(byNumber.get(2)).toMatchObject({ status: "succeeded" });
    });
  });

  it("reaps stale running runs", async () => {
    await withAiReviewTestDb(async () => {
      const h = harness([]);
      await enable();
      const staleStart = new Date(T0.getTime() - AI_REVIEW_STALE_RUN_MS - 1_000);
      const freshStart = new Date(T0.getTime() - AI_REVIEW_STALE_RUN_MS + 60_000);
      const stale = await insertRunningAiReview({
        cycleId: null, prUrl: queuePr(1).url, repository: "r/r", prNumber: 1, prTitle: "", headSha: "a", trigger: "cron", startedAt: staleStart
      });
      const fresh = await insertRunningAiReview({
        cycleId: null, prUrl: queuePr(2).url, repository: "r/r", prNumber: 2, prTitle: "", headSha: "a", trigger: "cron", startedAt: freshStart
      });
      await runAiReviewCronTick(h.deps);
      const runs = new Map((await listAiReviewRuns({})).map((run) => [run.id, run]));
      expect(runs.get(stale.id)).toMatchObject({ status: "failed", reason: "stale" });
      expect(runs.get(fresh.id)).toMatchObject({ status: "running" });
    });
  });

  it("no verdict means no reaction", async () => {
    await withAiReviewTestDb(async () => {
      const h = harness([queuePr(1)]);
      // Only a review from before the run started.
      h.reviewsByNumber.set(1, [{ login: LOGIN, state: "APPROVED", submittedAt: "2026-11-23T09:00:00.000Z", url: "u" }]);
      await enable();
      await runAiReviewCronTick(h.deps);
      const [run] = await listAiReviewRuns({});
      expect(run).toMatchObject({ status: "succeeded", verdict: null, slackReaction: null, reviewUrl: null });
      expect(h.react).not.toHaveBeenCalled();
    });
  });

  it("slack outcome does not fail the run", async () => {
    await withAiReviewTestDb(async () => {
      for (const outcome of ["not_found", "error", "skipped", "already_reacted"] as const) {
        resetAiReviewLockForTests();
        const pr = queuePr(outcome.length);
        const h = harness([pr], { react: vi.fn(async () => outcome) });
        h.reviewsByNumber.set(pr.number, [approvedAt(T0)]);
        await enable();
        await runAiReviewCronTick(h.deps);
        const [run] = await listAiReviewRuns({ prUrl: pr.url });
        expect(run).toMatchObject({ status: "succeeded", verdict: "APPROVE", slackReaction: outcome });
      }
    });
  });

  it("journal note only with verdict", async () => {
    await withAiReviewTestDb(async () => {
      const h = harness([queuePr(1), queuePr(2)]);
      h.reviewsByNumber.set(1, [approvedAt(T0, "CHANGES_REQUESTED")]);
      await enable();
      await runAiReviewCronTick(h.deps);
      expect(h.appendJournal).toHaveBeenCalledTimes(1);
      expect(h.appendJournal).toHaveBeenCalledWith("Revisor IA — jusfy/justracker-thanos#1: Pediu mudanças\nhttps://review/1");
      expect(h.react).toHaveBeenCalledWith({ prUrl: queuePr(1).url, verdict: "REQUEST_CHANGES" });
    });
  });

  it("manual cycle ignores enabled and due", async () => {
    await withAiReviewTestDb(async () => {
      const h = harness([queuePr(1)]);
      await enable(new Date(T0.getTime() + 3_600_000));
      await updateAiReviewConfig({ enabled: false });
      const started = await startManualAiReviewCycle(h.deps);
      expect(started).toMatchObject({ ok: true, prUrls: [queuePr(1).url] });
      if (started.ok) {
        await started.done;
      }
      const [run] = await listAiReviewRuns({});
      expect(run).toMatchObject({ status: "succeeded", trigger: "manual" });
    });
  });

  it("manual cycle without candidates", async () => {
    await withAiReviewTestDb(async () => {
      const h = harness([queuePr(1, { myReviewStatus: "reviewed" }), queuePr(2, { isDraft: true })]);
      await enable();
      const started = await startManualAiReviewCycle(h.deps);
      expect(started).toMatchObject({ ok: true, prUrls: [] });
      expect(await listAiReviewRuns({})).toEqual([]);
      expect(h.run).not.toHaveBeenCalled();
    });
  });

  it("queue failure creates no run", async () => {
    await withAiReviewTestDb(async () => {
      const h = harness([], {
        readQueue: async () => ({ status: "error", message: "GraphQL caiu" })
      });
      await enable();
      await expect(startManualAiReviewCycle(h.deps)).resolves.toEqual({ ok: false, status: 502, error: "GraphQL caiu" });
      await expect(runAiReviewCronTick(h.deps)).resolves.toEqual({ status: "queue_error", error: "GraphQL caiu" });
      expect(await listAiReviewRuns({})).toEqual([]);
    });
  });

  it("single pr review ignores filter and sha rule", async () => {
    await withAiReviewTestDb(async () => {
      const pr = queuePr(5, { repository: "jusfy/jusfy-backend", url: "https://github.com/jusfy/jusfy-backend/pull/5", authorLogin: "other", myReviewStatus: "reviewed" });
      const h = harness([pr]);
      // The agent posts an approval during each run (submitted at the moment the reviews are read).
      h.deps.listReviews = async () => [approvedAt(new Date(h.clock.now.getTime() - 30_000))];
      await enable();
      await updateAiReviewConfig({ authorLogins: ["cavanus"], repoPattern: "justracker-*" });
      for (let i = 0; i < 2; i += 1) {
        const started = await startManualAiReviewForPr(pr.url, h.deps);
        expect(started).toMatchObject({ ok: true, prUrls: [pr.url] });
        if (started.ok) {
          await started.done;
        }
      }
      // Same head reviewed twice on purpose: the click ignores the same-SHA rule.
      const runs = await listAiReviewRuns({ prUrl: pr.url });
      expect(runs).toHaveLength(2);
      expect(runs.every((run) => run.cycleId === null && run.verdict === "APPROVE")).toBe(true);
      // A single-PR review does not move the cycle schedule.
      expect((await getAiReviewConfig()).nextRunAt).toBe(T0.toISOString());

      await expect(startManualAiReviewForPr("https://github.com/jusfy/x/pull/1", h.deps)).resolves.toMatchObject({
        ok: false,
        status: 404
      });
    });
  });

  it("cron skips heads with a verdict and retries failed or moved heads", async () => {
    await withAiReviewTestDb(async () => {
      let queue = [queuePr(1, { headSha: "sha-1" }), queuePr(2, { headSha: "sha-2" })];
      const h = harness([], { readQueue: async () => okQueue(queue)() });
      h.deps.listReviews = async ({ number }) =>
        number === 1 ? [approvedAt(new Date(h.clock.now.getTime() - 30_000))] : [];
      h.run.mockImplementation(async (_binary: string, args: string[]) => {
        h.clock.now = new Date(h.clock.now.getTime() + 60_000);
        // PR 2's agent fails on the first tick only.
        if (args[1].includes("/pull/2") && h.run.mock.calls.length <= 2) {
          return { stdout: "", stderr: "boom", code: 1 };
        }
        return { stdout: "ok", stderr: "", code: 0 };
      });
      await enable();
      await updateAiReviewConfig({ promptTemplate: "rev {{pr_url}}" });

      // Tick 1: PR 1 gets APPROVE on sha-1, PR 2 fails on sha-2.
      await runAiReviewCronTick(h.deps);
      const reviewedOn = async () => (await listAiReviewRuns({})).map((run) => `${run.prNumber}@${run.headSha}:${run.status}`);
      expect((await reviewedOn()).sort()).toEqual(["1@sha-1:succeeded", "2@sha-2:failed"]);

      // Tick 2, same heads: only the failed PR 2 is retried.
      await updateAiReviewConfig({ nextRunAt: h.clock.now });
      await runAiReviewCronTick(h.deps);
      const tick2 = await listAiReviewRuns({ limit: 1 });
      expect(await listAiReviewRuns({ prUrl: queuePr(1).url })).toHaveLength(1);
      expect(tick2[0]).toMatchObject({ prNumber: 2, headSha: "sha-2" });

      // Tick 3: PR 1 moved to sha-3 and is reviewed again; PR 2 (no verdict on sha-2) is retried again.
      queue = [queuePr(1, { headSha: "sha-3" }), queuePr(2, { headSha: "sha-2" })];
      await updateAiReviewConfig({ nextRunAt: h.clock.now });
      await runAiReviewCronTick(h.deps);
      const pr1 = await listAiReviewRuns({ prUrl: queuePr(1).url });
      expect(pr1.map((run) => run.headSha)).toEqual(["sha-3", "sha-1"]);
    });
  });
});

