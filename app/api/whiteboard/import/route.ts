import type { SerializedSchema, TLRecord } from "tldraw";
import {
  WhiteboardNotEmptyError,
  WhiteboardRecordError,
  importWhiteboardSnapshot
} from "@/modules/whiteboard/lib/whiteboard-document-service";
import { readJsonBody, whiteboardErrorResponse } from "@/modules/whiteboard/lib/whiteboard-http";
import { whiteboardImportBodySchema } from "@/modules/whiteboard/lib/whiteboard-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const parsed = whiteboardImportBodySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return whiteboardErrorResponse(400, "invalid_body", parsed.error.message);
  }
  try {
    const result = importWhiteboardSnapshot({
      clientId: parsed.data.clientId,
      schema: parsed.data.schema as unknown as SerializedSchema,
      records: parsed.data.records as unknown as TLRecord[]
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof WhiteboardNotEmptyError) {
      return whiteboardErrorResponse(409, "board_not_empty", error.message);
    }
    if (error instanceof WhiteboardRecordError) {
      return whiteboardErrorResponse(422, "invalid_record", error.message);
    }
    throw error;
  }
}
