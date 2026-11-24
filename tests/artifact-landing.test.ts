import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withArtifactTestDb } from "./artifact-test-db";

describe("artifact landing", () => {
  it("migration creates the artifact tables", () =>
    withArtifactTestDb(async () => {
      const { getDb } = await import("@/modules/db/lib/db");
      const { artifactVersions, artifacts, artifactTabs } = await import("@/modules/artifacts/lib/schema");
      const db = getDb();

      const tables = db
        .all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'artifact%'`)
        .map((row) => row.name)
        .sort();
      expect(tables).toEqual(["artifact_tabs", "artifact_versions", "artifacts"]);

      for (const table of ["artifact_tabs", "artifact_versions"]) {
        const keys = db.all<{ table: string; on_delete: string }>(sql.raw(`PRAGMA foreign_key_list(${table})`));
        expect(keys, table).toEqual([expect.objectContaining({ table: "artifacts", on_delete: "CASCADE" })]);
      }
      const columns = (table: string) =>
        db.all<{ name: string; notnull: number }>(sql.raw(`PRAGMA table_info(${table})`)).map((c) => c.name);
      expect(columns("artifacts")).toEqual(["id", "title", "created_at", "updated_at"]);
      expect(columns("artifact_tabs")).toEqual([
        "id",
        "artifact_id",
        "title",
        "content",
        "position",
        "revision",
        "created_at",
        "updated_at"
      ]);
      expect(columns("artifact_versions")).toEqual([
        "id",
        "artifact_id",
        "number",
        "source",
        "restored_from",
        "title",
        "tabs",
        "created_at",
        "updated_at"
      ]);

      db.insert(artifacts).values({ id: "a1", title: "T", createdAt: 1, updatedAt: 1 }).run();
      db.insert(artifactTabs)
        .values({ id: "t1", artifactId: "a1", title: "A", content: "", position: 0, revision: 1, createdAt: 1, updatedAt: 1 })
        .run();
      const version = { artifactId: "a1", number: 1, source: "agent", title: "T", tabs: "[]", createdAt: 1, updatedAt: 1 };
      db.insert(artifactVersions).values(version).run();
      expect(() => db.insert(artifactVersions).values(version).run()).toThrow();
      db.insert(artifactVersions).values({ ...version, number: 2 }).run();

      db.delete(artifacts).run();
      expect(db.select().from(artifactTabs).all()).toEqual([]);
      expect(db.select().from(artifactVersions).all()).toEqual([]);
    }));
});
