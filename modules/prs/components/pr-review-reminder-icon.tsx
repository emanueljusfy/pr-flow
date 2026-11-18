"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  buildPrReviewReminderMessage,
  PR_REVIEW_REMINDER_SCHEDULE_INTERVALS,
  type PrReviewReminderScheduleIntervalMinutes
} from "@/modules/prs/lib/core/pr-review-reminder";
import type { PrReviewReminderScheduleInfo } from "@/modules/prs/lib/domain";
import { ptBR } from "@/modules/messages";

const FREQUENCY_NONE = "none";

type FrequencyValue = typeof FREQUENCY_NONE | `${PrReviewReminderScheduleIntervalMinutes}`;

function intervalLabel(minutes: number): string {
  return ptBR.reviewReminder.frequencyOption(minutes / 60);
}

function toFrequencyValue(
  schedule: PrReviewReminderScheduleInfo | null | undefined
): FrequencyValue {
  if (!schedule) {
    return FREQUENCY_NONE;
  }
  return String(schedule.intervalMinutes) as FrequencyValue;
}

interface Props {
  url: string;
  repository: string;
  number: number;
  hasSlackShare: boolean;
  pendingReviewers: string[];
  schedule?: PrReviewReminderScheduleInfo | null;
  onScheduleChange?: (schedule: PrReviewReminderScheduleInfo | null) => void;
}

export function PrReviewReminderIcon({
  url,
  repository,
  number,
  hasSlackShare,
  pendingReviewers,
  schedule = null,
  onScheduleChange
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState(() => buildPrReviewReminderMessage(pendingReviewers));
  const [frequency, setFrequency] = useState<FrequencyValue>(() => toFrequencyValue(schedule));
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const copy = ptBR.reviewReminder;
  const canPublish = message.trim().length > 0;
  const hasPendingReviewers = pendingReviewers.length > 0;
  const hasActiveSchedule = Boolean(schedule);

  useEffect(() => {
    setFrequency(toFrequencyValue(schedule));
  }, [schedule]);

  function tooltipText(): string {
    if (!hasSlackShare) {
      return copy.notShared;
    }
    if (!hasPendingReviewers) {
      return copy.noPending;
    }
    if (schedule) {
      return copy.tooltipScheduled(intervalLabel(schedule.intervalMinutes));
    }
    return copy.tooltip;
  }

  function openConfirm() {
    if (!hasSlackShare) {
      toast.error(copy.notShared);
      return;
    }
    if (!hasPendingReviewers) {
      toast.error(copy.noPending);
      return;
    }

    setMessage(buildPrReviewReminderMessage(pendingReviewers));
    setFrequency(toFrequencyValue(schedule));
    setConfirmOpen(true);
  }

  async function confirmReminder() {
    if (loading) {
      return;
    }

    const trimmed = message.trim();
    if (!trimmed) {
      toast.error(copy.emptyMessage);
      return;
    }

    const scheduleIntervalMinutes =
      frequency === FREQUENCY_NONE ? undefined : Number(frequency);

    setLoading(true);
    try {
      const response = await fetch("/api/prs/review-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          repository,
          number,
          message: trimmed,
          pendingReviewers,
          ...(scheduleIntervalMinutes != null ? { scheduleIntervalMinutes } : {})
        })
      });
      const body = (await response.json()) as {
        error?: string;
        schedule?: PrReviewReminderScheduleInfo | null;
      };

      if (!response.ok) {
        throw new Error(body.error ?? copy.error);
      }

      if (scheduleIntervalMinutes != null) {
        const nextSchedule = body.schedule ?? null;
        onScheduleChange?.(nextSchedule);
        setConfirmOpen(false);
        if (nextSchedule) {
          toast.success(copy.successScheduled(intervalLabel(nextSchedule.intervalMinutes)));
        } else {
          toast.success(copy.success);
        }
      } else {
        setConfirmOpen(false);
        toast.success(copy.success);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : copy.error;
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function cancelSchedule() {
    if (cancelling) {
      return;
    }

    setCancelling(true);
    try {
      const response = await fetch("/api/prs/review-reminder", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(body.error ?? copy.cancelScheduleError);
      }

      onScheduleChange?.(null);
      setFrequency(FREQUENCY_NONE);
      toast.success(copy.scheduleCancelled);
      setConfirmOpen(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : copy.cancelScheduleError;
      toast.error(errorMessage);
    } finally {
      setCancelling(false);
    }
  }

  const busy = loading || cancelling;

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              aria-label={copy.ariaLabel}
              className={
                hasActiveSchedule
                  ? "pr-alert-icon pr-review-reminder-icon pr-review-reminder-icon--scheduled"
                  : "pr-alert-icon pr-review-reminder-icon"
              }
              onClick={openConfirm}
              type="button"
            >
              <Bell aria-hidden className="impediment-icon-svg" />
            </button>
          }
        />
        <TooltipContent>{tooltipText()}</TooltipContent>
      </Tooltip>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setConfirmOpen(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {copy.confirmDescription(number)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            aria-label={copy.messageLabel}
            className="min-h-24 text-sm"
            disabled={busy}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
            value={message}
          />
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--app-text)]" htmlFor="review-reminder-frequency">
              {copy.frequencyLabel}
            </label>
            <Select
              disabled={busy}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  setFrequency(value as FrequencyValue);
                }
              }}
              value={frequency}
            >
              <SelectTrigger
                aria-label={copy.frequencyLabel}
                className="w-full"
                id="review-reminder-frequency"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FREQUENCY_NONE}>{copy.frequencyNone}</SelectItem>
                {PR_REVIEW_REMINDER_SCHEDULE_INTERVALS.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {intervalLabel(minutes)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            {hasActiveSchedule ? (
              <Button
                disabled={busy}
                onClick={() => {
                  void cancelSchedule();
                }}
                type="button"
                variant="outline"
              >
                {cancelling ? (
                  <>
                    <Loader2 aria-hidden className="size-4 animate-spin" />
                    {copy.cancellingSchedule}
                  </>
                ) : (
                  copy.cancelSchedule
                )}
              </Button>
            ) : null}
            <AlertDialogCancel disabled={busy}>{copy.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !canPublish}
              onClick={(event) => {
                event.preventDefault();
                void confirmReminder();
              }}
            >
              {loading ? (
                <>
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                  {copy.sending}
                </>
              ) : (
                copy.confirm
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
