import type { TLRecord } from "tldraw";
import {
  WhiteboardRecordError,
  applyWhiteboardChanges
} from "@/modules/whiteboard/lib/whiteboard-document-service";
import { readJsonBody, whiteboardErrorResponse } from "@/modules/whiteboard/lib/whiteboard-http";
import { whiteboardChangesBodySchema } from "@/modules/whiteboard/lib/whiteboard-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const parsed = whiteboardChangesBodySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return whiteboardErrorResponse(400, "invalid_body", parsed.error.message);
  }
  try {
    const clock = applyWhiteboardChanges({
      clientId: parsed.data.clientId,
      put: parsed.data.put as unknown as TLRecord[],
      remove: parsed.data.remove
    });
    return Response.json({ clock });
  } catch (error) {
    if (error instanceof WhiteboardRecordError) {
      return whiteboardErrorResponse(422, "invalid_record", error.message);
    }
    throw error;
  }
}
