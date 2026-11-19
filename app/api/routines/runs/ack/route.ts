import { NextResponse } from "next/server";
import { ackRoutineRunsFromInput } from "@/modules/routines/lib/routine-service";

export async function POST(request: Request) {
  const body: unknown = await request.json();
  const result = await ackRoutineRunsFromInput(body);

  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: 400 });
  }

  return new NextResponse(null, { status: 204 });
}
