import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AiReviewAgentInfo } from "@/modules/pr-ai-review/lib/domain";

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

export const AI_REVIEW_AGENT_ADAPTERS: readonly AgentAdapter[] = [
  {
    id: "claude",
    label: "Claude Code",
    binary: "claude",
    // Print mode starts in Manual permission mode: anything that would prompt
    // (Write outside cwd, Bash for review_gate/post_review, etc.) is denied.
    // Reviews are unattended, so skip those checks like other headless runners.
    buildArgs: (prompt) => [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--dangerously-skip-permissions"
    ]
  },
  {
    id: "cursor-agent",
    label: "Cursor Agent",
    binary: "agent",
    binaryCandidates: ["agent", "cursor-agent"],
    // -p already exposes write/shell; --force auto-approves commands that would
    // otherwise wait for a human that never answers in a routine.
    buildArgs: (prompt) => ["-p", prompt, "--force"]
  }
] as const;

const ADAPTERS_BY_ID = new Map(AI_REVIEW_AGENT_ADAPTERS.map((adapter) => [adapter.id, adapter]));

export function getAgentAdapter(agentId: string): AgentAdapter | undefined {
  return ADAPTERS_BY_ID.get(agentId);
}

export function isKnownAgentId(agentId: string): boolean {
  return ADAPTERS_BY_ID.has(agentId);
}

export function listRegisteredAgentIds(): string[] {
  return AI_REVIEW_AGENT_ADAPTERS.map((adapter) => adapter.id);
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

export async function listAiReviewAgents(
  probe: BinaryProbe = defaultBinaryProbe
): Promise<AiReviewAgentInfo[]> {
  const agents: AiReviewAgentInfo[] = [];
  for (const adapter of AI_REVIEW_AGENT_ADAPTERS) {
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
