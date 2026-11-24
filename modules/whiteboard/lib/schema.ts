import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** One row per tldraw document-scope record (document, page, shape, binding, asset). */
export const whiteboardRecords = sqliteTable("whiteboard_records", {
  /** tldraw record id, e.g. `shape:abc`. */
  id: text("id").primaryKey(),
  typeName: text("type_name").notNull(),
  /** The full tldraw record as JSON. */
  record: text("record").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

/** Board metadata: `schema` (tldraw SerializedSchema JSON) and `clock`. */
export const whiteboardMeta = sqliteTable("whiteboard_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull()
});
