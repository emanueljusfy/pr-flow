/** Slack handle used in the default review-reminder copy. */
export const SLACK_JUSTRACKER_HANDLE = "justracker";

/** JusTracker user group in the Jusfy workspace (`<!subteam^…>`). Override with env. */
export const SLACK_JUSTRACKER_USERGROUP_ID_DEFAULT = "S0CB9UG42D6";

/**
 * Turns plain `@justracker` into a real Slack usergroup mention.
 * Plain `@handle` text does not notify anyone via chat.postMessage.
 */
export function formatSlackUsergroupMentions(
  text: string,
  usergroupId: string | null = getSlackJustrackerUsergroupId()
): string {
  const id = usergroupId?.trim();
  if (!id) {
    return text;
  }

  const handle = SLACK_JUSTRACKER_HANDLE;
  const mention = `<!subteam^${id}|${handle}>`;
  return text.replace(new RegExp(`(^|\\s)@${handle}\\b`, "gi"), `$1${mention}`);
}

export function getSlackJustrackerUsergroupId(): string {
  const fromEnv = process.env.SLACK_JUSTRACKER_USERGROUP_ID?.trim();
  return fromEnv || SLACK_JUSTRACKER_USERGROUP_ID_DEFAULT;
}
