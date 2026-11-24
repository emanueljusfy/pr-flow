import { handleArtifactRoute } from "@/modules/artifacts/lib/artifact-http";
import { listVersions } from "@/modules/artifacts/lib/artifact-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export function GET(_request: Request, context: RouteContext): Promise<Response> {
  return handleArtifactRoute(async () => {
    const { id } = await context.params;
    return Response.json({ versions: listVersions(id) });
  });
}
