import { GhCommandError, GhUnauthenticatedError, type CommandRunner } from "@/modules/prs/lib/gh-client";
import {
  ensureMonitoredRepositoriesReady,
  listMonitoredRepositoriesForApp,
  noMonitoredRepositoriesMessage
} from "@/modules/prs/lib/monitored-repositories-service";
import { getMonitoredRepositoryBySlug } from "@/modules/prs/lib/monitored-repository-repository";
import {
  getGhAuthenticatedLogin,
  listAuthorBranches,
  type AuthorBranch
} from "@/modules/jira-branch/lib/gh-branch-client";
import { createServerCache } from "@/modules/server-cache/lib/server-cache";

// The login rarely changes; the branch list is paginated GraphQL (up to 8 calls).
const ghLoginCache = createServerCache<string>({
  name: "jira-branch:gh-login",
  ttlMs: 30 * 60_000,
  staleTtlMs: 24 * 60 * 60_000
});

const authorBranchesCache = createServerCache<AuthorBranch[]>({
  name: "jira-branch:author-branches",
  ttlMs: 2 * 60_000,
  staleTtlMs: 60 * 60_000
});

/** Call after creating or deleting a remote branch in `repository`. */
export function invalidateJiraBranchBaseBranches(repository: string): void {
  authorBranchesCache.invalidate(repository);
}

export function clearJiraBranchBaseBranchesCache(): void {
  ghLoginCache.clear();
  authorBranchesCache.clear();
}

export type JiraBranchRepositoryItem = {
  repository: string;
  defaultBranch: string;
};

export type JiraBranchRepositoriesResult =
  | { status: "ok"; repositories: JiraBranchRepositoryItem[] }
  | { status: "error"; message: string };

export type JiraBranchBaseBranchesResult =
  | { status: "ok"; defaultBranch: string; baseBranches: string[] }
  | { status: "unauthenticated"; message: string }
  | { status: "error"; message: string };

export async function listJiraBranchRepositories(): Promise<JiraBranchRepositoriesResult> {
  const rows = await listMonitoredRepositoriesForApp();
  const repositories = rows.map((row) => ({
    repository: row.repository,
    defaultBranch: row.defaultBranch
  }));

  if (repositories.length === 0) {
    return { status: "error", message: noMonitoredRepositoriesMessage() };
  }

  return { status: "ok", repositories };
}

export async function listJiraBranchBaseBranches(
  repository: string,
  run?: CommandRunner
): Promise<JiraBranchBaseBranchesResult> {
  await ensureMonitoredRepositoriesReady();
  const monitored = await getMonitoredRepositoryBySlug(repository);
  if (!monitored) {
    return { status: "error", message: "Repositório não cadastrado para monitoramento." };
  }

  try {
    const githubLogin = await ghLoginCache.get("default", () => getGhAuthenticatedLogin(run));
    const authorBranches = await authorBranchesCache.get(repository, () =>
      listAuthorBranches(repository, githubLogin, run)
    );

    const baseBranches = [
      ...new Set([monitored.defaultBranch, ...authorBranches.map((branch) => branch.name)])
    ].sort((a, b) => {
      if (a === monitored.defaultBranch) {
        return -1;
      }
      if (b === monitored.defaultBranch) {
        return 1;
      }
      return a.localeCompare(b);
    });

    return { status: "ok", defaultBranch: monitored.defaultBranch, baseBranches };
  } catch (error) {
    if (error instanceof GhUnauthenticatedError) {
      return { status: "unauthenticated", message: error.message };
    }
    if (error instanceof GhCommandError) {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: "Falha ao listar branches destino." };
  }
}
