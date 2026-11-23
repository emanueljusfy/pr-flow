import os from "node:os";
import { describe, expect, it } from "vitest";
import { GET as getConfig, PUT as putConfig } from "@/app/api/prs/ai-review/config/route";
import { getAiReviewConfig, updateAiReviewConfig } from "@/modules/pr-ai-review/lib/repository";
import { withAiReviewTestDb } from "./pr-ai-review-test-db";

function put(body: unknown) {
  return putConfig(
    new Request("http://localhost/api/prs/ai-review/config", { method: "PUT", body: JSON.stringify(body) })
  );
}

describe("ai review config api", () => {
  it("enabling sets next run to now", async () => {
    await withAiReviewTestDb(async () => {
      const future = new Date(Date.now() + 3_600_000);
      await updateAiReviewConfig({ enabled: false, nextRunAt: future });
      const before = Date.now();
      const response = await put({ enabled: true });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { enabled: boolean; nextRunAt: string };
      expect(body.enabled).toBe(true);
      expect(Date.parse(body.nextRunAt)).toBeGreaterThanOrEqual(before - 1);
      expect(Date.parse(body.nextRunAt)).toBeLessThanOrEqual(Date.now());

      // Saving other fields while already on keeps the schedule.
      await updateAiReviewConfig({ nextRunAt: future });
      const second = (await (await put({ repoPattern: "justracker-*" })).json()) as { nextRunAt: string; repoPattern: string };
      expect(second.repoPattern).toBe("justracker-*");
      expect(second.nextRunAt).toBe(future.toISOString());

      // What was saved comes back unchanged on GET.
      await put({ authorLogins: ["@Cavanus", "felipegmotta"], cwd: os.tmpdir(), intervalMinutes: 60 });
      const read = (await (await getConfig()).json()) as Record<string, unknown>;
      expect(read).toMatchObject({
        authorLogins: ["cavanus", "felipegmotta"],
        cwd: os.tmpdir(),
        intervalMinutes: 60,
        repoPattern: "justracker-*",
        enabled: true
      });
    });
  });

  it("rejects template without pr_url", async () => {
    await withAiReviewTestDb(async () => {
      const before = await getAiReviewConfig();
      const response = await put({ promptTemplate: "revise {{repository}}#{{number}}" });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "O prompt precisa conter {{pr_url}}." });
      expect((await getAiReviewConfig()).promptTemplate).toBe(before.promptTemplate);

      const ok = await put({ promptTemplate: "revise {{pr_url}}" });
      expect(ok.status).toBe(200);
      expect((await getAiReviewConfig()).promptTemplate).toBe("revise {{pr_url}}");
    });
  });

  it("rejects invalid interval agent and cwd", async () => {
    await withAiReviewTestDb(async () => {
      const before = await getAiReviewConfig();
      const cases: Array<[unknown, RegExp]> = [
        [{ intervalMinutes: 10 }, /intervalo/i],
        [{ agentId: "gpt" }, /Agente desconhecido/],
        [{ cwd: "relative/path" }, /caminho absoluto/],
        [{ cwd: "/definitely/not/here/pr-flow" }, /caminho absoluto/],
        [{ unknownField: true }, /inválido/]
      ];
      for (const [body, message] of cases) {
        const response = await put(body);
        expect(response.status).toBe(400);
        expect(((await response.json()) as { error: string }).error).toMatch(message);
      }
      const after = await getAiReviewConfig();
      expect(after).toEqual(before);
    });
  });
});
