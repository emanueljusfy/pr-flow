import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { MonitoredPrRaw, PrHistoryEvent, PrReview } from "@/modules/prs/lib/domain";
import { mapPullRequestHistory } from "@/modules/prs/lib/core/pr-history-map";
import { ghLogger } from "@/modules/prs/lib/gh-logger";
import { prHistoryGraphqlResponseSchema } from "@/modules/prs/lib/pr-history-validation";

const execFileAsync = promisify(execFile);

/** Node execFile default maxBuffer is 1MB; PR compare diffs often exceed that. */
const GH_EXEC_MAX_BUFFER_BYTES = 20 * 1024 * 1024;

export interface CommandOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type CommandRunner = (args: string[]) => Promise<CommandOutput>;

export class GhUnauthenticatedError extends Error {}

export class GhCommandError extends Error {}

const query = `
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 50, states: OPEN, orderBy: {field: CREATED_AT, direction: DESC}, headRefName: null) {
      nodes {
        id
        number
        title
        url
        createdAt
        baseRefName
        headRefName
        headRefOid
        isDraft
        mergeStateStatus
        mergeable
        author {
          login
        }
        reviewThreads(first: 100) {
          nodes {
            isResolved
          }
        }
        reviewRequests(first: 100) {
          nodes {
            requestedReviewer {
              ... on User {
                login
              }
            }
          }
        }
        reviews(first: 100) {
          nodes {
            state
            submittedAt
            author {
              login
            }
          }
        }
      }
    }
  }
}
`;

async function defaultRunner(args: string[]): Promise<CommandOutput> {
  const startTime = Date.now();
  try {
    const result = await execFileAsync("gh", args, { maxBuffer: GH_EXEC_MAX_BUFFER_BYTES });
    const duration = Date.now() - startTime;
    ghLogger.logCommand("gh", args, 0, result.stdout, result.stderr, duration);
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error as {
      stdout?: string;
      stderr?: string;
      code?: string | number;
      message?: string;
    };
    const stdout = err.stdout ?? "";
    const stderr = err.stderr ?? "";
    const exitCode = typeof err.code === "number" ? err.code : 1;
    ghLogger.logCommand("gh", args, exitCode, stdout, stderr, duration);
    return { stdout, stderr, exitCode };
  }
}

export { defaultRunner };

function parseRepo(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    throw new GhCommandError(`Invalid repository: ${repo}`);
  }
  return { owner, name };
}

function isGhUnauthenticated(stderr: string): boolean {
  return /gh auth login|not logged in|authentication/i.test(stderr);
}

function isTransientGhJsonIssue(stderr: string): boolean {
  return /unexpected end of json input/i.test(stderr);
}

async function getAuthenticatedLogin(run: CommandRunner): Promise<string> {
  const meCmd = await run(["api", "user", "--jq", ".login"]);
  if (meCmd.exitCode === 0 && meCmd.stdout.trim().length > 0) {
    return meCmd.stdout.trim();
  }

  if (isGhUnauthenticated(meCmd.stderr)) {
    throw new GhUnauthenticatedError(
      "GitHub CLI sem autenticacao. Defina GH_TOKEN no .env ou execute `gh auth login`."
    );
  }

  if (!isTransientGhJsonIssue(meCmd.stderr)) {
    throw new GhCommandError(meCmd.stderr || "Falha ao descobrir usuario autenticado");
  }

  const fallback = await run(["api", "user"]);
  if (fallback.exitCode !== 0) {
    if (isGhUnauthenticated(fallback.stderr)) {
      throw new GhUnauthenticatedError(
      "GitHub CLI sem autenticacao. Defina GH_TOKEN no .env ou execute `gh auth login`."
    );
    }
    throw new GhCommandError(fallback.stderr || "Falha ao descobrir usuario autenticado");
  }

  if (!fallback.stdout.trim()) {
    throw new GhCommandError("Falha ao descobrir usuario autenticado: resposta vazia do gh api user");
  }

  let payload: { login?: unknown } | null;
  try {
    payload = JSON.parse(fallback.stdout) as { login?: unknown } | null;
  } catch (error) {
    const parseError = error instanceof Error ? error.message : String(error);
    throw new GhCommandError(`Falha ao parsear usuario autenticado: ${parseError}`);
  }

  const login = typeof payload?.login === "string" ? payload.login.trim() : "";
  if (!login) {
    throw new GhCommandError("Falha ao descobrir usuario autenticado: campo login ausente");
  }
  return login;
}

export interface CollectOpenPrsResult {
  prs: MonitoredPrRaw[];
  githubLogin: string;
}

export type CollectOpenAuthorPrsResult = CollectOpenPrsResult;

function mapGraphqlPrNode(
  pr: {
    id: string;
    number: number;
    title: string;
    url: string;
    createdAt?: string;
    baseRefName?: string;
    headRefName?: string;
    headRefOid?: string;
    isDraft?: boolean;
    mergeable?: string;
    author?: { login?: string };
    reviewThreads?: { nodes?: Array<{ isResolved?: boolean }> };
    reviewRequests?: { nodes?: Array<{ requestedReviewer?: { login?: string } }> };
    reviews?: { nodes?: Array<{ state?: string; submittedAt?: string; author?: { login?: string } }> };
  },
  repo: string
): MonitoredPrRaw {
  const requestedReviewers =
    pr.reviewRequests?.nodes
      ?.map((node) => node.requestedReviewer?.login)
      .filter((value): value is string => Boolean(value)) ?? [];

  const reviews: PrReview[] =
    pr.reviews?.nodes
      ?.map((node) => ({
        login: node.author?.login ?? "",
        state: node.state ?? "",
        submittedAt: node.submittedAt ?? new Date(0).toISOString()
      }))
      .filter((review) => review.login.length > 0) ?? [];

  const hasUnresolvedComments = pr.reviewThreads?.nodes?.some((thread) => thread.isResolved === false) ?? false;

  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    createdAt: pr.createdAt ?? new Date(0).toISOString(),
    repository: repo,
    baseRefName: pr.baseRefName,
    headRefName: pr.headRefName,
    headSha: pr.headRefOid,
    isDraft: pr.isDraft ?? false,
    authorLogin: pr.author?.login,
    requestedReviewers,
    reviews,
    hasConflicts: pr.mergeable === "CONFLICTING",
    hasUnresolvedComments
  };
}

export async function collectOpenPrsFromRepos(
  repos: string[],
  run: CommandRunner = defaultRunner
): Promise<CollectOpenPrsResult> {
  const auth = await run(["auth", "status"]);
  if (auth.exitCode !== 0) {
    throw new GhUnauthenticatedError(
      "GitHub CLI sem autenticacao. Defina GH_TOKEN no .env ou execute `gh auth login`."
    );
  }

  const githubLogin = await getAuthenticatedLogin(run);
  const rows: MonitoredPrRaw[] = [];

  for (const repo of repos) {
    const { owner, name } = parseRepo(repo);
    const output = await run(["api", "graphql", "-f", `query=${query}`, "-F", `owner=${owner}`, "-F", `name=${name}`]);

    if (output.exitCode !== 0) {
      if (isGhUnauthenticated(output.stderr)) {
        throw new GhUnauthenticatedError(
      "GitHub CLI sem autenticacao. Defina GH_TOKEN no .env ou execute `gh auth login`."
    );
      }
      throw new GhCommandError(output.stderr || "Falha ao consultar GitHub GraphQL");
    }

    if (!output.stdout.trim()) {
      throw new GhCommandError(`GraphQL retornou resposta vazia para ${repo}. Stderr: ${output.stderr || "(vazio)"}`);
    }

    let payload: { data?: unknown; errors?: unknown };
    try {
      payload = JSON.parse(output.stdout) as { data?: unknown; errors?: unknown };
    } catch (error) {
      const parseError = error instanceof Error ? error.message : String(error);
      throw new GhCommandError(`Falha ao parsear resposta GraphQL para ${repo}: ${parseError}. Resposta: ${output.stdout.substring(0, 200)}`);
    }

    if (payload.errors && Array.isArray(payload.errors) && payload.errors.length > 0) {
      const errorMessages = payload.errors.map((e: { message?: string }) => e.message).join("; ");
      throw new GhCommandError(`Erro GraphQL para ${repo}: ${errorMessages}`);
    }

    const data = payload.data as {
      repository?: {
        pullRequests?: {
          nodes?: Array<{
            id: string;
            number: number;
            title: string;
            url: string;
            createdAt?: string;
            baseRefName?: string;
            headRefName?: string;
            headRefOid?: string;
            isDraft?: boolean;
            mergeStateStatus?: string;
            mergeable?: string;
            author?: { login?: string };
            reviewThreads?: { nodes?: Array<{ isResolved?: boolean }> };
            reviewRequests?: { nodes?: Array<{ requestedReviewer?: { login?: string } }> };
            reviews?: { nodes?: Array<{ state?: string; submittedAt?: string; author?: { login?: string } }> };
          }>;
        };
      };
    } | undefined;

    const prs = data?.repository?.pullRequests?.nodes ?? [];
    for (const pr of prs) {
      rows.push(mapGraphqlPrNode(pr, repo));
    }
  }

  return { prs: rows, githubLogin };
}

export async function collectOpenAuthorPrs(
  repos: string[],
  run: CommandRunner = defaultRunner
): Promise<CollectOpenAuthorPrsResult> {
  const { prs, githubLogin } = await collectOpenPrsFromRepos(repos, run);
  return {
    prs: prs.filter((pr) => pr.authorLogin === githubLogin),
    githubLogin
  };
}

export async function commentOnPullRequest(
  input: { repository: string; number: number; body: string },
  run: CommandRunner = defaultRunner
): Promise<void> {
  const output = await run([
    "pr",
    "comment",
    String(input.number),
    "--repo",
    input.repository,
    "--body",
    input.body
  ]);

  if (output.exitCode !== 0) {
    if (isGhUnauthenticated(output.stderr)) {
      throw new GhUnauthenticatedError(
        "GitHub CLI sem autenticacao. Defina GH_TOKEN no .env ou execute `gh auth login`."
      );
    }
    throw new GhCommandError(output.stderr || "Falha ao comentar na pull request");
  }
}

const historyQuery = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id
      number
      url
      createdAt
      author {
        login
      }
      timelineItems(first: 100, itemTypes: [ISSUE_COMMENT, PULL_REQUEST_COMMIT, PULL_REQUEST_REVIEW, MERGED_EVENT, CLOSED_EVENT, REOPENED_EVENT]) {
        nodes {
          __typename
          ... on IssueComment {
            id
            createdAt
            url
            body
            author {
              login
            }
          }
          ... on PullRequestCommit {
            commit {
              oid
              committedDate
              messageHeadline
              url
              author {
                name
                user {
                  login
                }
              }
            }
          }
          ... on PullRequestReview {
            id
            createdAt
            url
            state
            body
            author {
              login
            }
          }
          ... on MergedEvent {
            id
            createdAt
            url
            actor {
              login
            }
          }
          ... on ClosedEvent {
            id
            createdAt
            url
            actor {
              login
            }
          }
          ... on ReopenedEvent {
            id
            createdAt
            actor {
              login
            }
          }
        }
      }
    }
  }
}
`;

export async function fetchPullRequestHistory(
  input: { repository: string; number: number },
  run: CommandRunner = defaultRunner
): Promise<{ events: PrHistoryEvent[] }> {
  const { owner, name } = parseRepo(input.repository);
  const output = await run([
    "api",
    "graphql",
    "-f",
    `query=${historyQuery}`,
    "-F",
    `owner=${owner}`,
    "-F",
    `name=${name}`,
    "-F",
    `number=${input.number}`
  ]);

  if (output.exitCode !== 0) {
    if (isGhUnauthenticated(output.stderr)) {
      throw new GhUnauthenticatedError(
        "GitHub CLI sem autenticacao. Defina GH_TOKEN no .env ou execute `gh auth login`."
      );
    }
    throw new GhCommandError(output.stderr || "Falha ao consultar o histórico da PR");
  }

  if (!output.stdout.trim()) {
    throw new GhCommandError(
      `GraphQL retornou resposta vazia para o histórico de ${input.repository}#${input.number}.`
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(output.stdout);
  } catch (error) {
    const parseError = error instanceof Error ? error.message : String(error);
    throw new GhCommandError(`Falha ao parsear histórico da PR: ${parseError}`);
  }

  const parsed = prHistoryGraphqlResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new GhCommandError("Resposta GraphQL do histórico da PR inválida.");
  }

  if (parsed.data.errors && parsed.data.errors.length > 0) {
    throw new GhCommandError(
      `Erro GraphQL no histórico da PR: ${parsed.data.errors.map((entry) => entry.message).join("; ")}`
    );
  }

  const pullRequest = parsed.data.data?.repository?.pullRequest;
  if (!pullRequest) {
    throw new GhCommandError(`PR ${input.repository}#${input.number} não encontrada.`);
  }

  return { events: mapPullRequestHistory(pullRequest) };
}

export type PullRequestState = "OPEN" | "CLOSED" | "MERGED";

/** Current state of one PR. Used to tell a merge apart from a plain close once it leaves the open list. */
export async function getPullRequestState(
  input: { repository: string; number: number },
  run: CommandRunner = defaultRunner
): Promise<PullRequestState> {
  const output = await run(["pr", "view", String(input.number), "--repo", input.repository, "--json", "state"]);

  if (output.exitCode !== 0) {
    if (isGhUnauthenticated(output.stderr)) {
      throw new GhUnauthenticatedError(
        "GitHub CLI sem autenticacao. Defina GH_TOKEN no .env ou execute `gh auth login`."
      );
    }
    throw new GhCommandError(output.stderr || "Falha ao consultar a pull request");
  }

  const state = (JSON.parse(output.stdout) as { state?: unknown }).state;
  if (state !== "OPEN" && state !== "CLOSED" && state !== "MERGED") {
    throw new GhCommandError(`Estado inesperado da pull request: ${String(state)}`);
  }
  return state;
}

export type PullRequestReviewRecord = {
  login: string;
  state: string;
  submittedAt: string;
  url: string | null;
};

const pullRequestReviewsQuery = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviews(last: 50) {
        nodes {
          state
          submittedAt
          url
          author {
            login
          }
        }
      }
    }
  }
}
`;

/** Latest reviews on one PR (oldest first). Used to read what an AI review posted. */
export async function listPullRequestReviews(
  input: { repository: string; number: number },
  run: CommandRunner = defaultRunner
): Promise<PullRequestReviewRecord[]> {
  const { owner, name } = parseRepo(input.repository);
  const output = await run([
    "api",
    "graphql",
    "-f",
    `query=${pullRequestReviewsQuery}`,
    "-F",
    `owner=${owner}`,
    "-F",
    `name=${name}`,
    "-F",
    `number=${input.number}`
  ]);

  if (output.exitCode !== 0) {
    if (isGhUnauthenticated(output.stderr)) {
      throw new GhUnauthenticatedError(
        "GitHub CLI sem autenticacao. Defina GH_TOKEN no .env ou execute `gh auth login`."
      );
    }
    throw new GhCommandError(output.stderr || "Falha ao consultar reviews da pull request");
  }

  const payload = JSON.parse(output.stdout) as {
    data?: {
      repository?: {
        pullRequest?: {
          reviews?: {
            nodes?: Array<{ state?: string; submittedAt?: string | null; url?: string; author?: { login?: string } | null }>;
          };
        } | null;
      };
    };
  };

  const nodes = payload.data?.repository?.pullRequest?.reviews?.nodes ?? [];
  return nodes
    .filter((node) => node.author?.login && node.submittedAt)
    .map((node) => ({
      login: node.author!.login!,
      state: node.state ?? "",
      submittedAt: node.submittedAt!,
      url: node.url ?? null
    }));
}
