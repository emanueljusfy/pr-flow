"use client";

import { useEffect, useState } from "react";
import type {
  MonitoredPr,
  PrReviewReminderScheduleInfo,
  PrSlackShareInfo
} from "@/modules/prs/lib/domain";
import { ptBR } from "@/modules/messages/pt-BR";
import { PrAlertIcons } from "@/modules/prs/components/pr-alert-icons";
import { PrCardContextMenu } from "@/modules/prs/components/pr-card-context-menu";
import { PrCardSlackSharedBadge } from "@/modules/prs/components/pr-card-slack-shared-badge";
import { PrOpenDuration } from "@/modules/prs/components/pr-open-duration";
import { PrReviewReminderIcon } from "@/modules/prs/components/pr-review-reminder-icon";
import { ReviewerListItem } from "@/modules/prs/components/reviewer-list-item";
import { ReviewerPinStrip } from "@/modules/prs/components/reviewer-pin-strip";
import { usePrCardViewModel } from "@/modules/prs/lib/hooks/use-pr-card-view-model";

interface Props {
  pr: MonitoredPr;
  allOpenPrs?: MonitoredPr[];
  slackConfigured?: boolean;
  /** `compact` renders a single dense row (list view of /prs). */
  variant?: "card" | "compact";
  selected?: boolean;
  onSelect?: () => void;
}

export function PrCard({
  pr,
  allOpenPrs = [],
  slackConfigured = false,
  variant = "card",
  selected = false,
  onSelect
}: Props) {
  const vm = usePrCardViewModel(pr);
  const [slackShare, setSlackShare] = useState<PrSlackShareInfo | null>(pr.slackShare ?? null);
  const [reviewReminderSchedule, setReviewReminderSchedule] =
    useState<PrReviewReminderScheduleInfo | null>(pr.reviewReminderSchedule ?? null);

  useEffect(() => {
    setSlackShare(pr.slackShare ?? null);
  }, [pr.slackShare]);

  useEffect(() => {
    setReviewReminderSchedule(pr.reviewReminderSchedule ?? null);
  }, [pr.reviewReminderSchedule]);

  const statusIcons = (
    <>
      {slackShare ? <PrCardSlackSharedBadge slackShare={slackShare} /> : null}
      <PrReviewReminderIcon
        hasSlackShare={Boolean(slackShare)}
        number={pr.number}
        onScheduleChange={setReviewReminderSchedule}
        pendingReviewers={vm.pendente}
        repository={pr.repository}
        schedule={reviewReminderSchedule}
        url={pr.url}
      />
      <PrAlertIcons impediments={vm.impediments} />
      {vm.shouldShowStatusPill && <span className={`status-pill ${vm.statusClass}`}>{vm.statusLabel}</span>}
    </>
  );

  const titleLink = (
    <a
      aria-label="Abrir titulo da PR no GitHub"
      className="pr-link"
      href={vm.githubPrUrl}
      rel="noreferrer"
      target="_blank"
    >
      {pr.title}{" "}
      <span className="small muted">({pr.repository})</span>
    </a>
  );

  const prNumberBadge = (
    <a
      aria-label={`Abrir PR #${pr.number} no GitHub`}
      className="badge badge-link"
      href={vm.githubPrUrl}
      rel="noreferrer"
      target="_blank"
    >
      PR #{pr.number}
    </a>
  );

  const contextMenuProps = {
    allOpenPrs,
    jiraIssueKey: vm.jiraIssueKey,
    onSelect,
    onSlackShareChange: setSlackShare,
    pr: { ...pr, slackShare },
    selected,
    slackConfigured,
    statusClass: vm.statusClass
  };

  if (variant === "compact") {
    return (
      <PrCardContextMenu {...contextMenuProps} className="pr-card--compact">
        <div className="pr-compact-row">
          <div className="pr-compact-row__id">
            {prNumberBadge}
            <PrOpenDuration createdAt={pr.createdAt} />
          </div>
          <div className="pr-compact-row__title">{titleLink}</div>
          <div className="pr-compact-row__reviewers">
            {vm.statusGeral === "no_reviewers" ? (
              <span className="small muted">{ptBR.prViewMode.noReviewers}</span>
            ) : (
              <ReviewerPinStrip reviewers={vm.reviewers} />
            )}
          </div>
          <div className="pr-meta-right pr-compact-row__status">{statusIcons}</div>
        </div>
      </PrCardContextMenu>
    );
  }

  return (
    <PrCardContextMenu {...contextMenuProps}>
      <header className="pr-header">
        <div className="pr-title-row">
          <div className="pr-meta">
            {prNumberBadge}
            <PrOpenDuration createdAt={pr.createdAt} />
          </div>
          <div className="pr-meta-right">{statusIcons}</div>
        </div>
        {titleLink}
      </header>

      {vm.statusGeral === "no_reviewers" ? (
        <div className="no-reviewers-row">
          <span className="empty-dot">N</span>
          <p className="small muted">0 reviewers solicitados</p>
        </div>
      ) : (
        <section className="pr-reviewer-group">
          <h4>{ptBR.prReviewers.sectionTitle}</h4>
          {vm.reviewers.length > 0 ? (
            <ul className="reviewer-list">
              {vm.reviewers.map((reviewer) => (
                <ReviewerListItem key={reviewer.login} login={reviewer.login} status={reviewer.status} />
              ))}
            </ul>
          ) : (
            <p className="small muted">{ptBR.prReviewers.empty}</p>
          )}
        </section>
      )}

    </PrCardContextMenu>
  );
}
