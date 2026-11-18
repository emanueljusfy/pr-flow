import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPrReviewReminderMessage,
  computeNextReviewReminderRunAt,
  DEFAULT_PR_REVIEW_REMINDER_MESSAGE_WITHOUT_REVIEWERS,
  formatPendingReviewerMentions,
  resolveScheduleMessageToStore
} from "@/modules/prs/lib/core/pr-review-reminder";
import * as prCacheRepository from "@/modules/prs/lib/pr-cache-repository";
import * as scheduleRepository from "@/modules/prs/lib/pr-review-reminder-schedule-repository";
import { processDuePrReviewReminderSchedules } from "@/modules/prs/lib/pr-review-reminder-schedule-service";
import * as prSlackShareRepository from "@/modules/prs/lib/pr-slack-share-repository";
import { postPrReviewReminder } from "@/modules/prs/lib/pr-review-reminder-service";
import * as slackClient from "@/modules/slack/lib/slack-client";
import { SlackApiError } from "@/modules/slack/lib/slack-client";
import { SlackConfigError } from "@/modules/slack/lib/slack-config";
import * as slackGithubUserResolve from "@/modules/slack/lib/slack-github-user-resolve";
import { DELETE, POST } from "@/app/api/prs/review-reminder/route";

const PR_URL = "https://github.com/acme/a/pull/7";

describe("buildPrReviewReminderMessage", () => {
  afterEach(() => {
    delete process.env.PR_REVIEW_REMINDER_MESSAGE;
  });

  it("lists pending reviewers in portuguese", () => {
    expect(formatPendingReviewerMentions(["ana"])).toBe("@ana");
    expect(formatPendingReviewerMentions(["ana", "bruno"])).toBe("@ana e @bruno");
    expect(formatPendingReviewerMentions(["ana", "bruno", "carla"])).toBe(
      "@ana, @bruno e @carla"
    );
  });

  it("builds the default message with pending reviewers", () => {
    expect(buildPrReviewReminderMessage(["bruno", "carla"])).toBe(
      "Olá @bruno e @carla! Lembrete gentil: esta PR ainda aguarda a revisão de vocês. Quando puderem, peço uma olhada. Obrigado!"
    );
  });

  it("falls back without reviewers", () => {
    expect(buildPrReviewReminderMessage([])).toBe(DEFAULT_PR_REVIEW_REMINDER_MESSAGE_WITHOUT_REVIEWERS);
  });

  it("supports {reviewers} in PR_REVIEW_REMINDER_MESSAGE", () => {
    process.env.PR_REVIEW_REMINDER_MESSAGE = "Oi {reviewers}, revisem pf.";
    expect(buildPrReviewReminderMessage(["ana"])).toBe("Oi @ana, revisem pf.");
  });

  it("stores null when the schedule message matches the default template", () => {
    const pending = ["ana", "bruno"];
    expect(resolveScheduleMessageToStore(buildPrReviewReminderMessage(pending), pending)).toBeNull();
    expect(resolveScheduleMessageToStore("  texto custom  ", pending)).toBe("texto custom");
  });

  it("advances next run by the interval", () => {
    const from = new Date("2026-11-06T12:00:00.000Z");
    expect(computeNextReviewReminderRunAt(from, 120).toISOString()).toBe("2026-11-06T14:00:00.000Z");
  });
});

describe("postPrReviewReminder", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.PR_REVIEW_REMINDER_MESSAGE;
  });

  it("posts a Slack thread reply mentioning pending reviewers", async () => {
    vi.spyOn(prSlackShareRepository, "getPrSlackShareThreadByUrl").mockResolvedValue({
      channel: "squad-justracker-pr",
      threadTs: "123.456"
    });
    vi.spyOn(slackGithubUserResolve, "resolveGithubLoginsToSlackIds").mockResolvedValue(
      new Map([
        ["bruno", "U111"],
        ["carla", "U222"]
      ])
    );
    const post = vi.spyOn(slackClient, "postSlackMessage").mockResolvedValue({
      ok: true,
      ts: "123.457"
    });

    const result = await postPrReviewReminder({
      url: PR_URL,
      repository: "acme/a",
      number: 7,
      pendingReviewers: ["bruno", "carla"]
    });

    expect(result.status).toBe("ok");
    expect(result).toMatchObject({
      channel: "squad-justracker-pr",
      body: "Olá <@U111> e <@U222>! Lembrete gentil: esta PR ainda aguarda a revisão de vocês. Quando puderem, peço uma olhada. Obrigado!"
    });
    expect(post).toHaveBeenCalledWith({
      channel: "squad-justracker-pr",
      text: "Olá <@U111> e <@U222>! Lembrete gentil: esta PR ainda aguarda a revisão de vocês. Quando puderem, peço uma olhada. Obrigado!",
      threadTs: "123.456",
      linkNames: true,
      unfurlLinks: false,
      unfurlMedia: false
    });
  });

  it("posts the edited message and resolves @logins inside it", async () => {
    vi.spyOn(prSlackShareRepository, "getPrSlackShareThreadByUrl").mockResolvedValue({
      channel: "squad-justracker-pr",
      threadTs: "123.456"
    });
    vi.spyOn(slackGithubUserResolve, "resolveGithubLoginsToSlackIds").mockResolvedValue(
      new Map([["bruno", "U111"]])
    );
    const post = vi.spyOn(slackClient, "postSlackMessage").mockResolvedValue({
      ok: true,
      ts: "123.457"
    });

    const result = await postPrReviewReminder({
      url: PR_URL,
      repository: "acme/a",
      number: 7,
      pendingReviewers: ["bruno"],
      message: "  @bruno, pode revisar?  "
    });

    expect(result).toEqual({
      status: "ok",
      body: "<@U111>, pode revisar?",
      channel: "squad-justracker-pr"
    });
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "<@U111>, pode revisar?"
      })
    );
  });

  it("returns no_pending when there are no reviewers and no custom message", async () => {
    const post = vi.spyOn(slackClient, "postSlackMessage");

    const result = await postPrReviewReminder({
      url: PR_URL,
      repository: "acme/a",
      number: 7,
      pendingReviewers: []
    });

    expect(result).toEqual({
      status: "no_pending",
      message: "Ninguém está pendente de revisão nesta PR."
    });
    expect(post).not.toHaveBeenCalled();
  });

  it("returns not_shared when the PR was not sent to Slack", async () => {
    vi.spyOn(prSlackShareRepository, "getPrSlackShareThreadByUrl").mockResolvedValue(null);
    const post = vi.spyOn(slackClient, "postSlackMessage");

    const result = await postPrReviewReminder({
      url: PR_URL,
      repository: "acme/a",
      number: 7,
      pendingReviewers: ["bruno"]
    });

    expect(result).toEqual({
      status: "not_shared",
      message: "Envie a PR ao Slack antes de publicar o lembrete na thread."
    });
    expect(post).not.toHaveBeenCalled();
  });

  it("maps Slack config errors", async () => {
    vi.spyOn(prSlackShareRepository, "getPrSlackShareThreadByUrl").mockResolvedValue({
      channel: "squad-justracker-pr",
      threadTs: "123.456"
    });
    vi.spyOn(slackGithubUserResolve, "resolveGithubLoginsToSlackIds").mockResolvedValue(new Map());
    vi.spyOn(slackClient, "postSlackMessage").mockRejectedValue(
      new SlackConfigError("Configure SLACK_BOT_OAUTH_TOKEN")
    );

    const result = await postPrReviewReminder({
      url: PR_URL,
      repository: "acme/a",
      number: 7,
      pendingReviewers: ["bruno"]
    });

    expect(result).toEqual({
      status: "config",
      message: "Configure SLACK_BOT_OAUTH_TOKEN"
    });
  });

  it("maps Slack API errors", async () => {
    vi.spyOn(prSlackShareRepository, "getPrSlackShareThreadByUrl").mockResolvedValue({
      channel: "squad-justracker-pr",
      threadTs: "123.456"
    });
    vi.spyOn(slackGithubUserResolve, "resolveGithubLoginsToSlackIds").mockResolvedValue(new Map());
    vi.spyOn(slackClient, "postSlackMessage").mockRejectedValue(new SlackApiError("boom"));

    const result = await postPrReviewReminder({
      url: PR_URL,
      repository: "acme/a",
      number: 7,
      pendingReviewers: ["bruno"]
    });

    expect(result).toEqual({ status: "error", message: "boom" });
  });
});

describe("POST /api/prs/review-reminder", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 for invalid body", async () => {
    const response = await POST(
      new Request("http://localhost/api/prs/review-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository: "bad", number: 0 })
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when the PR was not shared to Slack", async () => {
    vi.spyOn(prSlackShareRepository, "getPrSlackShareThreadByUrl").mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/prs/review-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: PR_URL,
          repository: "acme/a",
          number: 7,
          pendingReviewers: ["bruno"]
        })
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Envie a PR ao Slack antes de publicar o lembrete na thread."
    });
  });

  it("returns ok with the posted body", async () => {
    vi.spyOn(prSlackShareRepository, "getPrSlackShareThreadByUrl").mockResolvedValue({
      channel: "squad-justracker-pr",
      threadTs: "123.456"
    });
    vi.spyOn(slackGithubUserResolve, "resolveGithubLoginsToSlackIds").mockResolvedValue(
      new Map([["bruno", "U111"]])
    );
    vi.spyOn(slackClient, "postSlackMessage").mockResolvedValue({
      ok: true,
      ts: "123.457"
    });

    const response = await POST(
      new Request("http://localhost/api/prs/review-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: PR_URL,
          repository: "acme/a",
          number: 7,
          pendingReviewers: ["bruno"]
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      body: "Olá <@U111>! Lembrete gentil: esta PR ainda aguarda a revisão de vocês. Quando puderem, peço uma olhada. Obrigado!",
      channel: "squad-justracker-pr",
      schedule: null
    });
  });

  it("upserts a schedule when scheduleIntervalMinutes is set", async () => {
    vi.spyOn(prSlackShareRepository, "getPrSlackShareThreadByUrl").mockResolvedValue({
      channel: "squad-justracker-pr",
      threadTs: "123.456"
    });
    vi.spyOn(slackGithubUserResolve, "resolveGithubLoginsToSlackIds").mockResolvedValue(
      new Map([["bruno", "U111"]])
    );
    vi.spyOn(slackClient, "postSlackMessage").mockResolvedValue({
      ok: true,
      ts: "123.457"
    });
    const upsert = vi.spyOn(scheduleRepository, "upsertPrReviewReminderSchedule").mockResolvedValue({
      intervalMinutes: 120,
      nextRunAt: "2026-11-06T14:00:00.000Z"
    });

    const response = await POST(
      new Request("http://localhost/api/prs/review-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: PR_URL,
          repository: "acme/a",
          number: 7,
          pendingReviewers: ["bruno"],
          scheduleIntervalMinutes: 120
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      body: "Olá <@U111>! Lembrete gentil: esta PR ainda aguarda a revisão de vocês. Quando puderem, peço uma olhada. Obrigado!",
      channel: "squad-justracker-pr",
      schedule: {
        intervalMinutes: 120,
        nextRunAt: "2026-11-06T14:00:00.000Z"
      }
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        prUrl: PR_URL,
        repository: "acme/a",
        number: 7,
        intervalMinutes: 120,
        message: null
      })
    );
  });

  it("cancels an existing schedule", async () => {
    const disable = vi
      .spyOn(scheduleRepository, "disablePrReviewReminderSchedule")
      .mockResolvedValue(true);

    const response = await DELETE(
      new Request("http://localhost/api/prs/review-reminder", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: PR_URL })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, cancelled: true });
    expect(disable).toHaveBeenCalledWith(PR_URL);
  });
});

describe("processDuePrReviewReminderSchedules", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("disables schedules when the PR has no pending reviewers", async () => {
    vi.spyOn(scheduleRepository, "listDuePrReviewReminderSchedules").mockResolvedValue([
      {
        id: "sch-1",
        prUrl: PR_URL,
        repository: "acme/a",
        number: 7,
        intervalMinutes: 60,
        message: null,
        enabled: true,
        nextRunAt: new Date("2026-11-06T10:00:00.000Z"),
        lastRemindedAt: null,
        createdAt: new Date("2026-11-06T09:00:00.000Z"),
        updatedAt: new Date("2026-11-06T09:00:00.000Z")
      }
    ]);
    vi.spyOn(prCacheRepository, "loadPrMonitorCacheAllowStale").mockResolvedValue({
      data: [
        {
          id: "PR_1",
          number: 7,
          title: "t",
          url: PR_URL,
          repository: "acme/a",
          createdAt: "2026-11-01T00:00:00.000Z",
          avaliou: ["bruno"],
          naoAvaliou: [],
          semReviewersSolicitados: false,
          aprovou: ["bruno"],
          solicitouAlteracoes: [],
          pendente: [],
          requestedReviewersCount: 1,
          statusGeral: "approved"
        }
      ],
      fetchedAt: "2026-11-06T12:00:00.000Z",
      githubLogin: "me"
    });
    const disable = vi
      .spyOn(scheduleRepository, "disablePrReviewReminderSchedule")
      .mockResolvedValue(true);
    const post = vi.spyOn(slackClient, "postSlackMessage");

    const result = await processDuePrReviewReminderSchedules(new Date("2026-11-06T12:00:00.000Z"));

    expect(result).toEqual({ processed: 1, sent: 0, disabled: 1, errors: 0 });
    expect(disable).toHaveBeenCalledWith(PR_URL);
    expect(post).not.toHaveBeenCalled();
  });

  it("disables schedules when the PR is gone from the monitor cache", async () => {
    vi.spyOn(scheduleRepository, "listDuePrReviewReminderSchedules").mockResolvedValue([
      {
        id: "sch-1",
        prUrl: PR_URL,
        repository: "acme/a",
        number: 7,
        intervalMinutes: 60,
        message: null,
        enabled: true,
        nextRunAt: new Date("2026-11-06T10:00:00.000Z"),
        lastRemindedAt: null,
        createdAt: new Date("2026-11-06T09:00:00.000Z"),
        updatedAt: new Date("2026-11-06T09:00:00.000Z")
      }
    ]);
    vi.spyOn(prCacheRepository, "loadPrMonitorCacheAllowStale").mockResolvedValue({
      data: [],
      fetchedAt: "2026-11-06T12:00:00.000Z",
      githubLogin: "me"
    });
    const disable = vi
      .spyOn(scheduleRepository, "disablePrReviewReminderSchedule")
      .mockResolvedValue(true);

    const result = await processDuePrReviewReminderSchedules(new Date("2026-11-06T12:00:00.000Z"));

    expect(result).toEqual({ processed: 1, sent: 0, disabled: 1, errors: 0 });
    expect(disable).toHaveBeenCalledWith(PR_URL);
  });
});
