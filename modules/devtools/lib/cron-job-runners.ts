import { syncJiraCache } from "@/modules/jira/lib/jira-sync-service";
import { isValidNotebookDay, todayLocalDateString } from "@/modules/journal/lib/notebook-day";
import type { CronJobId } from "@/modules/devtools/lib/cron-job-definitions";
import type { CronLogSourceId } from "@/modules/observability/lib/log-domain";
import { writeSystemLogFireAndForget } from "@/modules/observability/lib/system-logger";
import { processDuePrReviewReminderSchedules } from "@/modules/prs/lib/pr-review-reminder-schedule-service";
import { syncPrCache } from "@/modules/prs/lib/pr-sync-service";
import { generateAndPersistDashboardBriefing } from "@/modules/dashboard/lib/dashboard-briefing-service";
import {
  generateAndPersistDailySummary,
  generateAndPersistWeeklySummary
} from "@/modules/summaries/lib/summary-generation-service";
import {
  isMonday,
  lastCompletedWeekMonday,
  yesterdayLocalDay
} from "@/modules/summaries/lib/summary-period";
import { processDueRoutines } from "@/modules/routines/lib/process-due-routines";
export type { CronJobId } from "@/modules/devtools/lib/cron-job-definitions";

export type CronRunResult = {
  jobId: CronJobId;
  status: "ok" | "skipped" | "error";
  message: string;
  details?: unknown;
};

type RunContext = {
  manual: boolean;
};

function logStart(source: CronLogSourceId, message: string): void {
  writeSystemLogFireAndForget({
    level: "debug",
    source,
    message
  });
}

function logOutcome(
  source: CronLogSourceId,
  level: "info" | "warn" | "error",
  message: string,
  details?: unknown
): void {
  writeSystemLogFireAndForget({
    level,
    source,
    message,
    details: details ?? null
  });
}

export async function runPrSyncCron(ctx: RunContext): Promise<CronRunResult> {
  const source: CronJobId = "cron:prs-sync";
  const prefix = ctx.manual ? "manual" : "agendada";
  logStart(source, `Iniciando sincronização ${prefix} de PRs.`);

  try {
    const result = await syncPrCache();
    if (result.status === "ok") {
      const message = `Sincronização concluída (${result.prCount} PRs).`;
      logOutcome(source, "info", message);
      return { jobId: source, status: "ok", message, details: result };
    }
    if (result.status === "skipped") {
      const message = result.error ?? "Sincronização ignorada.";
      logOutcome(source, "warn", message);
      return { jobId: source, status: "skipped", message, details: result };
    }
    const message = result.error ?? `Falha na sincronização (${result.status}).`;
    logOutcome(source, "error", message, result);
    return { jobId: source, status: "error", message, details: result };
  } catch (error) {
    const message = "Erro inesperado na sincronização de PRs.";
    logOutcome(source, "error", message, error instanceof Error ? error.message : error);
    return { jobId: source, status: "error", message, details: error };
  }
}

export async function runPrReviewRemindersCron(ctx: RunContext): Promise<CronRunResult> {
  const source: CronJobId = "cron:pr-review-reminders";
  const prefix = ctx.manual ? "manual" : "agendada";
  logStart(source, `Iniciando envio ${prefix} de lembretes de revisão agendados.`);

  try {
    const result = await processDuePrReviewReminderSchedules();
    if (result.processed === 0) {
      const message = "Nenhum lembrete de revisão agendado estava vencido.";
      logOutcome(source, "info", message, result);
      return { jobId: source, status: "ok", message, details: result };
    }

    const message = `Lembretes processados: ${result.processed} (enviados: ${result.sent}, desativados: ${result.disabled}, erros: ${result.errors}).`;
    const level = result.errors > 0 ? "warn" : "info";
    logOutcome(source, level, message, result);
    return {
      jobId: source,
      status: result.errors > 0 && result.sent === 0 && result.disabled === 0 ? "error" : "ok",
      message,
      details: result
    };
  } catch (error) {
    const message = "Erro inesperado ao processar lembretes de revisão agendados.";
    logOutcome(source, "error", message, error instanceof Error ? error.message : error);
    return { jobId: source, status: "error", message, details: error };
  }
}

export async function runJiraSyncCron(ctx: RunContext): Promise<CronRunResult> {
  const source: CronJobId = "cron:jira-sync";
  const prefix = ctx.manual ? "manual" : "agendada";
  logStart(source, `Iniciando sincronização ${prefix} do Jira.`);

  try {
    const result = await syncJiraCache();
    if (result.status === "ok") {
      const message = `Sincronização concluída (${result.issueDetailCount} detalhes, ${result.sprintFilterCount} filtros).`;
      logOutcome(source, "info", message);
      return { jobId: source, status: "ok", message, details: result };
    }
    if (result.status === "skipped") {
      const message = result.error ?? "Sincronização ignorada.";
      logOutcome(source, "warn", message);
      return { jobId: source, status: "skipped", message, details: result };
    }
    const message = result.error ?? `Falha na sincronização (${result.status}).`;
    logOutcome(source, "error", message, result);
    return { jobId: source, status: "error", message, details: result };
  } catch (error) {
    const message = "Erro inesperado na sincronização do Jira.";
    logOutcome(source, "error", message, error instanceof Error ? error.message : error);
    return { jobId: source, status: "error", message, details: error };
  }
}

export async function runSummariesDailyCron(ctx: RunContext): Promise<CronRunResult> {
  const source: CronJobId = "cron:summaries-daily";
  const day = yesterdayLocalDay();

  if (!isValidNotebookDay(day)) {
    const message = `Dia inválido para resumo diário (${day}); job ignorado.`;
    writeSystemLogFireAndForget({ level: "debug", source, message });
    return { jobId: source, status: "skipped", message };
  }

  logStart(
    source,
    ctx.manual
      ? `Execução manual: gerando resumo diário para ${day}.`
      : `Gerando resumo diário para ${day}.`
  );

  const result = await generateAndPersistDailySummary(day, { force: true });
  if (result.status === "ok" || result.status === "skipped") {
    const message = `Resumo diário: ${result.status}.`;
    logOutcome(source, "info", message, result);
    return { jobId: source, status: "ok", message, details: result };
  }

  const message = "Falha no resumo diário.";
  logOutcome(source, "error", message, result);
  return { jobId: source, status: "error", message, details: result };
}

export async function runDashboardBriefingCron(ctx: RunContext): Promise<CronRunResult> {
  const source: CronJobId = "cron:dashboard-briefing";
  const prefix = ctx.manual ? "manual" : "agendada";

  logStart(
    source,
    ctx.manual
      ? `Execução manual: atualizando briefing do dash.`
      : `Atualizando briefing do dash (rotina horária).`
  );

  try {
    const result = await generateAndPersistDashboardBriefing();
    if (result.status === "ok") {
      const message = `Briefing do dash atualizado para ${result.day}.`;
      logOutcome(source, "info", message, result);
      return { jobId: source, status: "ok", message, details: result };
    }
    if (result.status === "no_input") {
      logOutcome(source, "warn", result.message, result);
      return { jobId: source, status: "skipped", message: result.message, details: result };
    }
    const message =
      result.status === "missing_api_key" || result.status === "rate_limited" || result.status === "error"
        ? result.message
        : "Falha no briefing do dash.";
    logOutcome(source, "error", message, result);
    return { jobId: source, status: "error", message, details: result };
  } catch (error) {
    const message = "Erro inesperado no briefing do dash.";
    logOutcome(source, "error", message, error instanceof Error ? error.message : error);
    return { jobId: source, status: "error", message, details: error };
  }
}

export async function runSummariesWeeklyCron(ctx: RunContext): Promise<CronRunResult> {
  const source: CronJobId = "cron:summaries-weekly";
  const today = todayLocalDateString();

  if (!ctx.manual && !isMonday(today)) {
    const message = "Hoje não é segunda; resumo semanal ignorado.";
    writeSystemLogFireAndForget({ level: "debug", source, message });
    return { jobId: source, status: "skipped", message };
  }

  const weekMonday = lastCompletedWeekMonday(today);
  logStart(
    source,
    ctx.manual
      ? `Execução manual: gerando resumo semanal para semana de ${weekMonday}.`
      : `Gerando resumo semanal para semana de ${weekMonday}.`
  );

  const result = await generateAndPersistWeeklySummary(weekMonday);
  if (result.status === "ok" || result.status === "skipped") {
    const message = `Resumo semanal: ${result.status}.`;
    logOutcome(source, "info", message, result);
    return { jobId: source, status: "ok", message, details: result };
  }

  const message = "Falha no resumo semanal.";
  logOutcome(source, "error", message, result);
  return { jobId: source, status: "error", message, details: result };
}

export async function runRoutinesCron(ctx: RunContext): Promise<CronRunResult> {
  const source: CronJobId = "cron:routines";
  const prefix = ctx.manual ? "manual" : "agendada";
  logStart(source, `Iniciando execução ${prefix} de rotinas vencidas.`);

  try {
    const result = await processDueRoutines();
    if (result.started === 0) {
      const message =
        result.skippedRunning > 0
          ? `Nenhuma rotina nova iniciada (${result.skippedRunning} já em execução).`
          : "Nenhuma rotina vencida.";
      logOutcome(source, "info", message, result);
      return { jobId: source, status: "ok", message, details: result };
    }

    const message = `Rotinas: iniciadas ${result.started}, sucesso ${result.succeeded}, falha ${result.failed}, ignoradas em execução ${result.skippedRunning}.`;
    const level = result.failed > 0 ? "warn" : "info";
    logOutcome(source, level, message, result);
    return { jobId: source, status: "ok", message, details: result };
  } catch (error) {
    const message = "Erro inesperado ao processar rotinas.";
    logOutcome(source, "error", message, error instanceof Error ? error.message : error);
    return { jobId: source, status: "error", message, details: error };
  }
}

const RUNNERS: Record<CronJobId, (ctx: RunContext) => Promise<CronRunResult>> = {
  "cron:prs-sync": runPrSyncCron,
  "cron:pr-review-reminders": runPrReviewRemindersCron,
  "cron:jira-sync": runJiraSyncCron,
  "cron:summaries-daily": runSummariesDailyCron,
  "cron:summaries-weekly": runSummariesWeeklyCron,
  "cron:dashboard-briefing": runDashboardBriefingCron,
  "cron:routines": runRoutinesCron
};

export async function runCronJob(jobId: CronJobId, manual: boolean): Promise<CronRunResult> {
  return RUNNERS[jobId]({ manual });
}
