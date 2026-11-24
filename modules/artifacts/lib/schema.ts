import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

/** A titled document made of ordered tabs. */
export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

/** One Markdown page of an artifact; `position` is contiguous from 0. */
export const artifactTabs = sqliteTable("artifact_tabs", {
  id: text("id").primaryKey(),
  artifactId: text("artifact_id")
    .notNull()
    .references(() => artifacts.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  position: integer("position").notNull(),
  /** Incremented by every content or title write to this tab. */
  revision: integer("revision").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

/** A snapshot of the whole document; the highest `number` is the current one. */
export const artifactVersions = sqliteTable(
  "artifact_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    /** `agent`, `user` or `restore`. */
    source: text("source").notNull(),
    /** For `restore`: the version number that was restored. */
    restoredFrom: integer("restored_from"),
    title: text("title").notNull(),
    /** JSON `[{ id, title, position, content }]`. */
    tabs: text("tabs").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull()
  },
  (table) => [unique().on(table.artifactId, table.number)]
);
