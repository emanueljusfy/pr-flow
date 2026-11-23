import { NextResponse } from "next/server";
import { listJiraBranchBaseBranches } from "@/modules/jira-branch/lib/jira-branch-repositories-service";
import {
  formatZodError,
  jiraBranchBaseBranchesQuerySchema
} from "@/modules/jira-branch/lib/jira-branch-validation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = jiraBranchBaseBranchesQuerySchema.safeParse({
    repository: searchParams.get("repository") ?? ""
  });

  if (!parsed.success) {
    return NextResponse.json({ errors: formatZodError(parsed.error) }, { status: 400 });
  }

  const result = await listJiraBranchBaseBranches(parsed.data.repository);

  if (result.status === "unauthenticated") {
    return NextResponse.json({ error: result.message }, { status: 401 });
  }

  if (result.status === "error") {
    return NextResponse.json({ error: result.message }, { status: 500 });
  }

  return NextResponse.json({
    defaultBranch: result.defaultBranch,
    baseBranches: result.baseBranches
  });
}
