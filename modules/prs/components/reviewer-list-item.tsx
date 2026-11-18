import { ptBR } from "@/modules/messages/pt-BR";
import type { ReviewerDisplayStatus } from "@/modules/prs/lib/core/reviewer-list";

interface Props {
  login: string;
  status: ReviewerDisplayStatus;
}

const STATUS_PIN_CLASS: Record<ReviewerDisplayStatus, string> = {
  approved: "reviewer-status-pin--approved",
  changes_requested: "reviewer-status-pin--changes-requested",
  commented: "reviewer-status-pin--commented",
  pending: "reviewer-status-pin--pending"
};

export function ReviewerListItem({ login, status }: Props) {
  const copy = ptBR.prReviewers;
  return (
    <li aria-label={copy.statusAriaLabel[status](login)} className="reviewer-row">
      <span aria-hidden className={`reviewer-status-pin ${STATUS_PIN_CLASS[status]}`} />
      <span className="reviewer-login">{login}</span>
      <span className="reviewer-status-label">{copy.status[status]}</span>
    </li>
  );
}
