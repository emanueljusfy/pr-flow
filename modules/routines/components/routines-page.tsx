"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Loader2, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { ptBR } from "@/modules/messages/pt-BR";
import { notifyRoutineRunStarted } from "@/modules/routines/hooks/use-routine-run-notifications";
import { RoutineLogsSheet } from "@/modules/routines/components/routine-logs-sheet";
import {
  PRESET_INTERVAL_MINUTES,
  type RoutineAgentInfo,
  type RoutineDto,
  type RoutineRunDto
} from "@/modules/routines/lib/domain";
import {
  ROUTINE_LOGS_POLL_MS,
  routineHasRunningRun
} from "@/modules/routines/lib/routine-run-ui";

type FieldErrors = Record<string, string>;

const copy = ptBR.routines;

function intervalLabel(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  if (minutes < 1440) {
    return `${minutes / 60} h`;
  }
  return `${minutes / 1440} d`;
}

function runStatusLabel(status: RoutineRunDto["status"]): string {
  if (status === "running") {
    return copy.statusRunning;
  }
  if (status === "succeeded") {
    return copy.statusSucceeded;
  }
  return copy.statusFailed;
}

export function RoutinesPage() {
  const [routines, setRoutines] = useState<RoutineDto[]>([]);
  const [agents, setAgents] = useState<RoutineAgentInfo[]>([]);
  const [runs, setRuns] = useState<RoutineRunDto[]>([]);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [agentId, setAgentId] = useState("claude");
  const [scheduleKind, setScheduleKind] = useState<"preset" | "cron">("preset");
  const [intervalMinutes, setIntervalMinutes] = useState<string>("60");
  const [cronExpr, setCronExpr] = useState("0 9 * * 1-5");
  const [cwd, setCwd] = useState("");
  const [notifySlack, setNotifySlack] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isCreating, setIsCreating] = useState(false);
  const [logsRoutineId, setLogsRoutineId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [routinesRes, agentsRes, runsRes] = await Promise.all([
      fetch("/api/routines"),
      fetch("/api/routines/agents"),
      fetch("/api/routines/runs?limit=20")
    ]);
    if (!routinesRes.ok || !agentsRes.ok || !runsRes.ok) {
      throw new Error(copy.loadFailed);
    }
    setRoutines((await routinesRes.json()) as RoutineDto[]);
    setAgents((await agentsRes.json()) as RoutineAgentInfo[]);
    setRuns((await runsRes.json()) as RoutineRunDto[]);
  }, []);

  useEffect(() => {
    refresh().catch(() => toast.error(copy.loadFailed));
  }, [refresh]);

  const anyRunning = runs.some((run) => run.status === "running");

  useEffect(() => {
    if (!anyRunning) {
      return;
    }
    const timer = window.setInterval(() => {
      void refresh().catch(() => {
        // Ignore transient refresh errors while polling.
      });
    }, ROUTINE_LOGS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [anyRunning, refresh]);

  const logsRoutine = routines.find((routine) => routine.id === logsRoutineId) ?? null;

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setIsCreating(true);
    try {
      const body = {
        name,
        prompt,
        agentId,
        scheduleKind,
        intervalMinutes: scheduleKind === "preset" ? Number(intervalMinutes) : null,
        cronExpr: scheduleKind === "cron" ? cronExpr : null,
        cwd: cwd.trim() ? cwd.trim() : null,
        notifySlack,
        enabled: true
      };
      const response = await fetch("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (response.status === 400) {
        const payload = (await response.json()) as { errors: FieldErrors };
        setFieldErrors(payload.errors ?? {});
        return;
      }
      if (!response.ok) {
        throw new Error(copy.createFailed);
      }
      setName("");
      setPrompt("");
      setCwd("");
      toast.success(copy.createSuccess);
      await refresh();
    } catch {
      toast.error(copy.createFailed);
    } finally {
      setIsCreating(false);
    }
  }

  async function toggleEnabled(routine: RoutineDto) {
    const response = await fetch(`/api/routines/${routine.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !routine.enabled })
    });
    if (!response.ok) {
      toast.error(copy.updateFailed);
      return;
    }
    toast.success(copy.updateSuccess);
    await refresh();
  }

  async function removeRoutine(id: string) {
    const response = await fetch(`/api/routines/${id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error(copy.removeFailed);
      return;
    }
    toast.success(copy.removeSuccess);
    await refresh();
  }

  async function runNow(routine: RoutineDto) {
    const response = await fetch(`/api/routines/${routine.id}/run`, { method: "POST" });
    if (response.status === 409) {
      toast.error(copy.runConflict);
      return;
    }
    if (!response.ok) {
      toast.error(copy.runFailed);
      return;
    }
    const payload = (await response.json()) as { runId?: string };
    if (payload.runId) {
      notifyRoutineRunStarted({
        id: payload.runId,
        routineId: routine.id,
        routineName: routine.name
      });
    } else {
      toast.success(copy.alertStarted(routine.name));
    }
    await refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <Surface className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--app-text)]">{copy.createTitle}</h2>
        <form className="flex flex-col gap-3" onSubmit={handleCreate}>
          <div>
            <label className="mb-1 block text-xs text-[var(--app-text-muted)]">{copy.nameLabel}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
            {fieldErrors.name ? <p className="mt-1 text-xs text-destructive">{fieldErrors.name}</p> : null}
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--app-text-muted)]">{copy.promptLabel}</label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} required />
            {fieldErrors.prompt ? (
              <p className="mt-1 text-xs text-destructive">{fieldErrors.prompt}</p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-[var(--app-text-muted)]">{copy.agentLabel}</label>
              <Select
                value={agentId}
                onValueChange={(value) => {
                  if (value) {
                    setAgentId(value);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.label}
                      {!agent.installed ? ` (${copy.agentNotInstalled})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.agentId ? (
                <p className="mt-1 text-xs text-destructive">{fieldErrors.agentId}</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--app-text-muted)]">
                {copy.scheduleKindLabel}
              </label>
              <Select
                value={scheduleKind}
                onValueChange={(value) => {
                  if (value === "preset" || value === "cron") {
                    setScheduleKind(value);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="preset">{copy.schedulePreset}</SelectItem>
                  <SelectItem value="cron">{copy.scheduleCron}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {scheduleKind === "preset" ? (
            <div>
              <label className="mb-1 block text-xs text-[var(--app-text-muted)]">
                {copy.intervalLabel}
              </label>
              <Select
                value={intervalMinutes}
                onValueChange={(value) => {
                  if (value) {
                    setIntervalMinutes(value);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESET_INTERVAL_MINUTES.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {intervalLabel(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.intervalMinutes ? (
                <p className="mt-1 text-xs text-destructive">{fieldErrors.intervalMinutes}</p>
              ) : null}
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs text-[var(--app-text-muted)]">{copy.cronLabel}</label>
              <Input value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} />
              {fieldErrors.cronExpr ? (
                <p className="mt-1 text-xs text-destructive">{fieldErrors.cronExpr}</p>
              ) : null}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-[var(--app-text-muted)]">{copy.cwdLabel}</label>
            <Input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="/home/you/projetos/app"
            />
            {fieldErrors.cwd ? <p className="mt-1 text-xs text-destructive">{fieldErrors.cwd}</p> : null}
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--app-text)]">
            <input
              type="checkbox"
              checked={notifySlack}
              onChange={(e) => setNotifySlack(e.target.checked)}
            />
            {copy.notifySlackLabel}
          </label>
          <div>
            <Button type="submit" disabled={isCreating}>
              {copy.create}
            </Button>
          </div>
        </form>
      </Surface>

      <div className="flex flex-col gap-3">
        {routines.length === 0 ? (
          <p className="text-sm text-[var(--app-text-muted)]">{copy.empty}</p>
        ) : (
          routines.map((routine) => {
            const isRunning = routineHasRunningRun(runs, routine.id);
            return (
              <Surface key={routine.id} className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-[var(--app-text)]">{routine.name}</h3>
                      {isRunning ? (
                        <span className="rounded-md border border-[var(--brand-border)] bg-[var(--brand-dim)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--brand-bright)]">
                          {copy.runningBadge}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--app-text-muted)]">
                      {routine.prompt}
                    </p>
                    <p className="mt-2 text-xs text-[var(--app-text-muted)]">
                      {routine.agentId} ·{" "}
                      {routine.scheduleKind === "preset"
                        ? intervalLabel(routine.intervalMinutes ?? 0)
                        : routine.cronExpr}{" "}
                      · {copy.nextRun(new Date(routine.nextRunAt).toLocaleString("pt-BR"))}
                      {!routine.enabled ? " · desativada" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={copy.logsAria(routine.name)}
                      onClick={() => setLogsRoutineId(routine.id)}
                    >
                      {isRunning ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden data-testid="logs-spinner" />
                      ) : (
                        <ScrollText className="size-4" aria-hidden />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={isRunning}
                      onClick={() => void runNow(routine)}
                    >
                      {copy.runNow}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void toggleEnabled(routine)}
                    >
                      {routine.enabled ? copy.disable : copy.enable}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => void removeRoutine(routine.id)}
                    >
                      {copy.remove}
                    </Button>
                  </div>
                </div>
              </Surface>
            );
          })
        )}
      </div>

      <Surface className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--app-text)]">{copy.recentRuns}</h2>
        {runs.length === 0 ? (
          <p className="text-xs text-[var(--app-text-muted)]">—</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {runs.map((run) => (
              <li key={run.id} className="text-xs text-[var(--app-text-muted)]">
                <span className="font-medium text-[var(--app-text)]">
                  {run.routineName ?? run.routineId}
                </span>{" "}
                · {runStatusLabel(run.status)}
                {run.reason ? ` (${run.reason})` : ""} ·{" "}
                {new Date(run.startedAt).toLocaleString("pt-BR")}
              </li>
            ))}
          </ul>
        )}
      </Surface>

      <RoutineLogsSheet
        routine={logsRoutine}
        open={logsRoutineId != null}
        onOpenChange={(open) => {
          if (!open) {
            setLogsRoutineId(null);
          }
        }}
      />
    </div>
  );
}
