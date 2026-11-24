import { artifactErrorResponse, handleArtifactRoute } from "@/modules/artifacts/lib/artifact-http";
import { getVersion } from "@/modules/artifacts/lib/artifact-service";
import { artifactVersionNumberSchema } from "@/modules/artifacts/lib/artifact-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; number: string }> };

export function GET(_request: Request, context: RouteContext): Promise<Response> {
  return handleArtifactRoute(async () => {
    const { id, number } = await context.params;
    const parsed = artifactVersionNumberSchema.safeParse(number);
    if (!parsed.success) {
      return artifactErrorResponse(404, "not_found", `Version not found: ${number}`);
    }
    return Response.json({ version: getVersion(id, parsed.data) });
  });
}
