import { describe, expect, it } from "vitest";
import { pickAiReviewVerdict } from "@/modules/pr-ai-review/lib/verdict";

const at = (time: string) => `2026-11-23T${time}:00.000Z`;
const review = (login: string, state: string, time: string, url = `https://r/${state}-${time}`) => ({
  login,
  state,
  submittedAt: at(time),
  url
});

describe("pickAiReviewVerdict", () => {
  it("picks latest own review since run start", () => {
    const since = new Date(at("10:00"));

    // APPROVED at 10:05 after a run started at 10:00 -> APPROVE with its URL.
    expect(pickAiReviewVerdict([review("emanueljusfy", "APPROVED", "10:05")], "emanueljusfy", since)).toEqual({
      verdict: "APPROVE",
      reviewUrl: "https://r/APPROVED-10:05"
    });

    // Only an older review -> no verdict.
    expect(pickAiReviewVerdict([review("emanueljusfy", "APPROVED", "09:55")], "emanueljusfy", since)).toBeNull();

    // COMMENTED 10:03 then APPROVED 10:07 -> the latest wins.
    expect(
      pickAiReviewVerdict(
        [review("emanueljusfy", "COMMENTED", "10:03"), review("emanueljusfy", "APPROVED", "10:07")],
        "emanueljusfy",
        since
      )?.verdict
    ).toBe("APPROVE");

    // Order in the list does not matter.
    expect(
      pickAiReviewVerdict(
        [review("emanueljusfy", "APPROVED", "10:07"), review("emanueljusfy", "COMMENTED", "10:03")],
        "emanueljusfy",
        since
      )?.verdict
    ).toBe("APPROVE");

    // Each state maps to its verdict.
    expect(pickAiReviewVerdict([review("emanueljusfy", "COMMENTED", "10:01")], "emanueljusfy", since)?.verdict).toBe(
      "COMMENT"
    );
    expect(
      pickAiReviewVerdict([review("emanueljusfy", "CHANGES_REQUESTED", "10:01")], "emanueljusfy", since)?.verdict
    ).toBe("REQUEST_CHANGES");

    // Exactly at the start counts; login comparison ignores case.
    expect(pickAiReviewVerdict([review("EmanuelJusfy", "APPROVED", "10:00")], "emanueljusfy", since)?.verdict).toBe(
      "APPROVE"
    );

    // Another user's review, or a dismissed/pending state, gives no verdict.
    expect(pickAiReviewVerdict([review("cavanus", "APPROVED", "10:05")], "emanueljusfy", since)).toBeNull();
    expect(pickAiReviewVerdict([review("emanueljusfy", "DISMISSED", "10:05")], "emanueljusfy", since)).toBeNull();
    expect(pickAiReviewVerdict([review("emanueljusfy", "PENDING", "10:05")], "emanueljusfy", since)).toBeNull();
  });
});
