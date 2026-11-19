import { describe, expect, it } from "vitest";
import { getPrHistoryEventVisual } from "@/modules/prs/lib/core/pr-history-visual";

describe("getPrHistoryEventVisual", () => {
  it("maps opened, comment and commit to muted icons", () => {
    expect(getPrHistoryEventVisual({ type: "opened", reviewState: null })).toEqual({
      icon: "git-pull-request",
      tone: "muted"
    });
    expect(getPrHistoryEventVisual({ type: "commented", reviewState: null })).toEqual({
      icon: "message-square",
      tone: "muted"
    });
    expect(getPrHistoryEventVisual({ type: "commit", reviewState: null })).toEqual({
      icon: "git-commit-horizontal",
      tone: "muted"
    });
  });

  it("maps review states to approved / changes / muted", () => {
    expect(
      getPrHistoryEventVisual({ type: "review_submitted", reviewState: "APPROVED" })
    ).toEqual({ icon: "check", tone: "approved" });

    expect(
      getPrHistoryEventVisual({ type: "review_submitted", reviewState: "CHANGES_REQUESTED" })
    ).toEqual({ icon: "alert-circle", tone: "changes" });

    expect(
      getPrHistoryEventVisual({ type: "review_submitted", reviewState: "COMMENTED" })
    ).toEqual({ icon: "message-square", tone: "muted" });
  });

  it("maps merge and close tones", () => {
    expect(getPrHistoryEventVisual({ type: "merged", reviewState: null })).toEqual({
      icon: "git-merge",
      tone: "merged"
    });
    expect(getPrHistoryEventVisual({ type: "closed", reviewState: null })).toEqual({
      icon: "circle-x",
      tone: "changes"
    });
    expect(getPrHistoryEventVisual({ type: "reopened", reviewState: null })).toEqual({
      icon: "rotate-ccw",
      tone: "muted"
    });
  });
});
