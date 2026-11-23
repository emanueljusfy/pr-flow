import { describe, expect, it } from "vitest";
import { selectAiReviewCandidates } from "@/modules/pr-ai-review/lib/candidates";
import type { ReviewerQueuePr } from "@/modules/prs/lib/domain";

function pr(overrides: Partial<ReviewerQueuePr> & { number: number }): ReviewerQueuePr {
  return {
    id: `id-${overrides.number}`,
    title: `PR ${overrides.number}`,
    url: `https://github.com/${overrides.repository ?? "jusfy/justracker-thanos"}/pull/${overrides.number}`,
    repository: "jusfy/justracker-thanos",
    myReviewStatus: "pending",
    authorLogin: "cavanus",
    isDraft: false,
    headSha: "abc",
    ...overrides
  };
}

const urls = (prs: ReviewerQueuePr[]) => prs.map((item) => item.number);

describe("selectAiReviewCandidates", () => {
  it("filters by repo pattern and author", () => {
    const queue = [
      pr({ number: 1, repository: "jusfy/justracker-thanos" }),
      pr({ number: 2, repository: "jusfy/jusfy-backend" }),
      pr({ number: 3, repository: "jusfy/justracker-stats-ui", authorLogin: "Cavanus" }),
      pr({ number: 4, authorLogin: "someone-else" }),
      pr({ number: 5, myReviewStatus: "dismissed" })
    ];
    const filter = { authorLogins: ["cavanus"], repoPattern: "justracker-*" };
    expect(urls(selectAiReviewCandidates(queue, filter, []))).toEqual([1, 3, 5]);

    // Empty pattern admits any repo (author filter still applies).
    expect(urls(selectAiReviewCandidates(queue, { authorLogins: ["cavanus"], repoPattern: "" }, []))).toEqual([
      1, 2, 3, 5
    ]);
    // Empty author list admits any author (repo filter still applies).
    expect(urls(selectAiReviewCandidates(queue, { authorLogins: [], repoPattern: "justracker-*" }, []))).toEqual([
      1, 3, 4, 5
    ]);
    // Several globs separated by comma; author list with a leading @.
    expect(
      urls(
        selectAiReviewCandidates(queue, { authorLogins: ["@CAVANUS"], repoPattern: "jusfy-backend, justracker-stats-*" }, [])
      )
    ).toEqual([2, 3]);
  });

  it("skips drafts", () => {
    const queue = [pr({ number: 1, isDraft: true }), pr({ number: 2 })];
    expect(urls(selectAiReviewCandidates(queue, { authorLogins: [], repoPattern: "" }, []))).toEqual([2]);
  });

  it("skips head sha already reviewed", () => {
    const queue = [
      pr({ number: 1, headSha: "abc" }),
      pr({ number: 2, headSha: "def" }),
      pr({ number: 3, headSha: "abc" })
    ];
    const reviewed = [
      { prUrl: queue[0].url, headSha: "abc" },
      // PR 2 got a verdict on its previous head; the new head is reviewed again.
      { prUrl: queue[1].url, headSha: "abc" }
    ];
    // PR 3 had a run on "abc" without a verdict: listReviewedHeads does not return it, so it is a candidate.
    expect(urls(selectAiReviewCandidates(queue, { authorLogins: [], repoPattern: "" }, reviewed))).toEqual([2, 3]);
  });

  it("skips reviewed status", () => {
    const queue = [pr({ number: 1, myReviewStatus: "reviewed" }), pr({ number: 2, myReviewStatus: "pending" })];
    expect(urls(selectAiReviewCandidates(queue, { authorLogins: [], repoPattern: "" }, []))).toEqual([2]);
  });
});
