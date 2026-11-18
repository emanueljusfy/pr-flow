/** Extrai JOR-/FT- de nomes de branch (ex.: feat/jor-123/descricao, fix/ft-3380/x). */
const BRANCH_JIRA_SEGMENT_PATTERN = /(?:^|\/)((?:jor|ft)-\d+)(?:\/|$)/i;

export function extractJiraIssueKeyFromBranch(branch: string): string | null {
  const match = branch.trim().match(BRANCH_JIRA_SEGMENT_PATTERN);
  if (!match) {
    return null;
  }
  return match[1].toUpperCase();
}
