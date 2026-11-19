import { NextResponse } from "next/server";
import { getRoutineRuns } from "@/modules/routines/lib/routine-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const routineId = url.searchParams.get("routineId");
  const unread = url.searchParams.get("unread") === "1" || url.searchParams.get("unread") === "true";
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  const runs = await getRoutineRuns({
    routineId,
    unread: unread || undefined,
    limit: Number.isFinite(limit) ? limit : undefined
  });

  return NextResponse.json(runs);
}
