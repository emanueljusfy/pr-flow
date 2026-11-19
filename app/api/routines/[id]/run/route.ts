import { NextResponse } from "next/server";
import { triggerManualRoutineRun } from "@/modules/routines/lib/routine-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const result = await triggerManualRoutineRun(id);

  if (!result.ok) {
    return NextResponse.json({ error: result.status === 409 ? "already_running" : "not_found" }, {
      status: result.status
    });
  }

  return NextResponse.json({ runId: result.runId }, { status: 202 });
}
