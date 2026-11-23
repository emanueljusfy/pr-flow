import { CRON_JOB_SCHEDULE_SPECS } from "@/modules/cron-scheduling/lib/schedules";
import { CRON_LOG_SOURCES, type CronLogSourceId } from "@/modules/observability/lib/log-domain";

export type CronJobId = CronLogSourceId;

export type CronJobDefinition = {
  id: CronJobId;
  label: string;
  schedule: string;
  description: string;
  /** Variável de ambiente que desliga o agendamento automático quando `1` */
  disableEnvVar?: string;
};

const DISABLE_ENV_BY_ID = new Map(
  CRON_JOB_SCHEDULE_SPECS.map((spec) => [spec.id, spec.disableEnvVar] as const)
);

const META: Record<CronJobId, Pick<CronJobDefinition, "schedule" | "description">> = {
  "cron:prs-sync": {
    schedule: "A cada 10 minutos",
    description: "Sincroniza pull requests monitoradas com o GitHub e atualiza o cache local."
  },
  "cron:pr-review-reminders": {
    schedule: "A cada 5 minutos",
    description:
      "Publica lembretes de revisão agendados na thread Slack da PR. Desativa o agendamento quando não há revisores pendentes ou a PR sai do monitor."
  },
  "cron:jira-sync": {
    schedule: "A cada 10 minutos",
    description:
      "Sincroniza issues atribuídas, detalhes e sprints do Jira; complementa chaves vindas do cache de PRs."
  },
  "cron:dashboard-briefing": {
    schedule: "A cada hora (fuso SUMMARY_CRON_TZ)",
    description:
      "Atualiza o briefing do dashboard: entregas do último dia útil por ticket, projeção para hoje e motivação."
  },
  "cron:pr-ai-review": {
    schedule: "A cada 1 minuto (ciclo no intervalo configurado)",
    description:
      "Revisor IA: revisa com agente local as PRs da fila Para revisar que passam no filtro e reage no anúncio da PR no canal. Desligue com DISABLE_PR_AI_REVIEW_CRON=1."
  }
};

export const CRON_JOB_DEFINITIONS: CronJobDefinition[] = CRON_LOG_SOURCES.map((item) => ({
  id: item.id,
  label: item.label,
  ...META[item.id],
  disableEnvVar: DISABLE_ENV_BY_ID.get(item.id)
}));

const JOB_IDS = new Set(CRON_JOB_DEFINITIONS.map((job) => job.id));

export function isCronJobId(value: string): value is CronJobId {
  return JOB_IDS.has(value as CronJobId);
}
