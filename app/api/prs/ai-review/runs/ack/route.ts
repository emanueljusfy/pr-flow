import { NextResponse } from "next/server";
import { z } from "zod";
import { ackAiReviewRuns } from "@/modules/pr-ai-review/lib/repository";

const bodySchema = z.object({ runIds: z.array(z.string().min(1)).max(200) });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }
  const acked = await ackAiReviewRuns(parsed.data.runIds);
  return NextResponse.json({ ok: true, acked });
}
