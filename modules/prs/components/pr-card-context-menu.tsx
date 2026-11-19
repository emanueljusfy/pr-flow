"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from "@/components/ui/context-menu";
import type { MonitoredPr, PrSlackShareInfo } from "@/modules/prs/lib/domain";
import { buildPrShareMessage } from "@/modules/prs/lib/core/pr-share-message";
import { findOpenPrsByJiraIssueKey } from "@/modules/prs/lib/core/pr-slack-related";
import { PrCardSlackIcon } from "@/modules/prs/components/pr-card-slack-icon";
import { PrSlackReshareDialog } from "@/modules/prs/components/pr-slack-reshare-dialog";
import { PrSlackShareDialog } from "@/modules/prs/components/pr-slack-share-dialog";
import { patchPrSlackShareInMonitorCache } from "@/modules/prs/lib/pr-monitor-cache";
import { SLACK_PR_CHANNEL_DEFAULT } from "@/modules/slack/lib/slack-config";
import { cn } from "@/lib/utils";

interface Props {
  pr: Pick<MonitoredPr, "id" | "title" | "url" | "slackShare" | "repository" | "number">;
  jiraIssueKey: string | null;
  allOpenPrs: MonitoredPr[];
  statusClass: string;
  className?: string;
  children: React.ReactNode;
  slackConfigured?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onSlackShareChange?: (slackShare: PrSlackShareInfo | null) => void;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(target.closest("a, button, input, textarea, select, [role='menuitem'], [data-slot='context-menu-item']"));
}

type ShareState = "idle" | "loading";

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function PrCardContextMenu({
  pr,
  jiraIssueKey,
  allOpenPrs,
  statusClass,
  className,
  children,
  slackConfigured = false,
  selected = false,
  onSelect,
  onSlackShareChange
}: Props) {
  const [shareState, setShareState] = useState<ShareState>("idle");
  const [slackShare, setSlackShare] = useState<PrSlackShareInfo | null>(pr.slackShare ?? null);
  const [confirmReshareOpen, setConfirmReshareOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const message = buildPrShareMessage({ title: pr.title, url: pr.url });

  const relatedPrs = useMemo(() => {
    if (!jiraIssueKey) {
      return [];
    }
    return findOpenPrsByJiraIssueKey(allOpenPrs, jiraIssueKey);
  }, [allOpenPrs, jiraIssueKey]);

  const hasMultipleRelatedPrs = relatedPrs.length > 1;

  useEffect(() => {
    setSlackShare(pr.slackShare ?? null);
  }, [pr.slackShare]);

  const handleCopy = useCallback(async () => {
    try {
      await copyTextToClipboard(message);
      toast.success("Mensagem copiada para a área de transferência");
    } catch {
      toast.error("Não foi possível copiar a mensagem");
    }
  }, [message]);

  const shareToSlack = useCallback(
    async (selectedUrls: string[]) => {
      if (!jiraIssueKey || shareState === "loading" || selectedUrls.length === 0) {
        return;
      }

      setShareState("loading");
      try {
        const response = await fetch("/api/prs/slack-share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: pr.title,
            url: pr.url,
            prId: pr.id,
            selectedPrUrls: selectedUrls,
            prRecords: selectedUrls.map((url) => {
              const related = relatedPrs.find((item) => item.url === url);
              return {
                url,
                prId: related?.id ?? (url === pr.url ? pr.id : undefined)
              };
            })
          })
        });

        const body = (await response.json()) as {
          error?: string;
          slackShare?: PrSlackShareInfo;
          slackShares?: Record<string, PrSlackShareInfo>;
        };

        if (!response.ok) {
          throw new Error(body.error ?? "Não foi possível enviar ao Slack.");
        }

        const nextShare = body.slackShare ?? {
          sharedAt: new Date().toISOString(),
          channel: SLACK_PR_CHANNEL_DEFAULT
        };

        setSlackShare(nextShare);
        onSlackShareChange?.(nextShare);

        if (body.slackShares) {
          patchPrSlackShareInMonitorCache(body.slackShares);
        } else {
          patchPrSlackShareInMonitorCache(pr.url, nextShare);
        }

        setConfirmReshareOpen(false);
        setShareDialogOpen(false);
        toast.success("PR enviada ao canal squad-jornada-pr no Slack");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Não foi possível enviar ao Slack.";
        toast.error(errorMessage);
      } finally {
        setShareState("idle");
      }
    },
    [jiraIssueKey, onSlackShareChange, pr.id, pr.title, pr.url, relatedPrs, shareState]
  );

  const handleShareRequest = useCallback(() => {
    if (!jiraIssueKey || shareState === "loading") {
      return;
    }

    if (hasMultipleRelatedPrs) {
      setShareDialogOpen(true);
      return;
    }

    if (slackShare) {
      setConfirmReshareOpen(true);
      return;
    }

    void shareToSlack([pr.url]);
  }, [hasMultipleRelatedPrs, jiraIssueKey, pr.url, shareState, shareToSlack, slackShare]);

  const slackMenuLabel = slackShare ? "Reenviar ao Slack" : "Enviar ao Slack";

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <article
              aria-selected={selected || undefined}
              className={cn("panel pr-card", statusClass, className, selected && "pr-card--selected")}
              data-selected={selected ? "true" : undefined}
              onClick={(event) => {
                if (!onSelect || isInteractiveTarget(event.target)) {
                  return;
                }
                onSelect();
              }}
              onKeyDown={(event) => {
                if (!onSelect || event.target !== event.currentTarget) {
                  return;
                }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect();
                }
              }}
              tabIndex={onSelect ? 0 : undefined}
            />
          }
        >
          <div className="pr-card-content">{children}</div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {!slackConfigured ? (
            <ContextMenuItem onClick={() => void handleCopy()}>
              <Copy aria-hidden />
              Copiar mensagem da PR
            </ContextMenuItem>
          ) : null}
          <ContextMenuItem
            disabled={!jiraIssueKey || shareState === "loading"}
            onClick={() => void handleShareRequest()}
          >
            {shareState === "loading" ? (
              <Loader2 aria-hidden className="animate-spin" />
            ) : (
              <PrCardSlackIcon className="size-4" />
            )}
            {slackMenuLabel}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <PrSlackShareDialog
        currentPrUrl={pr.url}
        issueKey={jiraIssueKey ?? ""}
        loading={shareState === "loading"}
        onConfirm={(selectedUrls) => void shareToSlack(selectedUrls)}
        onOpenChange={(open) => {
          if (!open && shareState !== "loading") {
            setShareDialogOpen(false);
          }
        }}
        open={shareDialogOpen}
        relatedPrs={relatedPrs}
      />

      <PrSlackReshareDialog
        channel={slackShare?.channel ?? SLACK_PR_CHANNEL_DEFAULT}
        loading={shareState === "loading"}
        onConfirm={() => void shareToSlack([pr.url])}
        onOpenChange={(open) => {
          if (!open && shareState !== "loading") {
            setConfirmReshareOpen(false);
          }
        }}
        open={confirmReshareOpen}
      />
    </>
  );
}
