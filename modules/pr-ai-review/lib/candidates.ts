import type { ReviewerQueuePr } from "@/modules/prs/lib/domain";

export type CandidateFilter = {
  authorLogins: string[];
  repoPattern: string;
};

export type ReviewedHead = { prUrl: string; headSha: string };

function repoName(repository: string): string {
  const slash = repository.lastIndexOf("/");
  return (slash === -1 ? repository : repository.slice(slash + 1)).toLowerCase();
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .trim()
    .toLowerCase()
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export function parseRepoPatterns(repoPattern: string): string[] {
  return repoPattern
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Empty pattern admits any repository. Globs match the repo name without owner. */
export function matchesRepoPattern(repository: string, repoPattern: string): boolean {
  const patterns = parseRepoPatterns(repoPattern);
  if (patterns.length === 0) {
    return true;
  }
  const name = repoName(repository);
  return patterns.some((pattern) => globToRegExp(pattern).test(name));
}

/** Empty list admits any author. Comparison ignores case and a leading `@`. */
export function matchesAuthor(authorLogin: string | undefined, authorLogins: string[]): boolean {
  const allowed = authorLogins.map((login) => login.trim().replace(/^@/, "").toLowerCase()).filter(Boolean);
  if (allowed.length === 0) {
    return true;
  }
  if (!authorLogin) {
    return false;
  }
  return allowed.includes(authorLogin.toLowerCase());
}

function headKey(prUrl: string, headSha: string): string {
  return `${prUrl.toLowerCase()}@${headSha}`;
}

/**
 * Queue PRs the cycle reviews: still owed a review (pending or dismissed), not draft,
 * inside the author/repo filter, and without an AI verdict on the current head.
 */
export function selectAiReviewCandidates(
  queue: ReviewerQueuePr[],
  filter: CandidateFilter,
  reviewedHeads: ReviewedHead[]
): ReviewerQueuePr[] {
  const reviewed = new Set(reviewedHeads.map((head) => headKey(head.prUrl, head.headSha)));
  return queue.filter((pr) => {
    if (pr.myReviewStatus !== "pending" && pr.myReviewStatus !== "dismissed") {
      return false;
    }
    if (pr.isDraft) {
      return false;
    }
    if (!matchesRepoPattern(pr.repository, filter.repoPattern)) {
      return false;
    }
    if (!matchesAuthor(pr.authorLogin, filter.authorLogins)) {
      return false;
    }
    if (pr.headSha && reviewed.has(headKey(pr.url, pr.headSha))) {
      return false;
    }
    return true;
  });
}
