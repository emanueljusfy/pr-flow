import { appendQuickNoteToToday } from "@/modules/journal/lib/note-service";
import type { RoutineDto, RoutineRunDto } from "@/modules/routines/lib/domain";
import { getSlackPrChannel, isSlackConfigured } from "@/modules/slack/lib/slack-config";
import { postSlackMessage } from "@/modules/slack/lib/slack-client";

const JOURNAL_EXCERPT_CHARS = 500;

export function buildRoutineJournalNote(routine: RoutineDto, run: RoutineRunDto): string {
  const statusLabel = run.status === "succeeded" ? "sucesso" : "falha";
  const head = `Rotina "${routine.name}" — ${statusLabel}`;
  if (run.status === "succeeded") {
    const excerpt = (run.stdout ?? "").trim().slice(0, JOURNAL_EXCERPT_CHARS);
    return excerpt ? `${head}\n${excerpt}` : head;
  }
  const reason = run.reason ?? "erro desconhecido";
  const stderr = (run.stderr ?? "").trim().slice(0, JOURNAL_EXCERPT_CHARS);
  return stderr ? `${head} (${reason})\n${stderr}` : `${head} (${reason})`;
}

export function buildRoutineSlackText(routine: RoutineDto, run: RoutineRunDto): string {
  const statusLabel = run.status === "succeeded" ? "sucesso" : "falha";
  const reason = run.reason ? ` — ${run.reason}` : "";
  return `Rotina *${routine.name}* terminou com ${statusLabel}${reason}.`;
}

export async function appendRoutineJournalNote(
  routine: RoutineDto,
  run: RoutineRunDto
): Promise<void> {
  await appendQuickNoteToToday({ text: buildRoutineJournalNote(routine, run) });
}

export type SlackNotifyResult = { posted: true } | { posted: false; slackSkipped: true };

export async function notifyRoutineSlack(
  routine: RoutineDto,
  run: RoutineRunDto,
  deps: {
    isConfigured?: () => boolean;
    post?: typeof postSlackMessage;
    channel?: () => string;
  } = {}
): Promise<SlackNotifyResult> {
  if (!routine.notifySlack) {
    return { posted: false, slackSkipped: true };
  }

  const isConfigured = deps.isConfigured ?? isSlackConfigured;
  if (!isConfigured()) {
    return { posted: false, slackSkipped: true };
  }

  const post = deps.post ?? postSlackMessage;
  const channel = (deps.channel ?? getSlackPrChannel)();
  await post({ channel, text: buildRoutineSlackText(routine, run) });
  return { posted: true };
}
