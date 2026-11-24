import { z } from "zod";

/** Upper bound of records in one request from a tab. */
export const WHITEBOARD_MAX_RECORDS_PER_REQUEST = 20_000;

export const whiteboardClientIdSchema = z.string().trim().min(1).max(100);

/** Envelope only; each record is validated by the tldraw schema in the service. */
const recordSchema = z.looseObject({ id: z.string().min(1), typeName: z.string().min(1) });

export const whiteboardChangesBodySchema = z.object({
  clientId: whiteboardClientIdSchema,
  put: z.array(recordSchema).max(WHITEBOARD_MAX_RECORDS_PER_REQUEST),
  remove: z.array(z.string().min(1)).max(WHITEBOARD_MAX_RECORDS_PER_REQUEST)
});

export const whiteboardImportBodySchema = z.object({
  clientId: whiteboardClientIdSchema,
  schema: z.looseObject({ schemaVersion: z.number() }),
  records: z.array(recordSchema).max(WHITEBOARD_MAX_RECORDS_PER_REQUEST)
});

/** What GET /api/whiteboard answers; the tab validates it before loading the store. */
export const whiteboardDocumentResponseSchema = z.object({
  clock: z.number(),
  schema: z.looseObject({ schemaVersion: z.number() }),
  records: z.array(recordSchema)
});

export const whiteboardChangeEventSchema = z.object({
  clock: z.number(),
  sourceClientId: z.string(),
  put: z.array(recordSchema),
  remove: z.array(z.string())
});

export const whiteboardReadyEventSchema = z.object({ clock: z.number() });
