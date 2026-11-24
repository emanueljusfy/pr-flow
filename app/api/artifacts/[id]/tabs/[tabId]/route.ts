import {
  artifactErrorResponse,
  handleArtifactRoute,
  parseBody,
  readJsonBody
} from "@/modules/artifacts/lib/artifact-http";
import { deleteTab, updateTab } from "@/modules/artifacts/lib/artifact-service";
import { artifactClientIdQuerySchema, artifactTabUpdateBodySchema } from "@/modules/artifacts/lib/artifact-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; tabId: string }> };

export function PUT(request: Request, context: RouteContext): Promise<Response> {
  return handleArtifactRoute(async () => {
    const { id, tabId } = await context.params;
    const parsed = parseBody(artifactTabUpdateBodySchema, await readJsonBody(request));
    if ("response" in parsed) {
      return parsed.response;
    }
    const { clientId, ...input } = parsed.data;
    const tab = updateTab({ source: "user", clientId }, id, tabId, input);
    return Response.json({ tab });
  });
}

export function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return handleArtifactRoute(async () => {
    const { id, tabId } = await context.params;
    const clientId = artifactClientIdQuerySchema.safeParse(new URL(request.url).searchParams.get("clientId"));
    if (!clientId.success) {
      return artifactErrorResponse(400, "invalid_body", "clientId is required");
    }
    deleteTab({ source: "user", clientId: clientId.data }, id, tabId);
    return new Response(null, { status: 204 });
  });
}
