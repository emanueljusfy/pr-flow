import { afterEach, describe, expect, it, vi } from "vitest";

const runAiReviewCronTick = vi.fn(async () => ({ status: "disabled" as const }));
vi.mock("@/modules/pr-ai-review/lib/review-service", () => ({
  runAiReviewCronTick: () => runAiReviewCronTick()
}));
import {
  getScheduledCronJob,
  isCronJobDisabled,
  registerScheduledCrons,
  resetCronSchedulingForTests,
  type CronJobSchedule,
  type CronScheduler
} from "@/modules/cron-scheduling";

/** Partial env for tests; production code receives the full `process.env`. */
function env(vars: Record<string, string> = {}): NodeJS.ProcessEnv {
  return vars as NodeJS.ProcessEnv;
}

describe("cron-scheduling", () => {
  afterEach(() => {
    resetCronSchedulingForTests();
    vi.unstubAllEnvs();
  });

  describe("isCronJobDisabled", () => {
    it("retorna true quando a variável de desabilitação do job está em 1", () => {
      const job = getScheduledCronJob("cron:prs-sync");
      expect(isCronJobDisabled(job, env({ DISABLE_PR_SYNC_CRON: "1" }))).toBe(true);
      expect(isCronJobDisabled(job, env({ DISABLE_PR_SYNC_CRON: "0" }))).toBe(false);
    });

    it("desliga o briefing do dash apenas com DISABLE_DASHBOARD_BRIEFING_CRON", () => {
      const briefing = getScheduledCronJob("cron:dashboard-briefing");

      expect(isCronJobDisabled(briefing, env({ DISABLE_DASHBOARD_BRIEFING_CRON: "1" }))).toBe(true);
      expect(isCronJobDisabled(briefing, env({}))).toBe(false);
    });

    it("desliga lembretes de revisão com DISABLE_PR_REVIEW_REMINDER_CRON", () => {
      const reminders = getScheduledCronJob("cron:pr-review-reminders");

      expect(isCronJobDisabled(reminders, env({ DISABLE_PR_REVIEW_REMINDER_CRON: "1" }))).toBe(true);
      expect(isCronJobDisabled(reminders, env({}))).toBe(false);
      expect(reminders.expression).toBe("*/5 * * * *");
    });
  });

  describe("registerScheduledCrons", () => {
    function fakeScheduler(): CronScheduler & { calls: Array<{ expression: string; timezone?: string }> } {
      const calls: Array<{ expression: string; timezone?: string }> = [];
      return {
        calls,
        schedule(expression, _callback, options) {
          calls.push({ expression, timezone: options?.timezone });
        }
      };
    }

    const sampleJob = (overrides?: Partial<CronJobSchedule>): CronJobSchedule => ({
      id: "cron:prs-sync",
      expression: "*/10 * * * *",
      disableEnvVar: "DISABLE_PR_SYNC_CRON",
      run: vi.fn(),
      ...overrides
    });

    it("agenda jobs habilitados no scheduler injetado", () => {
      const scheduler = fakeScheduler();
      const job = sampleJob();

      registerScheduledCrons([job], { scheduler, env: env() });

      expect(scheduler.calls).toEqual([{ expression: "*/10 * * * *", timezone: undefined }]);
    });

    it("ignora jobs desabilitados e notifica via callback", () => {
      const scheduler = fakeScheduler();
      const onDisabled = vi.fn();
      const job = sampleJob();

      registerScheduledCrons([job], {
        scheduler,
        env: env({ DISABLE_PR_SYNC_CRON: "1" }),
        onDisabled
      });

      expect(scheduler.calls).toEqual([]);
      expect(onDisabled).toHaveBeenCalledWith(job);
    });

    it("executa runOnStart antes de agendar quando o job está habilitado", () => {
      const scheduler = fakeScheduler();
      const run = vi.fn();
      const job = sampleJob({ runOnStart: true, run });

      registerScheduledCrons([job], { scheduler, env: env() });

      expect(run).toHaveBeenCalledOnce();
      expect(scheduler.calls).toHaveLength(1);
    });

    it("aplica SUMMARY_CRON_TZ nos jobs com useSummaryTimezone", () => {
      const scheduler = fakeScheduler();
      const job: CronJobSchedule = {
        id: "cron:dashboard-briefing",
        expression: "0 * * * *",
        disableEnvVar: "DISABLE_DASHBOARD_BRIEFING_CRON",
        useSummaryTimezone: true,
        run: vi.fn()
      };

      registerScheduledCrons([job], {
        scheduler,
        env: env({ SUMMARY_CRON_TZ: "Europe/Lisbon" })
      });

      expect(scheduler.calls[0]?.timezone).toBe("Europe/Lisbon");
    });
  });

  describe("startAllCrons", () => {
    it("registra jobs apenas uma vez", async () => {
      const registerModule = await import("@/modules/cron-scheduling/lib/register-scheduled-crons");
      const startModule = await import("@/modules/cron-scheduling/lib/start-all-crons");
      const registerSpy = vi.spyOn(registerModule, "registerScheduledCrons").mockImplementation(() => {});

      startModule.resetCronSchedulingStateForTests();
      startModule.startAllCrons();
      startModule.startAllCrons();

      expect(registerSpy).toHaveBeenCalledOnce();
      registerSpy.mockRestore();
      startModule.resetCronSchedulingStateForTests();
    });
  });

  describe("pr ai review cron", () => {
    it("registers pr ai review cron", async () => {
      const spec = getScheduledCronJob("cron:pr-ai-review");
      expect(spec.expression).toBe("*/1 * * * *");
      expect(isCronJobDisabled(spec, env({ DISABLE_PR_AI_REVIEW_CRON: "1" }))).toBe(true);
      expect(isCronJobDisabled(spec, env({}))).toBe(false);

      const { buildScheduledCronJobs } = await import("@/modules/cron-scheduling/lib/build-runtime-jobs");
      const job = buildScheduledCronJobs().find((item) => item.id === "cron:pr-ai-review");
      expect(job).toBeDefined();
      job!.run();
      await vi.waitFor(() => expect(runAiReviewCronTick).toHaveBeenCalledTimes(1));

      const { runCronJob } = await import("@/modules/devtools/lib/cron-job-runners");
      const result = await runCronJob("cron:pr-ai-review", true);
      expect(result).toMatchObject({ jobId: "cron:pr-ai-review", status: "ok", message: "Revisor IA desligado." });
      expect(runAiReviewCronTick).toHaveBeenCalledTimes(2);
    });
  });
});
