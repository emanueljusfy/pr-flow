import type { AiReviewPr } from "@/modules/pr-ai-review/lib/domain";

export const AI_REVIEW_REQUIRED_PLACEHOLDER = "{{pr_url}}";

export const DEFAULT_AI_REVIEW_PROMPT_TEMPLATE = `Usando a skill the-judge, revise a PR {{pr_url}} ({{repository}}#{{number}} — "{{title}}", autor @{{author}}, head {{head_sha}}).

- Se a PR só altera markdown/docs/.context sem código de app, não poste review: responda "Pulada: só docs".
- Fluxo the-judge completo, mas enxuto: TL;DR curto, no máximo 3 achados, sem research externo salvo se for necessário para um 🔴/🟠.
- Publique com post_review.py (não só relate no chat).
- Veredito: 🔴 → REQUEST_CHANGES; zero 🔴 e zero 🟠 → APPROVE; senão → COMMENT.
- Idioma pt-BR; tokens APPROVE/COMMENT/REQUEST_CHANGES em inglês.
- Resposta final: uma linha com o evento postado e a URL da review (ou o motivo do pulo). Sem ensaio longo.`;

export function hasRequiredPlaceholder(template: string): boolean {
  return template.includes(AI_REVIEW_REQUIRED_PLACEHOLDER);
}

/** Replaces every `{{placeholder}}` with the PR value; unknown placeholders stay as written. */
export function renderAiReviewPrompt(template: string, pr: AiReviewPr): string {
  const values: Record<string, string> = {
    pr_url: pr.url,
    repository: pr.repository,
    number: String(pr.number),
    title: pr.title,
    author: pr.authorLogin,
    head_sha: pr.headSha
  };
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  );
}
