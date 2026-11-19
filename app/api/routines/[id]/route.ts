import { NextResponse } from "next/server";
import {
  removeRoutine,
  updateRoutineFromInput
} from "@/modules/routines/lib/routine-service";
import type { UpdateRoutineInput } from "@/modules/routines/lib/routine-validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as UpdateRoutineInput;
  const result = await updateRoutineFromInput(id, body);

  if (!result.ok) {
    if (result.status === 404) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ errors: result.errors }, { status: 400 });
  }

  return NextResponse.json(result.routine);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const result = await removeRoutine(id);
  if (!result.ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
