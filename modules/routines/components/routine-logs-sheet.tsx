"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { ptBR } from "@/modules/messages/pt-BR";
import { RoutineStdoutPreview } from "@/modules/routines/components/routine-stdout-preview";
import { formatRoutineCostUsd } from "@/modules/routines/lib/claude-agent-output";
import type { RoutineDto, RoutineRunDto } from "@/modules/routines/lib/domain";
import { ROUTINE_LOGS_POLL_MS } from "@/modules/routines/lib/routine-run-ui";

const copy = ptBR.routines;

function statusLabel(status: RoutineRunDto["status"]): string {
  if (status === "running") {
    return copy.statusRunning;
  }
  if (status === "succeeded") {
    return copy.statusSucceeded;
  }
  return copy.statusFailed;
}

function costSuffix(costUsd: number | null | undefined): string {
  const formatted = formatRoutineCostUsd(costUsd);
  return formatted ? copy.costSuffix(formatted) : "";
}

type RoutineLogsSheetProps = {
  routine: RoutineDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RoutineLogsSheet({ routine, open, onOpenChange }: RoutineLogsSheetProps) {
  const [runs, setRuns] = useState<RoutineRunDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const selected = runs.find((run) => run.id === selectedId) ?? null;
  const needsPoll =
    open &&
    routine != null &&
    (runs.some((run) => run.status === "running") || selected?.status === "running");

  useEffect(() => {
    if (!open || !routine) {
      return;
    }

    let cancelled = false;

    async function load() {
      if (!routine) {
        return;
      }
      try {
        const response = await fetch(`/api/routines/runs?routineId=${encodeURIComponent(routine.id)}&limit=20`);
        if (!response.ok) {
          throw new Error("load failed");
        }
        const next = (await response.json()) as RoutineRunDto[];
        if (cancelled) {
          return;
        }
        setLoadError(false);
        setRuns(next);
        setSelectedId((current) => {
          if (current && next.some((run) => run.id === current)) {
            return current;
          }
          return next[0]?.id ?? null;
        });
      } catch {
        if (!cancelled) {
          setLoadError(true);
        }
      }
    }

    void load();

    if (!needsPoll) {
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setInterval(() => {
      void load();
    }, ROUTINE_LOGS_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, routine, needsPoll]);

  useEffect(() => {
    if (!open) {
      setRuns([]);
      setSelectedId(null);
      setLoadError(false);
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{routine ? copy.logsSheetTitle(routine.name) : copy.recentRuns}</SheetTitle>
          <SheetDescription>{copy.logsSheetDescription}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 pb-4">
          {loadError ? (
            <p className="text-xs text-destructive">{copy.loadFailed}</p>
          ) : runs.length === 0 ? (
            <p className="text-xs text-[var(--app-text-muted)]">{copy.logsEmpty}</p>
          ) : (
            <>
              <ul className="flex max-h-32 shrink-0 flex-col gap-1 overflow-y-auto" role="listbox" aria-label={copy.recentRuns}>
                {runs.map((run) => {
                  const selectedRun = run.id === selectedId;
                  return (
                    <li key={run.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selectedRun}
                        className={`w-full rounded-md px-2 py-1.5 text-left text-xs ${
                          selectedRun
                            ? "bg-[var(--brand-dim)] text-[var(--app-text)]"
                            : "text-[var(--app-text-muted)] hover:bg-[var(--app-surface-inset)]"
                        }`}
                        onClick={() => setSelectedId(run.id)}
                      >
                        <span className="font-medium text-[var(--app-text)]">{statusLabel(run.status)}</span>
                        {" · "}
                        {new Date(run.startedAt).toLocaleString("pt-BR")}
                        {costSuffix(run.costUsd)}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {selected ? (
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                  <p className="shrink-0 text-xs text-[var(--app-text-muted)]">
                    <span className="font-medium text-[var(--app-text)]">{statusLabel(selected.status)}</span>
                    {selected.reason ? ` · ${selected.reason}` : ""}
                    {" · "}
                    {formatRoutineCostUsd(selected.costUsd) ?? copy.logsCostUnknown}
                  </p>
                  <div className="flex min-h-0 flex-1 flex-col">
                    <h3 className="mb-1 shrink-0 text-xs font-semibold text-[var(--app-text)]">{copy.logsStdoutLabel}</h3>
                    <RoutineStdoutPreview
                      markdown={selected.stdout ?? ""}
                      emptyLabel={copy.logsStdoutEmpty}
                    />
                  </div>
                  <div className="shrink-0">
                    <h3 className="mb-1 text-xs font-semibold text-[var(--app-text)]">{copy.logsStderrLabel}</h3>
                    <pre
                      data-testid="routine-stderr"
                      className="max-h-28 overflow-auto rounded-md border border-[var(--app-border)] bg-[var(--app-surface-inset)] p-2 font-mono text-[11px] whitespace-pre-wrap text-[var(--app-text)]"
                    >
                      {selected.stderr && selected.stderr.length > 0 ? selected.stderr : copy.logsStderrEmpty}
                    </pre>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
