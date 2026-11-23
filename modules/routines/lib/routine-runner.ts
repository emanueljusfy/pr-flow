import fs from "node:fs";
import path from "node:path";
import {
  getAgentAdapter,
  resolveAdapterBinary,
  type BinaryProbe
} from "@/modules/routines/lib/agent-registry";
import { parseClaudeAgentOutput } from "@/modules/routines/lib/claude-agent-output";
import {
  defaultCommandRunner,
  type CommandRunner
} from "@/modules/routines/lib/command-runner";
import {
  ROUTINE_OUTPUT_TRUNCATE_CHARS,
  ROUTINE_RUN_TIMEOUT_MS,
  type RoutineDto
} from "@/modules/routines/lib/domain";

export type AgentRunResult = {
  status: "succeeded" | "failed";
  reason: string | null;
  stdout: string;
  stderr: string;
  costUsd: number | null;
};

export function truncateOutput(value: string, max = ROUTINE_OUTPUT_TRUNCATE_CHARS): string {
  if (value.length <= max) {
    return value;
  }
  return value.slice(0, max);
}

export function resolveRoutineCwd(routine: RoutineDto, processCwd = process.cwd()): string {
  if (!routine.cwd) {
    return processCwd;
  }
  return routine.cwd;
}

export function assertRoutineCwd(cwd: string): { ok: true } | { ok: false; reason: "bad_cwd" } {
  if (!path.isAbsolute(cwd) && cwd !== process.cwd()) {
    // relative only allowed when it is the process cwd fallback path already resolved
  }
  try {
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
      return { ok: false, reason: "bad_cwd" };
    }
  } catch {
    return { ok: false, reason: "bad_cwd" };
  }
  return { ok: true };
}

export async function runRoutineAgent(input: {
  routine: RoutineDto;
  run?: CommandRunner;
  probe?: BinaryProbe;
  timeoutMs?: number;
  processCwd?: string;
}): Promise<AgentRunResult> {
  const adapter = getAgentAdapter(input.routine.agentId);
  if (!adapter) {
    return {
      status: "failed",
      reason: "agent_not_found",
      stdout: "",
      stderr: "Adapter desconhecido.",
      costUsd: null
    };
  }

  const binary = await resolveAdapterBinary(adapter, input.probe);
  if (!binary) {
    return {
      status: "failed",
      reason: "agent_not_found",
      stdout: "",
      stderr: `Binário do agente não encontrado no PATH (${adapter.binary}).`,
      costUsd: null
    };
  }

  const cwd = resolveRoutineCwd(input.routine, input.processCwd);
  const cwdCheck = assertRoutineCwd(cwd);
  if (!cwdCheck.ok) {
    return {
      status: "failed",
      reason: "bad_cwd",
      stdout: "",
      stderr: `cwd inválido: ${cwd}`,
      costUsd: null
    };
  }

  const run = input.run ?? defaultCommandRunner;
  const args = adapter.buildArgs(input.routine.prompt);

  try {
    const result = await run(binary, args, {
      cwd,
      timeoutMs: input.timeoutMs ?? ROUTINE_RUN_TIMEOUT_MS
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

    return {
      status: "failed",
      reason: result.code === 124 ? "timeout" : "exit_nonzero",
      stdout,
      stderr,
      costUsd
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("command_not_found:") || (error as { reason?: string }).reason === "agent_not_found") {
      return {
        status: "failed",
        reason: "agent_not_found",
        stdout: "",
        stderr: message,
        costUsd: null
      };
    }
    return {
      status: "failed",
      reason: "exec_error",
      stdout: "",
      stderr: truncateOutput(message),
      costUsd: null
    };
  }
}
