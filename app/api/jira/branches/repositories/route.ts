import { NextResponse } from "next/server";
import { listJiraBranchRepositories } from "@/modules/jira-branch/lib/jira-branch-repositories-service";

export async function GET() {
  const result = await listJiraBranchRepositories();

  if (result.status === "error") {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ repositories: result.repositories });
}
