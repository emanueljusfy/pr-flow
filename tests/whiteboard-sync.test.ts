import { Editor, defaultBindingUtils, defaultShapeUtils, TLINSTANCE_ID, type TLRecord, type TLStore } from "tldraw";
import { describe, expect, it, vi } from "vitest";
import { GET as getBoard } from "@/app/api/whiteboard/route";
import { POST as postChanges } from "@/app/api/whiteboard/changes/route";
import { POST as postImport } from "@/app/api/whiteboard/import/route";
import { createPage, createShapes, deletePage, listPages } from "@/modules/whiteboard/lib/whiteboard-board-ops";
import {
  getWhiteboardDocument,
  readWhiteboard,
  runWhiteboardOp,
  subscribeWhiteboard,
  type WhiteboardChangeEvent
} from "@/modules/whiteboard/lib/whiteboard-document-service";
import { WhiteboardSyncClient, type EventSourceLike } from "@/modules/whiteboard/lib/whiteboard-sync-client";
import { createWhiteboardStore } from "@/modules/whiteboard/lib/whiteboard-tldraw";
import { withWhiteboardTestDb } from "./whiteboard-test-db";

class FakeEventSource implements EventSourceLike {
  listeners = new Map<string, ((event: MessageEvent) => void)[]>();
  closed = false;
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data: JSON.stringify(data) }));
    }
  }
  close() {
    this.closed = true;
  }
}

type Harness = {
  store: TLStore;
  client: WhiteboardSyncClient;
  events: FakeEventSource;
  calls: { url: string; method: string; body?: unknown }[];
  saveStatus: string[];
  failChanges: { value: boolean };
};

async function startClient(options: { clientId?: string; failLoad?: boolean } = {}): Promise<Harness> {
  const store = createWhiteboardStore();
  const events = new FakeEventSource();
  const calls: Harness["calls"] = [];
  const saveStatus: string[] = [];
  const failChanges = { value: false };
  const routeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (options.failLoad && url === "/api/whiteboard") {
      return new Response("boom", { status: 500 });
    }
    const request = new Request(`http://localhost${url}`, init);
    if (url === "/api/whiteboard") return getBoard();
    if (url === "/api/whiteboard/changes") {
      if (failChanges.value) return new Response("down", { status: 503 });
      return postChanges(request);
    }
    if (url === "/api/whiteboard/import") return postImport(request);
    throw new Error(`unexpected ${url}`);
  };
  const client = new WhiteboardSyncClient({
    store,
    clientId: options.clientId ?? "tab-1",
    fetch: routeFetch,
    createEventSource: () => events,
    readLegacyBoard: async () => null,
    debounceMs: 0,
    onSaveStatus: (status) => saveStatus.push(status)
  });
  await client.start();
  return { store, client, events, calls, saveStatus, failChanges };
}

const docRecords = (store: TLStore) =>
  store
    .allRecords()
    .filter((r) => ["document", "page", "shape", "binding"].includes(r.typeName))
    .sort((a, b) => a.id.localeCompare(b.id));

function geoShape(store: TLStore, id: string, x = 0): TLRecord {
  const pageId = store.allRecords().find((r) => r.typeName === "page")!.id;
  return store.schema.types.shape.create({
    id: id as never,
    type: "geo",
    parentId: pageId as never,
    index: "a9" as never,
    x,
    y: 0,
    props: {
      w: 100,
      h: 100,
      geo: "rectangle",
      dash: "draw",
      growY: 0,
      url: "",
      scale: 1,
      flipX: false,
      flipY: false,
      color: "black",
      labelColor: "black",
      fill: "none",
      size: "m",
      font: "draw",
      align: "middle",
      verticalAlign: "middle",
      richText: { type: "doc", content: [{ type: "paragraph" }] }
    } as never
  }) as TLRecord;
}

function createEditor(store: TLStore) {
  return new Editor({
    store,
    shapeUtils: defaultShapeUtils,
    bindingUtils: defaultBindingUtils,
    tools: [],
    getContainer: () => document.createElement("div")
  });
}

describe("whiteboard sync client", () => {
  it("loads the server board on start", () =>
    withWhiteboardTestDb(async () => {
      runWhiteboardOp((store) => createShapes(store, undefined, [{ type: "geo", x: 7 }, { type: "note" }]));
      const { store, calls } = await startClient();
      expect(calls[0]).toMatchObject({ url: "/api/whiteboard", method: "GET" });
      const server = getWhiteboardDocument().records.sort((a, b) => a.id.localeCompare(b.id));
      expect(docRecords(store)).toEqual(server);
    }));

  it("sends user document changes only", () =>
    withWhiteboardTestDb(async () => {
      const { store, client, calls } = await startClient();
      const shape = geoShape(store, "shape:user", 33);
      store.put([shape]);
      const editor = createEditor(store); // creates session records (instance, camera, page state)
      editor.updateInstanceState({ isGridMode: true });
      await client.flush();
      const posts = calls.filter((c) => c.url === "/api/whiteboard/changes");
      expect(posts.length).toBeGreaterThan(0);
      const sentTypes = posts.flatMap((p) => (p.body as { put: TLRecord[] }).put.map((r) => r.typeName));
      expect(sentTypes).toContain("shape");
      expect(sentTypes.filter((t) => !["document", "page", "shape", "binding", "asset"].includes(t))).toEqual([]);
      const server = getWhiteboardDocument().records.find((r) => r.id === "shape:user");
      expect(server).toMatchObject({ x: 33 });
      editor.dispose();
    }));

  it("applies server change events", () =>
    withWhiteboardTestDb(async () => {
      const { store, events } = await startClient();
      const seen: WhiteboardChangeEvent[] = [];
      subscribeWhiteboard("tab-1", (e) => seen.push(e));
      subscribeWhiteboard("spy", (e) => events.emit("changes", e));
      const { ids } = runWhiteboardOp((s) => createShapes(s, undefined, [{ type: "geo", x: 70 }]));
      expect(store.get(ids[0] as never)).toMatchObject({ x: 70 });
      expect(seen).toHaveLength(1);
    }));

  it("remote changes stay out of undo", () =>
    withWhiteboardTestDb(async () => {
      const { store, client, events, calls } = await startClient();
      subscribeWhiteboard("spy", (e) => events.emit("changes", e));
      const editor = createEditor(store);

      editor.markHistoryStoppingPoint("user");
      editor.createShape({ id: "shape:mine" as never, type: "geo", x: 1, y: 1 });
      await client.flush();
      const postsBefore = calls.filter((c) => c.url === "/api/whiteboard/changes").length;

      const { ids } = runWhiteboardOp((s) => createShapes(s, undefined, [{ type: "note", x: 500 }]));
      expect(store.get(ids[0] as never)).toBeDefined();
      await client.flush();
      expect(calls.filter((c) => c.url === "/api/whiteboard/changes").length).toBe(postsBefore);

      editor.undo();
      expect(store.get("shape:mine" as never)).toBeUndefined();
      expect(store.get(ids[0] as never)).toBeDefined();
      editor.dispose();
    }));

  it("refetches the board after reconnect", () =>
    withWhiteboardTestDb(async () => {
      const { store, events, calls } = await startClient();
      // changes made while the stream was down never reached the tab
      const { ids, clock } = runWhiteboardOp((s) => createShapes(s, undefined, [{ type: "geo", x: 5 }]));
      store.mergeRemoteChanges(() => store.put([geoShape(store, "shape:ghost")]));
      const gets = () => calls.filter((c) => c.url === "/api/whiteboard").length;
      const before = gets();

      events.emit("ready", { clock });
      await vi.waitFor(() => expect(gets()).toBe(before + 1));
      await vi.waitFor(() => expect(store.get(ids[0] as never)).toBeDefined());
      expect(store.get("shape:ghost" as never)).toBeUndefined();
      expect(docRecords(store)).toEqual(getWhiteboardDocument().records.sort((a, b) => a.id.localeCompare(b.id)));

      // a ready with the clock the tab already has does not refetch
      events.emit("ready", { clock });
      await new Promise((r) => setTimeout(r, 10));
      expect(gets()).toBe(before + 1);
    }));

  it("retries unsent changes", () =>
    withWhiteboardTestDb(async () => {
      const { store, client, saveStatus, failChanges } = await startClient();
      failChanges.value = true;
      store.put([geoShape(store, "shape:first", 1)]);
      await client.flush();
      expect(saveStatus.at(-1)).toBe("error");
      expect(getWhiteboardDocument().records.some((r) => r.id === "shape:first")).toBe(false);

      failChanges.value = false;
      store.put([geoShape(store, "shape:second", 2)]);
      await client.flush();
      expect(saveStatus.at(-1)).toBe("saved");
      const ids = getWhiteboardDocument().records.map((r) => r.id);
      expect(ids).toEqual(expect.arrayContaining(["shape:first", "shape:second"]));
    }));

  it("deleted current page switches page", () =>
    withWhiteboardTestDb(async () => {
      const second = runWhiteboardOp((s) => createPage(s, "Dois"));
      const { store, events } = await startClient();
      subscribeWhiteboard("spy", (e) => events.emit("changes", e));
      const editor = createEditor(store);
      editor.setCurrentPage(second.id as never);
      expect(editor.getCurrentPageId()).toBe(second.id);

      runWhiteboardOp((s) => deletePage(s, second.id));
      const remaining = readWhiteboard((s) => listPages(s))[0]!.id;
      expect((store.get(TLINSTANCE_ID) as { currentPageId: string }).currentPageId).toBe(remaining);
      expect(editor.getCurrentPageId()).toBe(remaining);
      editor.dispose();
    }));
});
