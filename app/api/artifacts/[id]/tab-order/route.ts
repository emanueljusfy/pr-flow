import { handleArtifactRoute, parseBody, readJsonBody } from "@/modules/artifacts/lib/artifact-http";
import { reorderTabs } from "@/modules/artifacts/lib/artifact-service";
import { artifactTabOrderBodySchema } from "@/modules/artifacts/lib/artifact-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export function PUT(request: Request, context: RouteContext): Promise<Response> {
  return handleArtifactRoute(async () => {
    const { id } = await context.params;
    const parsed = parseBody(artifactTabOrderBodySchema, await readJsonBody(request));
    if ("response" in parsed) {
      return parsed.response;
    }
    const artifact = reorderTabs({ source: "user", clientId: parsed.data.clientId }, id, parsed.data.tabIds);
    return Response.json({ artifact });
  });
}
