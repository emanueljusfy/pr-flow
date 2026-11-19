import { ptBR } from "@/modules/messages/pt-BR";
import type { PrHistoryEvent } from "@/modules/prs/lib/domain";

const copy = ptBR.prHistory;

export function formatPrHistoryEventSummary(event: PrHistoryEvent): string {
  switch (event.type) {
    case "opened":
      return copy.opened(event.actorLogin);
    case "commented":
      return copy.commented(event.actorLogin);
    case "commit":
      return copy.commit(event.actorLogin);
    case "merged":
      return copy.merged(event.actorLogin);
    case "closed":
      return copy.closed(event.actorLogin);
    case "reopened":
      return copy.reopened(event.actorLogin);
    case "review_submitted": {
      const state = (event.reviewState ?? "").toUpperCase();
      if (state === "APPROVED") {
        return copy.reviewApproved(event.actorLogin);
      }
      if (state === "CHANGES_REQUESTED") {
        return copy.reviewChanges(event.actorLogin);
      }
      if (state === "COMMENTED") {
        return copy.reviewCommented(event.actorLogin);
      }
      return copy.reviewSubmitted(event.actorLogin);
    }
    default:
      return event.actorLogin;
  }
}
