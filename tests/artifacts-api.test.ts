import { describe, expect, it } from "vitest";
import { GET as listRoute, POST as createRoute } from "@/app/api/artifacts/route";
import { DELETE as deleteRoute, GET as getRoute, PATCH as patchRoute } from "@/app/api/artifacts/[id]/route";
import { POST as addTabRoute } from "@/app/api/artifacts/[id]/tabs/route";
import { DELETE as deleteTabRoute, PUT as putTabRoute } from "@/app/api/artifacts/[id]/tabs/[tabId]/route";
import { PUT as orderRoute } from "@/app/api/artifacts/[id]/tab-order/route";
import { GET as versionsRoute } from "@/app/api/artifacts/[id]/versions/route";
import { GET as versionRoute } from "@/app/api/artifacts/[id]/versions/[number]/route";
import { POST as restoreRoute } from "@/app/api/artifacts/[id]/versions/[number]/restore/route";
import { GET as eventsRoute } from "@/app/api/artifacts/events/route";
import { AGENT_ACTOR, createArtifact, getArtifact, listVersions, updateTab } from "@/modules/artifacts/lib/artifact-service";
import { withArtifactTestDb } from "./artifact-test-db";

const CLIENT = "browser-1";

function req(method: string, url: string, body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body)
  });
}

const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

async function postArtifact(title = "Doc") {
  const response = await createRoute(req("POST", "/api/artifacts", { clientId: CLIENT, title }));
  expect(response.status).toBe(201);
  return (await response.json()).artifact as { id: string; tabs: Array<{ id: string; revision: number }> };
}

describe("artifact routes", () => {
  it("collection routes", () =>
    withArtifactTestDb(async () => {
      const empty = await listRoute(req("GET", "/api/artifacts"));
      expect(empty.status).toBe(200);
      expect(await empty.json()).toEqual({ artifacts: [] });

      const created = await postArtifact("Relatório");
      await postArtifact("Outro");
      const filtered = await listRoute(req("GET", "/api/artifacts?q=relatorio"));
      const body = await filtered.json();
      expect(filtered.status).toBe(200);
      expect(body.artifacts).toEqual([
        { id: created.id, title: "Relatório", updatedAt: expect.any(Number), tabCount: 1, versionCount: 1 }
      ]);

      for (const bad of [
        { clientId: CLIENT },
        { clientId: CLIENT, title: "" },
        { clientId: CLIENT, title: "x".repeat(201) },
        { title: "no client" },
        "not json{"
      ]) {
        const response = await createRoute(req("POST", "/api/artifacts", bad));
        expect(response.status).toBe(400);
        expect((await response.json()).error).toBe("invalid_body");
      }
      expect((await (await listRoute(req("GET", "/api/artifacts"))).json()).artifacts).toHaveLength(2);
    }));

  it("POST creates one empty tab and a user version", () =>
    withArtifactTestDb(async () => {
      const created = await postArtifact("Novo");
      const stored = getArtifact(created.id);

      expect(stored.tabs).toHaveLength(1);
      expect(stored.tabs[0]).toMatchObject({ title: "Aba 1", content: "", position: 0, revision: 1 });
      expect(listVersions(created.id)).toMatchObject([{ number: 1, source: "user", tabCount: 1 }]);
    }));

  it("artifact routes", () =>
    withArtifactTestDb(async () => {
      const { id } = await postArtifact("Doc");

      const found = await getRoute(req("GET", `/api/artifacts/${id}`), ctx({ id }));
      expect(found.status).toBe(200);
      const { artifact } = await found.json();
      expect(Object.keys(artifact).sort()).toEqual(["createdAt", "id", "tabs", "title", "updatedAt"]);
      expect(Object.keys(artifact.tabs[0]).sort()).toEqual(["content", "id", "position", "revision", "title"]);
      const missing = await getRoute(req("GET", "/api/artifacts/nope"), ctx({ id: "nope" }));
      expect(missing.status).toBe(404);
      expect((await missing.json()).error).toBe("not_found");

      const renamed = await patchRoute(req("PATCH", `/api/artifacts/${id}`, { clientId: CLIENT, title: "Novo" }), ctx({ id }));
      expect(renamed.status).toBe(200);
      expect((await renamed.json()).artifact.title).toBe("Novo");
      expect((await patchRoute(req("PATCH", `/api/artifacts/${id}`, { clientId: CLIENT, title: " " }), ctx({ id }))).status).toBe(400);
      expect((await patchRoute(req("PATCH", `/api/artifacts/nope`, { clientId: CLIENT, title: "x" }), ctx({ id: "nope" }))).status).toBe(404);

      expect((await deleteRoute(req("DELETE", `/api/artifacts/${id}`), ctx({ id }))).status).toBe(400);
      const deleted = await deleteRoute(req("DELETE", `/api/artifacts/${id}?clientId=${CLIENT}`), ctx({ id }));
      expect(deleted.status).toBe(204);
      const again = await deleteRoute(req("DELETE", `/api/artifacts/${id}?clientId=${CLIENT}`), ctx({ id }));
      expect(again.status).toBe(404);
    }));

  it("tab routes", () =>
    withArtifactTestDb(async () => {
      const { id, tabs } = await postArtifact();
      const first = tabs[0]!.id;

      const added = await addTabRoute(req("POST", `/api/artifacts/${id}/tabs`, { clientId: CLIENT, title: "B", content: "b" }), ctx({ id }));
      expect(added.status).toBe(201);
      const second = (await added.json()).tab as { id: string; position: number };
      expect(second.position).toBe(1);
      expect((await addTabRoute(req("POST", `/api/artifacts/${id}/tabs`, { clientId: CLIENT, title: "" }), ctx({ id }))).status).toBe(400);
      expect((await addTabRoute(req("POST", `/api/artifacts/nope/tabs`, { clientId: CLIENT }), ctx({ id: "nope" }))).status).toBe(404);

      const put = (tabId: string, body: unknown, artifactId = id) =>
        putTabRoute(req("PUT", `/api/artifacts/${artifactId}/tabs/${tabId}`, body), ctx({ id: artifactId, tabId }));
      const saved = await put(first, { clientId: CLIENT, baseRevision: 1, content: "hello" });
      expect(saved.status).toBe(200);
      expect((await saved.json()).tab).toMatchObject({ id: first, content: "hello", revision: 2 });
      expect((await put(first, { clientId: CLIENT, content: "no revision" })).status).toBe(400);
      expect((await put(first, { clientId: CLIENT, baseRevision: 2, content: "x".repeat(500_001) })).status).toBe(400);
      expect((await put("missing", { clientId: CLIENT, baseRevision: 1, content: "x" })).status).toBe(404);
      expect((await put(first, { clientId: CLIENT, baseRevision: 1, content: "stale" })).status).toBe(409);

      const order = (tabIds: string[], artifactId = id) =>
        orderRoute(req("PUT", `/api/artifacts/${artifactId}/tab-order`, { clientId: CLIENT, tabIds }), ctx({ id: artifactId }));
      const reordered = await order([second.id, first]);
      expect(reordered.status).toBe(200);
      expect((await reordered.json()).artifact.tabs.map((t: { id: string }) => t.id)).toEqual([second.id, first]);
      expect((await order([first])).status).toBe(400);
      expect((await order([first, first])).status).toBe(400);
      expect((await order([first, "other"])).status).toBe(400);
      expect((await order([first], "nope")).status).toBe(404);

      const del = (tabId: string, artifactId = id, query = `?clientId=${CLIENT}`) =>
        deleteTabRoute(req("DELETE", `/api/artifacts/${artifactId}/tabs/${tabId}${query}`), ctx({ id: artifactId, tabId }));
      expect((await del(second.id)).status).toBe(204);
      expect((await del(second.id)).status).toBe(404);
      expect((await del(first, id, "")).status).toBe(400);
    }));

  it("last tab delete is 409", () =>
    withArtifactTestDb(async () => {
      const { id, tabs } = await postArtifact();
      const tabId = tabs[0]!.id;
      const response = await deleteTabRoute(
        req("DELETE", `/api/artifacts/${id}/tabs/${tabId}?clientId=${CLIENT}`),
        ctx({ id, tabId })
      );
      expect(response.status).toBe(409);
      expect((await response.json()).error).toBe("last_tab");
      expect(getArtifact(id).tabs).toHaveLength(1);
    }));

  it("stale baseRevision is 409", () =>
    withArtifactTestDb(async () => {
      const { id, tabs } = await postArtifact();
      const tabId = tabs[0]!.id;
      updateTab(AGENT_ACTOR, id, tabId, { content: "agent" });

      const response = await putTabRoute(
        req("PUT", `/api/artifacts/${id}/tabs/${tabId}`, { clientId: CLIENT, baseRevision: 1, content: "mine" }),
        ctx({ id, tabId })
      );

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error).toBe("revision_conflict");
      expect(body.tab).toMatchObject({ id: tabId, content: "agent", revision: 2 });
      expect(getArtifact(id).tabs[0]!.content).toBe("agent");
    }));

  it("concurrent writes with one baseRevision", () =>
    withArtifactTestDb(async () => {
      const { id, tabs } = await postArtifact();
      const tabId = tabs[0]!.id;
      const put = (content: string) =>
        putTabRoute(req("PUT", `/api/artifacts/${id}/tabs/${tabId}`, { clientId: CLIENT, baseRevision: 1, content }), ctx({ id, tabId }));

      const responses = await Promise.all([put("first"), put("second")]);

      const statuses = responses.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 409]);
      const winner = responses.findIndex((r) => r.status === 200) === 0 ? "first" : "second";
      expect(getArtifact(id).tabs[0]).toMatchObject({ content: winner, revision: 2 });
    }));

  it("version routes", () =>
    withArtifactTestDb(async () => {
      const { id, tabs } = await postArtifact();
      updateTab(AGENT_ACTOR, id, tabs[0]!.id, { content: "agent" });

      const list = await versionsRoute(req("GET", `/api/artifacts/${id}/versions`), ctx({ id }));
      expect(list.status).toBe(200);
      const { versions } = await list.json();
      expect(versions.map((v: { number: number; source: string }) => [v.number, v.source])).toEqual([
        [2, "agent"],
        [1, "user"]
      ]);
      expect((await versionsRoute(req("GET", "/api/artifacts/nope/versions"), ctx({ id: "nope" }))).status).toBe(404);

      const one = await versionRoute(req("GET", `/api/artifacts/${id}/versions/1`), ctx({ id, number: "1" }));
      expect(one.status).toBe(200);
      const { version } = await one.json();
      expect(version).toMatchObject({ number: 1, source: "user", restoredFrom: null });
      expect(version.tabs).toEqual([{ id: tabs[0]!.id, title: "Aba 1", position: 0, content: "" }]);
      for (const number of ["9", "abc", "0"]) {
        expect((await versionRoute(req("GET", `/api/artifacts/${id}/versions/${number}`), ctx({ id, number }))).status).toBe(404);
      }

      const restore = (number: string, artifactId = id) =>
        restoreRoute(req("POST", `/api/artifacts/${artifactId}/versions/${number}/restore`, { clientId: CLIENT }), ctx({ id: artifactId, number }));
      expect((await restore("9")).status).toBe(404);
      expect((await restore("1", "nope")).status).toBe(404);
      expect((await restoreRoute(req("POST", `/x`, {}), ctx({ id, number: "1" }))).status).toBe(400);
    }));

  it("restore route restores the version", () =>
    withArtifactTestDb(async () => {
      const { id, tabs } = await postArtifact();
      updateTab(AGENT_ACTOR, id, tabs[0]!.id, { content: "agent" });

      const response = await restoreRoute(
        req("POST", `/api/artifacts/${id}/versions/1/restore`, { clientId: CLIENT }),
        ctx({ id, number: "1" })
      );

      expect(response.status).toBe(200);
      expect((await response.json()).artifact.tabs[0].content).toBe("");
      expect(listVersions(id)[0]).toMatchObject({ number: 3, source: "restore", restoredFrom: 1 });
    }));

  it("events route", async () => {
    const missing = eventsRoute(req("GET", "/api/artifacts/events"));
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toBe("invalid_body");
  });

  it("events stream ready and artifact", () =>
    withArtifactTestDb(async () => {
      const abort = new AbortController();
      const response = eventsRoute(
        new Request("http://localhost/api/artifacts/events?clientId=sse-1", { signal: abort.signal })
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let text = "";
      const readUntil = async (needle: string) => {
        while (!text.includes(needle)) {
          const { value, done } = await reader.read();
          if (done) break;
          text += decoder.decode(value);
        }
      };

      await readUntil("event: ready");
      expect(text.startsWith("event: ready")).toBe(true);

      const own = createArtifact({ source: "user", clientId: "sse-1" }, { title: "Mine" });
      const other = createArtifact(AGENT_ACTOR, { title: "Agent" });
      await readUntil(other.id);

      expect(text).toContain("event: artifact");
      expect(text).not.toContain(own.id);
      const data = text.split("\n").find((line) => line.startsWith("data: ") && line.includes(other.id))!;
      expect(JSON.parse(data.slice(6))).toEqual({
        type: "upsert",
        id: other.id,
        tabIds: [other.tabs[0]!.id],
        source: "agent"
      });
      abort.abort();
    }));
});
