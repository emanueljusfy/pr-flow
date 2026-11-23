import { z } from "zod";

const claudePrintJsonSchema = z
  .object({
    result: z.string().optional(),
    total_cost_usd: z.number().nonnegative().optional(),
    is_error: z.boolean().optional()
  })
  .passthrough();

export type ClaudeAgentOutput = {
  resultText: string;
  costUsd: number | null;
  isError: boolean;
};

/** Parses Claude Code `--output-format json` stdout. Falls back to raw text. */
export function parseClaudeAgentOutput(stdout: string): ClaudeAgentOutput {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith("{")) {
    return { resultText: stdout, costUsd: null, isError: false };
  }
  try {
    const parsed = claudePrintJsonSchema.safeParse(JSON.parse(trimmed));
    if (!parsed.success) {
      return { resultText: stdout, costUsd: null, isError: false };
    }
    const data = parsed.data;
    return {
      resultText: typeof data.result === "string" ? data.result : stdout,
      costUsd: typeof data.total_cost_usd === "number" ? data.total_cost_usd : null,
      isError: data.is_error === true
    };
  } catch {
    return { resultText: stdout, costUsd: null, isError: false };
  }
}

export function formatRoutineCostUsd(costUsd: number | null | undefined): string | null {
  if (costUsd == null || !Number.isFinite(costUsd)) {
    return null;
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  }).format(costUsd);
}
