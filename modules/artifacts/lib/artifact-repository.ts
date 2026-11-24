import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/modules/db/lib/db";
import { artifactTabs, artifactVersions, artifacts } from "@/modules/artifacts/lib/schema";

type Db = ReturnType<typeof getDb>;
/** What a repository function needs: the database or a transaction on it. */
export type ArtifactDb = Pick<Db, "select" | "insert" | "update" | "delete">;

export type ArtifactTab = {
  id: string;
  title: string;
  position: number;
  content: string;
  revision: number;
};

export type SnapshotTab = Omit<ArtifactTab, "revision">;
export type VersionSource = "agent" | "user" | "restore";

export type ArtifactRow = { id: string; title: string; createdAt: number; updatedAt: number };

export type VersionRow = {
  number: number;
  source: VersionSource;
  restoredFrom: number | null;
  title: string;
  tabs: SnapshotTab[];
  createdAt: number;
  updatedAt: number;
};

export type ArtifactSummaryRow = ArtifactRow & { tabCount: number; versionCount: number };

export function inTransaction<T>(run: (tx: ArtifactDb) => T): T {
  return getDb().transaction((tx) => run(tx as unknown as ArtifactDb));
}

export function readDb(): ArtifactDb {
  return getDb();
}

export function listArtifactRows(db: ArtifactDb): ArtifactSummaryRow[] {
  const tabCounts = new Map(
    db
      .select({ id: artifactTabs.artifactId, count: sql<number>`count(*)` })
      .from(artifactTabs)
      .groupBy(artifactTabs.artifactId)
      .all()
      .map((row) => [row.id, Number(row.count)])
  );
  const versionCounts = new Map(
    db
      .select({ id: artifactVersions.artifactId, count: sql<number>`count(*)` })
      .from(artifactVersions)
      .groupBy(artifactVersions.artifactId)
      .all()
      .map((row) => [row.id, Number(row.count)])
  );
  return db
    .select()
    .from(artifacts)
    .orderBy(desc(artifacts.updatedAt), desc(artifacts.createdAt), desc(sql`rowid`))
    .all()
    .map((row) => ({
      ...row,
      tabCount: tabCounts.get(row.id) ?? 0,
      versionCount: versionCounts.get(row.id) ?? 0
    }));
}

export function getArtifactRow(db: ArtifactDb, id: string): ArtifactRow | undefined {
  return db.select().from(artifacts).where(eq(artifacts.id, id)).get();
}

export function getTabs(db: ArtifactDb, artifactId: string): ArtifactTab[] {
  return db
    .select({
      id: artifactTabs.id,
      title: artifactTabs.title,
      position: artifactTabs.position,
      content: artifactTabs.content,
      revision: artifactTabs.revision
    })
    .from(artifactTabs)
    .where(eq(artifactTabs.artifactId, artifactId))
    .orderBy(asc(artifactTabs.position))
    .all();
}

export function insertArtifact(db: ArtifactDb, row: ArtifactRow): void {
  db.insert(artifacts).values(row).run();
}

export function touchArtifact(db: ArtifactDb, id: string, now: number, title?: string): void {
  db.update(artifacts)
    .set(title === undefined ? { updatedAt: now } : { updatedAt: now, title })
    .where(eq(artifacts.id, id))
    .run();
}

export function deleteArtifactRow(db: ArtifactDb, id: string): void {
  db.delete(artifacts).where(eq(artifacts.id, id)).run();
}

export function insertTab(db: ArtifactDb, artifactId: string, tab: ArtifactTab, now: number): void {
  db.insert(artifactTabs)
    .values({ ...tab, artifactId, createdAt: now, updatedAt: now })
    .run();
}

export function updateTabFields(
  db: ArtifactDb,
  tabId: string,
  fields: { title?: string; content?: string; revision?: number; position?: number },
  now: number
): void {
  db.update(artifactTabs)
    .set({ ...fields, updatedAt: now })
    .where(eq(artifactTabs.id, tabId))
    .run();
}

export function shiftPositionsFrom(db: ArtifactDb, artifactId: string, from: number, by: number): void {
  db.update(artifactTabs)
    .set({ position: sql`${artifactTabs.position} + ${by}` })
    .where(and(eq(artifactTabs.artifactId, artifactId), gte(artifactTabs.position, from)))
    .run();
}

export function deleteTabRow(db: ArtifactDb, tabId: string): void {
  db.delete(artifactTabs).where(eq(artifactTabs.id, tabId)).run();
}

function toVersionRow(row: typeof artifactVersions.$inferSelect): VersionRow {
  return {
    number: row.number,
    source: row.source as VersionSource,
    restoredFrom: row.restoredFrom,
    title: row.title,
    tabs: JSON.parse(row.tabs) as SnapshotTab[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function getLatestVersion(db: ArtifactDb, artifactId: string): VersionRow | undefined {
  const row = db
    .select()
    .from(artifactVersions)
    .where(eq(artifactVersions.artifactId, artifactId))
    .orderBy(desc(artifactVersions.number))
    .limit(1)
    .get();
  return row ? toVersionRow(row) : undefined;
}

export function getVersionRow(db: ArtifactDb, artifactId: string, number: number): VersionRow | undefined {
  const row = db
    .select()
    .from(artifactVersions)
    .where(and(eq(artifactVersions.artifactId, artifactId), eq(artifactVersions.number, number)))
    .get();
  return row ? toVersionRow(row) : undefined;
}

export function listVersionRows(db: ArtifactDb, artifactId: string): VersionRow[] {
  return db
    .select()
    .from(artifactVersions)
    .where(eq(artifactVersions.artifactId, artifactId))
    .orderBy(desc(artifactVersions.number))
    .all()
    .map(toVersionRow);
}

export function insertVersion(db: ArtifactDb, artifactId: string, version: VersionRow): void {
  db.insert(artifactVersions)
    .values({ ...version, artifactId, tabs: JSON.stringify(version.tabs) })
    .run();
}

/** Replaces the snapshot of an existing version (a grouped user session). */
export function replaceVersionSnapshot(
  db: ArtifactDb,
  artifactId: string,
  number: number,
  snapshot: { title: string; tabs: SnapshotTab[] },
  now: number
): void {
  db.update(artifactVersions)
    .set({ title: snapshot.title, tabs: JSON.stringify(snapshot.tabs), updatedAt: now })
    .where(and(eq(artifactVersions.artifactId, artifactId), eq(artifactVersions.number, number)))
    .run();
}
