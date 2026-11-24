import { describe, expect, it } from "vitest";
import {
  INITIAL_TAB_SYNC,
  hasUnsavedEdit,
  reduceTabSync,
  type TabSyncAction,
  type TabSyncState
} from "@/modules/artifacts/lib/artifact-sync";

const saving = (overrides: Partial<Extract<TabSyncState, { status: "saving" }>> = {}): TabSyncState => ({
  status: "saving",
  remoteChanged: false,
  editedDuring: false,
  ...overrides
});

/** The 17 transitions of the plan's state diagram: [from, action, to]. */
const DIAGRAM: Array<[string, TabSyncState, TabSyncAction, TabSyncState]> = [
  ["loading -> clean (GET ok)", { status: "loading" }, { type: "loaded" }, { status: "clean" }],
  ["loading -> loadError (GET fails)", { status: "loading" }, { type: "loadFailed" }, { status: "loadError" }],
  ["loadError -> loading (retry)", { status: "loadError" }, { type: "retryLoad" }, { status: "loading" }],
  ["clean -> dirty (user edits)", { status: "clean" }, { type: "edit" }, { status: "dirty" }],
  ["dirty -> saving (1s without typing)", { status: "dirty" }, { type: "saveStarted" }, saving()],
  ["saving -> clean (PUT 200)", saving(), { type: "saved" }, { status: "clean" }],
  ["saving -> saveError (PUT fails)", saving(), { type: "saveFailed" }, { status: "saveError" }],
  ["saveError -> saving (retry or next edit)", { status: "saveError" }, { type: "saveStarted" }, saving()],
  ["saving -> conflict (PUT 409)", saving(), { type: "saveConflict" }, { status: "conflict" }],
  ["clean -> loading (SSE touches this tab)", { status: "clean" }, { type: "remoteTouched" }, { status: "loading" }],
  ["dirty -> conflict (SSE touches this tab)", { status: "dirty" }, { type: "remoteTouched" }, { status: "conflict" }],
  ["conflict -> loading (Recarregar)", { status: "conflict" }, { type: "reload" }, { status: "loading" }],
  ["conflict -> saving (Manter o meu)", { status: "conflict" }, { type: "keepMine" }, saving()],
  ["clean -> loading (SSE tab deleted)", { status: "clean" }, { type: "remoteTabDeleted" }, { status: "loading" }],
  ["dirty -> loading (SSE tab deleted)", { status: "dirty" }, { type: "remoteTabDeleted" }, { status: "loading" }],
  ["clean -> end (SSE artifact deleted)", { status: "clean" }, { type: "remoteArtifactDeleted" }, { status: "gone" }],
  ["dirty -> end (SSE artifact deleted)", { status: "dirty" }, { type: "remoteArtifactDeleted" }, { status: "gone" }]
];

describe("artifact tab sync", () => {
  it("state transitions", () => {
    expect(DIAGRAM).toHaveLength(17);
    for (const [label, from, action, to] of DIAGRAM) {
      expect(reduceTabSync(from, action), label).toEqual(to);
    }
    expect(INITIAL_TAB_SYNC).toEqual({ status: "loading" });
  });

  it("state transitions refuse what the diagram does not draw", () => {
    const refused: Array<[TabSyncState, TabSyncAction]> = [
      [{ status: "clean" }, { type: "saveStarted" }],
      [{ status: "clean" }, { type: "saved" }],
      [{ status: "clean" }, { type: "keepMine" }],
      [{ status: "clean" }, { type: "reload" }],
      [{ status: "dirty" }, { type: "saved" }],
      [{ status: "dirty" }, { type: "reload" }],
      [{ status: "loading" }, { type: "edit" }],
      [{ status: "loading" }, { type: "saveStarted" }],
      [{ status: "loadError" }, { type: "edit" }],
      [{ status: "saveError" }, { type: "saved" }],
      [{ status: "conflict" }, { type: "saveStarted" }],
      [{ status: "conflict" }, { type: "saved" }]
    ];
    for (const [from, action] of refused) {
      expect(reduceTabSync(from, action), `${from.status} + ${action.type}`).toEqual(from);
    }
  });

  it("state transitions keep an edit made or a write that landed while saving", () => {
    // typing goes on during the PUT: after it lands the tab is dirty again, not clean
    let state = reduceTabSync(saving(), { type: "edit" });
    expect(state).toEqual(saving({ editedDuring: true }));
    expect(reduceTabSync(state, { type: "saved" })).toEqual({ status: "dirty" });

    // an event for the tab arrives while the PUT is in flight: the user's text stays and asks for a choice
    state = reduceTabSync(saving(), { type: "remoteTouched" });
    expect(state).toEqual(saving({ remoteChanged: true }));
    expect(reduceTabSync(state, { type: "saved" })).toEqual({ status: "conflict" });

    // failed saves and conflicts keep waiting for the user
    expect(reduceTabSync({ status: "saveError" }, { type: "remoteTouched" })).toEqual({ status: "conflict" });
    expect(reduceTabSync({ status: "conflict" }, { type: "edit" })).toEqual({ status: "conflict" });
    expect(reduceTabSync({ status: "conflict" }, { type: "remoteTouched" })).toEqual({ status: "conflict" });

    // a deleted tab or artifact wins from every state; nothing leaves `gone`
    for (const status of ["dirty", "saveError", "conflict"] as const) {
      expect(reduceTabSync({ status }, { type: "remoteTabDeleted" })).toEqual({ status: "loading" });
    }
    expect(reduceTabSync(saving(), { type: "remoteArtifactDeleted" })).toEqual({ status: "gone" });
    expect(reduceTabSync({ status: "gone" }, { type: "loaded" })).toEqual({ status: "gone" });
  });

  it("state transitions tell when the user's text is not on the server", () => {
    const unsaved = ["dirty", "saveError", "conflict"] as const;
    for (const status of unsaved) {
      expect(hasUnsavedEdit({ status }), status).toBe(true);
    }
    expect(hasUnsavedEdit(saving())).toBe(true);
    for (const status of ["loading", "loadError", "clean", "gone"] as const) {
      expect(hasUnsavedEdit({ status }), status).toBe(false);
    }
  });
});
