import type { MonitoredPr } from "@/modules/prs/lib/domain";

export type ReviewerDisplayStatus = "approved" | "changes_requested" | "dismissed" | "commented" | "pending";

export type ReviewerListEntry = {
  login: string;
  status: ReviewerDisplayStatus;
};

type ReviewerListInput = Pick<
  MonitoredPr,
  "aprovou" | "solicitouAlteracoes" | "pendente" | "naoAvaliou" | "avaliou" | "dismissed"
>;

/**
 * Single GitHub-style reviewer list: one row per person with their latest decision.
 * Blocking states first (changes requested, lost approval, then pending), then decisions.
 */
export function buildReviewerList(pr: ReviewerListInput): ReviewerListEntry[] {
  const entries: ReviewerListEntry[] = [];
  const seen = new Set<string>();

  const push = (login: string, status: ReviewerDisplayStatus) => {
    if (seen.has(login)) {
      return;
    }
    seen.add(login);
    entries.push({ login, status });
  };

  for (const login of pr.solicitouAlteracoes ?? []) {
    push(login, "changes_requested");
  }
  for (const login of pr.dismissed ?? []) {
    push(login, "dismissed");
  }
  for (const login of pr.pendente ?? pr.naoAvaliou ?? []) {
    push(login, "pending");
  }
  for (const login of pr.aprovou ?? []) {
    push(login, "approved");
  }
  for (const login of pr.avaliou ?? []) {
    push(login, "commented");
  }

  return entries;
}
