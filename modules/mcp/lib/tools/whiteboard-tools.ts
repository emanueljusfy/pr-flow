import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { TLStore } from "tldraw";
import { z } from "zod";
import { errorToolResult, jsonToolResult } from "@/modules/mcp/lib/mcp-tool-result";
import { sanitizeErrorForLog } from "@/modules/observability/lib/log-sanitize";
import { writeSystemLogFireAndForget } from "@/modules/observability/lib/system-logger";
import {
  WhiteboardOpError,
  clearPage,
  createPage,
  createShapes,
  deletePage,
  deleteShapes,
  duplicatePage,
  getShape,
  groupShapes,
  listPages,
  listShapes,
  renamePage,
  reorderShapes,
  ungroupShapes,
  updateShapes,
  type OpResult
} from "@/modules/whiteboard/lib/whiteboard-board-ops";
import { readWhiteboard, runWhiteboardOp } from "@/modules/whiteboard/lib/whiteboard-document-service";
import { WHITEBOARD_SHAPE_TYPES } from "@/modules/whiteboard/lib/whiteboard-tldraw";

const MCP_WHITEBOARD_LOG_SOURCE = "mcp:whiteboard";

/** Upper bound of shapes per create/update call. */
export const WHITEBOARD_MAX_SHAPES_PER_CALL = 200;
export const WHITEBOARD_MAX_PAGE_NAME = 200;

const pageIdSchema = z.string().trim().min(1).describe("Page id from list_whiteboard_pages, e.g. page:abc.");
const optionalPageIdSchema = pageIdSchema.optional().describe("Page id; defaults to the first page.");
const shapeIdSchema = z.string().trim().min(1).describe("Shape id, e.g. shape:abc.");
const pageNameSchema = z.string().trim().min(1).max(WHITEBOARD_MAX_PAGE_NAME);

const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
const terminalSchema = z.union([
  pointSchema.describe("A free point in the arrow parent's coordinates."),
  z
    .object({
      shapeId: shapeIdSchema,
      anchor: pointSchema
        .optional()
        .describe("Normalized point on the target's box (0,0 top-left, 1,1 bottom-right). Default center.")
    })
    .describe("Bind this end to a shape.")
]);

const shapeFields = {
  x: z.number().finite().optional().describe("Position relative to the parent (page, frame or group)."),
  y: z.number().finite().optional(),
  rotation: z.number().finite().optional().describe("Radians."),
  parentId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Page, frame or group to place the shape in. On update, the page position is kept unless x/y are given."),
  text: z
    .string()
    .max(20_000)
    .optional()
    .describe("Label text (geo, text, note, arrow); one paragraph per line. On a frame, sets its name."),
  props: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "tldraw props merged over the defaults, e.g. { geo: 'ellipse', w: 200, h: 80, color: 'blue', fill: 'solid', dash: 'dashed', size: 's'|'m'|'l'|'xl', font: 'draw'|'sans'|'serif'|'mono' }. Colors: black, grey, light-violet, violet, blue, light-blue, yellow, orange, green, light-green, light-red, red, white."
    ),
  start: terminalSchema.optional().describe("Arrow start: a point, or { shapeId } to bind it."),
  end: terminalSchema.optional().describe("Arrow end: a point, or { shapeId } to bind it."),
  points: z
    .array(pointSchema)
    .max(2000)
    .optional()
    .describe("line/draw points relative to the shape's x, y (at least 2).")
};

const shapeCreateSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe("Optional id so later shapes in the same call can reference it (parentId, arrow shapeId)."),
  type: z.enum(WHITEBOARD_SHAPE_TYPES),
  ...shapeFields
});

const shapeUpdateSchema = z.object({ id: shapeIdSchema, ...shapeFields });

function failure(tool: string, error: unknown): CallToolResult {
  if (error instanceof WhiteboardOpError) {
    return errorToolResult(error.message);
  }
  writeSystemLogFireAndForget({
    level: "error",
    source: MCP_WHITEBOARD_LOG_SOURCE,
    message: `${tool} failed`,
    details: { error: sanitizeErrorForLog(error) }
  });
  return errorToolResult(error instanceof Error ? error.message : String(error));
}

function read(tool: string, fn: (store: TLStore) => unknown): CallToolResult {
  try {
    return jsonToolResult(readWhiteboard(fn));
  } catch (error) {
    return failure(tool, error);
  }
}

function mutate<T>(tool: string, op: (store: TLStore) => OpResult<T>): CallToolResult {
  try {
    return jsonToolResult(runWhiteboardOp(op));
  } catch (error) {
    return failure(tool, error);
  }
}

const writeAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const destructiveAnnotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;
const readAnnotations = { readOnlyHint: true, openWorldHint: false } as const;

export function registerWhiteboardTools(server: McpServer): void {
  server.registerTool(
    "list_whiteboard_pages",
    {
      title: "List whiteboard pages",
      description: "Lists the pages of the user's tldraw whiteboard (PR Flow /whiteboard) in order, with shape counts.",
      inputSchema: {},
      annotations: readAnnotations
    },
    async () => read("list_whiteboard_pages", (store) => ({ pages: listPages(store) }))
  );

  server.registerTool(
    "create_whiteboard_page",
    {
      title: "Create whiteboard page",
      description: "Adds a page after the last one and returns its id.",
      inputSchema: { name: pageNameSchema },
      annotations: writeAnnotations
    },
    async ({ name }) => mutate("create_whiteboard_page", (store) => createPage(store, name))
  );

  server.registerTool(
    "rename_whiteboard_page",
    {
      title: "Rename whiteboard page",
      description: "Renames a page.",
      inputSchema: { pageId: pageIdSchema, name: pageNameSchema },
      annotations: writeAnnotations
    },
    async ({ pageId, name }) => mutate("rename_whiteboard_page", (store) => renamePage(store, pageId, name))
  );

  server.registerTool(
    "duplicate_whiteboard_page",
    {
      title: "Duplicate whiteboard page",
      description: "Copies a page with all its shapes and arrow bindings into a new page named '<name> (cópia)'.",
      inputSchema: { pageId: pageIdSchema },
      annotations: writeAnnotations
    },
    async ({ pageId }) => mutate("duplicate_whiteboard_page", (store) => duplicatePage(store, pageId))
  );

  server.registerTool(
    "clear_whiteboard_page",
    {
      title: "Clear whiteboard page",
      description: "Deletes every shape on a page and keeps the page. Confirm with the user first.",
      inputSchema: { pageId: pageIdSchema },
      annotations: destructiveAnnotations
    },
    async ({ pageId }) => mutate("clear_whiteboard_page", (store) => clearPage(store, pageId))
  );

  server.registerTool(
    "delete_whiteboard_page",
    {
      title: "Delete whiteboard page",
      description: "Deletes a page and everything on it. The last page cannot be deleted. Confirm with the user first.",
      inputSchema: { pageId: pageIdSchema },
      annotations: destructiveAnnotations
    },
    async ({ pageId }) => mutate("delete_whiteboard_page", (store) => deletePage(store, pageId))
  );

  server.registerTool(
    "list_whiteboard_shapes",
    {
      title: "List whiteboard shapes",
      description:
        "Lists every shape on a page (nested ones included) back to front, with position relative to its parent, size, text and tldraw props, plus arrow bindings.",
      inputSchema: { pageId: optionalPageIdSchema },
      annotations: readAnnotations
    },
    async ({ pageId }) => read("list_whiteboard_shapes", (store) => listShapes(store, pageId))
  );

  server.registerTool(
    "get_whiteboard_shape",
    {
      title: "Get whiteboard shape",
      description: "Returns one shape with its props and the ids of its children.",
      inputSchema: { shapeId: shapeIdSchema },
      annotations: readAnnotations
    },
    async ({ shapeId }) => read("get_whiteboard_shape", (store) => getShape(store, shapeId))
  );

  server.registerTool(
    "create_whiteboard_shapes",
    {
      title: "Create whiteboard shapes",
      description:
        "Creates shapes in one change (all or nothing): geo (rectangle, ellipse, diamond, ...), text, note (sticky), arrow (start/end bound to shapes or free), frame, line and draw (freehand from points). Later shapes may reference earlier ones by their `id`. Returns ids in input order.",
      inputSchema: {
        pageId: optionalPageIdSchema,
        shapes: z.array(shapeCreateSchema).min(1).max(WHITEBOARD_MAX_SHAPES_PER_CALL)
      },
      annotations: writeAnnotations
    },
    async ({ pageId, shapes }) => mutate("create_whiteboard_shapes", (store) => createShapes(store, pageId, shapes))
  );

  server.registerTool(
    "update_whiteboard_shapes",
    {
      title: "Update whiteboard shapes",
      description:
        "Edits shapes in one change (all or nothing): position, rotation, text, props, parent (move into or out of a frame/page), arrow ends. Fields not given stay as they are.",
      inputSchema: { shapes: z.array(shapeUpdateSchema).min(1).max(WHITEBOARD_MAX_SHAPES_PER_CALL) },
      annotations: writeAnnotations
    },
    async ({ shapes }) => mutate("update_whiteboard_shapes", (store) => updateShapes(store, shapes))
  );

  server.registerTool(
    "delete_whiteboard_shapes",
    {
      title: "Delete whiteboard shapes",
      description: "Deletes shapes, their children and the arrow bindings touching them.",
      inputSchema: { shapeIds: z.array(shapeIdSchema).min(1).max(WHITEBOARD_MAX_SHAPES_PER_CALL) },
      annotations: destructiveAnnotations
    },
    async ({ shapeIds }) => mutate("delete_whiteboard_shapes", (store) => deleteShapes(store, shapeIds))
  );

  server.registerTool(
    "group_whiteboard_shapes",
    {
      title: "Group whiteboard shapes",
      description: "Groups 2 or more shapes that share a parent, keeping where they are on the page.",
      inputSchema: { shapeIds: z.array(shapeIdSchema).min(2).max(WHITEBOARD_MAX_SHAPES_PER_CALL) },
      annotations: writeAnnotations
    },
    async ({ shapeIds }) => mutate("group_whiteboard_shapes", (store) => groupShapes(store, shapeIds))
  );

  server.registerTool(
    "ungroup_whiteboard_shapes",
    {
      title: "Ungroup whiteboard shapes",
      description: "Dissolves a group, moving its children to the group's parent without moving them on the page.",
      inputSchema: { groupId: shapeIdSchema },
      annotations: writeAnnotations
    },
    async ({ groupId }) => mutate("ungroup_whiteboard_shapes", (store) => ungroupShapes(store, groupId))
  );

  server.registerTool(
    "reorder_whiteboard_shapes",
    {
      title: "Reorder whiteboard shapes",
      description: "Changes the stacking order of shapes among their siblings.",
      inputSchema: {
        shapeIds: z.array(shapeIdSchema).min(1).max(WHITEBOARD_MAX_SHAPES_PER_CALL),
        action: z.enum(["bring_to_front", "bring_forward", "send_backward", "send_to_back"])
      },
      annotations: writeAnnotations
    },
    async ({ shapeIds, action }) =>
      mutate("reorder_whiteboard_shapes", (store) => reorderShapes(store, shapeIds, action))
  );
}
