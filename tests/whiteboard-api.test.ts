import { describe, expect, it } from "vitest";
import { GET as getBoard } from "@/app/api/whiteboard/route";
import { POST as postChanges } from "@/app/api/whiteboard/changes/route";
import { GET as getEvents } from "@/app/api/whiteboard/events/route";
import { POST as postImport } from "@/app/api/whiteboard/import/route";
import { createShapes } from "@/modules/whiteboard/lib/whiteboard-board-ops";
import { getWhiteboardDocument, runWhiteboardOp } from "@/modules/whiteboard/lib/whiteboard-document-service";
import { withWhiteboardTestDb } from "./whiteboard-test-db";

const json = (url: string, body: unknown) =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });

type Rec = { id: string; typeName: string; [key: string]: unknown };

async function board(): Promise<{ clock: number; schema: { schemaVersion: number }; records: Rec[] }> {
  const response = getBoard();
  expect(response.status).toBe(200);
  return response.json();
}

function geoRecord(pageId: string, id = "shape:tab", x = 10): Rec {
  return {
    id,
    typeName: "shape",
    type: "geo",
    parentId: pageId,
    index: "a5",
    x,
    y: 20,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {},
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
    }
  };
}

const pageIdOf = (records: Rec[]) => records.find((r) => r.typeName === "page")!.id;

async function readEvents(response: Response, count: number): Promise<{ event: string; data: unknown }[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: { event: string; data: unknown }[] = [];
  while (events.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.+)$/m.exec(block)?.[1];
      if (event && data) events.push({ event, data: JSON.parse(data) });
    }
  }
  await reader.cancel();
  return events;
}

describe("whiteboard API", () => {
  it("posted changes are returned by get", () =>
    withWhiteboardTestDb(async () => {
      const before = await board();
      const pageId = pageIdOf(before.records);
      const response = await postChanges(json("/api/whiteboard/changes", { clientId: "tab", put: [geoRecord(pageId)], remove: [] }));
      expect(response.status).toBe(200);
      const after = await board();
      expect(after.clock).toBe(before.clock + 1);
      expect(after.records.find((r) => r.id === "shape:tab")).toMatchObject({ x: 10, y: 20 });
      // session records never come back
      expect(after.records.some((r) => ["instance", "camera", "pointer", "instance_page_state"].includes(r.typeName))).toBe(false);
    }));

  it("changes route statuses", () =>
    withWhiteboardTestDb(async () => {
      const pageId = pageIdOf((await board()).records);
      const ok = await postChanges(json("/api/whiteboard/changes", { clientId: "tab", put: [geoRecord(pageId)], remove: [] }));
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ clock: getWhiteboardDocument().clock });

      const before = getWhiteboardDocument();
      for (const body of [
        "not json",
        { put: [], remove: [] },
        { clientId: "tab", remove: [] },
        { clientId: "tab", put: [] },
        { clientId: "tab", put: [{ x: 1 }], remove: [] }
      ]) {
        const response = await postChanges(json("/api/whiteboard/changes", body));
        expect(response.status, JSON.stringify(body)).toBe(400);
        expect((await response.json()).error).toBe("invalid_body");
      }

      const bad = { ...geoRecord(pageId, "shape:bad"), props: { ...(geoRecord(pageId).props as object), color: "pink" } };
      const session = { id: "instance:instance", typeName: "instance" };
      const preferences = { id: "user:someone", typeName: "user" };
      for (const put of [[geoRecord(pageId, "shape:good", 99), bad], [session], [preferences]]) {
        const response = await postChanges(json("/api/whiteboard/changes", { clientId: "tab", put, remove: [] }));
        expect(response.status).toBe(422);
        expect((await response.json()).error).toBe("invalid_record");
      }
      expect(getWhiteboardDocument()).toEqual(before);
    }));

  it("import route statuses", () =>
    withWhiteboardTestDb(async () => {
      const current = await board();
      const legacyPage = { id: "page:legacy", typeName: "page", name: "Velha", index: "a1", meta: {} };
      const snapshot = (records: Rec[]) => ({ clientId: "tab", schema: current.schema, records });

      const bad400 = await postImport(json("/api/whiteboard/import", { clientId: "tab", records: [] }));
      expect(bad400.status).toBe(400);
      expect((await bad400.json()).error).toBe("invalid_body");

      const emptyBoard = getWhiteboardDocument();
      const invalid = await postImport(
        json("/api/whiteboard/import", snapshot([legacyPage, { ...geoRecord("page:legacy"), props: { color: "pink" } }]))
      );
      expect(invalid.status).toBe(422);
      expect((await invalid.json()).error).toBe("invalid_record");
      expect(getWhiteboardDocument()).toEqual(emptyBoard);

      const ok = await postImport(json("/api/whiteboard/import", snapshot([legacyPage, geoRecord("page:legacy")])));
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ imported: 2 });
      const imported = await board();
      expect(imported.records.filter((r) => r.typeName === "page").map((r) => r.id)).toEqual(["page:legacy"]);

      const before = getWhiteboardDocument();
      const conflict = await postImport(json("/api/whiteboard/import", snapshot([legacyPage])));
      expect(conflict.status).toBe(409);
      expect((await conflict.json()).error).toBe("board_not_empty");
      expect(getWhiteboardDocument()).toEqual(before);
    }));

  it("events stream changes", () =>
    withWhiteboardTestDb(async () => {
      const missing = getEvents(new Request("http://localhost/api/whiteboard/events"));
      expect(missing.status).toBe(400);
      expect((await missing.json()).error).toBe("invalid_body");

      const controller = new AbortController();
      const response = getEvents(
        new Request("http://localhost/api/whiteboard/events?clientId=tab-1", { signal: controller.signal })
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/event-stream");

      const pending = readEvents(response, 2);
      const { ids, clock } = runWhiteboardOp((store) => createShapes(store, undefined, [{ type: "geo" }]));
      const events = await pending;
      controller.abort();
      expect(events[0]).toEqual({ event: "ready", data: { clock: clock - 1 } });
      expect(events[1]!.event).toBe("changes");
      expect(events[1]!.data).toMatchObject({ clock, sourceClientId: "mcp", remove: [] });
      expect((events[1]!.data as { put: Rec[] }).put.map((r) => r.id)).toEqual(ids);
    }));
});
