import type { z } from "zod";
import { ptBR } from "@/modules/messages/pt-BR";
import { ArtifactError } from "@/modules/artifacts/lib/artifact-service";

export type { ArtifactErrorCode } from "@/modules/artifacts/lib/artifact-service";
import type { ArtifactErrorCode } from "@/modules/artifacts/lib/artifact-service";

/** Same shape as the whiteboard routes: `{ error: code, message }`. */
export function artifactErrorResponse(
  status: number,
  error: ArtifactErrorCode,
  message: string,
  extra?: Record<string, unknown>
): Response {
  return Response.json({ error, message, ...extra }, { status });
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

const STATUS_BY_CODE = { not_found: 404, invalid_body: 400, last_tab: 409, revision_conflict: 409 } as const;

/** Runs a route body and answers the service's `ArtifactError`s with the shared error shape. */
export async function handleArtifactRoute(run: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ArtifactError) {
      return artifactErrorResponse(
        STATUS_BY_CODE[error.code],
        error.code,
        error.message,
        error.tab ? { tab: error.tab } : undefined
      );
    }
    throw error;
  }
}

/** Parses `body` with `schema`; the response to send when it is invalid, or the data. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): { data: T } | { response: Response } {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      response: artifactErrorResponse(400, "invalid_body", ptBR.artifacts.errors.invalidBody(parsed.error.message))
    };
  }
  return { data: parsed.data };
}
