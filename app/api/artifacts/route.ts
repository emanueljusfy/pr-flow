import { handleArtifactRoute, parseBody, readJsonBody } from "@/modules/artifacts/lib/artifact-http";
import { createArtifact, listArtifacts } from "@/modules/artifacts/lib/artifact-service";
import { artifactCreateBodySchema } from "@/modules/artifacts/lib/artifact-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request): Promise<Response> {
  return handleArtifactRoute(() => {
    const query = new URL(request.url).searchParams.get("q") ?? undefined;
    return Response.json({ artifacts: listArtifacts(query) });
  });
}

export function POST(request: Request): Promise<Response> {
  return handleArtifactRoute(async () => {
    const parsed = parseBody(artifactCreateBodySchema, await readJsonBody(request));
    if ("response" in parsed) {
      return parsed.response;
    }
    const artifact = createArtifact({ source: "user", clientId: parsed.data.clientId }, { title: parsed.data.title });
    return Response.json({ artifact }, { status: 201 });
  });
}
