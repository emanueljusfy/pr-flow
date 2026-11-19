import type { CommandRunner } from "@/modules/routines/lib/command-runner";
import type { BinaryProbe } from "@/modules/routines/lib/agent-registry";
import {
  advanceRoutineNextRunAt,
  finalizeRun,
  getRoutineById,
  hasRunningRun,
  insertRunningRun,
  listDueRoutines
} from "@/modules/routines/lib/routine-repository";
import { computeNextRunAt } from "@/modules/routines/lib/routine-schedule";
import { runRoutineAgent } from "@/modules/routines/lib/routine-runner";
import {
  appendRoutineJournalNote,
  notifyRoutineSlack
} from "@/modules/routines/lib/routine-side-effects";
import type { RoutineDto } from "@/modules/routines/lib/domain";

export type ProcessDueRoutinesResult = {
  processed: number;
  started: number;
  succeeded: number;
  failed: number;
  skippedRunning: number;
};

async function executeRoutineRun(input: {
  routine: RoutineDto;
  runId: string;
  run?: CommandRunner;
  probe?: BinaryProbe;
}): Promise<"succeeded" | "failed"> {
  const agentResult = await runRoutineAgent({
    routine: input.routine,
    run: input.run,
    probe: input.probe
  });

  let slackSkipped: boolean | null = null;
  const draftRun = {
    id: input.runId,
    routineId: input.routine.id,
    status: agentResult.status,
    reason: agentResult.reason,
    stdout: agentResult.stdout,
    stderr: agentResult.stderr,
    slackSkipped: null,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    ackedAt: null
  };

  try {
    await appendRoutineJournalNote(input.routine, draftRun);
  } catch {
    // Journal failure must not block run finalization.
  }

  try {
    const slack = await notifyRoutineSlack(input.routine, draftRun);
    slackSkipped = slack.posted ? false : true;
  } catch {
    slackSkipped = true;
  }

  await finalizeRun({
    runId: input.runId,
    status: agentResult.status,
    reason: agentResult.reason,
    stdout: agentResult.stdout,
    stderr: agentResult.stderr,
    slackSkipped
  });

  const nextRunAt = computeNextRunAt({
    scheduleKind: input.routine.scheduleKind,
    intervalMinutes: input.routine.intervalMinutes,
    cronExpr: input.routine.cronExpr,
    from: new Date()
  });
  await advanceRoutineNextRunAt(input.routine.id, nextRunAt);

  return agentResult.status;
}

export async function processDueRoutines(
  asOf: Date = new Date(),
  deps: { run?: CommandRunner; probe?: BinaryProbe } = {}
): Promise<ProcessDueRoutinesResult> {
  const due = await listDueRoutines(asOf);
  let started = 0;
  let succeeded = 0;
  let failed = 0;
  let skippedRunning = 0;

  for (const routine of due) {
    if (await hasRunningRun(routine.id)) {
      skippedRunning += 1;
      continue;
    }

    const run = await insertRunningRun(routine.id, asOf);
    started += 1;
    const status = await executeRoutineRun({
      routine,
      runId: run.id,
      run: deps.run,
      probe: deps.probe
    });
    if (status === "succeeded") {
      succeeded += 1;
    } else {
      failed += 1;
    }
  }

  return {
    processed: due.length,
    started,
    succeeded,
    failed,
    skippedRunning
  };
}

export async function startManualRoutineRun(
  routineId: string,
  deps: { run?: CommandRunner; probe?: BinaryProbe } = {}
): Promise<
  | { ok: true; runId: string }
  | { ok: false; status: 404 }
  | { ok: false; status: 409 }
> {
  const routine = await getRoutineById(routineId);
  if (!routine) {
    return { ok: false, status: 404 };
  }
  if (await hasRunningRun(routineId)) {
    return { ok: false, status: 409 };
  }

  const run = await insertRunningRun(routineId);
  // Fire and forget completion — API returns 202 with run id.
  void executeRoutineRun({
    routine,
    runId: run.id,
    run: deps.run,
    probe: deps.probe
  });

  return { ok: true, runId: run.id };
}

/** Test helper: run to completion synchronously. */
export async function runRoutineToCompletionForTests(
  routineId: string,
  deps: { run?: CommandRunner; probe?: BinaryProbe } = {}
): Promise<{ ok: true; runId: string; status: "succeeded" | "failed" } | { ok: false; status: 404 | 409 }> {
  const routine = await getRoutineById(routineId);
  if (!routine) {
    return { ok: false, status: 404 };
  }
  if (await hasRunningRun(routineId)) {
    return { ok: false, status: 409 };
  }
  const run = await insertRunningRun(routineId);
  const status = await executeRoutineRun({
    routine,
    runId: run.id,
    run: deps.run,
    probe: deps.probe
  });
  return { ok: true, runId: run.id, status };
}
