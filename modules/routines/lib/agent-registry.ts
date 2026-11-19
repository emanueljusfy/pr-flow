import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RoutineAgentInfo } from "@/modules/routines/lib/domain";

const execFileAsync = promisify(execFile);

export type AgentAdapter = {
  id: string;
  label: string;
  /** Primary binary probed on PATH */
  binary: string;
  /** Alternate binaries probed in order */
  binaryCandidates?: string[];
  buildArgs: (prompt: string) => string[];
};

export const ROUTINE_AGENT_ADAPTERS: readonly AgentAdapter[] = [
  {
    id: "claude",
    label: "Claude Code",
    binary: "claude",
    buildArgs: (prompt) => ["-p", prompt, "--output-format", "text"]
  },
  {
    id: "cursor-agent",
    label: "Cursor Agent",
    binary: "agent",
    binaryCandidates: ["agent", "cursor-agent"],
    buildArgs: (prompt) => ["-p", prompt]
  }
] as const;

const ADAPTERS_BY_ID = new Map(ROUTINE_AGENT_ADAPTERS.map((adapter) => [adapter.id, adapter]));

export function getAgentAdapter(agentId: string): AgentAdapter | undefined {
  return ADAPTERS_BY_ID.get(agentId);
}

export function isKnownAgentId(agentId: string): boolean {
  return ADAPTERS_BY_ID.has(agentId);
}

export function listRegisteredAgentIds(): string[] {
  return ROUTINE_AGENT_ADAPTERS.map((adapter) => adapter.id);
}

export type BinaryProbe = (binary: string) => Promise<boolean>;

export async function defaultBinaryProbe(binary: string): Promise<boolean> {
  try {
    await execFileAsync("which", [binary]);
    return true;
  } catch {
    return false;
  }
}

export async function resolveAdapterBinary(
  adapter: AgentAdapter,
  probe: BinaryProbe = defaultBinaryProbe
): Promise<string | null> {
  const candidates = adapter.binaryCandidates ?? [adapter.binary];
  for (const candidate of candidates) {
    if (await probe(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function listRoutineAgents(
  probe: BinaryProbe = defaultBinaryProbe
): Promise<RoutineAgentInfo[]> {
  const agents: RoutineAgentInfo[] = [];
  for (const adapter of ROUTINE_AGENT_ADAPTERS) {
    const binary = await resolveAdapterBinary(adapter, probe);
    agents.push({
      id: adapter.id,
      label: adapter.label,
      binary: binary ?? adapter.binary,
      installed: binary !== null
    });
  }
  return agents;
}
