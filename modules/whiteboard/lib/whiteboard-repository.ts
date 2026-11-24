import { inArray } from "drizzle-orm";
import type { SerializedSchema, TLRecord } from "tldraw";
import { getDb } from "@/modules/db/lib/db";
import { whiteboardMeta, whiteboardRecords } from "@/modules/whiteboard/lib/schema";

const META_SCHEMA = "schema";
const META_CLOCK = "clock";

export type StoredWhiteboard = {
  records: TLRecord[];
  schema: SerializedSchema | null;
  clock: number;
};

export function loadStoredWhiteboard(): StoredWhiteboard {
  const db = getDb();
  const rows = db.select().from(whiteboardRecords).all();
  const meta = new Map(
    db
      .select()
      .from(whiteboardMeta)
      .all()
      .map((row) => [row.key, row.value])
  );
  const schemaJson = meta.get(META_SCHEMA);
  return {
    records: rows.map((row) => JSON.parse(row.record) as TLRecord),
    schema: schemaJson ? (JSON.parse(schemaJson) as SerializedSchema) : null,
    clock: Number(meta.get(META_CLOCK) ?? 0)
  };
}

type PersistInput = {
  put: TLRecord[];
  remove: string[];
  schema: SerializedSchema;
  clock: number;
  /** Delete every stored record before writing `put` (import). */
  replaceAll?: boolean;
};

/** Writes one board change atomically: records, schema and clock. */
export function persistWhiteboardChange(input: PersistInput): void {
  const db = getDb();
  const now = new Date();
  db.transaction((tx) => {
    if (input.replaceAll) {
      tx.delete(whiteboardRecords).run();
    } else if (input.remove.length > 0) {
      tx.delete(whiteboardRecords).where(inArray(whiteboardRecords.id, input.remove)).run();
    }
    for (const record of input.put) {
      const json = JSON.stringify(record);
      tx.insert(whiteboardRecords)
        .values({ id: record.id, typeName: record.typeName, record: json, updatedAt: now })
        .onConflictDoUpdate({
          target: whiteboardRecords.id,
          set: { typeName: record.typeName, record: json, updatedAt: now }
        })
        .run();
    }
    for (const [key, value] of [
      [META_SCHEMA, JSON.stringify(input.schema)],
      [META_CLOCK, String(input.clock)]
    ] as const) {
      tx.insert(whiteboardMeta)
        .values({ key, value })
        .onConflictDoUpdate({ target: whiteboardMeta.key, set: { value } })
        .run();
    }
  });
}
