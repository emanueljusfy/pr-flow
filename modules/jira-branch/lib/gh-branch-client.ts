import {
  defaultRunner,
  GhCommandError,
  GhUnauthenticatedError,
  type CommandRunner
} from "@/modules/prs/lib/gh-client";

function parseRepo(repository: string): { owner: string; name: string } {
  const [owner, name] = repository.split("/");
  if (!owner || !name) {
    throw new GhCommandError(`Repositório inválido: ${repository}`);
  }
  return { owner, name };
}

export type AuthorBranch = {
  name: string;
};

async function assertGhAuthenticated(run: CommandRunner): Promise<void> {
  const auth = await run(["auth", "status"]);
  if (auth.exitCode !== 0) {
    throw new GhUnauthenticatedError(
      "GitHub CLI sem autenticacao. Defina GH_TOKEN no .env ou execute `gh auth login`."
    );
  }
}

export async function getGhAuthenticatedLogin(run: CommandRunner = defaultRunner): Promise<string> {
  await assertGhAuthenticated(run);
  const meCmd = await run(["api", "user", "--jq", ".login"]);
  if (meCmd.exitCode === 0 && meCmd.stdout.trim()) {
    return meCmd.stdout.trim();
  }
  if (/gh auth login|not logged in|authentication/i.test(meCmd.stderr)) {
    throw new GhUnauthenticatedError(
      "GitHub CLI sem autenticacao. Defina GH_TOKEN no .env ou execute `gh auth login`."
    );
  }
  throw new GhCommandError(meCmd.stderr || "Falha ao descobrir usuario autenticado");
}

const authorBranchesQuery = `
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    refs(refPrefix: "refs/heads/", first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        target {
          ... on Commit {
            author { user { login } }
          }
        }
      }
    }
  }
}
`;

export async function listAuthorBranches(
  repository: string,
  githubLogin: string,
  run: CommandRunner = defaultRunner
): Promise<AuthorBranch[]> {
  const { owner, name } = parseRepo(repository);
  const branches: AuthorBranch[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 8; page += 1) {
    const args = [
      "api",
      "graphql",
      "-f",
      `query=${authorBranchesQuery}`,
      "-F",
      `owner=${owner}`,
      "-F",
      `name=${name}`
    ];
    if (cursor) {
      args.push("-F", `cursor=${cursor}`);
    }

    const output = await run(args);
    if (output.exitCode !== 0) {
      if (/gh auth login|not logged in|authentication/i.test(output.stderr)) {
        throw new GhUnauthenticatedError(
          "GitHub CLI sem autenticacao. Defina GH_TOKEN no .env ou execute `gh auth login`."
        );
      }
      throw new GhCommandError(output.stderr || `Falha ao listar branches de ${repository}`);
    }

    let payload: {
      data?: {
        repository?: {
          refs?: {
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
            nodes?: Array<{
              name?: string;
              target?: { author?: { user?: { login?: string } } };
            }>;
          };
        };
      };
      errors?: Array<{ message?: string }>;
    };

    try {
      payload = JSON.parse(output.stdout) as typeof payload;
    } catch {
      throw new GhCommandError(`Falha ao parsear branches de ${repository}`);
    }

    if (payload.errors?.length) {
      throw new GhCommandError(payload.errors.map((e) => e.message).join("; "));
    }

    const nodes = payload.data?.repository?.refs?.nodes ?? [];
    for (const node of nodes) {
      const branchName = node.name?.trim();
      const authorLogin = node.target?.author?.user?.login?.trim();
      if (!branchName || authorLogin !== githubLogin) {
        continue;
      }
      if (branchName === "master" || branchName === "main") {
        continue;
      }
      branches.push({ name: branchName });
    }

    const pageInfo = payload.data?.repository?.refs?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) {
      break;
    }
    cursor = pageInfo.endCursor;
  }

  return branches.sort((a, b) => a.name.localeCompare(b.name));
}

function encodeRefBranch(branch: string): string {
  return encodeURIComponent(branch.trim());
}

export async function getRemoteBranchSha(
  repository: string,
  branch: string,
  run: CommandRunner = defaultRunner
): Promise<string | null> {
  const { owner, name } = parseRepo(repository);
  const output = await run([
    "api",
    `/repos/${owner}/${name}/git/ref/heads/${encodeRefBranch(branch)}`,
    "--jq",
    ".object.sha"
  ]);

  if (output.exitCode !== 0) {
    if (/404|Not Found/i.test(output.stderr) || /404|Not Found/i.test(output.stdout)) {
      return null;
    }
    if (/gh auth login|not logged in|authentication/i.test(output.stderr)) {
      throw new GhUnauthenticatedError(
        "GitHub CLI sem autenticacao. Defina GH_TOKEN no .env ou execute `gh auth login`."
      );
    }
    throw new GhCommandError(output.stderr || `Falha ao buscar branch ${branch} em ${repository}`);
  }

  const sha = output.stdout.trim().replace(/^"|"$/g, "");
  return sha.length > 0 ? sha : null;
}

export async function remoteBranchExists(
  repository: string,
  branch: string,
  run: CommandRunner = defaultRunner
): Promise<boolean> {
  const sha = await getRemoteBranchSha(repository, branch, run);
  return sha !== null;
}

export async function createRemoteBranch(
  repository: string,
  branch: string,
  baseSha: string,
  run: CommandRunner = defaultRunner
): Promise<void> {
  const { owner, name } = parseRepo(repository);
  const output = await run([
    "api",
    `/repos/${owner}/${name}/git/refs`,
    "-f",
    `ref=refs/heads/${branch}`,
    "-f",
    `sha=${baseSha}`
  ]);

  if (output.exitCode !== 0) {
    if (/gh auth login|not logged in|authentication/i.test(output.stderr)) {
      throw new GhUnauthenticatedError(
        "GitHub CLI sem autenticacao. Defina GH_TOKEN no .env ou execute `gh auth login`."
      );
    }
    throw new GhCommandError(output.stderr || `Falha ao criar branch ${branch} em ${repository}`);
  }
}
