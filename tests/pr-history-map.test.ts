import { describe, expect, it } from "vitest";
import { mapPullRequestHistory } from "@/modules/prs/lib/core/pr-history-map";
import { formatPrHistoryEventSummary } from "@/modules/prs/lib/core/pr-history-labels";

describe("mapPullRequestHistory", () => {
  it("maps opened, comment, review, commit and merge with newest first", () => {
    const events = mapPullRequestHistory({
      id: "PR_1",
      number: 7,
      url: "https://github.com/acme/a/pull/7",
      createdAt: "2026-05-28T10:00:00Z",
      author: { login: "rigon" },
      timelineItems: {
        nodes: [
          {
            __typename: "IssueComment",
            id: "IC_1",
            createdAt: "2026-05-28T11:00:00Z",
            url: "https://github.com/acme/a/pull/7#issuecomment-1",
            body: "parece bom",
            author: { login: "coelho" }
          },
          {
            __typename: "PullRequestCommit",
            commit: {
              oid: "abc123",
              committedDate: "2026-05-28T12:00:00Z",
              messageHeadline: "fix: simplify retries",
              url: "https://github.com/acme/a/commit/abc123",
              author: { user: { login: "rigon" } }
            }
          },
          {
            __typename: "PullRequestReview",
            id: "PRR_1",
            createdAt: "2026-05-28T13:00:00Z",
            url: "https://github.com/acme/a/pull/7#pullrequestreview-1",
            state: "APPROVED",
            body: "lgtm",
            author: { login: "ana" }
          },
          {
            __typename: "MergedEvent",
            id: "ME_1",
            createdAt: "2026-05-28T14:00:00Z",
            url: "https://github.com/acme/a/pull/7#event-1",
            actor: { login: "rigon" }
          }
        ]
      }
    });

    expect(events.map((event) => event.type)).toEqual([
      "merged",
      "review_submitted",
      "commit",
      "commented",
      "opened"
    ]);
    expect(events[0]).toMatchObject({
      type: "merged",
      actorLogin: "rigon"
    });
    expect(events[1]).toMatchObject({
      reviewState: "APPROVED",
      actorLogin: "ana"
    });
    expect(events[2]).toMatchObject({
      type: "commit",
      detail: "fix: simplify retries",
      actorLogin: "rigon"
    });
    expect(events[3]).toMatchObject({
      actorLogin: "coelho",
      detail: "parece bom",
      url: "https://github.com/acme/a/pull/7#issuecomment-1"
    });
    expect(events[4]).toMatchObject({
      type: "opened",
      actorLogin: "rigon",
      url: "https://github.com/acme/a/pull/7"
    });
  });

  it("keeps line breaks in comment bodies so markdown survives", () => {
    const events = mapPullRequestHistory({
      id: "PR_3",
      createdAt: "2026-05-28T10:00:00Z",
      author: { login: "rigon" },
      timelineItems: {
        nodes: [
          {
            __typename: "IssueComment",
            id: "IC_md",
            createdAt: "2026-05-28T11:30:00Z",
            body: "  **Title**\r\n\r\n- item one\r\n- item two  ",
            author: { login: "coelho" }
          }
        ]
      }
    });

    expect(events[0]?.detail).toBe("**Title**\n\n- item one\n- item two");
  });

  it("skips pending reviews and preserves long details", () => {
    const longBody = "x".repeat(200);
    const events = mapPullRequestHistory({
      id: "PR_2",
      createdAt: "2026-05-28T10:00:00Z",
      author: { login: "rigon" },
      timelineItems: {
        nodes: [
          {
            __typename: "PullRequestReview",
            id: "PRR_pending",
            createdAt: "2026-05-28T11:00:00Z",
            state: "PENDING",
            author: { login: "ana" }
          },
          {
            __typename: "IssueComment",
            id: "IC_long",
            createdAt: "2026-05-28T11:30:00Z",
            body: longBody,
            author: { login: "coelho" }
          }
        ]
      }
    });

    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe("commented");
    expect(events[0]?.detail).toBe(longBody);
    expect(events[1]?.type).toBe("opened");
  });
});

describe("formatPrHistoryEventSummary", () => {
  it("formats review states in pt-BR", () => {
    expect(
      formatPrHistoryEventSummary({
        id: "1",
        type: "review_submitted",
        occurredAt: "2026-05-28T13:00:00Z",
        actorLogin: "ana",
        url: null,
        detail: null,
        reviewState: "CHANGES_REQUESTED"
      })
    ).toBe("ana pediu alterações");

    expect(
      formatPrHistoryEventSummary({
        id: "2",
        type: "commented",
        occurredAt: "2026-05-28T11:00:00Z",
        actorLogin: "coelho",
        url: null,
        detail: null,
        reviewState: null
      })
    ).toBe("coelho comentou");
  });
});
