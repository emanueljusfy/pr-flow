/**
 * Sync state of the selected tab (plan: state diagram). Pure: the page feeds it what happened
 * (an edit, a save result, a server event) and renders what it says.
 */
export type TabSyncState =
  | { status: "loading" }
  | { status: "loadError" }
  | { status: "clean" }
  | { status: "dirty" }
  /** `remoteChanged`: an event for this tab arrived while the save was in flight. `editedDuring`: typing went on. */
  | { status: "saving"; remoteChanged: boolean; editedDuring: boolean }
  | { status: "saveError" }
  /** The server holds a newer version of a tab with an unsaved edit: the banner. */
  | { status: "conflict" }
  | { status: "gone" };

export type TabSyncAction =
  | { type: "loaded" }
  | { type: "loadFailed" }
  | { type: "retryLoad" }
  | { type: "edit" }
  | { type: "saveStarted" }
  | { type: "saved" }
  | { type: "saveFailed" }
  /** `PUT` answered 409 revision_conflict. */
  | { type: "saveConflict" }
  /** An event (or a refetch) shows the selected tab changed on the server. */
  | { type: "remoteTouched" }
  | { type: "remoteTabDeleted" }
  | { type: "remoteArtifactDeleted" }
  /** "Recarregar" */
  | { type: "reload" }
  /** "Manter o meu" */
  | { type: "keepMine" };

export const INITIAL_TAB_SYNC: TabSyncState = { status: "loading" };

/** Where a tab goes when something happens to it; an action a state does not take leaves it as it is. */
export function reduceTabSync(state: TabSyncState, action: TabSyncAction): TabSyncState {
  if (state.status === "gone") {
    return state;
  }
  switch (action.type) {
    case "remoteArtifactDeleted":
      return { status: "gone" };
    case "remoteTabDeleted":
      return { status: "loading" };
    case "loaded":
      return state.status === "loading" ? { status: "clean" } : state;
    case "loadFailed":
      return state.status === "loading" ? { status: "loadError" } : state;
    case "retryLoad":
      return state.status === "loadError" ? { status: "loading" } : state;
    case "edit":
      switch (state.status) {
        case "clean":
          return { status: "dirty" };
        case "saving":
          return { ...state, editedDuring: true };
        default:
          return state;
      }
    case "saveStarted":
      return state.status === "dirty" || state.status === "saveError"
        ? { status: "saving", remoteChanged: false, editedDuring: false }
        : state;
    case "saved":
      if (state.status !== "saving") {
        return state;
      }
      if (state.remoteChanged) {
        return { status: "conflict" };
      }
      return state.editedDuring ? { status: "dirty" } : { status: "clean" };
    case "saveFailed":
      return state.status === "saving" ? { status: "saveError" } : state;
    case "saveConflict":
      return state.status === "saving" ? { status: "conflict" } : state;
    case "remoteTouched":
      switch (state.status) {
        case "clean":
          return { status: "loading" };
        case "dirty":
        case "saveError":
          return { status: "conflict" };
        case "saving":
          return { ...state, remoteChanged: true };
        default:
          return state;
      }
    case "reload":
      return state.status === "conflict" ? { status: "loading" } : state;
    case "keepMine":
      return state.status === "conflict" ? { status: "saving", remoteChanged: false, editedDuring: false } : state;
  }
}

/** True while the user's text is not on the server yet (pending, in flight, failed or in conflict). */
export function hasUnsavedEdit(state: TabSyncState): boolean {
  return (
    state.status === "dirty" || state.status === "saving" || state.status === "saveError" || state.status === "conflict"
  );
}
