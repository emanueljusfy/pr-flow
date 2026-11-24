import { handleArtifactRoute, parseBody, readJsonBody } from "@/modules/artifacts/lib/artifact-http";
import { addTab } from "@/modules/artifacts/lib/artifact-service";
import { artifactTabCreateBodySchema } from "@/modules/artifacts/lib/artifact-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export function POST(request: Request, context: RouteContext): Promise<Response> {
  return handleArtifactRoute(async () => {
    const { id } = await context.params;
    const parsed = parseBody(artifactTabCreateBodySchema, await readJsonBody(request));
    if ("response" in parsed) {
      return parsed.response;
    }
    const { clientId, ...input } = parsed.data;
    const tab = addTab({ source: "user", clientId }, id, input);
    return Response.json({ tab }, { status: 201 });
  });
}
