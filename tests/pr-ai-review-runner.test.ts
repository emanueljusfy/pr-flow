import os from "node:os";
import { describe, expect, it } from "vitest";
import { runReviewAgent } from "@/modules/pr-ai-review/lib/agent-runner";

const probeAll = async () => true;
const cwd = os.tmpdir();

describe("runReviewAgent", () => {
  it("maps agent failures to reasons", async () => {
    const exitNonZero = await runReviewAgent({
      agentId: "cursor-agent",
      prompt: "p",
      cwd,
      probe: probeAll,
      run: async () => ({ stdout: "out", stderr: "boom", code: 2 })
    });
    expect(exitNonZero).toMatchObject({ status: "failed", reason: "exit_nonzero", stderr: "boom" });

    const timeout = await runReviewAgent({
      agentId: "cursor-agent",
      prompt: "p",
      cwd,
      probe: probeAll,
      run: async () => ({ stdout: "", stderr: "", code: 124 })
    });
    expect(timeout).toMatchObject({ status: "failed", reason: "timeout" });

    const missingBinary = await runReviewAgent({ agentId: "claude", prompt: "p", cwd, probe: async () => false });
    expect(missingBinary).toMatchObject({ status: "failed", reason: "agent_not_found" });

    const enoent = await runReviewAgent({
      agentId: "claude",
      prompt: "p",
      cwd,
      probe: probeAll,
      run: async () => {
        throw Object.assign(new Error("command_not_found:claude"), { reason: "agent_not_found" });
      }
    });
    expect(enoent).toMatchObject({ status: "failed", reason: "agent_not_found" });

    const badCwd = await runReviewAgent({
      agentId: "claude",
      prompt: "p",
      cwd: "/definitely/not/here/pr-flow",
      probe: probeAll,
      run: async () => ({ stdout: "", stderr: "", code: 0 })
    });
    expect(badCwd).toMatchObject({ status: "failed", reason: "bad_cwd" });

    const isError = await runReviewAgent({
      agentId: "claude",
      prompt: "p",
      cwd,
      probe: probeAll,
      run: async () => ({
        stdout: JSON.stringify({ result: "falhou", is_error: true, total_cost_usd: 0.25 }),
        stderr: "",
        code: 0
      })
    });
    expect(isError).toMatchObject({ status: "failed", reason: "exit_nonzero", stdout: "falhou", costUsd: 0.25 });

    const ok = await runReviewAgent({
      agentId: "claude",
      prompt: "p",
      cwd,
      probe: probeAll,
      run: async () => ({ stdout: JSON.stringify({ result: "ok", total_cost_usd: 0.9 }), stderr: "", code: 0 })
    });
    expect(ok).toEqual({ status: "succeeded", reason: null, stdout: "ok", stderr: "", costUsd: 0.9 });
  });
});
