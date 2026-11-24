import { artifactErrorResponse } from "@/modules/artifacts/lib/artifact-http";
import { subscribeArtifacts } from "@/modules/artifacts/lib/artifact-service";
import { artifactClientIdQuerySchema } from "@/modules/artifacts/lib/artifact-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 25_000;

/** SSE: `ready` on connect, then `artifact` for every change not made by `clientId`. */
export function GET(request: Request): Response {
  const parsed = artifactClientIdQuerySchema.safeParse(new URL(request.url).searchParams.get("clientId"));
  if (!parsed.success) {
    return artifactErrorResponse(400, "invalid_body", "clientId is required");
  }
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      const unsubscribe = subscribeArtifacts(parsed.data, ({ type, id, tabIds, source }) =>
        send("artifact", { type, id, tabIds, source })
      );
      const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
      const onAbort = () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", onAbort);
      };
      request.signal.addEventListener("abort", onAbort);
      send("ready", {});
    },
    cancel() {
      cleanup();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
