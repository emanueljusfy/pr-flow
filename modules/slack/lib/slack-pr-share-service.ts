import { getGithubLogin } from "@/modules/app/lib/github-login-repository";
import { resolveSlackPrShareFromTitle } from "@/modules/prs/lib/core/pr-slack-share";
import { getSlackPrChannel } from "@/modules/slack/lib/slack-config";
import { postSlackMessage } from "@/modules/slack/lib/slack-client";
import {
  formatSlackGithubUserMentions,
  resolveGithubLoginsToSlackIds
} from "@/modules/slack/lib/slack-github-user-resolve";

export class SlackPrShareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlackPrShareError";
  }
}

/** Sem preview de Jira/GitHub — só texto e links clicáveis. */
const PR_SHARE_SLACK_OPTS = { linkNames: true, unfurlLinks: false, unfurlMedia: false } as const;

export async function sharePrToSlackChannel(input: {
  title: string;
  selectedPrUrls: string[];
  authorLogin?: string | null;
}): Promise<{ channel: string; threadTs: string }> {
  const authorLogin = input.authorLogin?.trim() || (await getGithubLogin());
  const payload = resolveSlackPrShareFromTitle({
    title: input.title,
    prUrls: input.selectedPrUrls,
    authorLogin
  });
  if (!payload) {
    throw new SlackPrShareError(
      "A PR precisa de uma chave Jira (JOR-/FT-xxx) no título para enviar ao Slack."
    );
  }

  let threadText = payload.threadText;
  if (authorLogin) {
    const loginToSlackId = await resolveGithubLoginsToSlackIds([authorLogin]);
    threadText = formatSlackGithubUserMentions(threadText, loginToSlackId);
  }

  const channel = getSlackPrChannel();
  const parent = await postSlackMessage({
    channel,
    text: payload.channelText,
    ...PR_SHARE_SLACK_OPTS
  });

  if (!parent.ts) {
    throw new SlackPrShareError("Slack não retornou o identificador da mensagem.");
  }

  await postSlackMessage({
    channel,
    text: threadText,
    threadTs: parent.ts,
    ...PR_SHARE_SLACK_OPTS
  });

  return { channel, threadTs: parent.ts };
}
