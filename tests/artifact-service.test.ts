import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_ACTOR,
  ArtifactError,
  addTab,
  createArtifact,
  deleteArtifact,
  deleteTab,
  editTab,
  getArtifact,
  getVersion,
  listArtifacts,
  listVersions,
  renameArtifact,
  reorderTabs,
  restoreVersion,
  subscribeArtifacts,
  updateTab,
  type ArtifactActor,
  type ArtifactEvent
} from "@/modules/artifacts/lib/artifact-service";
import { withArtifactTestDb } from "./artifact-test-db";

const USER: ArtifactActor = { source: "user", clientId: "tab-1" };

function make(tabs: Array<{ title: string; content?: string }> = [{ title: "A" }, { title: "B" }, { title: "C" }]) {
  return createArtifact(AGENT_ACTOR, { title: "Doc", tabs });
}

function titles(id: string): string[] {
  return getArtifact(id).tabs.map((tab) => tab.title);
}

function expectError(fn: () => unknown, code: string): ArtifactError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ArtifactError);
    expect((error as ArtifactError).code).toBe(code);
    return error as ArtifactError;
  }
  throw new Error("expected the call to throw");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("artifact service", () => {
  it("title search ignores case and accents", () =>
    withArtifactTestDb(() => {
      createArtifact(AGENT_ACTOR, { title: "Relatório de PRs" });
      createArtifact(AGENT_ACTOR, { title: "Outro" });

      expect(listArtifacts("relatorio").map((a) => a.title)).toEqual(["Relatório de PRs"]);
      expect(listArtifacts("RELATORIO").map((a) => a.title)).toEqual(["Relatório de PRs"]);
      expect(listArtifacts("relatório").map((a) => a.title)).toEqual(["Relatório de PRs"]);
      expect(listArtifacts("xyz")).toEqual([]);
      expect(listArtifacts("")).toHaveLength(2);
      expect(listArtifacts(undefined)).toHaveLength(2);
    }));

  it("update replaces content and bumps revision", () =>
    withArtifactTestDb(() => {
      const artifact = make([{ title: "A", content: "old" }]);
      const tab = artifact.tabs[0]!;
      expect(tab.revision).toBe(1);

      const updated = updateTab(AGENT_ACTOR, artifact.id, tab.id, { content: "new" });

      expect(updated.content).toBe("new");
      expect(updated.revision).toBe(2);
      expect(getArtifact(artifact.id).tabs[0]!.content).toBe("new");
      const versions = listVersions(artifact.id);
      expect(versions.map((v) => [v.number, v.source])).toEqual([
        [2, "agent"],
        [1, "agent"]
      ]);
    }));

  it("edit replaces a single occurrence", () =>
    withArtifactTestDb(() => {
      const artifact = make([{ title: "A", content: "# Title\n\nhello $& world" }]);
      const tab = artifact.tabs[0]!;

      const edited = editTab(AGENT_ACTOR, artifact.id, tab.id, "hello", "bye");

      expect(edited.content).toBe("# Title\n\nbye $& world");
      expect(edited.revision).toBe(2);
      expect(listVersions(artifact.id)).toHaveLength(2);
      // replacement text with `$` patterns is inserted literally
      expect(editTab(AGENT_ACTOR, artifact.id, tab.id, "bye", "$& $1").content).toBe("# Title\n\n$& $1 $& world");
    }));

  it("add tab inserts at position and shifts later tabs", () =>
    withArtifactTestDb(() => {
      const artifact = make();
      const inserted = addTab(AGENT_ACTOR, artifact.id, { title: "new", position: 1 });
      expect(inserted.position).toBe(1);
      expect(getArtifact(artifact.id).tabs.map((t) => [t.title, t.position])).toEqual([
        ["A", 0],
        ["new", 1],
        ["B", 2],
        ["C", 3]
      ]);

      addTab(AGENT_ACTOR, artifact.id, { title: "far", position: 99 });
      addTab(AGENT_ACTOR, artifact.id, { title: "default" });
      expect(titles(artifact.id).slice(-2)).toEqual(["far", "default"]);
      expect(getArtifact(artifact.id).tabs.map((t) => t.position)).toEqual([0, 1, 2, 3, 4, 5]);
    }));

  it("renames add an agent version", () =>
    withArtifactTestDb(() => {
      const artifact = make();
      const tab = artifact.tabs[0]!;

      updateTab(AGENT_ACTOR, artifact.id, tab.id, { title: "Renamed tab" });
      expect(listVersions(artifact.id)).toHaveLength(2);
      expect(titles(artifact.id)[0]).toBe("Renamed tab");

      renameArtifact(AGENT_ACTOR, artifact.id, "Renamed doc");
      const versions = listVersions(artifact.id);
      expect(versions).toHaveLength(3);
      expect(versions[0]).toMatchObject({ number: 3, source: "agent", title: "Renamed doc" });
      expect(getArtifact(artifact.id).title).toBe("Renamed doc");
    }));

  it("reorder requires exactly the tab ids", () =>
    withArtifactTestDb(() => {
      const artifact = make();
      const [a, b, c] = artifact.tabs.map((t) => t.id) as [string, string, string];
      const other = make([{ title: "X" }]).tabs[0]!.id;

      reorderTabs(AGENT_ACTOR, artifact.id, [c, a, b]);
      expect(titles(artifact.id)).toEqual(["C", "A", "B"]);
      const versionsBefore = listVersions(artifact.id).length;

      for (const bad of [[c, a], [c, a, a, b], [c, a, other], [], [a, b, c, other]]) {
        expectError(() => reorderTabs(AGENT_ACTOR, artifact.id, bad), "invalid_body");
      }
      expect(titles(artifact.id)).toEqual(["C", "A", "B"]);
      expect(listVersions(artifact.id)).toHaveLength(versionsBefore);
    }));

  it("delete tab closes the gap", () =>
    withArtifactTestDb(() => {
      const artifact = make();
      deleteTab(AGENT_ACTOR, artifact.id, artifact.tabs[1]!.id);

      expect(getArtifact(artifact.id).tabs.map((t) => [t.title, t.position])).toEqual([
        ["A", 0],
        ["C", 1]
      ]);
    }));

  it("deleting the last tab is refused", () =>
    withArtifactTestDb(() => {
      const artifact = make([{ title: "Only", content: "x" }]);
      const tab = artifact.tabs[0]!;

      expectError(() => deleteTab(AGENT_ACTOR, artifact.id, tab.id), "last_tab");

      expect(getArtifact(artifact.id).tabs).toEqual([expect.objectContaining({ id: tab.id, revision: 1 })]);
      expect(listVersions(artifact.id)).toHaveLength(1);
    }));

  it("delete artifact cascades tabs and versions", () =>
    withArtifactTestDb(async () => {
      const artifact = make();
      updateTab(AGENT_ACTOR, artifact.id, artifact.tabs[0]!.id, { content: "x" });
      const survivor = make([{ title: "Keep" }]);

      deleteArtifact(AGENT_ACTOR, artifact.id);

      const { getDb } = await import("@/modules/db/lib/db");
      const { artifactTabs, artifactVersions, artifacts } = await import("@/modules/artifacts/lib/schema");
      const db = getDb();
      expect(db.select().from(artifacts).all().map((row) => row.id)).toEqual([survivor.id]);
      expect(db.select().from(artifactTabs).all().map((row) => row.artifactId)).toEqual([survivor.id]);
      expect(db.select().from(artifactVersions).all().map((row) => row.artifactId)).toEqual([survivor.id]);
      expectError(() => getArtifact(artifact.id), "not_found");
    }));

  it("limits on titles, content and tab count", () =>
    withArtifactTestDb(() => {
      expectError(() => createArtifact(AGENT_ACTOR, { title: "   " }), "invalid_body");
      expectError(() => createArtifact(AGENT_ACTOR, { title: "x".repeat(201) }), "invalid_body");
      const ok = createArtifact(AGENT_ACTOR, { title: "x".repeat(200) });
      expect(ok.title).toHaveLength(200);

      const tab = ok.tabs[0]!;
      expectError(() => renameArtifact(AGENT_ACTOR, ok.id, ""), "invalid_body");
      expectError(() => updateTab(AGENT_ACTOR, ok.id, tab.id, { title: "y".repeat(201) }), "invalid_body");
      expectError(() => updateTab(AGENT_ACTOR, ok.id, tab.id, { content: "z".repeat(500_001) }), "invalid_body");
      expect(updateTab(AGENT_ACTOR, ok.id, tab.id, { content: "z".repeat(500_000) }).content).toHaveLength(500_000);
      expectError(() => addTab(AGENT_ACTOR, ok.id, { title: "t", content: "z".repeat(500_001) }), "invalid_body");

      const before = listVersions(ok.id).length;
      for (let index = 2; index <= 50; index += 1) {
        addTab(AGENT_ACTOR, ok.id, { title: `t${index}` });
      }
      expect(getArtifact(ok.id).tabs).toHaveLength(50);
      expectError(() => addTab(AGENT_ACTOR, ok.id, { title: "51st" }), "invalid_body");
      expect(getArtifact(ok.id).tabs).toHaveLength(50);
      expect(listVersions(ok.id)).toHaveLength(before + 49);
      expectError(
        () => createArtifact(AGENT_ACTOR, { title: "many", tabs: Array.from({ length: 51 }, () => ({ title: "t" })) }),
        "invalid_body"
      );
    }));

  it("each agent tool adds exactly one agent version", () =>
    withArtifactTestDb(() => {
      const artifact = make([{ title: "A", content: "a" }, { title: "B", content: "b" }, { title: "C", content: "c" }]);
      const [a, b] = artifact.tabs as [(typeof artifact.tabs)[number], (typeof artifact.tabs)[number]];
      const id = artifact.id;

      expect(listVersions(id)).toHaveLength(1);
      expect(getVersion(id, 1).tabs.map((t) => t.title)).toEqual(["A", "B", "C"]);

      const operations: Array<[string, () => unknown]> = [
        ["rename_artifact", () => renameArtifact(AGENT_ACTOR, id, "Doc 2")],
        ["update", () => updateTab(AGENT_ACTOR, id, a.id, { content: "a2" })],
        ["edit", () => editTab(AGENT_ACTOR, id, a.id, "a2", "a3")],
        ["add tab", () => addTab(AGENT_ACTOR, id, { title: "D", content: "d" })],
        ["rename tab", () => updateTab(AGENT_ACTOR, id, b.id, { title: "B2" })],
        ["reorder", () => reorderTabs(AGENT_ACTOR, id, [...getArtifact(id).tabs.map((t) => t.id)].reverse())],
        ["delete tab", () => deleteTab(AGENT_ACTOR, id, b.id)]
      ];
      let expected = 1;
      for (const [label, operate] of operations) {
        operate();
        expected += 1;
        const versions = listVersions(id);
        expect(versions, label).toHaveLength(expected);
        expect(versions[0], label).toMatchObject({ number: expected, source: "agent" });
        const snapshot = getVersion(id, expected);
        const current = getArtifact(id);
        expect(snapshot.title, label).toBe(current.title);
        expect(snapshot.tabs, label).toEqual(
          current.tabs.map(({ id: tabId, title, position, content }) => ({ id: tabId, title, position, content }))
        );
      }
      // create is the 8th: one version with every tab
      expect(getVersion(id, 1).tabs).toHaveLength(3);
    }));

  it("user changes inside the window update the version in place", () =>
    withArtifactTestDb(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const start = new Date("2026-01-01T10:00:00Z").getTime();
      vi.setSystemTime(start);
      const created = createArtifact(USER, { title: "Doc", tabs: [{ title: "A" }, { title: "B" }] });
      const id = created.id;
      const [a, b] = created.tabs as [(typeof created.tabs)[number], (typeof created.tabs)[number]];
      expect(listVersions(id).map((v) => v.source)).toEqual(["user"]);

      const changes: Array<[string, () => unknown]> = [
        ["tab content", () => updateTab(USER, id, a.id, { content: "typed", baseRevision: 1 })],
        ["tab title", () => updateTab(USER, id, a.id, { title: "A2", baseRevision: 2 })],
        ["new tab", () => addTab(USER, id, { title: "C" })],
        ["deleted tab", () => deleteTab(USER, id, b.id)],
        ["tab order", () => reorderTabs(USER, id, [...getArtifact(id).tabs.map((t) => t.id)].reverse())],
        ["artifact title", () => renameArtifact(USER, id, "Doc 2")]
      ];
      vi.setSystemTime(start + 9 * 60_000 + 59_000);
      for (const [label, change] of changes) {
        change();
        const versions = listVersions(id);
        expect(versions, label).toHaveLength(1);
        const current = getArtifact(id);
        expect(versions[0]!.title, label).toBe(current.title);
        expect(getVersion(id, 1).tabs, label).toEqual(
          current.tabs.map(({ id: tabId, title, position, content }) => ({ id: tabId, title, position, content }))
        );
      }
      expect(getVersion(id, 1).tabs.find((t) => t.id === a.id)?.content).toBe("typed");
    }));

  it("user changes outside the window add a version", () =>
    withArtifactTestDb(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const start = new Date("2026-01-01T10:00:00Z").getTime();

      // exactly 10 minutes after the user version was created
      vi.setSystemTime(start);
      const first = createArtifact(USER, { title: "Doc" });
      vi.setSystemTime(start + 10 * 60_000);
      updateTab(USER, first.id, first.tabs[0]!.id, { content: "x", baseRevision: 1 });
      expect(listVersions(first.id).map((v) => [v.number, v.source])).toEqual([
        [2, "user"],
        [1, "user"]
      ]);

      // an agent version 5 seconds old
      vi.setSystemTime(start);
      const second = createArtifact(USER, { title: "Doc 2" });
      vi.setSystemTime(start + 1000);
      updateTab(AGENT_ACTOR, second.id, second.tabs[0]!.id, { content: "agent" });
      vi.setSystemTime(start + 6000);
      updateTab(USER, second.id, second.tabs[0]!.id, { content: "user", baseRevision: 2 });
      expect(listVersions(second.id).map((v) => [v.number, v.source])).toEqual([
        [3, "user"],
        [2, "agent"],
        [1, "user"]
      ]);

      // a restore version
      restoreVersion(USER, second.id, 1);
      vi.setSystemTime(start + 7000);
      updateTab(USER, second.id, second.tabs[0]!.id, { content: "again" });
      expect(listVersions(second.id).map((v) => v.source)).toEqual(["user", "restore", "user", "agent", "user"]);
    }));

  it("restore brings back the whole document", () =>
    withArtifactTestDb(() => {
      const artifact = createArtifact(AGENT_ACTOR, {
        title: "Doc v1",
        tabs: [
          { title: "A", content: "a1" },
          { title: "B", content: "b1" }
        ]
      });
      const [a, b] = artifact.tabs as [(typeof artifact.tabs)[number], (typeof artifact.tabs)[number]];
      const id = artifact.id;
      renameArtifact(AGENT_ACTOR, id, "Doc v2");
      deleteTab(AGENT_ACTOR, id, b.id);
      const c = addTab(AGENT_ACTOR, id, { title: "C", content: "c1" });
      updateTab(AGENT_ACTOR, id, a.id, { content: "a2" });
      const v1 = getVersion(id, 1);
      const latestBefore = listVersions(id).length;
      const aRevision = getArtifact(id).tabs.find((t) => t.id === a.id)!.revision;

      const restored = restoreVersion(USER, id, 1);

      expect(restored.title).toBe("Doc v1");
      expect(restored.tabs.map(({ id: tabId, title, position, content }) => ({ id: tabId, title, position, content }))).toEqual(
        v1.tabs
      );
      expect(restored.tabs.map((t) => t.id)).toEqual([a.id, b.id]);
      expect(restored.tabs.some((t) => t.id === c.id)).toBe(false);
      expect(restored.tabs.find((t) => t.id === a.id)!.revision).toBe(aRevision + 1);
      const versions = listVersions(id);
      expect(versions).toHaveLength(latestBefore + 1);
      expect(versions[0]).toMatchObject({ number: latestBefore + 1, source: "restore", restoredFrom: 1 });
      expect(getVersion(id, 1)).toEqual(v1);
      expect(getVersion(id, 2).title).toBe("Doc v2");
      expectError(() => restoreVersion(USER, id, 99), "not_found");
    }));

  it("stale baseRevision is rejected", () =>
    withArtifactTestDb(() => {
      const artifact = make([{ title: "A", content: "a" }, { title: "B", content: "b" }]);
      const [a, b] = artifact.tabs as [(typeof artifact.tabs)[number], (typeof artifact.tabs)[number]];
      updateTab(AGENT_ACTOR, artifact.id, a.id, { content: "agent" });
      const versionsBefore = listVersions(artifact.id).length;

      const error = expectError(
        () => updateTab(USER, artifact.id, a.id, { content: "mine", baseRevision: 1 }),
        "revision_conflict"
      );

      expect(error.tab).toMatchObject({ id: a.id, content: "agent", revision: 2 });
      expect(getArtifact(artifact.id).tabs[0]!.content).toBe("agent");
      expect(listVersions(artifact.id)).toHaveLength(versionsBefore);

      // a write to tab B does not move tab A
      updateTab(USER, artifact.id, b.id, { content: "b2", baseRevision: 1 });
      expect(getArtifact(artifact.id).tabs[0]!.revision).toBe(2);
      expect(updateTab(USER, artifact.id, a.id, { content: "mine", baseRevision: 2 }).revision).toBe(3);
    }));

  it("events skip the writing client", () =>
    withArtifactTestDb(() => {
      const seen: Record<string, ArtifactEvent[]> = { "tab-1": [], "tab-2": [] };
      const unsubscribe = ["tab-1", "tab-2"].map((clientId) =>
        subscribeArtifacts(clientId, (event) => seen[clientId]!.push(event))
      );

      const artifact = createArtifact(USER, { title: "Doc" });
      expect(seen["tab-1"]).toEqual([]);
      expect(seen["tab-2"]).toEqual([
        { type: "upsert", id: artifact.id, tabIds: [artifact.tabs[0]!.id], source: "user", sourceClientId: "tab-1" }
      ]);

      updateTab(AGENT_ACTOR, artifact.id, artifact.tabs[0]!.id, { content: "agent" });
      expect(seen["tab-1"]).toHaveLength(1);
      expect(seen["tab-2"]).toHaveLength(2);
      expect(seen["tab-1"]![0]).toMatchObject({ source: "agent", sourceClientId: null, tabIds: [artifact.tabs[0]!.id] });

      deleteArtifact(USER, artifact.id);
      expect(seen["tab-1"]).toHaveLength(1);
      expect(seen["tab-2"]![2]).toMatchObject({ type: "delete", id: artifact.id });

      unsubscribe.forEach((stop) => stop());
      createArtifact(AGENT_ACTOR, { title: "After" });
      expect(seen["tab-2"]).toHaveLength(3);
    }));

  it("agent Markdown is stored as sent", () =>
    withArtifactTestDb(() => {
      const markdown = "# Title  \n\n*  odd   bullet\n\n|a|b|\n|-|-|\n|1|2|\n\n\n\ntrailing   ";
      const artifact = createArtifact(AGENT_ACTOR, { title: "Doc", tabs: [{ title: "A", content: markdown }] });
      expect(getArtifact(artifact.id).tabs[0]!.content).toBe(markdown);
      updateTab(AGENT_ACTOR, artifact.id, artifact.tabs[0]!.id, { content: markdown + "\n" });
      expect(getArtifact(artifact.id).tabs[0]!.content).toBe(markdown + "\n");
    }));
});
