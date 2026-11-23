import { NextResponse } from "next/server";
import { z } from "zod";
import { listAiReviewRuns } from "@/modules/pr-ai-review/lib/repository";

const querySchema = z.object({
  prUrl: z.string().trim().url().optional(),
  cycleId: z.string().trim().min(1).optional(),
  unread: z.enum(["1", "true"]).optional(),
  status: z.enum(["running", "succeeded", "failed"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }
  const runs = await listAiReviewRuns({
    prUrl: parsed.data.prUrl,
    cycleId: parsed.data.cycleId,
    unread: parsed.data.unread !== undefined,
    status: parsed.data.status,
    limit: parsed.data.limit
  });
  return NextResponse.json(runs);
}
