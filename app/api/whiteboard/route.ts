import { getWhiteboardDocument } from "@/modules/whiteboard/lib/whiteboard-document-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(): Response {
  return Response.json(getWhiteboardDocument());
}
