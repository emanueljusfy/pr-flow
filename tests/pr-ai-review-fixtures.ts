import type { PrAiReviewConfigDto, PrAiReviewRunDto } from "@/modules/pr-ai-review/lib/domain";

export const PR_URL = "https://github.com/jusfy/justracker-thanos/pull/699";

export function aiRun(overrides: Partial<PrAiReviewRunDto> = {}): PrAiReviewRunDto {
  return {
    id: "run-1",
    cycleId: "cycle-1",
    prUrl: PR_URL,
    repository: "jusfy/justracker-thanos",
    prNumber: 699,
    prTitle: "fix: S3",
    headSha: "head-1",
    trigger: "cron",
    status: "succeeded",
    reason: null,
    verdict: "APPROVE",
    reviewUrl: "https://github.com/jusfy/justracker-thanos/pull/699#pullrequestreview-1",
    slackReaction: "reacted",
    stdout: "**Aprovado**",
    stderr: "",
    costUsd: 0.91,
    startedAt: "2026-11-23T10:00:00.000Z",
    finishedAt: "2026-11-23T10:05:00.000Z",
    ackedAt: null,
    ...overrides
  };
}

export function aiConfig(overrides: Partial<PrAiReviewConfigDto> = {}): PrAiReviewConfigDto {
  return {
    enabled: false,
    intervalMinutes: 15,
    agentId: "claude",
    cwd: null,
    authorLogins: ["cavanus"],
    repoPattern: "justracker-*",
    promptTemplate: "revise {{pr_url}}",
    promptIsDefault: false,
    nextRunAt: "2026-11-23T10:15:00.000Z",
    updatedAt: "2026-11-23T10:00:00.000Z",
    ...overrides
  };
}

type Route = { status?: number; body: unknown };

/** fetch stub keyed by "METHOD path-prefix"; records every call. */
export function stubFetch(routes: Record<string, Route | ((init?: RequestInit) => Route)>) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    const key = Object.keys(routes)
      .filter((candidate) => {
        const [m, prefix] = candidate.split(" ");
        return m === method && url.startsWith(prefix);
      })
      .sort((a, b) => b.length - a.length)[0];
    if (!key) {
      return { ok: false, status: 404, json: async () => ({ error: "not stubbed" }) } as Response;
    }
    const entry = routes[key];
    const route = typeof entry === "function" ? entry(init) : entry;
    const status = route.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => route.body } as Response;
  };
  return { fetchMock, calls };
}
