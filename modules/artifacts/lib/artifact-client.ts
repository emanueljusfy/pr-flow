import type { z } from "zod";
import {
  artifactDetailResponseSchema,
  artifactListResponseSchema,
  artifactTabResponseSchema,
  artifactVersionResponseSchema,
  artifactVersionsResponseSchema
} from "@/modules/artifacts/lib/artifact-validation";

export type ArtifactDetailDto = z.infer<typeof artifactDetailResponseSchema>["artifact"];
export type ArtifactTabDto = ArtifactDetailDto["tabs"][number];
export type ArtifactSummaryDto = z.infer<typeof artifactListResponseSchema>["artifacts"][number];
export type ArtifactVersionSummaryDto = z.infer<typeof artifactVersionsResponseSchema>["versions"][number];
export type ArtifactVersionDto = z.infer<typeof artifactVersionResponseSchema>["version"];

/** A request that did not succeed: `status` 0 means the network failed. */
export class ArtifactRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    /** The server's current tab on `revision_conflict`. */
    readonly tab: ArtifactTabDto | null = null
  ) {
    super(`artifact request failed (${status}${code ? ` ${code}` : ""})`);
    this.name = "ArtifactRequestError";
  }
}

let clientId: string | null = null;

/** Identifies this browser tab to the server so its own writes are not echoed back. */
export function getArtifactClientId(): string {
  clientId ??= crypto.randomUUID();
  return clientId;
}

async function send(url: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined
    });
  } catch {
    throw new ArtifactRequestError(0, null);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: unknown; tab?: unknown } | null;
    const tab = artifactTabResponseSchema.safeParse({ tab: body?.tab });
    throw new ArtifactRequestError(
      response.status,
      typeof body?.error === "string" ? body.error : null,
      tab.success ? tab.data.tab : null
    );
  }
  return response;
}

async function request<S extends z.ZodType>(schema: S, url: string, init?: RequestInit): Promise<z.infer<S>> {
  const response = await send(url, init);
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new ArtifactRequestError(response.status, "invalid_response");
  }
  return parsed.data;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export async function fetchArtifactList(query: string): Promise<ArtifactSummaryDto[]> {
  const url = query.trim() ? `/api/artifacts?q=${encodeURIComponent(query.trim())}` : "/api/artifacts";
  return (await request(artifactListResponseSchema, url)).artifacts;
}

export async function fetchArtifact(id: string): Promise<ArtifactDetailDto> {
  return (await request(artifactDetailResponseSchema, `/api/artifacts/${id}`)).artifact;
}

export async function postArtifact(title: string): Promise<ArtifactDetailDto> {
  return (
    await request(
      artifactDetailResponseSchema,
      "/api/artifacts",
      json("POST", { clientId: getArtifactClientId(), title })
    )
  ).artifact;
}

export async function patchArtifactTitle(id: string, title: string): Promise<void> {
  await send(`/api/artifacts/${id}`, json("PATCH", { clientId: getArtifactClientId(), title }));
}

export async function removeArtifact(id: string): Promise<void> {
  await send(`/api/artifacts/${id}?clientId=${encodeURIComponent(getArtifactClientId())}`, { method: "DELETE" });
}

export async function postTab(id: string, title?: string): Promise<ArtifactTabDto> {
  return (
    await request(
      artifactTabResponseSchema,
      `/api/artifacts/${id}/tabs`,
      json("POST", { clientId: getArtifactClientId(), title })
    )
  ).tab;
}

export async function putTab(
  id: string,
  tabId: string,
  input: { baseRevision: number; title?: string; content?: string }
): Promise<ArtifactTabDto> {
  return (
    await request(
      artifactTabResponseSchema,
      `/api/artifacts/${id}/tabs/${tabId}`,
      json("PUT", { clientId: getArtifactClientId(), ...input })
    )
  ).tab;
}

export async function removeTab(id: string, tabId: string): Promise<void> {
  await send(`/api/artifacts/${id}/tabs/${tabId}?clientId=${encodeURIComponent(getArtifactClientId())}`, {
    method: "DELETE"
  });
}

export async function putTabOrder(id: string, tabIds: string[]): Promise<void> {
  await send(`/api/artifacts/${id}/tab-order`, json("PUT", { clientId: getArtifactClientId(), tabIds }));
}

export async function fetchVersions(id: string): Promise<ArtifactVersionSummaryDto[]> {
  return (await request(artifactVersionsResponseSchema, `/api/artifacts/${id}/versions`)).versions;
}

export async function fetchVersion(id: string, number: number): Promise<ArtifactVersionDto> {
  return (await request(artifactVersionResponseSchema, `/api/artifacts/${id}/versions/${number}`)).version;
}

export async function postRestore(id: string, number: number): Promise<void> {
  await send(`/api/artifacts/${id}/versions/${number}/restore`, json("POST", { clientId: getArtifactClientId() }));
}
