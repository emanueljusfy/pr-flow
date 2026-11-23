import { describe, expect, it } from "vitest";
import {
  formatRoutineCostUsd,
  parseClaudeAgentOutput
} from "@/modules/routines/lib/claude-agent-output";

describe("claude agent output", () => {
  it("extracts result text and cost from JSON", () => {
    const parsed = parseClaudeAgentOutput(
      JSON.stringify({
        result: "feito",
        total_cost_usd: 0.5,
        is_error: false
      })
    );
    expect(parsed.resultText).toBe("feito");
    expect(parsed.costUsd).toBe(0.5);
    expect(parsed.isError).toBe(false);
  });

  it("falls back to raw text when not JSON", () => {
    const parsed = parseClaudeAgentOutput("plain text");
    expect(parsed.resultText).toBe("plain text");
    expect(parsed.costUsd).toBeNull();
  });

  it("formats USD in pt-BR", () => {
    expect(formatRoutineCostUsd(null)).toBeNull();
    expect(formatRoutineCostUsd(1.2)).toMatch(/US\$\s*1,2/);
  });
});
