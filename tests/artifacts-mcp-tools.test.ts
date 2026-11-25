import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "@/app/api/mcp/route";
import { getArtifact, listVersions } from "@/modules/artifacts/lib/artifact-service";
import { writeSystemLogFireAndForget } from "@/modules/observability/lib/system-logger";
import { withArtifactTestDb } from "./artifact-test-db";

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
    return error instanceof Error ? error.message : String(error);
  }
  expect(result.isError, `${name} should fail`).toBe(true);
  return JSON.stringify(parseText(result));
}

type TabOut = { id: string; title: string; position: number; content: string; revision: number };

describe("artifact MCP tools", () => {
  afterEach(() => {
    delete process.env.PR_FLOW_MCP_TOKEN;
    vi.clearAllMocks();
  });

  it("create_artifact stores tabs in order", () =>
    withArtifactTestDb(async () => {
      const client = await connectClient();

      const created = await call(client, "create_artifact", {
        title: "Plano",
        tabs: [
          { title: "Resumo", content: "# A" },
          { title: "Riscos", content: "" }
        ]
      });
      expect(Object.keys(created).sort()).toEqual(["id", "tabs", "url", "version"]);
      expect(created.version).toBe(1);
      expect(created.tabs.map((t: { title: string }) => t.title)).toEqual(["Resumo", "Riscos"]);
      expect(created.url).toBe(`/artifacts/${created.id}?tab=${created.tabs[0].id}`);
      const stored = getArtifact(created.id);
      expect(stored.tabs.map((t) => [t.title, t.position, t.content])).toEqual([
        ["Resumo", 0, "# A"],
        ["Riscos", 1, ""]
      ]);
      expect(listVersions(created.id)).toMatchObject([{ number: 1, source: "agent", tabCount: 2 }]);

      const single = await call(client, "create_artifact", { title: "Um", content: "# A" });
      expect(single.tabs).toEqual([{ id: expect.any(String), title: "Aba 1" }]);
      expect(getArtifact(single.id).tabs[0]!.content).toBe("# A");

      const empty = await call(client, "create_artifact", { title: "Vazio" });
      expect(empty.tabs).toHaveLength(1);
      expect(empty.tabs[0].title).toBe("Aba 1");
      expect(getArtifact(empty.id).tabs[0]!.content).toBe("");
    }));

  it("list_artifacts orders by updatedAt", () =>
    withArtifactTestDb(async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        const client = await connectClient();
        const ids: string[] = [];
        for (const [index, title] of ["Primeiro", "Segundo", "Terceiro"].entries()) {
          vi.setSystemTime(new Date("2026-01-01T10:00:00Z").getTime() + index * 1000);
          ids.push((await call(client, "create_artifact", { title })).id);
        }
        const before = await call(client, "list_artifacts");
        expect(before.artifacts.map((a: { title: string }) => a.title)).toEqual(["Terceiro", "Segundo", "Primeiro"]);

        vi.setSystemTime(new Date("2026-01-01T11:00:00Z"));
        await call(client, "update_artifact", { id: ids[0], content: "novo" });

        const after = await call(client, "list_artifacts");
        expect(after.artifacts.map((a: { title: string }) => a.title)).toEqual(["Primeiro", "Terceiro", "Segundo"]);
        expect(Object.keys(after.artifacts[0]).sort()).toEqual([
          "id",
          "tabCount",
          "title",
          "updatedAt",
          "versionCount"
        ]);
        expect(after.artifacts[0]).toMatchObject({ tabCount: 1, versionCount: 2 });
      } finally {
        vi.useRealTimers();
      }
    }));

  it("list_artifacts filters by query", () =>
    withArtifactTestDb(async () => {
      const client = await connectClient();
      await call(client, "create_artifact", { title: "Relatório de PRs" });
      await call(client, "create_artifact", { title: "Outro" });

      const hit = await call(client, "list_artifacts", { query: "relatorio" });
      expect(hit.artifacts.map((a: { title: string }) => a.title)).toEqual(["Relatório de PRs"]);
      expect((await call(client, "list_artifacts", { query: "xyz" })).artifacts).toEqual([]);
    }));

  it("get_artifact returns tabs, one tab or a version", () =>
    withArtifactTestDb(async () => {
      const client = await connectClient();
      const created = await call(client, "create_artifact", {
        title: "Doc",
        tabs: [
          { title: "A", content: "a" },
          { title: "B", content: "b" }
        ]
      });
      const [a, b] = created.tabs;
      await call(client, "update_artifact", { id: created.id, tabId: a.id, content: "a2" });

      const whole = await call(client, "get_artifact", { id: created.id });
      expect(whole).toMatchObject({ id: created.id, title: "Doc", version: 2 });
      expect(whole.url).toBe(`/artifacts/${created.id}?tab=${a.id}`);
      expect(whole.tabs.map((t: TabOut) => [t.title, t.position, t.content, t.revision])).toEqual([
        ["A", 0, "a2", 2],
        ["B", 1, "b", 1]
      ]);

      const one = await call(client, "get_artifact", { id: created.id, tabId: b.id });
      expect(one.tabs).toHaveLength(1);
      expect(one.tabs[0]).toMatchObject({ id: b.id, content: "b" });
      expect(one.url).toBe(`/artifacts/${created.id}?tab=${b.id}`);

      const old = await call(client, "get_artifact", { id: created.id, version: 1 });
      expect(old.version).toBe(1);
      expect(old.tabs.map((t: TabOut) => t.content)).toEqual(["a", "b"]);
    }));

  it("edit_artifact rejects missing, ambiguous and empty old_str", () =>
    withArtifactTestDb(async () => {
      const client = await connectClient();
      const created = await call(client, "create_artifact", { title: "Doc", content: "a b a" });
      const tabId = created.tabs[0].id;
      const before = { artifact: getArtifact(created.id), versions: listVersions(created.id).length };

      expect(await callError(client, "edit_artifact", { id: created.id, old_str: "a", new_str: "x" })).toContain(
        "2 ocorrências"
      );
      expect(await callError(client, "edit_artifact", { id: created.id, old_str: "zzz", new_str: "x" })).toContain(
        "não foi encontrado"
      );
      await callError(client, "edit_artifact", { id: created.id, old_str: "", new_str: "x" });
      expect(getArtifact(created.id)).toEqual(before.artifact);
      expect(listVersions(created.id)).toHaveLength(before.versions);

      const edited = await call(client, "edit_artifact", { id: created.id, tabId, old_str: "a b", new_str: "X" });
      expect(edited.tab.revision).toBe(2);
      expect(getArtifact(created.id).tabs[0]!.content).toBe("X a");
    }));

  it("tabId may be omitted only with one tab", () =>
    withArtifactTestDb(async () => {
      const client = await connectClient();
      const single = await call(client, "create_artifact", { title: "Um", content: "um" });
      await call(client, "update_artifact", { id: single.id, content: "dois" });
      expect(getArtifact(single.id).tabs[0]!.content).toBe("dois");

      const many = await call(client, "create_artifact", {
        title: "Vários",
        tabs: [
          { title: "Resumo", content: "r" },
          { title: "Riscos", content: "k" }
        ]
      });
      const versions = listVersions(many.id).length;
      for (const [tool, args] of [
        ["update_artifact", { content: "x" }],
        ["edit_artifact", { old_str: "r", new_str: "x" }]
      ] as const) {
        const message = await callError(client, tool, { id: many.id, ...args });
        expect(message).toContain(`${many.tabs[0].id}: Resumo`);
        expect(message).toContain(`${many.tabs[1].id}: Riscos`);
      }
      expect(getArtifact(many.id).tabs.map((t) => t.content)).toEqual(["r", "k"]);
      expect(listVersions(many.id)).toHaveLength(versions);
    }));

  it("unknown ids are tool errors for every tool", () =>
    withArtifactTestDb(async () => {
      const client = await connectClient();
      const mine = await call(client, "create_artifact", { title: "Meu", content: "m" });
      const other = await call(client, "create_artifact", { title: "Outro", content: "o" });
      const otherTab = other.tabs[0].id;
      const snapshot = JSON.stringify([getArtifact(mine.id), getArtifact(other.id)]);

      const unknownId = "nope";
      const idCalls: Array<[string, Record<string, unknown>]> = [
        ["get_artifact", {}],
        ["rename_artifact", { title: "x" }],
        ["update_artifact", { content: "x" }],
        ["edit_artifact", { old_str: "m", new_str: "x" }],
        ["add_artifact_tab", { title: "x" }],
        ["rename_artifact_tab", { tabId: "t", title: "x" }],
        ["delete_artifact_tab", { tabId: "t" }],
        ["reorder_artifact_tabs", { tabIds: ["t"] }],
        ["list_artifact_versions", {}],
        ["delete_artifact", {}]
      ];
      for (const [tool, args] of idCalls) {
        expect(await callError(client, tool, { id: unknownId, ...args }), tool).toContain(unknownId);
      }

      const tabCalls: Array<[string, Record<string, unknown>]> = [
        ["get_artifact", {}],
        ["update_artifact", { content: "x" }],
        ["edit_artifact", { old_str: "m", new_str: "x" }],
        ["rename_artifact_tab", { title: "x" }],
        ["delete_artifact_tab", {}]
      ];
      for (const tabId of ["missing-tab", otherTab]) {
        for (const [tool, args] of tabCalls) {
          expect(await callError(client, tool, { id: mine.id, tabId, ...args }), `${tool} ${tabId}`).toContain(tabId);
        }
      }
      expect(await callError(client, "get_artifact", { id: mine.id, version: 7 })).toContain("7");

      expect(JSON.stringify([getArtifact(mine.id), getArtifact(other.id)])).toBe(snapshot);
      expect(listVersions(mine.id)).toHaveLength(1);
    }));

  it("limits are tool errors", () =>
    withArtifactTestDb(async () => {
      const client = await connectClient();
      expect(await callError(client, "create_artifact", { title: "  " })).toContain("título");
      expect(await callError(client, "create_artifact", { title: "x".repeat(201) })).toContain("título");
      const created = await call(client, "create_artifact", { title: "x".repeat(200) });
      const id = created.id;

      expect(await callError(client, "rename_artifact", { id, title: "" })).toContain("título");
      expect(await callError(client, "update_artifact", { id, content: "z".repeat(500_001) })).toContain("500000");
      await call(client, "update_artifact", { id, content: "z".repeat(500_000) });
      expect(await callError(client, "add_artifact_tab", { id, title: "t", content: "z".repeat(500_001) })).toContain(
        "500000"
      );
      expect(await callError(client, "add_artifact_tab", { id, title: "t".repeat(201) })).toContain("título");
      expect(getArtifact(id).tabs).toHaveLength(1);
      expect(getArtifact(id).tabs[0]!.content).toHaveLength(500_000);
    }));

  it("instructions describe artifact tools", () =>
    withArtifactTestDb(async () => {
      const client = await connectClient();
      const instructions = client.getInstructions() ?? "";
      const lines = instructions.split("\n");

      expect(lines.find((l) => l.includes("_artifact_"))).toMatch(/Markdown/);
      expect(instructions).toContain("GFM tables");
      expect(instructions).toContain("- [ ]");
      const edit = lines.find((l) => l.includes("get_artifact") && l.includes("edit_artifact")) ?? "";
      expect(edit).toMatch(/get_artifact before edit_artifact/);
      const del = lines.find((l) => l.includes("delete_artifact")) ?? "";
      expect(del).toMatch(/confirm with the user/);
    }));

  it("list_artifact_versions returns versions newest first", () =>
    withArtifactTestDb(async () => {
      const client = await connectClient();
      const created = await call(client, "create_artifact", { title: "Doc", tabs: [{ title: "A" }, { title: "B" }] });
      await call(client, "update_artifact", { id: created.id, tabId: created.tabs[0].id, content: "x" });

      const { versions } = await call(client, "list_artifact_versions", { id: created.id });

      expect(versions.map((v: { number: number }) => v.number)).toEqual([2, 1]);
      expect(versions.map((v: { source: string }) => v.source)).toEqual(["agent", "agent"]);
      expect(versions.map((v: { tabCount: number }) => v.tabCount)).toEqual([2, 2]);
      expect(Object.keys(versions[0]).sort()).toEqual([
        "createdAt",
        "number",
        "restoredFrom",
        "source",
        "tabCount",
        "title",
        "updatedAt"
      ]);
    }));

  it("tools/list names the 12 artifact tools", () =>
    withArtifactTestDb(async () => {
      const client = await connectClient();
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).filter((name) => name.includes("artifact"));
      expect(names.sort()).toEqual(
        [
          "add_artifact_tab",
          "create_artifact",
          "delete_artifact",
          "delete_artifact_tab",
          "edit_artifact",
          "get_artifact",
          "list_artifact_versions",
          "list_artifacts",
          "rename_artifact",
          "rename_artifact_tab",
          "reorder_artifact_tabs",
          "update_artifact"
        ].sort()
      );
    }));

  it("artifact tools: the /api/mcp route requires the bearer token when set", () =>
    withArtifactTestDb(async () => {
      process.env.PR_FLOW_MCP_TOKEN = "secret";
      const response = await POST(
        new Request("http://localhost/api/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "create_artifact", arguments: { title: "x" } }
          })
        })
      );
      expect(response.status).toBe(401);

      const client = await connectClient({ Authorization: "Bearer secret" });
      expect((await call(client, "list_artifacts")).artifacts).toEqual([]);
    }));

  it("unexpected failures are logged", () =>
    withArtifactTestDb(async () => {
      const client = await connectClient();
      const { closeDb } = await import("@/modules/db/lib/db");
      const original = process.env.DATABASE_URL;
      await closeDb();
      process.env.DATABASE_URL = "postgres://nope/nope";
      try {
        const message = await callError(client, "list_artifacts", {});
        expect(message).toContain("PostgreSQL");
      } finally {
        process.env.DATABASE_URL = original;
      }
      expect(writeSystemLogFireAndForget).toHaveBeenCalledTimes(1);
      expect(writeSystemLogFireAndForget).toHaveBeenCalledWith(
        expect.objectContaining({ level: "error", source: "mcp:artifacts", message: "list_artifacts failed" })
      );
    }));
});
