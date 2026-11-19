"use client";

import { ExternalLink } from "lucide-react";
import type { JiraIssueDto } from "@/modules/jira/lib/domain";
import { jiraStatusCardClass, jiraStatusPillClass } from "@/modules/jira/lib/jira-issue-status";
import { JiraBranchContextMenu } from "@/modules/jira-branch/components/jira-branch-context-menu";
import { cn } from "@/lib/utils";

interface Props {
  issue: JiraIssueDto;
  updatedLabel: string;
}

export function JiraIssueCard({ issue, updatedLabel }: Props) {
  const statusClass = jiraStatusCardClass(issue.statusCategoryKey);

  return (
    <JiraBranchContextMenu
      issueKey={issue.key}
      issueTypeName={issue.issueTypeName}
      summary={issue.summary}
    >
      <article className={cn("jira-issue-card panel", statusClass)}>
        <a
          className="jira-issue-card__main"
          href={issue.browseUrl}
          rel="noopener noreferrer"
          target="_blank"
          aria-label={`Abrir ${issue.key} no Jira: ${issue.summary}`}
        >
          <header className="jira-issue-card__header">
            <p className="jira-task-dialog__key">
              <span className="jira-task-dialog__key-dot" aria-hidden />
              {issue.key}
            </p>
            <span className={cn("jira-issue-card__status", jiraStatusPillClass(issue.statusCategoryKey))}>
              {issue.statusName}
            </span>
          </header>

          <h3 className="jira-issue-card__summary">{issue.summary}</h3>

          <div className="jira-issue-card__meta">
            <span className="jira-issue-card__chip">{issue.issueTypeName}</span>
            {issue.priorityName ? (
              <span className="jira-issue-card__chip jira-issue-card__chip--muted">{issue.priorityName}</span>
            ) : null}
            <span className="jira-issue-card__updated">Atualizado {updatedLabel}</span>
          </div>
        </a>

        <a
          href={issue.browseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="jira-issue-card__external"
          aria-label={`Abrir ${issue.key} no Jira`}
          onClick={(event) => event.stopPropagation()}
        >
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </article>
    </JiraBranchContextMenu>
  );
}
