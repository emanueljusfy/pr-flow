"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ptBR } from "@/modules/messages/pt-BR";
import type { ReviewerListEntry } from "@/modules/prs/lib/core/reviewer-list";
import { REVIEWER_STATUS_PIN_CLASS } from "@/modules/prs/components/reviewer-list-item";

interface Props {
  reviewers: ReviewerListEntry[];
}

/** Compact reviewer summary: one status pin per reviewer, details on hover. */
export function ReviewerPinStrip({ reviewers }: Props) {
  const copy = ptBR.prReviewers;

  if (reviewers.length === 0) {
    return <span className="small muted">{copy.empty}</span>;
  }

  return (
    <ul aria-label={ptBR.prViewMode.reviewersAriaLabel} className="reviewer-pin-strip">
      {reviewers.map((reviewer) => (
        <li key={reviewer.login}>
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  aria-label={copy.statusAriaLabel[reviewer.status](reviewer.login)}
                  className="reviewer-pin-strip__item"
                  role="img"
                  tabIndex={0}
                />
              }
            >
              <span aria-hidden className={`reviewer-status-pin ${REVIEWER_STATUS_PIN_CLASS[reviewer.status]}`} />
            </TooltipTrigger>
            <TooltipContent>
              {reviewer.login} · {copy.status[reviewer.status]}
            </TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}
