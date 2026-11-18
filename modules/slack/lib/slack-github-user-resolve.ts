import {
  defaultRunner,
  type CommandRunner,
  GhCommandError,
  GhUnauthenticatedError
} from "@/modules/prs/lib/gh-client";
import {
  getSlackUsersDirectory,
  lookupSlackUserIdByEmail,
  type SlackDirectoryUser
} from "@/modules/slack/lib/slack-users-directory";

function isGhUnauthenticated(stderr: string): boolean {
  return /gh auth login|not logged in|authentication/i.test(stderr);
}

type GithubProfile = {
  login: string;
  name: string | null;
  email: string | null;
};

const githubProfileCache = new Map<string, GithubProfile | null>();
const slackIdByGithubLoginCache = new Map<string, string | null>();

export function clearSlackGithubUserResolveCache(): void {
  githubProfileCache.clear();
  slackIdByGithubLoginCache.clear();
}

function normalizePersonKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function stripJusfySuffix(login: string): string {
  return login.toLowerCase().endsWith("jusfy") ? login.slice(0, -5) : login;
}

function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (!a.length) {
    return b.length;
  }
  if (!b.length) {
    return a.length;
  }

  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i += 1) {
    let previous = i;
    row[0] = i + 1;
    for (let j = 0; j < b.length; j += 1) {
      const current = row[j + 1]!;
      const cost = a[i] === b[j] ? 0 : 1;
      row[j + 1] = Math.min(row[j + 1]! + 1, row[j]! + 1, previous + cost);
      previous = current;
    }
  }
  return row[b.length]!;
}

export function scoreGithubLoginAgainstSlackUser(
  login: string,
  profile: GithubProfile | null,
  user: SlackDirectoryUser
): number {
  const loginKey = normalizePersonKey(stripJusfySuffix(login));
  const emailLocal = user.email?.split("@")[0] ?? "";
  const candidates = [user.name, user.realName, user.displayName, emailLocal].map(normalizePersonKey);

  let best = 0;
  for (const candidate of candidates) {
    if (!candidate || !loginKey) {
      continue;
    }
    if (candidate === loginKey) {
      best = Math.max(best, 100);
    } else if (candidate.includes(loginKey) || loginKey.includes(candidate)) {
      best = Math.max(best, 85);
    } else if (Math.abs(candidate.length - loginKey.length) <= 2 && levenshtein(candidate, loginKey) <= 2) {
      best = Math.max(best, 80);
    }
  }

  const githubName = profile?.name?.trim();
  if (githubName) {
    const githubNameKey = normalizePersonKey(githubName);
    const slackNameKey = normalizePersonKey(`${user.realName} ${user.displayName}`);
    if (githubNameKey && slackNameKey) {
      if (githubNameKey === slackNameKey) {
        best = Math.max(best, 100);
      } else if (slackNameKey.includes(githubNameKey) || githubNameKey.includes(slackNameKey)) {
        best = Math.max(best, 95);
      }
    }
  }

  return best;
}

async function fetchGithubProfile(
  login: string,
  run: CommandRunner = defaultRunner
): Promise<GithubProfile | null> {
  const cached = githubProfileCache.get(login);
  if (cached !== undefined) {
    return cached;
  }

  const output = await run(["api", `users/${encodeURIComponent(login)}`]);
  if (output.exitCode !== 0) {
    if (isGhUnauthenticated(output.stderr)) {
      throw new GhUnauthenticatedError(
        "GitHub CLI sem autenticacao. Defina GH_TOKEN no .env ou execute `gh auth login`."
      );
    }
    githubProfileCache.set(login, null);
    return null;
  }

  try {
    const json = JSON.parse(output.stdout) as {
      login?: string;
      name?: string | null;
      email?: string | null;
    };
    const profile: GithubProfile = {
      login: json.login?.trim() || login,
      name: json.name?.trim() || null,
      email: json.email?.trim().toLowerCase() || null
    };
    githubProfileCache.set(login, profile);
    return profile;
  } catch {
    throw new GhCommandError(`Falha ao ler perfil GitHub de ${login}.`);
  }
}

export async function resolveGithubLoginToSlackUserId(
  login: string,
  run: CommandRunner = defaultRunner
): Promise<string | null> {
  const trimmed = login.trim();
  if (!trimmed) {
    return null;
  }

  if (slackIdByGithubLoginCache.has(trimmed)) {
    return slackIdByGithubLoginCache.get(trimmed) ?? null;
  }

  const profile = await fetchGithubProfile(trimmed, run);
  if (profile?.email) {
    const byEmail = await lookupSlackUserIdByEmail(profile.email);
    if (byEmail) {
      slackIdByGithubLoginCache.set(trimmed, byEmail);
      return byEmail;
    }
  }

  const directory = await getSlackUsersDirectory();
  let bestId: string | null = null;
  let bestScore = 0;
  for (const user of directory.users) {
    const score = scoreGithubLoginAgainstSlackUser(trimmed, profile, user);
    if (score > bestScore) {
      bestScore = score;
      bestId = user.id;
    }
  }

  const resolved = bestScore >= 80 ? bestId : null;
  slackIdByGithubLoginCache.set(trimmed, resolved);
  return resolved;
}

/**
 * Replaces `@githubLogin` tokens with `<@SLACK_ID>` when a mapping is known.
 * Unknown logins stay as plain `@login` text.
 */
export function formatSlackGithubUserMentions(
  text: string,
  loginToSlackId: ReadonlyMap<string, string>
): string {
  if (loginToSlackId.size === 0) {
    return text;
  }

  const logins = [...loginToSlackId.keys()].sort((a, b) => b.length - a.length);
  let result = text;
  for (const login of logins) {
    const slackId = loginToSlackId.get(login);
    if (!slackId) {
      continue;
    }
    const escaped = login.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`(^|\\s)@${escaped}\\b`, "g"), `$1<@${slackId}>`);
  }
  return result;
}

export async function resolveGithubLoginsToSlackIds(
  logins: string[],
  run: CommandRunner = defaultRunner
): Promise<Map<string, string>> {
  const unique = [...new Set(logins.map((login) => login.trim()).filter(Boolean))];
  const resolved = new Map<string, string>();

  await Promise.all(
    unique.map(async (login) => {
      const slackId = await resolveGithubLoginToSlackUserId(login, run);
      if (slackId) {
        resolved.set(login, slackId);
      }
    })
  );

  return resolved;
}
