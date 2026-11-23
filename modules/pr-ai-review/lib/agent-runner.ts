import fs from "node:fs";
import path from "node:path";
import { getAgentAdapter, resolveAdapterBinary, type BinaryProbe } from "@/modules/pr-ai-review/lib/agent-registry";
import { parseClaudeAgentOutput } from "@/modules/pr-ai-review/lib/claude-agent-output";
import { defaultCommandRunner, type CommandRunner } from "@/modules/pr-ai-review/lib/command-runner";
import { AI_REVIEW_OUTPUT_TRUNCATE_CHARS, AI_REVIEW_RUN_TIMEOUT_MS } from "@/modules/pr-ai-review/lib/domain";

export type AgentRunFailureReason = "agent_not_found" | "bad_cwd" | "exit_nonzero" | "timeout" | "exec_error";

export type AgentRunResult = {
  status: "succeeded" | "failed";
  reason: AgentRunFailureReason | null;
  stdout: string;
  stderr: string;
  costUsd: number | null;
};

export function truncateOutput(value: string, max = AI_REVIEW_OUTPUT_TRUNCATE_CHARS): string {
  return value.length <= max ? value : value.slice(0, max);
}

export function isUsableCwd(cwd: string): boolean {
  try {
    return path.isAbsolute(cwd) && fs.existsSync(cwd) && fs.statSync(cwd).isDirectory();
  } catch {
    return false;
  }
}

function failed(reason: AgentRunFailureReason, stderr: string): AgentRunResult {
  return { status: "failed", reason, stdout: "", stderr, costUsd: null };
}

/** Runs one agent invocation with a clean context and normalizes the outcome. Never throws. */
export async function runReviewAgent(input: {
  agentId: string;
  prompt: string;
  cwd: string | null;
  run?: CommandRunner;
  probe?: BinaryProbe;
  timeoutMs?: number;
  processCwd?: string;
}): Promise<AgentRunResult> {
  const adapter = getAgentAdapter(input.agentId);
  if (!adapter) {
    return failed("agent_not_found", "Adapter desconhecido.");
  }

  const binary = await resolveAdapterBinary(adapter, input.probe);
  if (!binary) {
    return failed("agent_not_found", `Binário do agente não encontrado no PATH (${adapter.binary}).`);
  }

  const cwd = input.cwd ?? input.processCwd ?? process.cwd();
  if (!isUsableCwd(cwd)) {
    return failed("bad_cwd", `cwd inválido: ${cwd}`);
  }

  const run = input.run ?? defaultCommandRunner;
  try {
    const result = await run(binary, adapter.buildArgs(input.prompt), {
      cwd,
      timeoutMs: input.timeoutMs ?? AI_REVIEW_RUN_TIMEOUT_MS
    });

    const stderr = truncateOutput(result.stderr ?? "");
    let stdout = truncateOutput(result.stdout ?? "");
    let costUsd: number | null = null;

    if (adapter.id === "claude") {
      const parsed = parseClaudeAgentOutput(result.stdout ?? "");
      stdout = truncateOutput(parsed.resultText);
      costUsd = parsed.costUsd;
      if (result.code === 0 && parsed.isError) {
        return { status: "failed", reason: "exit_nonzero", stdout, stderr, costUsd };
      }
    }

    if (result.code === 0) {
      return { status: "succeeded", reason: null, stdout, stderr, costUsd };
    }
    return { status: "failed", reason: result.code === 124 ? "timeout" : "exit_nonzero", stdout, stderr, costUsd };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("command_not_found:") || (error as { reason?: string }).reason === "agent_not_found") {
      return failed("agent_not_found", message);
    }
    return failed("exec_error", truncateOutput(message));
  }
}
