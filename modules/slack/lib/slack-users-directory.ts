import { getSlackBotTokenOrThrow } from "@/modules/slack/lib/slack-config";
import { SlackApiError } from "@/modules/slack/lib/slack-client";

const SLACK_API_BASE = "https://slack.com/api";
const DIRECTORY_TTL_MS = 10 * 60 * 1000;

export type SlackDirectoryUser = {
  id: string;
  name: string;
  realName: string;
  displayName: string;
  email: string | null;
};

type DirectoryCache = {
  fetchedAt: number;
  users: SlackDirectoryUser[];
  byEmail: Map<string, SlackDirectoryUser>;
};

let directoryCache: DirectoryCache | null = null;

export function clearSlackUsersDirectoryCache(): void {
  directoryCache = null;
}

export async function getSlackUsersDirectory(): Promise<DirectoryCache> {
  if (directoryCache && Date.now() - directoryCache.fetchedAt < DIRECTORY_TTL_MS) {
    return directoryCache;
  }

  const token = getSlackBotTokenOrThrow();
  const users: SlackDirectoryUser[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ limit: "200" });
    if (cursor) {
      params.set("cursor", cursor);
    }

    const response = await fetch(`${SLACK_API_BASE}/users.list?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      throw new SlackApiError(`Slack API retornou HTTP ${response.status}.`);
    }

    const json = (await response.json()) as {
      ok: boolean;
      error?: string;
      members?: Array<{
        id?: string;
        name?: string;
        real_name?: string;
        deleted?: boolean;
        is_bot?: boolean;
        profile?: {
          email?: string;
          display_name?: string;
          real_name?: string;
        };
      }>;
      response_metadata?: { next_cursor?: string };
    };

    if (!json.ok) {
      throw new SlackApiError(
        json.error ? `Slack: ${json.error}` : "Falha ao listar usuários do Slack.",
        json.error
      );
    }

    for (const member of json.members ?? []) {
      if (!member.id || member.deleted || member.is_bot || member.id === "USLACKBOT") {
        continue;
      }
      const profile = member.profile ?? {};
      const email = profile.email?.trim().toLowerCase() || null;
      users.push({
        id: member.id,
        name: member.name?.trim() || "",
        realName: (member.real_name || profile.real_name || "").trim(),
        displayName: (profile.display_name || "").trim(),
        email
      });
    }

    cursor = json.response_metadata?.next_cursor?.trim() || undefined;
  } while (cursor);

  const byEmail = new Map<string, SlackDirectoryUser>();
  for (const user of users) {
    if (user.email) {
      byEmail.set(user.email, user);
    }
  }

  directoryCache = { fetchedAt: Date.now(), users, byEmail };
  return directoryCache;
}

export async function lookupSlackUserIdByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const directory = await getSlackUsersDirectory();
  const fromDirectory = directory.byEmail.get(normalized);
  if (fromDirectory) {
    return fromDirectory.id;
  }

  const token = getSlackBotTokenOrThrow();
  const params = new URLSearchParams({ email: normalized });
  const response = await fetch(`${SLACK_API_BASE}/users.lookupByEmail?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new SlackApiError(`Slack API retornou HTTP ${response.status}.`);
  }

  const json = (await response.json()) as {
    ok: boolean;
    error?: string;
    user?: { id?: string };
  };

  if (!json.ok) {
    if (json.error === "users_not_found") {
      return null;
    }
    throw new SlackApiError(
      json.error ? `Slack: ${json.error}` : "Falha ao buscar usuário do Slack por e-mail.",
      json.error
    );
  }

  return json.user?.id?.trim() || null;
}
