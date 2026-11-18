import { NextResponse } from "next/server";
import { sanitizeErrorForLog } from "@/modules/observability/lib/log-sanitize";
import { writeSystemLogFireAndForget } from "@/modules/observability/lib/system-logger";
import { buildPrReviewReminderMessage } from "@/modules/prs/lib/core/pr-review-reminder";
import {
  cancelPrReviewReminderSchedule,
  schedulePrReviewReminderAfterSend
} from "@/modules/prs/lib/pr-review-reminder-schedule-service";
import { postPrReviewReminder } from "@/modules/prs/lib/pr-review-reminder-service";
import {
  prReviewReminderBodySchema,
  prReviewReminderCancelBodySchema
} from "@/modules/prs/lib/pr-review-reminder-validation";

const API_PRS_REVIEW_REMINDER_LOG_SOURCE = "api:prs-review-reminder";

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const parsed = prReviewReminderBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { url, repository, number, message, pendingReviewers, scheduleIntervalMinutes } =
    parsed.data;

  try {
    const result = await postPrReviewReminder({
      url,
      repository,
      number,
      message,
      pendingReviewers
    });

    if (result.status === "not_shared") {
      writeSystemLogFireAndForget({
        level: "warn",
        source: API_PRS_REVIEW_REMINDER_LOG_SOURCE,
        message: result.message,
        details: { repository, number, url, code: "not_shared" }
      });
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    if (result.status === "no_pending") {
      writeSystemLogFireAndForget({
        level: "warn",
        source: API_PRS_REVIEW_REMINDER_LOG_SOURCE,
        message: result.message,
        details: { repository, number, url, code: "no_pending" }
      });
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    if (result.status === "config") {
      writeSystemLogFireAndForget({
        level: "warn",
        source: API_PRS_REVIEW_REMINDER_LOG_SOURCE,
        message: result.message,
        details: { repository, number, url, code: "slack_config" }
      });
      return NextResponse.json({ error: result.message }, { status: 503 });
    }

    if (result.status === "unauthenticated") {
      writeSystemLogFireAndForget({
        level: "warn",
        source: API_PRS_REVIEW_REMINDER_LOG_SOURCE,
        message: result.message,
        details: { repository, number, url, code: "unauthenticated" }
      });
      return NextResponse.json({ error: result.message }, { status: 401 });
    }

    if (result.status === "error") {
      writeSystemLogFireAndForget({
        level: "error",
        source: API_PRS_REVIEW_REMINDER_LOG_SOURCE,
        message: result.message,
        details: { repository, number, url, code: "error" }
      });
      return NextResponse.json({ error: result.message }, { status: 502 });
    }

    let schedule = null;
    if (scheduleIntervalMinutes != null) {
      const pending = pendingReviewers ?? [];
      const messageForSchedule = message?.trim() || buildPrReviewReminderMessage(pending);
      schedule = await schedulePrReviewReminderAfterSend({
        url,
        repository,
        number,
        message: messageForSchedule,
        pendingReviewers: pending,
        intervalMinutes: scheduleIntervalMinutes
      });
    }

    writeSystemLogFireAndForget({
      level: "info",
      source: API_PRS_REVIEW_REMINDER_LOG_SOURCE,
      message: schedule
        ? `Lembrete de revisão publicado e agendado a cada ${schedule.intervalMinutes} min na thread Slack de ${repository}#${number}.`
        : `Lembrete de revisão publicado na thread Slack de ${repository}#${number}.`,
      details: {
        repository,
        number,
        url,
        channel: result.channel,
        scheduleIntervalMinutes: schedule?.intervalMinutes ?? null
      }
    });

    return NextResponse.json({
      ok: true,
      body: result.body,
      channel: result.channel,
      schedule
    });
  } catch (error) {
    writeSystemLogFireAndForget({
      level: "error",
      source: API_PRS_REVIEW_REMINDER_LOG_SOURCE,
      message: "Não foi possível publicar o lembrete de revisão.",
      details: {
        repository,
        number,
        url,
        code: "unknown",
        error: sanitizeErrorForLog(error)
      }
    });
    return NextResponse.json(
      { error: "Não foi possível publicar o lembrete de revisão." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const parsed = prReviewReminderCancelBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { url } = parsed.data;

  try {
    const cancelled = await cancelPrReviewReminderSchedule(url);
    writeSystemLogFireAndForget({
      level: "info",
      source: API_PRS_REVIEW_REMINDER_LOG_SOURCE,
      message: cancelled
        ? "Agendamento de lembrete de revisão cancelado."
        : "Nenhum agendamento de lembrete ativo para cancelar.",
      details: { url, cancelled }
    });
    return NextResponse.json({ ok: true, cancelled });
  } catch (error) {
    writeSystemLogFireAndForget({
      level: "error",
      source: API_PRS_REVIEW_REMINDER_LOG_SOURCE,
      message: "Não foi possível cancelar o agendamento de lembrete.",
      details: { url, error: sanitizeErrorForLog(error) }
    });
    return NextResponse.json(
      { error: "Não foi possível cancelar o agendamento de lembrete." },
      { status: 500 }
    );
  }
}
