import { NextResponse } from "next/server";
import { validateAiReviewConfigInput } from "@/modules/pr-ai-review/lib/config-validation";
import { getAiReviewConfig, updateAiReviewConfig } from "@/modules/pr-ai-review/lib/repository";

export async function GET() {
  return NextResponse.json(await getAiReviewConfig());
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const validated = validateAiReviewConfigInput(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const current = await getAiReviewConfig();
  const patch = { ...validated.patch };
  // Turning the reviewer on runs it on the next cron tick instead of waiting a full interval.
  if (patch.enabled === true && !current.enabled) {
    patch.nextRunAt = new Date();
  }
  return NextResponse.json(await updateAiReviewConfig(patch));
}
