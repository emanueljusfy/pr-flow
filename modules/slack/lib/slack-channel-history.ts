import { z } from "zod";
import { getSlackBotTokenOrThrow } from "@/modules/slack/lib/slack-config";
import { SlackApiError } from "@/modules/slack/lib/slack-client";

const SLACK_API_BASE = "https://slack.com/api";
const CHANNEL_ID_PATTERN = /^[CG][A-Z0-9]{6,}$/;
/** Hard stop so a huge channel does not turn one tool call into hundreds of API pages. */
const MAX_HISTORY_PAGES = 20;
const HISTORY_PAGE_SIZE = 200;
const TEXT_PREVIEW_CHARS = 280;

const slackErrorFields = {
  ok: z.boolean(),
  error: z.string().optional(),
  needed: z.string().optional()
};

const cursorSchema = z.object({ next_cursor: z.string().optional() }).optional();

const conversationsListSchema = z.object({
  ...slackErrorFields,
  channels: z.array(z.object({ id: z.string(), name: z.string().optional() })).optional(),
  response_metadata: cursorSchema
});

const historyMessageSchema = z.object({
  ts: z.string(),
  thread_ts: z.string().optional(),
  user: z.string().optional(),
  bot_id: z.string().optional(),
  text: z.string().optional(),
  reply_count: z.number().optional()
});

const conversationsHistorySchema = z.object({
  ...slackErrorFields,
  messages: z.array(historyMessageSchema).optional(),
  has_more: z.boolean().optional(),
  response_metadata: cursorSchema
});

const permalinkSchema = z.object({ ...slackErrorFields, permalink: z.string().optional() });

type SlackErrorResponse = { ok: boolean; error?: string; needed?: string };

function slackReadError(json: SlackErrorResponse, fallback: string): SlackApiError {
  switch (json.error) {
    case "missing_scope":
      return new SlackApiError(
        `O token do Slack não tem o escopo necessário${json.needed ? ` (${json.needed})` : ""}. Adicione channels:read e channels:history (groups:read e groups:history para canal privado) e reinstale o app.`,
        json.error
      );
    case "not_in_channel":
    case "channel_not_found":
      return new SlackApiError("O bot não tem acesso ao canal do Slack. Convide o bot para o canal.", json.error);
    case "invalid_auth":
    case "token_revoked":
      return new SlackApiError("Token do Slack inválido ou revogado. Verifique SLACK_BOT_OAUTH_TOKEN.", json.error);
    default:
      return new SlackApiError(json.error ? `Slack: ${json.error}` : fallback, json.error);
  }
}

async function slackGet<T extends SlackErrorResponse>(
  method: string,
  params: URLSearchParams,
  schema: z.ZodType<T>,
  fallbackError: string
): Promise<T> {
  const token = getSlackBotTokenOrThrow();
  const response = await fetch(`${SLACK_API_BASE}/${method}?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new SlackApiError(`Slack API retornou HTTP ${response.status}.`);
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new SlackApiError("Resposta inválida da API do Slack.");
  }
  if (!parsed.data.ok) {
    throw slackReadError(parsed.data, fallbackError);
  }
  return parsed.data;
}

const channelIdByName = new Map<string, string>();

export function clearSlackChannelIdCache(): void {
  channelIdByName.clear();
}

/** SLACK_PR_CHANNEL holds a name (`squad-jornada-pr`); history endpoints need the channel ID. */
export async function resolveSlackChannelId(nameOrId: string): Promise<string> {
  const trimmed = nameOrId.trim().replace(/^#/, "");
  if (CHANNEL_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const key = trimmed.toLowerCase();
  const cached = channelIdByName.get(key);
  if (cached) {
    return cached;
  }

  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({
      types: "public_channel,private_channel",
      exclude_archived: "true",
      limit: "1000"
    });
    if (cursor) {
      params.set("cursor", cursor);
    }

    const page = await slackGet("conversations.list", params, conversationsListSchema, "Falha ao listar canais do Slack.");
    for (const channel of page.channels ?? []) {
      if (channel.name) {
        channelIdByName.set(channel.name.toLowerCase(), channel.id);
      }
    }
    const found = channelIdByName.get(key);
    if (found) {
      return found;
    }
    cursor = page.response_metadata?.next_cursor?.trim() || undefined;
  } while (cursor);

  throw new SlackApiError(`Canal #${trimmed} não encontrado (ou o bot não tem acesso a ele).`, "channel_not_found");
}

function normalizePrUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches the PR URL but not a longer number (`/pull/12` must not match `/pull/123`). */
export function buildPrUrlMatcher(url: string): RegExp {
  return new RegExp(`${escapeRegExp(normalizePrUrl(url))}(?![0-9])`, "i");
}

export type SlackChannelPrMention = {
  ts: string;
  /** Thread to reply in: the message's own thread, or the message itself when it starts one. */
  threadTs: string;
  postedAt: string;
  user: string | null;
  botId: string | null;
  replyCount: number;
  text: string;
  permalink: string | null;
};

export type FindPrMentionsResult = {
  channelId: string;
  scannedMessages: number;
  oldestScannedAt: string | null;
  /** True when the page limit stopped the scan before `lookbackDays` was covered. */
  truncated: boolean;
  mentionsByUrl: Map<string, SlackChannelPrMention[]>;
};

function slackTsToIso(ts: string): string {
  return new Date(Number.parseFloat(ts) * 1000).toISOString();
}

async function getPermalink(channelId: string, ts: string): Promise<string | null> {
  try {
    const result = await slackGet(
      "chat.getPermalink",
      new URLSearchParams({ channel: channelId, message_ts: ts }),
      permalinkSchema,
      "Falha ao obter link da mensagem."
    );
    return result.permalink ?? null;
  } catch {
    return null;
  }
}

/**
 * Scans the channel's top-level history (and thread broadcasts) for messages that link the
 * given PRs, including ones posted by hand. Replies inside threads are not scanned.
 * Results per URL are newest first.
 */
export async function findPrMentionsInSlackChannel(input: {
  channel: string;
  urls: string[];
  lookbackDays: number;
  now?: Date;
}): Promise<FindPrMentionsResult> {
  const channelId = await resolveSlackChannelId(input.channel);
  const matchers = input.urls.map((url) => ({ url, regex: buildPrUrlMatcher(url) }));
  const mentionsByUrl = new Map<string, SlackChannelPrMention[]>(input.urls.map((url) => [url, []]));
  const now = input.now ?? new Date();
  const oldest = String((now.getTime() - input.lookbackDays * 86_400_000) / 1000);

  let cursor: string | undefined;
  let pages = 0;
  let scannedMessages = 0;
  let oldestScannedTs: string | null = null;
  let truncated = false;

  do {
    const params = new URLSearchParams({ channel: channelId, oldest, limit: String(HISTORY_PAGE_SIZE) });
    if (cursor) {
      params.set("cursor", cursor);
    }

    const page = await slackGet(
      "conversations.history",
      params,
      conversationsHistorySchema,
      "Falha ao ler o histórico do canal do Slack."
    );
    pages += 1;

    for (const message of page.messages ?? []) {
      scannedMessages += 1;
      oldestScannedTs = message.ts;
      const text = message.text ?? "";
      if (!text) {
        continue;
      }
      for (const { url, regex } of matchers) {
        if (!regex.test(text)) {
          continue;
        }
        mentionsByUrl.get(url)!.push({
          ts: message.ts,
          threadTs: message.thread_ts ?? message.ts,
          postedAt: slackTsToIso(message.ts),
          user: message.user ?? null,
          botId: message.bot_id ?? null,
          replyCount: message.reply_count ?? 0,
          text: text.length > TEXT_PREVIEW_CHARS ? `${text.slice(0, TEXT_PREVIEW_CHARS)}…` : text,
          permalink: null
        });
      }
    }

    cursor = page.has_more ? page.response_metadata?.next_cursor?.trim() || undefined : undefined;
    if (cursor && pages >= MAX_HISTORY_PAGES) {
      truncated = true;
      cursor = undefined;
    }
  } while (cursor);

  for (const mentions of mentionsByUrl.values()) {
    for (const mention of mentions) {
      mention.permalink = await getPermalink(channelId, mention.ts);
    }
  }

  return {
    channelId,
    scannedMessages,
    oldestScannedAt: oldestScannedTs ? slackTsToIso(oldestScannedTs) : null,
    truncated,
    mentionsByUrl
  };
}
