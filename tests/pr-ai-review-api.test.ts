import { afterEach, describe, expect, it, vi } from "vitest";

const startManualAiReviewCycle = vi.fn();
const startManualAiReviewForPr = vi.fn();
vi.mock("@/modules/pr-ai-review/lib/review-service", () => ({
  startManualAiReviewCycle: (...args: unknown[]) => startManualAiReviewCycle(...args),
  startManualAiReviewForPr: (...args: unknown[]) => startManualAiReviewForPr(...args)
}));

import { GET as getAgents } from "@/app/api/prs/ai-review/agents/route";
import { GET as getConfig } from "@/app/api/prs/ai-review/config/route";
import { POST as postRun } from "@/app/api/prs/ai-review/run/route";
import { POST as postAck } from "@/app/api/prs/ai-review/runs/ack/route";
import { GET as getRuns } from "@/app/api/prs/ai-review/runs/route";
import { finalizeAiReview, insertRunningAiReview } from "@/modules/pr-ai-review/lib/repository";
import { withAiReviewTestDb } from "./pr-ai-review-test-db";

const PR = "https://github.com/jusfy/justracker-thanos/pull/699";

function run(body?: unknown) {
  return postRun(
    new Request("http://localhost/api/prs/ai-review/run", {
      method: "POST",
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body)
    })
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ai review api", () => {
  it("run route statuses", async () => {
    startManualAiReviewCycle.mockResolvedValue({ ok: true, prUrls: [PR], done: Promise.resolve([]) });
    const cycle = await run();
    expect(cycle.status).toBe(202);
    expect(await cycle.json()).toEqual({ prUrls: [PR] });

    startManualAiReviewForPr.mockResolvedValue({ ok: true, prUrls: [PR], done: Promise.resolve([]) });
    const single = await run({ prUrl: PR });
    expect(single.status).toBe(202);
    expect(startManualAiReviewForPr).toHaveBeenCalledWith(PR);

    startManualAiReviewCycle.mockResolvedValue({ ok: true, prUrls: [], done: Promise.resolve([]) });
    const empty = await run();
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ prUrls: [] });

    expect((await run({ prUrl: "javascript:alert(1)" })).status).toBe(400);
    expect((await run({ prUrl: "https://evil.example/pull/1" })).status).toBe(400);
    expect((await run("{not json")).status).toBe(400);
    expect((await run({ extra: 1 })).status).toBe(400);

    startManualAiReviewForPr.mockResolvedValue({ ok: false, status: 404, error: "A PR não está na sua fila de revisão." });
    const missing = await run({ prUrl: PR });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "A PR não está na sua fila de revisão." });

    startManualAiReviewCycle.mockResolvedValue({ ok: false, status: 409, error: "Já existe uma revisão da IA em andamento." });
    expect((await run()).status).toBe(409);

    startManualAiReviewCycle.mockResolvedValue({ ok: false, status: 502, error: "GraphQL caiu" });
    const queueDown = await run();
    expect(queueDown.status).toBe(502);
    expect(await queueDown.json()).toEqual({ error: "GraphQL caiu" });
  });

  it("runs ack agents and config routes", async () => {
    await withAiReviewTestDb(async () => {
      const first = await insertRunningAiReview({
        cycleId: "c1", prUrl: PR, repository: "jusfy/justracker-thanos", prNumber: 699, prTitle: "t", headSha: "a", trigger: "cron",
        startedAt: new Date("2026-11-23T10:00:00Z")
      });
      await finalizeAiReview({ runId: first.id, status: "succeeded", verdict: "APPROVE" });
      await insertRunningAiReview({
        cycleId: null, prUrl: "https://github.com/jusfy/justracker-thanos/pull/700", repository: "jusfy/justracker-thanos",
        prNumber: 700, prTitle: "t", headSha: "b", trigger: "manual", startedAt: new Date("2026-11-23T10:05:00Z")
      });

      const all = (await (await getRuns(new Request("http://localhost/api/prs/ai-review/runs"))).json()) as Array<{ prNumber: number }>;
      expect(all.map((r) => r.prNumber)).toEqual([700, 699]);

      const byPr = await getRuns(new Request(`http://localhost/api/prs/ai-review/runs?prUrl=${encodeURIComponent(PR)}`));
      expect(byPr.status).toBe(200);
      expect(((await byPr.json()) as Array<{ prNumber: number }>).map((r) => r.prNumber)).toEqual([699]);

      const unread = (await (await getRuns(new Request("http://localhost/api/prs/ai-review/runs?unread=1"))).json()) as Array<{ id: string }>;
      expect(unread.map((r) => r.id)).toEqual([first.id]);

      const running = (await (await getRuns(new Request("http://localhost/api/prs/ai-review/runs?status=running"))).json()) as Array<{ prNumber: number }>;
      expect(running.map((r) => r.prNumber)).toEqual([700]);

      expect((await getRuns(new Request("http://localhost/api/prs/ai-review/runs?limit=abc"))).status).toBe(400);
      expect((await getRuns(new Request("http://localhost/api/prs/ai-review/runs?limit=0"))).status).toBe(400);

      const ack = await postAck(
        new Request("http://localhost/api/prs/ai-review/runs/ack", { method: "POST", body: JSON.stringify({ runIds: [first.id] }) })
      );
      expect(ack.status).toBe(200);
      const afterAck = (await (await getRuns(new Request("http://localhost/api/prs/ai-review/runs?unread=1"))).json()) as unknown[];
      expect(afterAck).toEqual([]);
      expect(
        (await postAck(new Request("http://localhost/api/prs/ai-review/runs/ack", { method: "POST", body: JSON.stringify({ runIds: "x" }) }))).status
      ).toBe(400);

      const agents = await getAgents();
      expect(agents.status).toBe(200);
      const agentList = (await agents.json()) as Array<{ id: string; installed: boolean }>;
      expect(agentList.map((agent) => agent.id)).toEqual(["claude", "cursor-agent"]);
      expect(agentList.every((agent) => typeof agent.installed === "boolean")).toBe(true);

      const config = await getConfig();
      expect(config.status).toBe(200);
      expect(await config.json()).toMatchObject({ enabled: false, intervalMinutes: 15, agentId: "claude", promptIsDefault: true });
    });
  });
});
