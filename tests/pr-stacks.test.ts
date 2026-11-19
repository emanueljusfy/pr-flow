import { describe, expect, it } from "vitest";
import { groupPrsIntoStacks, type StackablePr } from "@/modules/prs/lib/core/pr-stacks";

function pr(number: number, headRefName?: string, baseRefName?: string, repository = "acme/a"): StackablePr {
  return { id: `PR_${repository}_${number}`, number, repository, headRefName, baseRefName };
}

describe("groupPrsIntoStacks", () => {
  it("keeps independent PRs as singles in input order", () => {
    const entries = groupPrsIntoStacks([pr(1, "a", "main"), pr(2, "b", "main")]);
    expect(entries.map((entry) => entry.kind)).toEqual(["single", "single"]);
  });

  it("groups a chain of stacked PRs bottom-up with depth and parent", () => {
    // Newest first, as the GitHub query returns them.
    const entries = groupPrsIntoStacks([
      pr(3, "feat-c", "feat-b"),
      pr(9, "other", "main"),
      pr(2, "feat-b", "feat-a"),
      pr(1, "feat-a", "main")
    ]);

    expect(entries).toHaveLength(2);
    const [stack, single] = entries;
    expect(stack.kind).toBe("stack");
    if (stack.kind !== "stack") return;
    expect(stack.baseRefName).toBe("main");
    expect(stack.nodes.map((node) => [node.pr.number, node.depth, node.parentNumber])).toEqual([
      [1, 0, null],
      [2, 1, 1],
      [3, 2, 2]
    ]);
    expect(single).toMatchObject({ kind: "single", pr: { number: 9 } });
  });

  it("places sibling sub-PRs under the same parent", () => {
    const entries = groupPrsIntoStacks([pr(1, "epic", "main"), pr(2, "part-1", "epic"), pr(3, "part-2", "epic")]);
    expect(entries).toHaveLength(1);
    const [stack] = entries;
    if (stack.kind !== "stack") throw new Error("expected stack");
    expect(stack.nodes.map((node) => [node.pr.number, node.depth, node.parentNumber])).toEqual([
      [1, 0, null],
      [2, 1, 1],
      [3, 1, 1]
    ]);
  });

  it("does not link PRs across repositories with the same branch names", () => {
    const entries = groupPrsIntoStacks([pr(1, "feat-a", "main", "acme/a"), pr(2, "feat-b", "feat-a", "acme/b")]);
    expect(entries.map((entry) => entry.kind)).toEqual(["single", "single"]);
  });

  it("treats PRs without branch info and branch cycles as singles", () => {
    const entries = groupPrsIntoStacks([pr(1), pr(2, "x", "y"), pr(3, "y", "x")]);
    expect(entries.map((entry) => entry.kind)).toEqual(["single", "single", "single"]);
  });
});
