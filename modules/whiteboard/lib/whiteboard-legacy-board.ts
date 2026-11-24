import type { SerializedSchema, TLRecord } from "tldraw";
import { WHITEBOARD_PERSISTENCE_KEY } from "@/modules/whiteboard/lib/whiteboard-theme";

/** Where tldraw's `persistenceKey` kept the board (see @tldraw/editor LocalIndexedDb). */
const TLDRAW_DB_PREFIX = "TLDRAW_DOCUMENT_v2";
const TLDRAW_DB_NAME_INDEX_KEY = "TLDRAW_DB_NAME_INDEX_v2";

export type LegacyWhiteboard = { schema: SerializedSchema; records: TLRecord[] };

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function databaseExists(factory: IDBFactory, name: string): Promise<boolean> {
  if (typeof factory.databases === "function") {
    const databases = await factory.databases();
    return databases.some((db) => db.name === name);
  }
  try {
    const raw = globalThis.localStorage?.getItem(TLDRAW_DB_NAME_INDEX_KEY);
    const names = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(names) && names.includes(name);
  } catch {
    return false;
  }
}

/**
 * Reads the board tldraw stored in this browser before it moved to the server.
 * Read-only: never creates the database and leaves its data in place.
 */
export async function readLegacyWhiteboard(
  factory: IDBFactory | undefined = globalThis.indexedDB,
  persistenceKey: string = WHITEBOARD_PERSISTENCE_KEY
): Promise<LegacyWhiteboard | null> {
  if (!factory) {
    return null;
  }
  const name = TLDRAW_DB_PREFIX + persistenceKey;
  if (!(await databaseExists(factory, name))) {
    return null;
  }
  const db = await request(factory.open(name));
  try {
    if (!db.objectStoreNames.contains("records") || !db.objectStoreNames.contains("schema")) {
      return null;
    }
    const tx = db.transaction(["records", "schema"], "readonly");
    const [records, schema] = await Promise.all([
      request(tx.objectStore("records").getAll() as IDBRequest<TLRecord[]>),
      request(tx.objectStore("schema").get("schema") as IDBRequest<SerializedSchema | undefined>)
    ]);
    if (!schema || !Array.isArray(records)) {
      return null;
    }
    return { schema, records };
  } finally {
    db.close();
  }
}

/** True when the legacy board holds at least one shape worth importing. */
export function legacyWhiteboardHasShapes(board: LegacyWhiteboard | null): board is LegacyWhiteboard {
  return !!board && board.records.some((record) => record.typeName === "shape");
}
