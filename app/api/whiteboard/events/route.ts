import {
  getWhiteboardDocument,
  subscribeWhiteboard
} from "@/modules/whiteboard/lib/whiteboard-document-service";
import { whiteboardErrorResponse } from "@/modules/whiteboard/lib/whiteboard-http";
import { whiteboardClientIdSchema } from "@/modules/whiteboard/lib/whiteboard-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 25_000;

/** SSE: `ready` on connect with the current clock, then `changes` for every change not sent by `clientId`. */
export function GET(request: Request): Response {
  const parsed = whiteboardClientIdSchema.safeParse(new URL(request.url).searchParams.get("clientId"));
  if (!parsed.success) {
    return whiteboardErrorResponse(400, "invalid_body", "clientId is required");
  }
  const clientId = parsed.data;
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

      const unsubscribe = subscribeWhiteboard(clientId, (change) => send("changes", change));
      const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener("abort", onAbort);
      send("ready", { clock: getWhiteboardDocument().clock });
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
