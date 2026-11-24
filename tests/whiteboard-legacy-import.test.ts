import type { TLStore } from "tldraw";
import { describe, expect, it } from "vitest";
import { GET as getBoard } from "@/app/api/whiteboard/route";
import { POST as postChanges } from "@/app/api/whiteboard/changes/route";
import { POST as postImport } from "@/app/api/whiteboard/import/route";
import { getWhiteboardDocument } from "@/modules/whiteboard/lib/whiteboard-document-service";
import { readLegacyWhiteboard } from "@/modules/whiteboard/lib/whiteboard-legacy-board";
import { WhiteboardSyncClient } from "@/modules/whiteboard/lib/whiteboard-sync-client";
import {
  createWhiteboardStore,
  getDefaultShapeProps,
  plainTextToRichText
} from "@/modules/whiteboard/lib/whiteboard-tldraw";
import { withWhiteboardTestDb } from "./whiteboard-test-db";

const DB_NAME = "TLDRAW_DOCUMENT_v2pr-flow-whiteboard";

type Stores = Record<string, Map<string, unknown>>;

/** Minimal IDBFactory over in-memory maps that records every access. */
function fakeIndexedDb(databases: Record<string, Stores>) {
  const log: string[] = [];
  const request = <T>(result: T) => {
    const req = { result, error: null, onsuccess: null as null | (() => void), onerror: null };
    queueMicrotask(() => req.onsuccess?.());
    return req as unknown as IDBRequest<T>;
  };
  const factory = {
    databases: async () => Object.keys(databases).map((name) => ({ name, version: 4 })),
    open(name: string) {
      log.push(`open:${name}`);
      databases[name] ??= {}; // what a real open does to a missing database
      const stores = databases[name]!;
      const db = {
        objectStoreNames: { contains: (store: string) => store in stores },
        transaction(names: string[], mode: string) {
          log.push(`tx:${mode}:${names.join(",")}`);
          return {
            objectStore(store: string) {
              const data = stores[store]!;
              return {
                getAll: () => request([...data.values()]),
                get: (key: string) => request(data.get(key)),
                put: () => {
                  log.push("write");
                },
                delete: () => {
                  log.push("write");
                },
                clear: () => {
                  log.push("write");
                }
              };
            }
          };
        },
        close: () => log.push("close")
      };
      return request(db);
    }
  } as unknown as IDBFactory;
  return { factory, log, databases };
}

function legacyStores(withShape: boolean): Stores {
  const current = getWhiteboardDocument();
  const records = new Map<string, unknown>([
    ["document:document", { id: "document:document", typeName: "document", gridSize: 10, name: "", meta: {} }],
    ["page:old", { id: "page:old", typeName: "page", name: "Meu quadro", index: "a1", meta: {} }]
  ]);
  if (withShape) {
    records.set("shape:legacy", {
      id: "shape:legacy",
      typeName: "shape",
      type: "note",
      parentId: "page:old",
      index: "a1",
      x: 0,
      y: 0,
      rotation: 0,
      isLocked: false,
      opacity: 1,
      meta: {},
      props: { ...getDefaultShapeProps("note"), richText: plainTextToRichText("antigo") }
    });
  }
  return {
    records,
    schema: new Map([["schema", current.schema]]),
    session_state: new Map(),
    assets: new Map()
  };
}

async function startWith(factory: IDBFactory): Promise<{ store: TLStore; posts: string[] }> {
  const store = createWhiteboardStore();
  const posts: string[] = [];
  const routeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const request = new Request(`http://localhost${url}`, init);
    if (init?.method === "POST") posts.push(url);
    if (url === "/api/whiteboard") return getBoard();
    if (url === "/api/whiteboard/import") return postImport(request);
    if (url === "/api/whiteboard/changes") return postChanges(request);
    throw new Error(url);
  };
  const client = new WhiteboardSyncClient({
    store,
    clientId: "tab",
    fetch: routeFetch,
    createEventSource: () => ({ addEventListener() {}, close() {} }),
    readLegacyBoard: () => readLegacyWhiteboard(factory),
    debounceMs: 0
  });
  await client.start();
  client.stop();
  return { store, posts };
}

describe("legacy whiteboard import", () => {
  it("imports the local board only when the server board is empty", () =>
    withWhiteboardTestDb(async () => {
      // empty server + local board with a shape → imported and shown
      const local = fakeIndexedDb({ [DB_NAME]: legacyStores(true) });
      const first = await startWith(local.factory);
      expect(first.posts).toEqual(["/api/whiteboard/import"]);
      expect(first.store.get("shape:legacy" as never)).toMatchObject({ type: "note" });
      expect(first.store.get("page:old" as never)).toMatchObject({ name: "Meu quadro" });
      expect(getWhiteboardDocument().records.some((r) => r.id === "shape:legacy")).toBe(true);

      // server board no longer empty → a second tab does not import
      const again = await startWith(fakeIndexedDb({ [DB_NAME]: legacyStores(true) }).factory);
      expect(again.posts).toEqual([]);
    }));

  it("does not import a local board without shapes", () =>
    withWhiteboardTestDb(async () => {
      const { posts } = await startWith(fakeIndexedDb({ [DB_NAME]: legacyStores(false) }).factory);
      expect(posts).toEqual([]);
    }));

  it("leaves local data in place", () =>
    withWhiteboardTestDb(async () => {
      const present = fakeIndexedDb({ [DB_NAME]: legacyStores(true) });
      const before = [...present.databases[DB_NAME]!.records!.keys()];
      const board = await readLegacyWhiteboard(present.factory);
      expect(board?.records.map((r) => r.id).sort()).toEqual(before.sort());
      expect(present.log.filter((entry) => entry.startsWith("tx:"))).toEqual(["tx:readonly:records,schema"]);
      expect(present.log).not.toContain("write");
      expect(present.log.at(-1)).toBe("close");
      expect([...present.databases[DB_NAME]!.records!.keys()]).toEqual(before);

      const absent = fakeIndexedDb({});
      expect(await readLegacyWhiteboard(absent.factory)).toBeNull();
      expect(absent.log).toEqual([]);
      expect(Object.keys(absent.databases)).toEqual([]);
    }));
});
