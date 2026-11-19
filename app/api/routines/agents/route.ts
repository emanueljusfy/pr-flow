import { NextResponse } from "next/server";
import { getRoutineAgents } from "@/modules/routines/lib/routine-service";

export async function GET() {
  const agents = await getRoutineAgents();
  return NextResponse.json(agents);
}
