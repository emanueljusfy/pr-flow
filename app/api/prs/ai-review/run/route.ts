import { NextResponse } from "next/server";
import { z } from "zod";
import { writeSystemLogFireAndForget } from "@/modules/observability/lib/system-logger";
import {
  startManualAiReviewCycle,
  startManualAiReviewForPr
} from "@/modules/pr-ai-review/lib/review-service";

const bodySchema = z
  .object({ prUrl: z.string().trim().url().regex(/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+\/?$/).optional() })
  .strict();

export async function POST(request: Request) {
  let raw: unknown = {};
  const text = await request.text();
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
    }
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const result = parsed.data.prUrl
    ? await startManualAiReviewForPr(parsed.data.prUrl)
    : await startManualAiReviewCycle();

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (result.prUrls.length === 0) {
    return NextResponse.json({ prUrls: [] }, { status: 200 });
  }

  // Reviews run for minutes; the UI follows them through /api/prs/ai-review/runs.
  void result.done.catch((error: unknown) => {
    writeSystemLogFireAndForget({
      level: "error",
      source: "prs:ai-review",
      message: "Revisão da IA terminou com erro inesperado.",
      details: error instanceof Error ? error.message : error
    });
  });
  return NextResponse.json({ prUrls: result.prUrls }, { status: 202 });
}
