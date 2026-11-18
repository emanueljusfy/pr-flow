/**
 * Chave de issue Jira (JOR-/FT-): extração, normalização e URLs compartilhadas.
 * Seguro para Client Components. Para sync/cache PR, use `@/modules/jira-issue-key/server`.
 */

export {
  extractJiraIssueKey,
  getJiraAppIssueHref,
  getJiraBrowseUrl,
  linkifyJiraIssueKeysInMarkdown,
  normalizeJiraIssueKey,
  resolvePrTitleHref,
  textContainsJiraIssueKey
} from "@/modules/jira-issue-key/lib/issue-key";

export { extractJiraIssueKeyFromBranch } from "@/modules/jira-issue-key/lib/issue-key-branch";

export { textMentionsIssueKey } from "@/modules/jira-issue-key/lib/issue-key-text";

export type { JiraIssueKeySource } from "@/modules/jira-issue-key/lib/issue-key-sources";

export { collectJiraIssueKeysFromTexts } from "@/modules/jira-issue-key/lib/issue-key-sources";
