import {
  artifactErrorResponse,
  handleArtifactRoute,
  parseBody,
  readJsonBody
} from "@/modules/artifacts/lib/artifact-http";
import { deleteArtifact, getArtifact, renameArtifact } from "@/modules/artifacts/lib/artifact-service";
import { artifactClientIdQuerySchema, artifactPatchBodySchema } from "@/modules/artifacts/lib/artifact-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export function GET(_request: Request, context: RouteContext): Promise<Response> {
  return handleArtifactRoute(async () => {
    const { id } = await context.params;
    return Response.json({ artifact: getArtifact(id) });
  });
}

export function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return handleArtifactRoute(async () => {
    const { id } = await context.params;
    const parsed = parseBody(artifactPatchBodySchema, await readJsonBody(request));
    if ("response" in parsed) {
      return parsed.response;
    }
    const artifact = renameArtifact({ source: "user", clientId: parsed.data.clientId }, id, parsed.data.title);
    return Response.json({ artifact });
  });
}

export function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return handleArtifactRoute(async () => {
    const { id } = await context.params;
    const clientId = artifactClientIdQuerySchema.safeParse(new URL(request.url).searchParams.get("clientId"));
    if (!clientId.success) {
      return artifactErrorResponse(400, "invalid_body", "clientId is required");
    }
    deleteArtifact({ source: "user", clientId: clientId.data }, id);
    return new Response(null, { status: 204 });
  });
}
