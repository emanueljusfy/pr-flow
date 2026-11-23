import { describe, expect, it } from "vitest";
import { readAiReviewEnvDefaults, resolveAiReviewSettings } from "@/modules/pr-ai-review/lib/env-defaults";

describe("AI review env defaults", () => {
  it("reads nothing when the env is unset", () => {
    expect(readAiReviewEnvDefaults({})).toEqual({ authorLogins: [], repoPattern: "", cwd: null });
  });

  it("parses authors, repo pattern and cwd", () => {
    expect(
      readAiReviewEnvDefaults({
        PR_AI_REVIEW_AUTHORS: " @Cavanus, felipegmotta  cavanus,not/valid",
        PR_AI_REVIEW_REPO_PATTERN: " justracker-* ",
        PR_AI_REVIEW_CWD: " /home/me/jusfy "
      })
    ).toEqual({ authorLogins: ["cavanus", "felipegmotta"], repoPattern: "justracker-*", cwd: "/home/me/jusfy" });
  });

  it("falls back to defaults only for fields left empty", () => {
    const defaults = { authorLogins: ["cavanus"], repoPattern: "justracker-*", cwd: "/srv" };
    expect(resolveAiReviewSettings({ authorLogins: [], repoPattern: "", cwd: null, defaults })).toEqual(defaults);
    expect(
      resolveAiReviewSettings({ authorLogins: ["felipegmotta"], repoPattern: "kor-*", cwd: "/tmp", defaults })
    ).toEqual({ authorLogins: ["felipegmotta"], repoPattern: "kor-*", cwd: "/tmp" });
  });
});
