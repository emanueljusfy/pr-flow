import type { PrHistoryEvent } from "@/modules/prs/lib/domain";

export type PrHistoryEventIcon =
  | "git-pull-request"
  | "message-square"
  | "git-commit-horizontal"
  | "check"
  | "alert-circle"
  | "git-merge"
  | "circle-x"
  | "rotate-ccw";

export type PrHistoryEventTone = "muted" | "approved" | "changes" | "merged";

export type PrHistoryEventVisual = {
  icon: PrHistoryEventIcon;
  tone: PrHistoryEventTone;
};

/** Maps a history event to timeline marker icon + semantic tone (no React). */
export function getPrHistoryEventVisual(event: Pick<PrHistoryEvent, "type" | "reviewState">): PrHistoryEventVisual {
  switch (event.type) {
    case "opened":
      return { icon: "git-pull-request", tone: "muted" };
    case "commented":
      return { icon: "message-square", tone: "muted" };
    case "commit":
      return { icon: "git-commit-horizontal", tone: "muted" };
    case "merged":
      return { icon: "git-merge", tone: "merged" };
    case "closed":
      return { icon: "circle-x", tone: "changes" };
    case "reopened":
      return { icon: "rotate-ccw", tone: "muted" };
    case "review_submitted": {
      const state = (event.reviewState ?? "").toUpperCase();
      if (state === "APPROVED") {
        return { icon: "check", tone: "approved" };
      }
      if (state === "CHANGES_REQUESTED") {
        return { icon: "alert-circle", tone: "changes" };
      }
      return { icon: "message-square", tone: "muted" };
    }
    default:
      return { icon: "git-pull-request", tone: "muted" };
  }
}
