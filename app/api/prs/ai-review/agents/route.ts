import { NextResponse } from "next/server";
import { listCachedAiReviewAgents } from "@/modules/pr-ai-review/lib/agent-registry";

export async function GET() {
  return NextResponse.json(await listCachedAiReviewAgents());
}
