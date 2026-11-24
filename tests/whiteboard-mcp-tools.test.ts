import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "@/app/api/mcp/route";
import { getWhiteboardDocument } from "@/modules/whiteboard/lib/whiteboard-document-service";
import { withWhiteboardTestDb } from "./whiteboard-test-db";

vi.mock("@/modules/observability/lib/system-logger", () => ({ writeSystemLogFireAndForget: vi.fn() }));

const routeFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  const handler = { POST, GET, DELETE }[request.method as "POST" | "GET" | "DELETE"];
  return handler(request);
};

async function connectClient(headers?: Record<string, string>) {
  const client = new Client({ name: "test", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), {
    fetch: routeFetch,
    requestInit: headers ? { headers } : undefined
  });
  await client.connect(transport);
  return client;
}

type CallResult = Awaited<ReturnType<Client["callTool"]>>;

function parseText(result: CallResult) {
  const [first] = result.content as Array<{ type: string; text: string }>;
  try {
    return JSON.parse(first!.text);
  } catch {
    return first!.text;
  }
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    throw new Error(`${name} failed: ${JSON.stringify(parseText(result))}`);
  }
  return parseText(result);
}

/** A rejected call: a tool error result or a protocol error. Returns the error text. */
async function callError(client: Client, name: string, args: Record<string, unknown>): Promise<string> {
  let result: CallResult;
  try {
    result = await client.callTool({ name, arguments: args });
  } catch (error) {
    // protocol-level rejection (e.g. arguments that fail the input schema)
    return error instanceof Error ? error.message : String(error);
  }
  expect(result.isError, `${name} should fail`).toBe(true);
  return JSON.stringify(parseText(result));
}

describe("whiteboard MCP tools", () => {
  afterEach(() => {
    delete process.env.PR_FLOW_MCP_TOKEN;
  });

  it("list pages returns pages in order with shape counts", () =>
    withWhiteboardTestDb(async () => {
      const client = await connectClient();
      const fresh = await call(client, "list_whiteboard_pages");
      expect(fresh.pages).toHaveLength(1);
      expect(fresh.pages[0]).toMatchObject({ name: "Página 1", shapeCount: 0 });
      expect(Object.keys(fresh.pages[0]).sort()).toEqual(["id", "index", "name", "shapeCount"]);

      const second = await call(client, "create_whiteboard_page", { name: "Dois" });
      await call(client, "create_whiteboard_page", { name: "Três" });
      await call(client, "create_whiteboard_shapes", { pageId: second.id, shapes: [{ type: "geo" }, { type: "note" }] });

      const { pages } = await call(client, "list_whiteboard_pages");
      expect(pages.map((p: { name: string }) => p.name)).toEqual(["Página 1", "Dois", "Três"]);
      expect(pages.map((p: { shapeCount: number }) => p.shapeCount)).toEqual([0, 2, 0]);
    }));

  it("create page appends after last page", () =>
    withWhiteboardTestDb(async () => {
      const client = await connectClient();
      const first = await call(client, "create_whiteboard_page", { name: "Arquitetura" });
      const second = await call(client, "create_whiteboard_page", { name: "Fluxo" });
      expect(second.id).toMatch(/^page:/);
      const { pages } = await call(client, "list_whiteboard_pages");
      expect(pages.map((p: { id: string }) => p.id).slice(1)).toEqual([first.id, second.id]);
      expect(pages.at(-1)).toMatchObject({ id: second.id, name: "Fluxo" });
      expect(pages[1].index > pages[0].index && pages[2].index > pages[1].index).toBe(true);
    }));

  it("rename page", () =>
    withWhiteboardTestDb(async () => {
      const client = await connectClient();
      const { pages } = await call(client, "list_whiteboard_pages");
      await call(client, "rename_whiteboard_page", { pageId: pages[0].id, name: "Rascunho" });
      const after = await call(client, "list_whiteboard_pages");
      expect(after.pages[0]).toMatchObject({ id: pages[0].id, name: "Rascunho" });
    }));

  it("refuses to delete the only page", () =>
    withWhiteboardTestDb(async () => {
      const client = await connectClient();
      const { pages } = await call(client, "list_whiteboard_pages");
      await call(client, "create_whiteboard_shapes", { shapes: [{ type: "geo" }] });
      const before = getWhiteboardDocument();
      const message = await callError(client, "delete_whiteboard_page", { pageId: pages[0].id });
      expect(message).toContain("única página");
      expect(getWhiteboardDocument()).toEqual(before);
    }));

  it("unknown page id is a tool error for every page tool", () =>
    withWhiteboardTestDb(async () => {
      const client = await connectClient();
      await call(client, "create_whiteboard_page", { name: "Outra" });
      const before = getWhiteboardDocument();
      const cases: [string, Record<string, unknown>][] = [
        ["rename_whiteboard_page", { pageId: "page:ghost", name: "x" }],
        ["duplicate_whiteboard_page", { pageId: "page:ghost" }],
        ["clear_whiteboard_page", { pageId: "page:ghost" }],
        ["delete_whiteboard_page", { pageId: "page:ghost" }],
        ["list_whiteboard_shapes", { pageId: "page:ghost" }]
      ];
      for (const [tool, args] of cases) {
        const message = await callError(client, tool, args);
        expect(message, tool).toContain("page:ghost");
        expect(getWhiteboardDocument(), tool).toEqual(before);
      }
    }));

  it("page name bounds", () =>
    withWhiteboardTestDb(async () => {
      const client = await connectClient();
      const { pages } = await call(client, "list_whiteboard_pages");
      const before = getWhiteboardDocument();
      for (const name of ["   ", "x".repeat(201)]) {
        await callError(client, "create_whiteboard_page", { name });
        await callError(client, "rename_whiteboard_page", { pageId: pages[0].id, name });
        expect(getWhiteboardDocument()).toEqual(before);
      }
      const ok = await call(client, "create_whiteboard_page", { name: "y".repeat(200) });
      expect(ok.id).toMatch(/^page:/);
      await call(client, "rename_whiteboard_page", { pageId: pages[0].id, name: "  z  " });
      const after = await call(client, "list_whiteboard_pages");
      expect(after.pages[0].name).toBe("z");
    }));

  it("instructions ask to confirm destructive page tools", () =>
    withWhiteboardTestDb(async () => {
      const client = await connectClient();
      const instructions = client.getInstructions() ?? "";
      const line = instructions.split("\n").find((l) => l.includes("delete_whiteboard_page")) ?? "";
      expect(line).toContain("clear_whiteboard_page");
      expect(line).toMatch(/confirm with the user before/i);
    }));

  it("creates every supported shape type", () =>
    withWhiteboardTestDb(async () => {
      const client = await connectClient();
      const shapes = [
        { id: "g", type: "geo", text: "caixa" },
        { type: "text", x: 0, y: 200, text: "título" },
        { type: "note", x: 300, text: "lembrete" },
        { type: "arrow", start: { shapeId: "g" }, end: { x: 500, y: 500 } },
        { type: "frame", x: 800, text: "Seção", props: { w: 400, h: 300 } },
        { type: "line", points: [{ x: 0, y: 0 }, { x: 50, y: 50 }] },
        { type: "draw", points: [{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }] }
      ];
      const { ids } = await call(client, "create_whiteboard_shapes", { shapes });
      expect(ids).toHaveLength(7);
      const listed = await call(client, "list_whiteboard_shapes");
      expect(listed.shapes.map((s: { type: string }) => s.type)).toEqual([
        "geo",
        "text",
        "note",
        "arrow",
        "frame",
        "line",
        "draw"
      ]);
      expect(listed.shapes[4].props.name).toBe("Seção");
    }));

  it("get shape returns shape and children", () =>
    withWhiteboardTestDb(async () => {
      const client = await connectClient();
      const { ids } = await call(client, "create_whiteboard_shapes", {
        shapes: [
          { id: "frame", type: "frame", props: { w: 400, h: 400 } },
          { id: "a", type: "geo", parentId: "frame", x: 10, y: 10 },
          { id: "b", type: "geo", parentId: "frame", x: 200, y: 10 }
        ]
      });
      const frame = await call(client, "get_whiteboard_shape", { shapeId: ids[0] });
      expect(frame).toMatchObject({ id: ids[0], type: "frame", w: 400, h: 400, childIds: [ids[1], ids[2]] });
      const child = await call(client, "get_whiteboard_shape", { shapeId: ids[1] });
      expect(child).toMatchObject({ parentId: ids[0], x: 10, y: 10, childIds: [] });
      const message = await callError(client, "get_whiteboard_shape", { shapeId: "shape:ghost" });
      expect(message).toContain("shape:ghost");
    }));

  it("invalid shape is a tool error with its position", () =>
    withWhiteboardTestDb(async () => {
      const client = await connectClient();
      const before = getWhiteboardDocument();
      const message = await callError(client, "create_whiteboard_shapes", {
        shapes: [{ type: "geo" }, { type: "geo" }, { type: "geo" }, { type: "geo", props: { color: "pink" } }]
      });
      expect(message).toContain("posição 3");
      expect(getWhiteboardDocument()).toEqual(before);
      const listed = await call(client, "list_whiteboard_shapes");
      expect(listed.shapes).toHaveLength(0);
    }));

  it("shape count bound", () =>
    withWhiteboardTestDb(async () => {
      const client = await connectClient();
      const make = (n: number) => Array.from({ length: n }, (_, i) => ({ type: "geo", x: i * 10 }));
      await callError(client, "create_whiteboard_shapes", { shapes: make(201) });
      expect((await call(client, "list_whiteboard_shapes")).shapes).toHaveLength(0);
      const { ids } = await call(client, "create_whiteboard_shapes", { shapes: make(200) });
      expect(ids).toHaveLength(200);
      await callError(client, "update_whiteboard_shapes", {
        shapes: Array.from({ length: 201 }, () => ({ id: ids[0], x: 1 }))
      });
      expect((await call(client, "get_whiteboard_shape", { shapeId: ids[0] })).x).toBe(0);
    }));

  it("whiteboard tools require the mcp token when set", () =>
    withWhiteboardTestDb(async () => {
      process.env.PR_FLOW_MCP_TOKEN = "secret";
      const before = getWhiteboardDocument();
      const response = await POST(
        new Request("http://localhost/api/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "create_whiteboard_page", arguments: { name: "x" } }
          })
        })
      );
      expect(response.status).toBe(401);
      expect(getWhiteboardDocument()).toEqual(before);

      const client = await connectClient({ Authorization: "Bearer secret" });
      const created = await call(client, "create_whiteboard_page", { name: "ok" });
      expect(created.id).toMatch(/^page:/);
    }));
});
