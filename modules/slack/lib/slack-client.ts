import { getSlackBotTokenOrThrow } from "@/modules/slack/lib/slack-config";
import {
  slackPostMessageResponseSchema,
  type SlackPostMessageResponse
} from "@/modules/slack/lib/slack-api-validation";

const SLACK_API_BASE = "https://slack.com/api";

export class SlackApiError extends Error {
  constructor(
    message: string,
    readonly slackError?: string
  ) {
    super(message);
    this.name = "SlackApiError";
  }
}

export async function postSlackMessage(input: {
  channel: string;
  text: string;
  threadTs?: string;
  /**
   * When true, Slack turns `@usergroup` handles into real mentions.
   * Needed for review reminders that include `@justracker`.
   */
  linkNames?: boolean;
  /** Evita cards de preview (Jira, GitHub, etc.) no Slack. Padrão: false. */
  unfurlLinks?: boolean;
  unfurlMedia?: boolean;
}): Promise<SlackPostMessageResponse> {
  const token = getSlackBotTokenOrThrow();

  const body: Record<string, string | boolean> = {
    channel: input.channel,
    text: input.text,
    unfurl_links: input.unfurlLinks ?? false,
    unfurl_media: input.unfurlMedia ?? false
  };
  if (input.linkNames) {
    body.link_names = true;
  }
  if (input.threadTs) {
    body.thread_ts = input.threadTs;
  }

  const response = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new SlackApiError(`Slack API retornou HTTP ${response.status}.`);
  }

  const json: unknown = await response.json();
  const parsed = slackPostMessageResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new SlackApiError("Resposta inválida da API do Slack.");
  }

  if (!parsed.data.ok) {
    throw new SlackApiError(formatSlackApiError(parsed.data.error), parsed.data.error);
  }

  return parsed.data;
}

/**
 * Adds an emoji reaction to a message. `channel` must be a channel ID.
 * Returns false when the bot had already reacted with that emoji.
 */
export async function addSlackReaction(input: {
  channel: string;
  timestamp: string;
  name: string;
}): Promise<boolean> {
  const token = getSlackBotTokenOrThrow();

  const response = await fetch(`${SLACK_API_BASE}/reactions.add`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new SlackApiError(`Slack API retornou HTTP ${response.status}.`);
  }

  const parsed = slackPostMessageResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new SlackApiError("Resposta inválida da API do Slack.");
  }

  if (!parsed.data.ok) {
    if (parsed.data.error === "already_reacted") {
      return false;
    }
    if (parsed.data.error === "missing_scope") {
      throw new SlackApiError(
        "O token do Slack não tem permissão reactions:write. Adicione o escopo e reinstale o app.",
        parsed.data.error
      );
    }
    throw new SlackApiError(formatSlackApiError(parsed.data.error), parsed.data.error);
  }

  return true;
}

function formatSlackApiError(code?: string): string {
  switch (code) {
    case "not_in_channel":
    case "channel_not_found":
      return "O bot não tem acesso ao canal do Slack. Convide o bot para o canal squad-jornada-pr.";
    case "missing_scope":
      return "O token do Slack não tem permissão chat:write. Verifique os escopos do app.";
    case "invalid_auth":
    case "token_revoked":
      return "Token do Slack inválido ou revogado. Verifique SLACK_BOT_OAUTH_TOKEN.";
    default:
      return code ? `Slack: ${code}` : "Falha ao enviar mensagem no Slack.";
  }
}
