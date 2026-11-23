import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_REVIEW_PROMPT_TEMPLATE,
  hasRequiredPlaceholder,
  renderAiReviewPrompt
} from "@/modules/pr-ai-review/lib/prompt-template";

const pr = {
  url: "https://github.com/jusfy/justracker-thanos/pull/699",
  repository: "jusfy/justracker-thanos",
  number: 699,
  title: "fix: limpa S3",
  authorLogin: "felipegmotta",
  headSha: "fe69f81"
};

describe("renderAiReviewPrompt", () => {
  it("renders every placeholder", () => {
    const template =
      "url={{pr_url}} repo={{repository}} n={{number}} t={{title}} a={{author}} sha={{head_sha}} again={{pr_url}} keep={{other}}";
    expect(renderAiReviewPrompt(template, pr)).toBe(
      "url=https://github.com/jusfy/justracker-thanos/pull/699 repo=jusfy/justracker-thanos n=699 t=fix: limpa S3 a=felipegmotta sha=fe69f81 again=https://github.com/jusfy/justracker-thanos/pull/699 keep={{other}}"
    );
  });

  it("default template is per PR and carries the required placeholder", () => {
    expect(hasRequiredPlaceholder(DEFAULT_AI_REVIEW_PROMPT_TEMPLATE)).toBe(true);
    const rendered = renderAiReviewPrompt(DEFAULT_AI_REVIEW_PROMPT_TEMPLATE, pr);
    expect(rendered).toContain(pr.url);
    expect(rendered).toContain("post_review.py");
    expect(rendered).not.toMatch(/\{\{(pr_url|repository|number|title|author|head_sha)\}\}/);
  });
});
