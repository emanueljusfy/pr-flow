import { buildPrReviewReminderMessage } from "@/modules/prs/lib/core/pr-review-reminder";
import { getPrSlackShareThreadByUrl } from "@/modules/prs/lib/pr-slack-share-repository";
import { SlackApiError, postSlackMessage } from "@/modules/slack/lib/slack-client";
import { SlackConfigError } from "@/modules/slack/lib/slack-config";
import {
  formatSlackGithubUserMentions,
  resolveGithubLoginsToSlackIds
} from "@/modules/slack/lib/slack-github-user-resolve";
import { formatSlackUsergroupMentions } from "@/modules/slack/lib/slack-mention-format";
import { GhUnauthenticatedError } from "@/modules/prs/lib/gh-client";

const REVIEW_REMINDER_SLACK_OPTS = {
  linkNames: true,
  unfurlLinks: false,
  unfurlMedia: false
} as const;

export type PostPrReviewReminderResult =
  | { status: "ok"; body: string; channel: string }
  | { status: "not_shared"; message: string }
  | { status: "no_pending"; message: string }
  | { status: "config"; message: string }
  | { status: "unauthenticated"; message: string }
  | { status: "error"; message: string };

function extractAtLogins(message: string): string[] {
  const matches = message.match(/(^|\s)@([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)/g) ?? [];
  return [
    ...new Set(
      matches
        .map((match) => match.trim().replace(/^@/, ""))
        .filter((login) => login.toLowerCase() !== "justracker")
    )
  ];
}

export async function postPrReviewReminder(input: {
  url: string;
  repository: string;
  number: number;
  message?: string;
  pendingReviewers?: string[];
}): Promise<PostPrReviewReminderResult> {
  const pendingReviewers = [
    ...new Set((input.pendingReviewers ?? []).map((login) => login.trim()).filter(Boolean))
  ];

  const body = input.message?.trim() || buildPrReviewReminderMessage(pendingReviewers);
  if (!body) {
    return {
      status: "error",
      message: "Mensagem de lembrete de revisão não configurada."
    };
  }

  if (pendingReviewers.length === 0 && !input.message?.trim()) {
    return {
      status: "no_pending",
      message: "Ninguém está pendente de revisão nesta PR."
    };
  }

  const share = await getPrSlackShareThreadByUrl(input.url);
  if (!share) {
    return {
      status: "not_shared",
      message: "Envie a PR ao Slack antes de publicar o lembrete na thread."
    };
  }

  try {
    const loginsToResolve = [...new Set([...pendingReviewers, ...extractAtLogins(body)])];
    const loginToSlackId = await resolveGithubLoginsToSlackIds(loginsToResolve);
    const text = formatSlackUsergroupMentions(formatSlackGithubUserMentions(body, loginToSlackId));

    await postSlackMessage({
      channel: share.channel,
      text,
      threadTs: share.threadTs,
      ...REVIEW_REMINDER_SLACK_OPTS
    });
    return { status: "ok", body: text, channel: share.channel };
  } catch (error) {
    if (error instanceof SlackConfigError) {
      return { status: "config", message: error.message };
    }
    if (error instanceof GhUnauthenticatedError) {
      return { status: "unauthenticated", message: error.message };
    }
    if (error instanceof SlackApiError) {
      return { status: "error", message: error.message };
    }
    throw error;
  }
}
