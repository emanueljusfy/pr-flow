import type { MonitoredPr, MonitoredPrRaw, PrReview } from "@/modules/prs/lib/domain";
import {
  buildExcludedReviewLogins,
  filterExcludedLogins,
  isExcludedFromReviewCalculation
} from "@/modules/prs/lib/core/excluded-reviewers";
import { getPrStatus } from "@/modules/prs/lib/core/pr-status";
import { isReadyToMerge } from "@/modules/prs/lib/core/ready-to-merge";
import { buildSolicitedReviewerSet } from "@/modules/prs/lib/core/solicited-reviewers";

const VALID_REVIEW_STATES = new Set(["COMMENTED", "APPROVED", "CHANGES_REQUESTED"]);

function getLatestReviewPerLogin(reviews: PrReview[]): Map<string, PrReview> {
  const sortedReviews = [...reviews].sort((a, b) => {
    const left = Date.parse(a.submittedAt);
    const right = Date.parse(b.submittedAt);
    return left - right;
  });

  const latestByLogin = new Map<string, PrReview>();
  for (const review of sortedReviews) {
    latestByLogin.set(review.login, review);
  }

  return latestByLogin;
}

const DECISION_REVIEW_STATES = new Set(["APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);

/**
 * Logins whose latest decision (approve / request changes) was dismissed, e.g. by a new push
 * with "dismiss stale approvals". COMMENTED reviews (thread replies) do not restore a decision,
 * so they are ignored here. GitHub does not put these people back in reviewRequests.
 */
function getDismissedReviewers(reviews: PrReview[]): Set<string> {
  const latestDecision = getLatestReviewPerLogin(reviews.filter((review) => DECISION_REVIEW_STATES.has(review.state)));
  return new Set(
    Array.from(latestDecision.entries())
      .filter(([, review]) => review.state === "DISMISSED")
      .map(([login]) => login)
  );
}

function withoutExcludedReviews(reviews: PrReview[], excluded: Set<string>): PrReview[] {
  return reviews.filter((review) => !isExcludedFromReviewCalculation(review.login, excluded));
}

export function aggregateReviewerStatus(pr: MonitoredPrRaw): MonitoredPr {
  const excluded = buildExcludedReviewLogins(pr.authorLogin);
  const reviews = withoutExcludedReviews(pr.reviews, excluded);
  const latestByLogin = getLatestReviewPerLogin(reviews);
  const dismissedSet = getDismissedReviewers(reviews);
  const pendingRequests = filterExcludedLogins(pr.requestedReviewers, excluded);
  const solicitedSet = buildSolicitedReviewerSet(pendingRequests, latestByLogin, excluded);
  for (const login of dismissedSet) {
    solicitedSet.add(login);
  }
  const avaliou = Array.from(latestByLogin.entries())
    .filter(([, review]) => VALID_REVIEW_STATES.has(review.state))
    .map(([login]) => login);
  const naoAvaliou: string[] = [];
  const aprovou: string[] = [];
  const solicitouAlteracoes: string[] = [];
  const pendente: string[] = [];
  const dismissed: string[] = [];

  for (const login of solicitedSet) {
    if (dismissedSet.has(login)) {
      dismissed.push(login);
      naoAvaliou.push(login);
      pendente.push(login);
      continue;
    }
    const review = latestByLogin.get(login);
    if (review && VALID_REVIEW_STATES.has(review.state)) {
      if (review.state === "APPROVED") {
        aprovou.push(login);
      } else if (review.state === "CHANGES_REQUESTED") {
        solicitouAlteracoes.push(login);
      }
      continue;
    }
    naoAvaliou.push(login);
    pendente.push(login);
  }

  const semReviewersSolicitados = pendingRequests.length === 0;
  const hasConflicts = Boolean(pr.hasConflicts);
  const hasUnresolvedComments = Boolean(pr.hasUnresolvedComments);
  const readyToMerge = isReadyToMerge({
    requestedReviewersCount: solicitedSet.size,
    pendingReviewersCount: pendente.length,
    requestedChangesCount: solicitouAlteracoes.length,
    hasConflicts,
    hasUnresolvedComments
  });
  const statusGeral = getPrStatus({
    readyToMerge,
    semReviewersSolicitados,
    requestedChangesCount: solicitouAlteracoes.length,
    pendingReviewersCount: pendente.length,
    requestedReviewersCount: solicitedSet.size
  });

  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    repository: pr.repository,
    createdAt: pr.createdAt,
    ...(pr.baseRefName ? { baseRefName: pr.baseRefName } : {}),
    ...(pr.headRefName ? { headRefName: pr.headRefName } : {}),
    avaliou,
    naoAvaliou,
    semReviewersSolicitados,
    aprovou,
    solicitouAlteracoes,
    pendente,
    dismissed,
    requestedReviewersCount: solicitedSet.size,
    statusGeral,
    readyToMerge,
    hasConflicts,
    hasUnresolvedComments
  };
}
