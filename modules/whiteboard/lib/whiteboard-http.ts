export type WhiteboardErrorCode = "invalid_body" | "invalid_record" | "board_not_empty";

export function whiteboardErrorResponse(status: number, error: WhiteboardErrorCode, message: string): Response {
  return Response.json({ error, message }, { status });
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
