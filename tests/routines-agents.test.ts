import { describe, expect, it } from "vitest";
import {
  listRegisteredAgentIds,
  listRoutineAgents
} from "@/modules/routines/lib/agent-registry";
import { validateCreateRoutineInput } from "@/modules/routines/lib/routine-validation";
import { GET as getAgents } from "@/app/api/routines/agents/route";

describe("routines agents", () => {
  it("lists adapters with installed flag", async () => {
    const agents = await listRoutineAgents(async (binary) => binary === "claude");
    expect(agents).toHaveLength(2);
    expect(agents.map((a) => a.id).sort()).toEqual(["claude", "cursor-agent"]);
    expect(agents.find((a) => a.id === "claude")?.installed).toBe(true);
    expect(agents.find((a) => a.id === "cursor-agent")?.installed).toBe(false);

    const response = await getAgents();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{ id: string; installed: boolean }>;
    expect(body.map((a) => a.id).sort()).toEqual(["claude", "cursor-agent"]);
    expect(body.every((a) => typeof a.installed === "boolean")).toBe(true);
  });

  it("only allowlisted adapters", () => {
    expect(listRegisteredAgentIds()).toEqual(["claude", "cursor-agent"]);
    const rejected = validateCreateRoutineInput({
      name: "x",
      prompt: "p",
      agentId: "bash",
      scheduleKind: "preset",
      intervalMinutes: 15
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.errors.agentId).toBeTruthy();
    }
  });
});
