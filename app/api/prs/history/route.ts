import { NextResponse } from "next/server";
import { writeSystemLogFireAndForget } from "@/modules/observability/lib/system-logger";
import { getPullRequestHistory } from "@/modules/prs/lib/pr-history-service";
import { prHistoryQuerySchema } from "@/modules/prs/lib/pr-history-validation";

const API_PRS_HISTORY_LOG_SOURCE = "api:prs-history";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = prHistoryQuerySchema.safeParse({
    repository: url.searchParams.get("repository"),
    number: url.searchParams.get("number")
  });

  if (!parsed.success) {
    return NextResponse.json(
      { status: "error", message: "Parâmetros inválidos.", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await getPullRequestHistory(parsed.data);

  if (result.status === "unauthenticated") {
    writeSystemLogFireAndForget({
      level: "warn",
      source: API_PRS_HISTORY_LOG_SOURCE,
      message: result.message,
      details: { ...parsed.data, code: "unauthenticated" }
    });
    return NextResponse.json(result, { status: 401 });
  }

  if (result.status === "error") {
    writeSystemLogFireAndForget({
      level: "error",
      source: API_PRS_HISTORY_LOG_SOURCE,
      message: result.message,
      details: { ...parsed.data, code: "error" }
    });
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
