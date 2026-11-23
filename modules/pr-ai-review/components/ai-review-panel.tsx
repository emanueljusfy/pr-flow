"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR as dateLocale } from "date-fns/locale";
import { Bot, Loader2, Play, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import { ptBR } from "@/modules/messages/pt-BR";
import { hasRunningAiReviewRun, lastCycleSummary } from "@/modules/pr-ai-review/lib/ai-review-ui";
import {
  AI_REVIEW_INTERVAL_PRESETS,
  type AiReviewAgentInfo,
  type PrAiReviewConfigDto,
  type PrAiReviewRunDto
} from "@/modules/pr-ai-review/lib/domain";
import { DEFAULT_AI_REVIEW_PROMPT_TEMPLATE } from "@/modules/pr-ai-review/lib/prompt-template";

const copy = ptBR.aiReview;

/** Edited values in full text color; env defaults show as the muted placeholder. */
const FIELD_INPUT_CLASS = "mt-1 text-[var(--app-text)] placeholder:text-[var(--app-text-muted)]";

type ConfigPatch = Partial<{
  enabled: boolean;
  intervalMinutes: number;
  agentId: string;
  cwd: string | null;
  authorLogins: string[];
  repoPattern: string;
  promptTemplate: string | null;
}>;

function formatWhen(iso: string): string {
  try {
    return format(new Date(iso), "d MMM, HH:mm", { locale: dateLocale });
  } catch {
    return iso;
  }
}

function parseLogins(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((login) => login.trim())
    .filter(Boolean);
}

type AiReviewPanelProps = {
  runs: PrAiReviewRunDto[];
  onRunStarted: () => void;
};

export function AiReviewPanel({ runs, onRunStarted }: AiReviewPanelProps) {
  const [config, setConfig] = useState<PrAiReviewConfigDto | null>(null);
  const [agents, setAgents] = useState<AiReviewAgentInfo[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [authorsText, setAuthorsText] = useState("");
  const [repoPattern, setRepoPattern] = useState("");
  const [cwd, setCwd] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const applyConfig = useCallback((next: PrAiReviewConfigDto) => {
    setConfig(next);
    setAuthorsText(next.authorLogins.join(", "));
    setRepoPattern(next.repoPattern);
    setCwd(next.cwd ?? "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [configRes, agentsRes] = await Promise.all([
          fetch("/api/prs/ai-review/config", { cache: "no-store" }),
          fetch("/api/prs/ai-review/agents", { cache: "no-store" })
        ]);
        if (!configRes.ok) {
          throw new Error("config");
        }
        const nextConfig = (await configRes.json()) as PrAiReviewConfigDto;
        const nextAgents = agentsRes.ok ? ((await agentsRes.json()) as AiReviewAgentInfo[]) : [];
        if (!cancelled) {
          applyConfig(nextConfig);
          setAgents(nextAgents);
        }
      } catch {
        if (!cancelled) {
          setLoadFailed(true);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [applyConfig]);

  /** Saves a patch; returns the pt-BR error when the server refuses it. */
  const save = useCallback(
    async (patch: ConfigPatch): Promise<string | null> => {
      try {
        const response = await fetch("/api/prs/ai-review/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch)
        });
        const body = (await response.json()) as PrAiReviewConfigDto | { error?: string };
        if (!response.ok) {
          const message = ("error" in body && body.error) || copy.configFailed;
          toast.error(message);
          return message;
        }
        applyConfig(body as PrAiReviewConfigDto);
        toast.success(copy.configSaved);
        return null;
      } catch {
        toast.error(copy.configFailed);
        return copy.configFailed;
      }
    },
    [applyConfig]
  );

  const running = hasRunningAiReviewRun(runs);
  const lastCycle = lastCycleSummary(runs);

  async function runNow() {
    setStarting(true);
    try {
      const response = await fetch("/api/prs/ai-review/run", { method: "POST" });
      const body = (await response.json()) as { prUrls?: string[]; error?: string };
      if (!response.ok) {
        toast.error(body.error ?? copy.runFailed);
        return;
      }
      const count = body.prUrls?.length ?? 0;
      if (count === 0) {
        toast(copy.nothingToReview);
        return;
      }
      toast(copy.cycleStarted(count));
      onRunStarted();
    } catch {
      toast.error(copy.runFailed);
    } finally {
      setStarting(false);
    }
  }

  async function savePrompt() {
    const error = await save({ promptTemplate: promptDraft });
    setPromptError(error);
    if (!error) {
      setPromptOpen(false);
    }
  }

  if (loadFailed) {
    return (
      <Surface className="p-4" role="region" aria-label={copy.panelTitle}>
        <p className="text-xs text-destructive">{copy.loadFailed}</p>
      </Surface>
    );
  }

  return (
    <Surface className="flex flex-col gap-4 p-4" role="region" aria-label={copy.panelTitle}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--app-text)]">
            <Bot className="size-4 text-[var(--brand)]" aria-hidden />
            {copy.panelTitle}
          </h2>
          <p className="text-xs text-[var(--app-text-muted)]">{copy.panelDescription}</p>
          <p className="text-xs text-[var(--app-text-muted)]" data-testid="ai-review-last-run">
            {lastCycle ? copy.lastRun(formatWhen(lastCycle.startedAt), lastCycle.count) : copy.noRunsYet}
            {config?.enabled ? ` · ${copy.nextRun(formatWhen(config.nextRunAt))}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!config}
            onClick={() => {
              setPromptDraft(config?.promptTemplate ?? DEFAULT_AI_REVIEW_PROMPT_TEMPLATE);
              setPromptError(null);
              setPromptOpen(true);
            }}
          >
            <ScrollText className="size-4" aria-hidden />
            {copy.editPrompt}
          </Button>
          <Button type="button" size="sm" disabled={!config || running || starting} onClick={() => void runNow()}>
            {running || starting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Play className="size-4" aria-hidden />
            )}
            {copy.runNow}
          </Button>
        </div>
      </div>

      {config ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center gap-2 text-xs text-[var(--app-text)]">
            <Checkbox
              checked={config.enabled}
              onCheckedChange={(checked) => void save({ enabled: checked === true })}
              aria-labelledby="ai-review-enabled-label"
            />
            <span id="ai-review-enabled-label">{copy.enabledLabel}</span>
          </div>
          <div>
            <span className="mb-1 block text-xs text-[var(--app-text-muted)]" id="ai-review-interval-label">
              {copy.intervalLabel}
            </span>
            <Select
              value={String(config.intervalMinutes)}
              onValueChange={(value) => {
                if (value) {
                  void save({ intervalMinutes: Number(value) });
                }
              }}
            >
              <SelectTrigger aria-labelledby="ai-review-interval-label">
                <SelectValue>{copy.intervalOption(config.intervalMinutes)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {AI_REVIEW_INTERVAL_PRESETS.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {copy.intervalOption(minutes)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <span className="mb-1 block text-xs text-[var(--app-text-muted)]" id="ai-review-agent-label">
              {copy.agentLabel}
            </span>
            <Select
              value={config.agentId}
              onValueChange={(value) => {
                if (value) {
                  void save({ agentId: value });
                }
              }}
            >
              <SelectTrigger aria-labelledby="ai-review-agent-label">
                <SelectValue>{agents.find((agent) => agent.id === config.agentId)?.label ?? config.agentId}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id} disabled={!agent.installed}>
                    {agent.label}
                    {!agent.installed ? ` (${copy.agentNotInstalled})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="block text-xs text-[var(--app-text-muted)]">
            {copy.authorsLabel}
            <Input
              className={FIELD_INPUT_CLASS}
              value={authorsText}
              placeholder={config.defaults.authorLogins.join(", ") || copy.authorsPlaceholder}
              onChange={(event) => setAuthorsText(event.target.value)}
              onBlur={() => {
                const next = parseLogins(authorsText);
                if (next.join(",") !== config.authorLogins.join(",")) {
                  void save({ authorLogins: next });
                }
              }}
            />
          </label>
          <label className="block text-xs text-[var(--app-text-muted)]">
            {copy.repoPatternLabel}
            <Input
              className={FIELD_INPUT_CLASS}
              value={repoPattern}
              placeholder={config.defaults.repoPattern || copy.repoPatternPlaceholder}
              onChange={(event) => setRepoPattern(event.target.value)}
              onBlur={() => {
                if (repoPattern.trim() !== config.repoPattern) {
                  void save({ repoPattern: repoPattern.trim() });
                }
              }}
            />
          </label>
          <label className="block text-xs text-[var(--app-text-muted)]">
            {copy.cwdLabel}
            <Input
              className={FIELD_INPUT_CLASS}
              value={cwd}
              placeholder={config.defaults.cwd ?? copy.cwdPlaceholder}
              onChange={(event) => setCwd(event.target.value)}
              onBlur={() => {
                const next = cwd.trim() || null;
                if (next !== config.cwd) {
                  void save({ cwd: next });
                }
              }}
            />
          </label>
        </div>
      ) : null}

      <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{copy.promptDialogTitle}</DialogTitle>
            <DialogDescription>{copy.promptDialogDescription}</DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label={copy.promptDialogTitle}
            className="min-h-64 font-mono text-xs"
            value={promptDraft}
            onChange={(event) => setPromptDraft(event.target.value)}
          />
          {promptError ? (
            <p className="text-xs text-destructive" role="alert">
              {promptError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPromptDraft(DEFAULT_AI_REVIEW_PROMPT_TEMPLATE)}>
              {copy.promptResetDefault}
            </Button>
            <Button type="button" variant="outline" onClick={() => setPromptOpen(false)}>
              {copy.cancel}
            </Button>
            <Button type="button" onClick={() => void savePrompt()}>
              {copy.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Surface>
  );
}
