import { z } from "zod";

export const ARTIFACT_MAX_TITLE = 200;
export const ARTIFACT_MAX_CONTENT = 500_000;
export const ARTIFACT_MAX_TABS = 50;
/** A user version keeps absorbing edits until it is this old. */
export const ARTIFACT_USER_VERSION_WINDOW_MS = 10 * 60 * 1000;

export const artifactTitleSchema = z.string().trim().min(1).max(ARTIFACT_MAX_TITLE);
export const artifactContentSchema = z.string().max(ARTIFACT_MAX_CONTENT);
export const artifactClientIdSchema = z.string().trim().min(1).max(100);

export const artifactCreateBodySchema = z.object({
  clientId: artifactClientIdSchema,
  title: artifactTitleSchema
});

export const artifactPatchBodySchema = z.object({
  clientId: artifactClientIdSchema,
  title: artifactTitleSchema
});

export const artifactTabCreateBodySchema = z.object({
  clientId: artifactClientIdSchema,
  title: artifactTitleSchema.optional(),
  content: artifactContentSchema.optional()
});

export const artifactTabUpdateBodySchema = z.object({
  clientId: artifactClientIdSchema,
  baseRevision: z.number().int().min(0),
  title: artifactTitleSchema.optional(),
  content: artifactContentSchema.optional()
});

export const artifactTabOrderBodySchema = z.object({
  clientId: artifactClientIdSchema,
  tabIds: z.array(z.string().min(1)).min(1).max(ARTIFACT_MAX_TABS)
});

export const artifactRestoreBodySchema = z.object({ clientId: artifactClientIdSchema });

export const artifactVersionNumberSchema = z.coerce.number().int().min(1);

/** `?clientId=` of the DELETE routes and the events stream. */
export const artifactClientIdQuerySchema = artifactClientIdSchema;

const tabSchema = z.object({
  id: z.string(),
  title: z.string(),
  position: z.number(),
  content: z.string(),
  revision: z.number()
});

const summarySchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.number(),
  tabCount: z.number(),
  versionCount: z.number()
});

/** Responses the page validates before trusting them (zod-validation.md: third-party and network data). */
export const artifactListResponseSchema = z.object({ artifacts: z.array(summarySchema) });
export const artifactDetailResponseSchema = z.object({
  artifact: z.object({
    id: z.string(),
    title: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
    tabs: z.array(tabSchema)
  })
});
export const artifactTabResponseSchema = z.object({ tab: tabSchema });

const versionSourceSchema = z.enum(["agent", "user", "restore"]);
export const artifactVersionsResponseSchema = z.object({
  versions: z.array(
    z.object({
      number: z.number(),
      source: versionSourceSchema,
      restoredFrom: z.number().nullable(),
      title: z.string(),
      tabCount: z.number(),
      createdAt: z.number(),
      updatedAt: z.number()
    })
  )
});
export const artifactVersionResponseSchema = z.object({
  version: z.object({
    number: z.number(),
    source: versionSourceSchema,
    restoredFrom: z.number().nullable(),
    title: z.string(),
    tabs: z.array(z.object({ id: z.string(), title: z.string(), position: z.number(), content: z.string() })),
    createdAt: z.number(),
    updatedAt: z.number()
  })
});

export const artifactEventSchema = z.object({
  type: z.enum(["upsert", "delete"]),
  id: z.string(),
  tabIds: z.array(z.string()),
  source: z.enum(["agent", "user"])
});
export type ArtifactEventPayload = z.infer<typeof artifactEventSchema>;
