import {
  createTLStore,
  defaultBindingUtils,
  defaultShapeUtils,
  toRichText,
  type TLRecord,
  type TLRichText,
  type TLStore
} from "tldraw";

/** Shape types an agent may create through MCP. */
export const WHITEBOARD_SHAPE_TYPES = ["geo", "text", "note", "arrow", "frame", "line", "draw"] as const;
export type WhiteboardShapeType = (typeof WHITEBOARD_SHAPE_TYPES)[number];

/** Shape types that carry `richText`. */
export const WHITEBOARD_TEXT_SHAPE_TYPES: ReadonlySet<string> = new Set(["geo", "text", "note", "arrow"]);

/** Shape types that can hold other shapes. */
export const WHITEBOARD_CONTAINER_SHAPE_TYPES: ReadonlySet<string> = new Set(["frame", "group"]);

/** A headless tldraw store with the default shapes and bindings (same schema as the canvas). */
export function createWhiteboardStore(): TLStore {
  return createTLStore({ shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils });
}

const defaultPropsCache = new Map<string, Record<string, unknown>>();

/** Default props of a shape type, as tldraw's ShapeUtil declares them. */
export function getDefaultShapeProps(type: string): Record<string, unknown> | null {
  const cached = defaultPropsCache.get(type);
  if (cached) {
    return structuredClone(cached);
  }
  const Util = defaultShapeUtils.find((util) => util.type === type);
  if (!Util) {
    return null;
  }
  // getDefaultProps reads no editor state for the default shapes.
  const util = new Util({} as never);
  const props = util.getDefaultProps() as unknown as Record<string, unknown>;
  defaultPropsCache.set(type, props);
  return structuredClone(props);
}

/** Default props of a binding type. */
export function getDefaultBindingProps(type: string): Record<string, unknown> | null {
  const Util = defaultBindingUtils.find((util) => util.type === type);
  if (!Util) {
    return null;
  }
  return new Util({} as never).getDefaultProps() as Record<string, unknown>;
}

/**
 * Record types shared through the server. tldraw also gives `user` (preferences) document scope;
 * it stays per browser like the session records.
 */
export const WHITEBOARD_SYNCED_TYPE_NAMES: ReadonlySet<string> = new Set(["document", "page", "shape", "binding", "asset"]);

/** True when the record belongs to the shared board (not to one browser's session or preferences). */
export function isDocumentScopeRecord(store: TLStore, record: { typeName: string }): boolean {
  const type = (store.schema.types as Record<string, { scope: string } | undefined>)[record.typeName];
  return type?.scope === "document" && WHITEBOARD_SYNCED_TYPE_NAMES.has(record.typeName);
}

export function isDocumentScopeTypeName(store: TLStore, typeName: string): boolean {
  return isDocumentScopeRecord(store, { typeName });
}

/** Plain text (one line per paragraph) to tldraw rich text. */
export function plainTextToRichText(text: string): TLRichText {
  return toRichText(text);
}

type RichTextNode = { type?: string; text?: string; content?: RichTextNode[] };

function nodeText(node: RichTextNode): string {
  if (node.type === "text") {
    return node.text ?? "";
  }
  if (node.type === "hardBreak") {
    return "\n";
  }
  return (node.content ?? []).map(nodeText).join("");
}

/** tldraw rich text back to plain text: block nodes joined by line breaks. */
export function richTextToPlainText(richText: unknown): string {
  const doc = richText as RichTextNode | null | undefined;
  if (!doc || !Array.isArray(doc.content)) {
    return "";
  }
  return doc.content.map(nodeText).join("\n");
}

export type WhiteboardDiff = { put: TLRecord[]; remove: TLRecord["id"][] };
