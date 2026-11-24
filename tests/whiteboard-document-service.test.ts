import { getDb } from "@/modules/db/lib/db";
import {
  clearPage,
  createPage,
  createShapes,
  deletePage,
  deleteShapes,
  duplicatePage,
  getShape,
  groupShapes,
  listPages,
  listShapes,
  reorderShapes,
  ungroupShapes,
  updateShapes,
  WhiteboardOpError
} from "@/modules/whiteboard/lib/whiteboard-board-ops";
import {
  getWhiteboardDocument,
  importWhiteboardSnapshot,
  readWhiteboard,
  resetWhiteboardState,
  runWhiteboardOp,
  subscribeWhiteboard,
  applyWhiteboardChanges,
  type WhiteboardChangeEvent
} from "@/modules/whiteboard/lib/whiteboard-document-service";
import { describe, expect, it } from "vitest";
import { withWhiteboardTestDb } from "./whiteboard-test-db";

const firstPageId = () => readWhiteboard((store) => listPages(store)[0]!.id);
const shapesOf = (pageId?: string) => readWhiteboard((store) => listShapes(store, pageId));
const shape = (id: string) => readWhiteboard((store) => getShape(store, id));
const create = (inputs: Parameters<typeof createShapes>[2], pageId?: string) =>
  runWhiteboardOp((store) => createShapes(store, pageId, inputs));

function expectPagePosition(id: string, expected: { x: number; y: number }) {
  // Walk up parents composing translation + rotation to get the page position of the origin.
  let current = shape(id);
  let point = { x: 0, y: 0 };
  for (;;) {
    const cos = Math.cos(current.rotation);
    const sin = Math.sin(current.rotation);
    point = { x: current.x + point.x * cos - point.y * sin, y: current.y + point.x * sin + point.y * cos };
    if (current.parentId.startsWith("page:")) {
      break;
    }
    current = shape(current.parentId);
  }
  expect(point.x).toBeCloseTo(expected.x, 4);
  expect(point.y).toBeCloseTo(expected.y, 4);
}

describe("whiteboard document service", () => {
  it("create shapes applies defaults and overrides", () =>
    withWhiteboardTestDb(() => {
      const { ids } = create([
        { type: "geo", x: 10, y: 20 },
        { type: "geo", props: { geo: "ellipse", w: 300, h: 80, color: "orange" } }
      ]);
      expect(ids).toHaveLength(2);
      const rect = shape(ids[0]!);
      expect(rect).toMatchObject({ type: "geo", x: 10, y: 20, w: 100, h: 100 });
      expect(rect.props).toMatchObject({ geo: "rectangle", color: "black", fill: "none" });
      const ellipse = shape(ids[1]!);
      expect(ellipse.props).toMatchObject({ geo: "ellipse", w: 300, h: 80, color: "orange" });
      // returned in input order and in one change
      expect(shapesOf().shapes.map((s) => s.id)).toEqual(ids);
    }));

  it("text round trips through rich text", () =>
    withWhiteboardTestDb(() => {
      const { ids } = create(
        ["geo", "text", "note", "arrow"].map((type) => ({ type, text: "a\nb" }))
      );
      for (const id of ids) {
        const view = shape(id);
        expect(view.text).toBe("a\nb");
        const richText = readWhiteboard(
          (store) => (store.get(id as never) as unknown as { props: { richText: { content: unknown[] } } }).props.richText
        );
        expect(richText.content).toHaveLength(2);
      }
    }));

  it("arrow ends bind to shapes", () =>
    withWhiteboardTestDb(() => {
      const { ids } = create([
        { id: "a", type: "geo", x: 0, y: 0 },
        { id: "b", type: "geo", x: 400, y: 0 },
        { id: "arrow1", type: "arrow", start: { shapeId: "a" }, end: { shapeId: "b", anchor: { x: 0, y: 1 } } },
        { id: "arrow2", type: "arrow", start: { x: 0, y: 300 }, end: { x: 100, y: 300 } }
      ]);
      const { bindings } = shapesOf();
      expect(bindings).toEqual(
        expect.arrayContaining([
          { arrowId: ids[2], terminal: "start", shapeId: ids[0] },
          { arrowId: ids[2], terminal: "end", shapeId: ids[1] }
        ])
      );
      expect(bindings).toHaveLength(2);
      const raw = readWhiteboard((store) =>
        store.allRecords().filter((r) => r.typeName === "binding")
      ) as unknown as { props: { terminal: string; normalizedAnchor: unknown } }[];
      const byTerminal = Object.fromEntries(raw.map((b) => [b.props.terminal, b.props.normalizedAnchor]));
      expect(byTerminal.start).toEqual({ x: 0.5, y: 0.5 });
      expect(byTerminal.end).toEqual({ x: 0, y: 1 });
      const free = shape(ids[3]!);
      expect(free).toMatchObject({ x: 0, y: 300 });
      expect(free.props.end).toEqual({ x: 100, y: 0 });
    }));

  it("line and draw points are relative to shape", () =>
    withWhiteboardTestDb(() => {
      const { ids } = create([
        { type: "line", x: 50, y: 50, points: [{ x: 0, y: 0 }, { x: 100, y: 40 }, { x: 200, y: 0 }] },
        { type: "draw", x: 10, y: 10, points: [{ x: 0, y: 0 }, { x: 30, y: 30 }] }
      ]);
      const line = shape(ids[0]!);
      expect(line).toMatchObject({ x: 50, y: 50 });
      const points = Object.values(line.props.points as Record<string, { x: number; y: number }>);
      expect(points.map(({ x, y }) => ({ x, y }))).toEqual([{ x: 0, y: 0 }, { x: 100, y: 40 }, { x: 200, y: 0 }]);
      const draw = shape(ids[1]!);
      expect(draw).toMatchObject({ x: 10, y: 10 });
      expect(draw.props.segments).toHaveLength(1);
    }));

  it("list shapes returns nested shapes in z order with bindings", () =>
    withWhiteboardTestDb(() => {
      const pageId = firstPageId();
      const { ids } = create([
        { id: "frame", type: "frame", x: 0, y: 0, props: { w: 500, h: 500 } },
        { id: "inside", type: "geo", parentId: "frame", x: 10, y: 10 },
        { id: "top", type: "note", x: 600, y: 0, text: "oi" },
        { id: "arrow", type: "arrow", start: { shapeId: "inside" }, end: { shapeId: "top" } }
      ]);
      const other = runWhiteboardOp((store) => createPage(store, "Outra"));
      create([{ type: "geo" }], other.id);

      const listed = shapesOf(pageId);
      expect(listed.shapes.map((s) => s.id)).toEqual([ids[0], ids[1], ids[2], ids[3]]);
      const inside = listed.shapes[1]!;
      expect(inside).toMatchObject({ id: ids[1], type: "geo", parentId: ids[0], x: 10, y: 10, rotation: 0, w: 100, h: 100 });
      expect(inside.props).toBeDefined();
      expect(listed.shapes[2]).toMatchObject({ text: "oi" });
      expect(listed.bindings).toHaveLength(2);
      expect(listed.bindings[0]).toEqual(expect.objectContaining({ arrowId: ids[3] }));
    }));

  it("update merges only given fields", () =>
    withWhiteboardTestDb(() => {
      const { ids } = create([{ type: "geo", x: 1, y: 2, text: "old", props: { color: "red", fill: "solid" } }]);
      runWhiteboardOp((store) => updateShapes(store, [{ id: ids[0]!, x: 50, props: { color: "blue" } }]));
      const view = shape(ids[0]!);
      expect(view).toMatchObject({ x: 50, y: 2, rotation: 0, text: "old" });
      expect(view.props).toMatchObject({ color: "blue", fill: "solid", geo: "rectangle" });
      runWhiteboardOp((store) => updateShapes(store, [{ id: ids[0]!, text: "new", rotation: 1 }]));
      expect(shape(ids[0]!)).toMatchObject({ x: 50, y: 2, rotation: 1, text: "new" });
      expect(shape(ids[0]!).props).toMatchObject({ color: "blue" });
    }));

  it("reparent keeps page position", () =>
    withWhiteboardTestDb(() => {
      const { ids } = create([
        { id: "frame", type: "frame", x: 400, y: 400, props: { w: 600, h: 600 } },
        { id: "box", type: "geo", x: 500, y: 500 },
        { id: "rotated", type: "frame", x: 1000, y: 0, rotation: Math.PI / 2, props: { w: 300, h: 300 } }
      ]);
      const pageId = firstPageId();
      runWhiteboardOp((store) => updateShapes(store, [{ id: ids[1]!, parentId: ids[0]! }]));
      expect(shape(ids[1]!)).toMatchObject({ parentId: ids[0], x: 100, y: 100 });

      runWhiteboardOp((store) => updateShapes(store, [{ id: ids[1]!, parentId: pageId }]));
      expect(shape(ids[1]!)).toMatchObject({ parentId: pageId, x: 500, y: 500 });

      runWhiteboardOp((store) => updateShapes(store, [{ id: ids[1]!, parentId: ids[2]! }]));
      expect(shape(ids[1]!).parentId).toBe(ids[2]);
      expect(shape(ids[1]!).x).not.toBeCloseTo(500 - 1000, 1);
      expectPagePosition(ids[1]!, { x: 500, y: 500 });

      // explicit x/y win
      runWhiteboardOp((store) => updateShapes(store, [{ id: ids[1]!, parentId: ids[0]!, x: 5, y: 6 }]));
      expect(shape(ids[1]!)).toMatchObject({ parentId: ids[0], x: 5, y: 6 });
    }));

  it("delete shapes removes descendants and bindings", () =>
    withWhiteboardTestDb(() => {
      const { ids } = create([
        { id: "frame", type: "frame", props: { w: 500, h: 500 } },
        { id: "child", type: "geo", parentId: "frame" },
        { id: "outside", type: "geo", x: 800 },
        { id: "arrow", type: "arrow", start: { shapeId: "child" }, end: { shapeId: "outside" } }
      ]);
      const { removed } = runWhiteboardOp((store) => deleteShapes(store, [ids[0]!]));
      expect(new Set(removed)).toEqual(new Set([ids[0], ids[1]]));
      const listed = shapesOf();
      expect(listed.shapes.map((s) => s.id)).toEqual([ids[2], ids[3]]);
      const bindings = readWhiteboard((store) => store.allRecords().filter((r) => r.typeName === "binding"));
      expect(bindings).toHaveLength(1);
      expect((bindings[0] as unknown as { toId: string }).toId).toBe(ids[2]);
    }));

  it("invalid shape rejects the whole call", () =>
    withWhiteboardTestDb(() => {
      const before = getWhiteboardDocument();
      const cases: { inputs: Parameters<typeof createShapes>[2]; position: number }[] = [
        { inputs: [{ type: "geo" }, { type: "geo" }, { type: "geo" }, { type: "geo", props: { color: "pink" } }], position: 3 },
        { inputs: [{ type: "geo" }, { type: "hexagon" }], position: 1 },
        { inputs: [{ type: "geo", parentId: "shape:nope" }], position: 0 },
        { inputs: [{ type: "geo" }, { type: "arrow", start: { shapeId: "ghost" } }], position: 1 },
        { inputs: [{ id: "box", type: "geo" }, { type: "geo", parentId: "box" }], position: 1 }
      ];
      for (const { inputs, position } of cases) {
        let error: unknown;
        try {
          create(inputs);
        } catch (caught) {
          error = caught;
        }
        expect(error).toBeInstanceOf(WhiteboardOpError);
        expect((error as Error).message).toContain(`posição ${position}`);
        expect(getWhiteboardDocument()).toEqual(before);
      }

      const { ids } = create([{ type: "geo" }]);
      expect(() =>
        runWhiteboardOp((store) => updateShapes(store, [{ id: ids[0]!, x: 9 }, { id: ids[0]!, props: { color: "pink" } }]))
      ).toThrow(/posição 1/);
      expect(shape(ids[0]!).x).toBe(0);
    }));

  it("group keeps page positions", () =>
    withWhiteboardTestDb(() => {
      const { ids } = create([
        { type: "geo", x: 100, y: 100 },
        { type: "geo", x: 300, y: 250, rotation: 0.3 },
        { type: "geo", x: 900, y: 900 }
      ]);
      const pageId = firstPageId();
      const { groupId } = runWhiteboardOp((store) => groupShapes(store, [ids[0]!, ids[1]!]));
      const group = shape(groupId);
      expect(group).toMatchObject({ type: "group", parentId: pageId });
      expect(group.childIds).toEqual([ids[0], ids[1]]);
      expectPagePosition(ids[0]!, { x: 100, y: 100 });
      expectPagePosition(ids[1]!, { x: 300, y: 250 });
      expect(shape(ids[1]!).rotation).toBeCloseTo(0.3);
      expect(shape(ids[2]!).parentId).toBe(pageId);
    }));

  it("group rejects single shape and mixed parents", () =>
    withWhiteboardTestDb(() => {
      const { ids } = create([
        { id: "frame", type: "frame", props: { w: 500, h: 500 } },
        { id: "in", type: "geo", parentId: "frame" },
        { id: "out", type: "geo", x: 800 }
      ]);
      const before = getWhiteboardDocument();
      expect(() => runWhiteboardOp((store) => groupShapes(store, [ids[2]!]))).toThrow(WhiteboardOpError);
      expect(() => runWhiteboardOp((store) => groupShapes(store, [ids[2]!, ids[2]!]))).toThrow(WhiteboardOpError);
      expect(() => runWhiteboardOp((store) => groupShapes(store, [ids[1]!, ids[2]!]))).toThrow(WhiteboardOpError);
      expect(getWhiteboardDocument()).toEqual(before);
    }));

  it("ungroup keeps page position and rotation", () =>
    withWhiteboardTestDb(() => {
      const { ids } = create([
        { type: "geo", x: 100, y: 100, rotation: 0.2 },
        { type: "geo", x: 300, y: 300 }
      ]);
      const pageId = firstPageId();
      const { groupId } = runWhiteboardOp((store) => groupShapes(store, ids));
      // rotate the group, then ungroup: children keep where the rotated group put them
      runWhiteboardOp((store) => updateShapes(store, [{ id: groupId, rotation: Math.PI / 2 }]));
      const group = shape(groupId);
      const child0 = shape(ids[0]!);
      const expected0 = {
        x: group.x + child0.x * Math.cos(Math.PI / 2) - child0.y * Math.sin(Math.PI / 2),
        y: group.y + child0.x * Math.sin(Math.PI / 2) + child0.y * Math.cos(Math.PI / 2)
      };
      const { childIds } = runWhiteboardOp((store) => ungroupShapes(store, groupId));
      expect(childIds).toEqual(ids);
      expect(shape(ids[0]!).parentId).toBe(pageId);
      expectPagePosition(ids[0]!, expected0);
      expect(shape(ids[0]!).rotation).toBeCloseTo(0.2 + Math.PI / 2);
      expect(() => shape(groupId)).toThrow(WhiteboardOpError);
      expect(() => runWhiteboardOp((store) => ungroupShapes(store, ids[1]!))).toThrow(WhiteboardOpError);
    }));

  it("reorder actions", () =>
    withWhiteboardTestDb(() => {
      const order = () => shapesOf().shapes.map((s) => s.id);
      const cases: { action: Parameters<typeof reorderShapes>[2]; target: number; expected: number[] }[] = [
        { action: "bring_to_front", target: 0, expected: [1, 2, 0] },
        { action: "send_to_back", target: 2, expected: [2, 0, 1] },
        { action: "bring_forward", target: 0, expected: [1, 0, 2] },
        { action: "send_backward", target: 2, expected: [0, 2, 1] },
        { action: "bring_to_front", target: 2, expected: [0, 1, 2] }
      ];
      for (const { action, target, expected } of cases) {
        resetWhiteboardState();
        const pageId = firstPageId();
        runWhiteboardOp((store) => clearPage(store, pageId));
        const { ids } = create([{ type: "geo" }, { type: "geo" }, { type: "geo" }]);
        runWhiteboardOp((store) => reorderShapes(store, [ids[target]!], action));
        expect(order(), action).toEqual(expected.map((i) => ids[i]));
      }
    }));

  it("duplicate page copies shapes and rebinds arrows", () =>
    withWhiteboardTestDb(() => {
      const pageId = firstPageId();
      runWhiteboardOp((store) => createPage(store, "Fluxo"));
      const fluxo = readWhiteboard((store) => listPages(store)[1]!);
      create(
        [
          { id: "f", type: "frame", props: { w: 500, h: 500 } },
          { id: "a", type: "geo", parentId: "f" },
          { id: "b", type: "geo", x: 700 },
          { id: "arr", type: "arrow", start: { shapeId: "a" }, end: { shapeId: "b" } }
        ],
        fluxo.id
      );
      const original = shapesOf(fluxo.id);
      const { id, name } = runWhiteboardOp((store) => duplicatePage(store, fluxo.id));
      expect(name).toBe("Fluxo (cópia)");
      const copy = shapesOf(id);
      expect(copy.shapes).toHaveLength(4);
      const originalIds = new Set(original.shapes.map((s) => s.id));
      expect(copy.shapes.every((s) => !originalIds.has(s.id))).toBe(true);
      const copyIds = new Set(copy.shapes.map((s) => s.id));
      expect(copy.bindings).toHaveLength(2);
      expect(copy.bindings.every((b) => copyIds.has(b.arrowId) && copyIds.has(b.shapeId))).toBe(true);
      expect(copy.shapes[1]!.parentId).toBe(copy.shapes[0]!.id);
      expect(copy.shapes.map((s) => s.type)).toEqual(original.shapes.map((s) => s.type));
      expect(shapesOf(fluxo.id)).toEqual(original);
      expect(shapesOf(pageId).shapes).toHaveLength(0);
    }));

  it("clear page keeps page and other pages", () =>
    withWhiteboardTestDb(() => {
      const pageId = firstPageId();
      create([{ id: "a", type: "geo" }, { id: "b", type: "geo" }, { type: "arrow", start: { shapeId: "a" }, end: { shapeId: "b" } }]);
      const other = runWhiteboardOp((store) => createPage(store, "Outra"));
      create([{ type: "note" }], other.id);
      runWhiteboardOp((store) => clearPage(store, pageId));
      expect(shapesOf(pageId)).toEqual({ pageId, shapes: [], bindings: [] });
      expect(readWhiteboard((store) => listPages(store)).map((p) => p.id)).toEqual([pageId, other.id]);
      expect(shapesOf(other.id).shapes).toHaveLength(1);
      expect(readWhiteboard((store) => store.allRecords().filter((r) => r.typeName === "binding"))).toHaveLength(0);
    }));

  it("delete page cascades shapes and bindings", () =>
    withWhiteboardTestDb(() => {
      const pageId = firstPageId();
      const other = runWhiteboardOp((store) => createPage(store, "Outra"));
      create(
        [
          { id: "f", type: "frame" },
          { id: "a", type: "geo", parentId: "f" },
          { id: "b", type: "geo" },
          { type: "arrow", start: { shapeId: "a" }, end: { shapeId: "b" } }
        ],
        other.id
      );
      create([{ type: "geo" }], pageId);
      runWhiteboardOp((store) => deletePage(store, other.id));
      const records = getWhiteboardDocument().records;
      expect(records.filter((r) => r.typeName === "page").map((r) => r.id)).toEqual([pageId]);
      expect(records.filter((r) => r.typeName === "shape")).toHaveLength(1);
      expect(records.filter((r) => r.typeName === "binding")).toHaveLength(0);
      const orphans = records.filter(
        (r) => r.typeName === "shape" && !records.some((p) => p.id === (r as unknown as { parentId: string }).parentId)
      );
      expect(orphans).toEqual([]);
    }));

  it("change events skip the source client", () =>
    withWhiteboardTestDb(() => {
      const tabA: WhiteboardChangeEvent[] = [];
      const tabB: WhiteboardChangeEvent[] = [];
      const offA = subscribeWhiteboard("tab-a", (event) => tabA.push(event));
      subscribeWhiteboard("tab-b", (event) => tabB.push(event));

      const { ids, clock } = create([{ type: "geo" }]);
      expect(tabA).toHaveLength(1);
      expect(tabB).toHaveLength(1);
      expect(tabA[0]).toMatchObject({ clock, sourceClientId: "mcp", remove: [] });
      expect(tabA[0]!.put.map((r) => r.id)).toEqual(ids);

      const current = readWhiteboard((store) => store.get(ids[0] as never)) as unknown as Record<string, unknown>;
      const moved = { ...current, x: 42 } as never;
      applyWhiteboardChanges({ clientId: "tab-a", put: [moved], remove: [] });
      expect(tabA).toHaveLength(1);
      expect(tabB).toHaveLength(2);
      expect(tabB[1]).toMatchObject({ sourceClientId: "tab-a" });

      offA();
      create([{ type: "geo" }]);
      expect(tabA).toHaveLength(1);
      expect(tabB).toHaveLength(3);
    }));

  it("import migrates older schema", () =>
    withWhiteboardTestDb(() => {
      // A geo shape saved before the rich text migration carried `text` instead of `richText`.
      const legacySchema = {
        schemaVersion: 2,
        sequences: {
          "com.tldraw.store": 4,
          "com.tldraw.asset": 1,
          "com.tldraw.camera": 1,
          "com.tldraw.document": 2,
          "com.tldraw.instance": 25,
          "com.tldraw.instance_page_state": 5,
          "com.tldraw.page": 1,
          "com.tldraw.instance_presence": 6,
          "com.tldraw.pointer": 1,
          "com.tldraw.shape": 4,
          "com.tldraw.shape.geo": 9,
          "com.tldraw.binding": 0,
          "com.tldraw.binding.arrow": 0
        }
      };
      const records = [
        { id: "document:document", typeName: "document", gridSize: 10, name: "", meta: {} },
        { id: "page:old", typeName: "page", name: "Antiga", index: "a1", meta: {} },
        {
          id: "shape:old",
          typeName: "shape",
          type: "geo",
          parentId: "page:old",
          index: "a1",
          x: 5,
          y: 6,
          rotation: 0,
          isLocked: false,
          opacity: 1,
          meta: {},
          props: {
            geo: "rectangle",
            w: 100,
            h: 100,
            color: "black",
            labelColor: "black",
            fill: "none",
            dash: "draw",
            size: "m",
            font: "draw",
            text: "legado",
            align: "middle",
            verticalAlign: "middle",
            growY: 0,
            url: "",
            scale: 1
          }
        }
      ];
      const { imported } = importWhiteboardSnapshot({ clientId: "tab", schema: legacySchema as never, records: records as never });
      expect(imported).toBe(3);
      expect(shape("shape:old")).toMatchObject({ text: "legado", x: 5, y: 6 });
      expect(readWhiteboard((store) => listPages(store)).map((p) => p.name)).toEqual(["Antiga"]);
    }));

  it("board survives reload from sqlite", () =>
    withWhiteboardTestDb(() => {
      const other = runWhiteboardOp((store) => createPage(store, "Outra"));
      const { clock } = create(
        [{ id: "a", type: "geo", text: "x" }, { id: "b", type: "note" }, { type: "arrow", start: { shapeId: "a" }, end: { shapeId: "b" } }],
        other.id
      );
      const before = getWhiteboardDocument();
      resetWhiteboardState();
      const after = getWhiteboardDocument();
      expect(after.clock).toBe(clock);
      const sort = (records: { id: string }[]) => [...records].sort((x, y) => x.id.localeCompare(y.id));
      expect(sort(after.records)).toEqual(sort(before.records));
      const rows = getDb().all<{ type_name: string }>("SELECT type_name FROM whiteboard_records" as never);
      expect(new Set(rows.map((row) => row.type_name))).toEqual(new Set(["document", "page", "shape", "binding"]));
    }));

  it("migration creates whiteboard tables", () =>
    withWhiteboardTestDb(() => {
      const columns = (table: string) =>
        getDb().all<{ name: string; pk: number; notnull: number }>(`PRAGMA table_info(${table})` as never);
      expect(columns("whiteboard_records").map((c) => [c.name, c.pk, c.notnull])).toEqual([
        ["id", 1, 1],
        ["type_name", 0, 1],
        ["record", 0, 1],
        ["updated_at", 0, 1]
      ]);
      expect(columns("whiteboard_meta").map((c) => [c.name, c.pk, c.notnull])).toEqual([
        ["key", 1, 1],
        ["value", 0, 1]
      ]);
    }));
});
