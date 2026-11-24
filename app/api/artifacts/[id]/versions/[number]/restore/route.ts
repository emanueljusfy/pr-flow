import {
  artifactErrorResponse,
  handleArtifactRoute,
  parseBody,
  readJsonBody
} from "@/modules/artifacts/lib/artifact-http";
import { restoreVersion } from "@/modules/artifacts/lib/artifact-service";
import { artifactRestoreBodySchema, artifactVersionNumberSchema } from "@/modules/artifacts/lib/artifact-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; number: string }> };

export function POST(request: Request, context: RouteContext): Promise<Response> {
  return handleArtifactRoute(async () => {
    const { id, number } = await context.params;
    const version = artifactVersionNumberSchema.safeParse(number);
    if (!version.success) {
      return artifactErrorResponse(404, "not_found", `Version not found: ${number}`);
    }
    const parsed = parseBody(artifactRestoreBodySchema, await readJsonBody(request));
    if ("response" in parsed) {
      return parsed.response;
    }
    const artifact = restoreVersion({ source: "user", clientId: parsed.data.clientId }, id, version.data);
    return Response.json({ artifact });
  });
}
