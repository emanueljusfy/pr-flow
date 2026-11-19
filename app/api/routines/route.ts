import { NextResponse } from "next/server";
import {
  createRoutineFromInput,
  getRoutines
} from "@/modules/routines/lib/routine-service";
import type { CreateRoutineInput } from "@/modules/routines/lib/routine-validation";

export async function GET() {
  const list = await getRoutines();
  return NextResponse.json(list);
}

export async function POST(request: Request) {
  const body = (await request.json()) as CreateRoutineInput;
  const result = await createRoutineFromInput(body);

  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: 400 });
  }

  return NextResponse.json(result.routine, { status: 201 });
}
