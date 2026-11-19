/**
 * Groups stacked PRs: a PR is stacked on another when, in the same repository,
 * its base branch is the other PR's head branch (e.g. `feat-b` → `feat-a` → `main`).
 */

export interface StackablePr {
  id: string;
  number: number;
  repository: string;
  baseRefName?: string;
  headRefName?: string;
}

export interface PrStackNode<T extends StackablePr> {
  pr: T;
  /** 0 for the bottom of the stack (merges into a branch without an open PR). */
  depth: number;
  /** Number of the PR this one is stacked on; null for the bottom of the stack. */
  parentNumber: number | null;
}

export type PrListEntry<T extends StackablePr> =
  | { kind: "single"; pr: T }
  | {
      kind: "stack";
      id: string;
      repository: string;
      /** Branch the bottom PR merges into (usually the default branch). */
      baseRefName: string;
      /** Depth-first order: each PR comes right after the one it is stacked on. */
      nodes: PrStackNode<T>[];
    };

function branchKey(repository: string, branch: string): string {
  return `${repository}::${branch}`;
}

/**
 * Keeps the input order: each stack takes the position of its first member in `prs`.
 * PRs without branch info (old caches) and branch cycles are listed as singles.
 */
export function groupPrsIntoStacks<T extends StackablePr>(prs: T[]): PrListEntry<T>[] {
  const byHead = new Map<string, T>();
  for (const pr of prs) {
    if (pr.headRefName) {
      byHead.set(branchKey(pr.repository, pr.headRefName), pr);
    }
  }

  const parentOf = new Map<string, T>();
  const childrenOf = new Map<string, T[]>();
  for (const pr of prs) {
    if (!pr.baseRefName) {
      continue;
    }
    const parent = byHead.get(branchKey(pr.repository, pr.baseRefName));
    if (!parent || parent.id === pr.id) {
      continue;
    }
    parentOf.set(pr.id, parent);
    const siblings = childrenOf.get(parent.id) ?? [];
    siblings.push(pr);
    childrenOf.set(parent.id, siblings);
  }

  function findRoot(pr: T): T | null {
    const seen = new Set<string>([pr.id]);
    let current = pr;
    let parent = parentOf.get(current.id);
    while (parent) {
      if (seen.has(parent.id)) {
        return null;
      }
      seen.add(parent.id);
      current = parent;
      parent = parentOf.get(current.id);
    }
    return current;
  }

  const emitted = new Set<string>();
  const entries: PrListEntry<T>[] = [];

  for (const pr of prs) {
    if (emitted.has(pr.id)) {
      continue;
    }

    const root = findRoot(pr);
    if (!root || !childrenOf.has(root.id)) {
      emitted.add(pr.id);
      entries.push({ kind: "single", pr });
      continue;
    }

    const nodes: PrStackNode<T>[] = [];
    const visit = (node: T, depth: number, parentNumber: number | null) => {
      if (emitted.has(node.id)) {
        return;
      }
      emitted.add(node.id);
      nodes.push({ pr: node, depth, parentNumber });
      for (const child of childrenOf.get(node.id) ?? []) {
        visit(child, depth + 1, node.number);
      }
    };
    visit(root, 0, null);

    entries.push({
      kind: "stack",
      id: root.id,
      repository: root.repository,
      baseRefName: root.baseRefName ?? "",
      nodes
    });
  }

  return entries;
}
