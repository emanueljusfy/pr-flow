import { describe, expect, it } from "vitest";
import {
  DEFAULT_PR_REVIEW_REMINDER_DIGEST_INTRO,
  buildPrReviewReminderDigest
} from "@/modules/prs/lib/core/pr-review-reminder-digest";
import { buildPrUrlMatcher } from "@/modules/slack/lib/slack-channel-history";

describe("buildPrReviewReminderDigest", () => {
  it("lists every PR with its pending reviewers in one message", () => {
    const text = buildPrReviewReminderDigest([
      {
        url: "https://github.com/acme/api/pull/754",
        repository: "acme/api",
        number: 754,
        title: "FT-1 <fix> & tidy",
        pendingReviewers: ["jairo", "felipe"],
        dismissedReviewers: ["felipe"]
      },
      {
        url: "https://github.com/acme/web/pull/12",
        repository: "acme/web",
        number: 12,
        title: "FT-2 page",
        pendingReviewers: ["ana"]
      }
    ]);

    expect(text.split("\n")).toEqual([
      DEFAULT_PR_REVIEW_REMINDER_DIGEST_INTRO,
      "",
      "• <https://github.com/acme/api/pull/754|api#754> FT-1 &lt;fix&gt; &amp; tidy — @jairo e @felipe (aprovação caiu com push novo: felipe)",
      "• <https://github.com/acme/web/pull/12|web#12> FT-2 page — @ana"
    ]);
  });

  it("uses a custom intro when given", () => {
    const text = buildPrReviewReminderDigest(
      [{ url: "https://github.com/a/b/pull/1", repository: "a/b", number: 1, title: "t", pendingReviewers: ["x"] }],
      "Bom dia!"
    );
    expect(text.startsWith("Bom dia!\n")).toBe(true);
  });
});

describe("buildPrUrlMatcher", () => {
  it("matches the PR link inside Slack markup but not a longer PR number", () => {
    const matcher = buildPrUrlMatcher("https://github.com/acme/api/pull/75/");
    expect(matcher.test("PR: <https://github.com/acme/api/pull/75|api#75>")).toBe(true);
    expect(matcher.test("<https://github.com/Acme/API/pull/75/files>")).toBe(true);
    expect(matcher.test("<https://github.com/acme/api/pull/754>")).toBe(false);
  });
});
