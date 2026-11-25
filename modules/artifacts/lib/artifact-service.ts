import { ptBR } from "@/modules/messages/pt-BR";
import {
  ARTIFACT_MAX_CONTENT,
  ARTIFACT_MAX_TABS,
  ARTIFACT_MAX_TITLE,
  ARTIFACT_USER_VERSION_WINDOW_MS,
  artifactContentSchema,
  artifactTitleSchema
} from "@/modules/artifacts/lib/artifact-validation";
import {
  deleteArtifactRow,
  deleteTabRow,
  getArtifactRow,
  getLatestVersion,
  getTabs,
  getVersionRow,
  inTransaction,
  insertArtifact,
  insertTab,
  insertVersion,
  listArtifactRows,
  listVersionRows,
  readDb,
  replaceVersionSnapshot,
  shiftPositionsFrom,
  touchArtifact,
  updateTabFields,
  type ArtifactDb,
  type ArtifactTab,
  type SnapshotTab,
  type VersionRow,
  type VersionSource
} from "@/modules/artifacts/lib/artifact-repository";

export type { ArtifactTab, VersionRow, VersionSource } from "@/modules/artifacts/lib/artifact-repository";

/** Who made a write: an agent (MCP) or a browser tab (`clientId`). */
export type ArtifactActor = { source: "agent"; clientId: null } | { source: "user"; clientId: string };

export const AGENT_ACTOR: ArtifactActor = { source: "agent", clientId: null };

export type ArtifactErrorCode = "not_found" | "invalid_body" | "last_tab" | "revision_conflict";

export class ArtifactError extends Error {
  readonly code: ArtifactErrorCode;
  /** The current tab on `revision_conflict`. */
  readonly tab?: ArtifactTab;

  constructor(code: ArtifactErrorCode, message: string, tab?: ArtifactTab) {
    super(message);
    this.name = "ArtifactError";
    this.code = code;
    this.tab = tab;
  }
}

export type ArtifactDetail = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  tabs: ArtifactTab[];
};

export type ArtifactSummary = {
  id: string;
  title: string;
  updatedAt: number;
  tabCount: number;
  versionCount: number;
};

export type ArtifactEvent = {
  type: "upsert" | "delete";
  id: string;
  /** Tabs whose title, content or existence changed. */
  tabIds: string[];
  source: "agent" | "user";
  sourceClientId: string | null;
};

type Subscriber = { clientId: string; listener: (event: ArtifactEvent) => void };

const globalKey = "__prFlowArtifactSubscribers" as const;
type GlobalWithArtifacts = typeof globalThis & { [globalKey]?: Set<Subscriber> };

function subscribers(): Set<Subscriber> {
  const scope = globalThis as GlobalWithArtifacts;
  scope[globalKey] ??= new Set();
  return scope[globalKey];
}

/** Subscribes to artifact events not caused by `clientId`. */
export function subscribeArtifacts(clientId: string, listener: (event: ArtifactEvent) => void): () => void {
  const subscriber: Subscriber = { clientId, listener };
  subscribers().add(subscriber);
  return () => {
    subscribers().delete(subscriber);
  };
}

function emit(event: ArtifactEvent): void {
  for (const subscriber of subscribers()) {
    if (subscriber.clientId !== event.sourceClientId) {
      subscriber.listener(event);
    }
  }
}

const notFound = (id: string) => new ArtifactError("not_found", ptBR.artifacts.errors.artifactNotFound(id));
const tabNotFound = (id: string) => new ArtifactError("not_found", ptBR.artifacts.errors.tabNotFound(id));

function checkTitle(title: string): string {
  const parsed = artifactTitleSchema.safeParse(title);
  if (!parsed.success) {
    throw new ArtifactError("invalid_body", ptBR.artifacts.errors.titleInvalid(ARTIFACT_MAX_TITLE));
  }
  return parsed.data;
}

function checkContent(content: string): string {
  if (!artifactContentSchema.safeParse(content).success) {
    throw new ArtifactError("invalid_body", ptBR.artifacts.errors.contentTooLong(ARTIFACT_MAX_CONTENT));
  }
  return content;
}

function checkTabCount(count: number): void {
  if (count > ARTIFACT_MAX_TABS) {
    throw new ArtifactError("invalid_body", ptBR.artifacts.errors.tooManyTabs(ARTIFACT_MAX_TABS));
  }
}

function snapshotOf(tabs: ArtifactTab[]): SnapshotTab[] {
  return tabs.map(({ id, title, position, content }) => ({ id, title, position, content }));
}

/** Adds a version, or folds a user write into the user version still inside its window (AD-019, AD-025). */
function recordVersion(
  tx: ArtifactDb,
  artifactId: string,
  source: VersionSource,
  now: number,
  restoredFrom: number | null = null
): void {
  const artifact = getArtifactRow(tx, artifactId)!;
  const snapshot = { title: artifact.title, tabs: snapshotOf(getTabs(tx, artifactId)) };
  const latest = getLatestVersion(tx, artifactId);
  if (source === "user" && latest?.source === "user" && now - latest.createdAt < ARTIFACT_USER_VERSION_WINDOW_MS) {
    replaceVersionSnapshot(tx, artifactId, latest.number, snapshot, now);
    return;
  }
  insertVersion(tx, artifactId, {
    number: (latest?.number ?? 0) + 1,
    source,
    restoredFrom,
    ...snapshot,
    createdAt: now,
    updatedAt: now
  });
}

function requireArtifact(tx: ArtifactDb, id: string) {
  const row = getArtifactRow(tx, id);
  if (!row) {
    throw notFound(id);
  }
  return row;
}

function requireTab(tx: ArtifactDb, artifactId: string, tabId: string): ArtifactTab {
  const tab = getTabs(tx, artifactId).find((candidate) => candidate.id === tabId);
  if (!tab) {
    throw tabNotFound(tabId);
  }
  return tab;
}

function detail(tx: ArtifactDb, id: string): ArtifactDetail {
  const row = requireArtifact(tx, id);
  return { ...row, tabs: getTabs(tx, id) };
}

function defaultTabTitle(position: number): string {
  return ptBR.artifacts.defaultTabTitle(position + 1);
}

export type NewTabInput = { title?: string; content?: string };

export function createArtifact(actor: ArtifactActor, input: { title: string; tabs?: NewTabInput[] }): ArtifactDetail {
  const title = checkTitle(input.title);
  const tabInputs = input.tabs && input.tabs.length > 0 ? input.tabs : [{}];
  checkTabCount(tabInputs.length);
  const tabs = tabInputs.map((tab, position) => ({
    id: crypto.randomUUID(),
    title: tab.title === undefined ? defaultTabTitle(position) : checkTitle(tab.title),
    content: checkContent(tab.content ?? ""),
    position,
    revision: 1
  }));
  const id = crypto.randomUUID();
  const now = Date.now();

  const created = inTransaction((tx) => {
    insertArtifact(tx, { id, title, createdAt: now, updatedAt: now });
    for (const tab of tabs) {
      insertTab(tx, id, tab, now);
    }
    recordVersion(tx, id, actor.source, now);
    return detail(tx, id);
  });
  emit({ type: "upsert", id, tabIds: tabs.map((tab) => tab.id), source: actor.source, sourceClientId: actor.clientId });
  return created;
}

/** Lowercase, accent-free form used by the title search (AD-020). */
export function normalizeForSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function listArtifacts(query?: string): ArtifactSummary[] {
  const needle = normalizeForSearch((query ?? "").trim());
  return listArtifactRows(readDb())
    .filter((row) => needle === "" || normalizeForSearch(row.title).includes(needle))
    .map(({ id, title, updatedAt, tabCount, versionCount }) => ({ id, title, updatedAt, tabCount, versionCount }));
}

export function getArtifact(id: string): ArtifactDetail {
  return detail(readDb(), id);
}

/** The tab a tool call means: `tabId`, or the only tab when omitted. */
export function resolveTab(artifactId: string, tabId?: string): ArtifactTab {
  const db = readDb();
  requireArtifact(db, artifactId);
  const tabs = getTabs(db, artifactId);
  if (tabId !== undefined) {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab) {
      throw tabNotFound(tabId);
    }
    return tab;
  }
  if (tabs.length !== 1) {
    throw new ArtifactError(
      "invalid_body",
      ptBR.artifacts.errors.tabIdRequired(tabs.map((tab) => `${tab.id}: ${tab.title}`).join("; "))
    );
  }
  return tabs[0]!;
}

type WriteResult<T> = { value: T; tabIds: string[] };

/** Runs one document change: the change, the artifact's `updatedAt`, a version, then the event. */
function write<T>(
  actor: ArtifactActor,
  artifactId: string,
  run: (tx: ArtifactDb, now: number) => WriteResult<T>,
  version: { source?: VersionSource; restoredFrom?: number } = {}
): T {
  const now = Date.now();
  const result = inTransaction((tx) => {
    requireArtifact(tx, artifactId);
    const outcome = run(tx, now);
    touchArtifact(tx, artifactId, now);
    recordVersion(tx, artifactId, version.source ?? actor.source, now, version.restoredFrom ?? null);
    return outcome;
  });
  emit({
    type: "upsert",
    id: artifactId,
    tabIds: result.tabIds,
    source: actor.source,
    sourceClientId: actor.clientId
  });
  return result.value;
}

export function renameArtifact(actor: ArtifactActor, id: string, title: string): ArtifactDetail {
  const clean = checkTitle(title);
  return write(actor, id, (tx, now) => {
    touchArtifact(tx, id, now, clean);
    return { value: detail(tx, id), tabIds: [] };
  });
}

export function deleteArtifact(actor: ArtifactActor, id: string): void {
  inTransaction((tx) => {
    requireArtifact(tx, id);
    deleteArtifactRow(tx, id);
  });
  emit({ type: "delete", id, tabIds: [], source: actor.source, sourceClientId: actor.clientId });
}

export function addTab(
  actor: ArtifactActor,
  artifactId: string,
  input: NewTabInput & { position?: number }
): ArtifactTab {
  return write(actor, artifactId, (tx, now) => {
    const tabs = getTabs(tx, artifactId);
    checkTabCount(tabs.length + 1);
    const position = Math.min(Math.max(input.position ?? tabs.length, 0), tabs.length);
    const tab: ArtifactTab = {
      id: crypto.randomUUID(),
      title: input.title === undefined ? defaultTabTitle(tabs.length) : checkTitle(input.title),
      content: checkContent(input.content ?? ""),
      position,
      revision: 1
    };
    shiftPositionsFrom(tx, artifactId, position, 1);
    insertTab(tx, artifactId, tab, now);
    return { value: tab, tabIds: [tab.id] };
  });
}

/**
 * Writes a tab's title and/or content. With `baseRevision` (browser) a stale revision is a conflict;
 * without it (agent) the write always lands.
 */
export function updateTab(
  actor: ArtifactActor,
  artifactId: string,
  tabId: string,
  input: { title?: string; content?: string; baseRevision?: number }
): ArtifactTab {
  return write(actor, artifactId, (tx, now) => {
    const current = requireTab(tx, artifactId, tabId);
    if (input.baseRevision !== undefined && input.baseRevision !== current.revision) {
      throw new ArtifactError("revision_conflict", ptBR.artifacts.errors.revisionConflict, current);
    }
    const title = input.title === undefined ? undefined : checkTitle(input.title);
    const content = input.content === undefined ? undefined : checkContent(input.content);
    updateTabFields(tx, tabId, { title, content, revision: current.revision + 1 }, now);
    return { value: requireTab(tx, artifactId, tabId), tabIds: [tabId] };
  });
}

/** Replaces the one occurrence of `oldStr` in the tab (AD-022). */
export function editTab(
  actor: ArtifactActor,
  artifactId: string,
  tabId: string,
  oldStr: string,
  newStr: string
): ArtifactTab {
  if (oldStr === "") {
    throw new ArtifactError("invalid_body", ptBR.artifacts.errors.oldStrEmpty);
  }
  return write(actor, artifactId, (tx, now) => {
    const current = requireTab(tx, artifactId, tabId);
    let occurrences = 0;
    for (let at = current.content.indexOf(oldStr); at !== -1; at = current.content.indexOf(oldStr, at + 1)) {
      occurrences += 1;
    }
    if (occurrences === 0) {
      throw new ArtifactError("invalid_body", ptBR.artifacts.errors.oldStrNotFound);
    }
    if (occurrences > 1) {
      throw new ArtifactError("invalid_body", ptBR.artifacts.errors.oldStrAmbiguous(occurrences));
    }
    const at = current.content.indexOf(oldStr);
    const content = checkContent(current.content.slice(0, at) + newStr + current.content.slice(at + oldStr.length));
    updateTabFields(tx, tabId, { content, revision: current.revision + 1 }, now);
    return { value: requireTab(tx, artifactId, tabId), tabIds: [tabId] };
  });
}

export function deleteTab(actor: ArtifactActor, artifactId: string, tabId: string): void {
  write(actor, artifactId, (tx, now) => {
    const tabs = getTabs(tx, artifactId);
    if (!tabs.some((tab) => tab.id === tabId)) {
      throw tabNotFound(tabId);
    }
    if (tabs.length === 1) {
      throw new ArtifactError("last_tab", ptBR.artifacts.errors.lastTab);
    }
    deleteTabRow(tx, tabId);
    tabs
      .filter((tab) => tab.id !== tabId)
      .forEach((tab, position) => {
        if (tab.position !== position) {
          updateTabFields(tx, tab.id, { position }, now);
        }
      });
    return { value: undefined, tabIds: [tabId] };
  });
}

export function reorderTabs(actor: ArtifactActor, artifactId: string, tabIds: string[]): ArtifactDetail {
  return write(actor, artifactId, (tx, now) => {
    const tabs = getTabs(tx, artifactId);
    const known = new Set(tabs.map((tab) => tab.id));
    if (
      tabIds.length !== tabs.length ||
      new Set(tabIds).size !== tabIds.length ||
      !tabIds.every((id) => known.has(id))
    ) {
      throw new ArtifactError("invalid_body", ptBR.artifacts.errors.reorderMismatch);
    }
    tabIds.forEach((id, position) => updateTabFields(tx, id, { position }, now));
    return { value: detail(tx, artifactId), tabIds: [] };
  });
}

export type VersionSummary = {
  number: number;
  source: VersionSource;
  restoredFrom: number | null;
  title: string;
  tabCount: number;
  createdAt: number;
  updatedAt: number;
};

export function listVersions(artifactId: string): VersionSummary[] {
  const db = readDb();
  requireArtifact(db, artifactId);
  return listVersionRows(db, artifactId).map(({ tabs, ...rest }) => ({ ...rest, tabCount: tabs.length }));
}

export function getVersion(artifactId: string, number: number): VersionRow {
  const db = readDb();
  requireArtifact(db, artifactId);
  const version = getVersionRow(db, artifactId, number);
  if (!version) {
    throw new ArtifactError("not_found", ptBR.artifacts.errors.versionNotFound(number));
  }
  return version;
}

/** Makes the document equal to a snapshot and records a `restore` version (AD-025). */
export function restoreVersion(actor: ArtifactActor, artifactId: string, number: number): ArtifactDetail {
  return write(
    actor,
    artifactId,
    (tx, now) => {
      const version = getVersionRow(tx, artifactId, number);
      if (!version) {
        throw new ArtifactError("not_found", ptBR.artifacts.errors.versionNotFound(number));
      }
      const current = getTabs(tx, artifactId);
      const wanted = new Map(version.tabs.map((tab) => [tab.id, tab]));
      const touched: string[] = [];

      for (const tab of current) {
        if (!wanted.has(tab.id)) {
          deleteTabRow(tx, tab.id);
          touched.push(tab.id);
        }
      }
      for (const snap of version.tabs) {
        const existing = current.find((tab) => tab.id === snap.id);
        if (!existing) {
          insertTab(tx, artifactId, { ...snap, revision: 1 }, now);
          touched.push(snap.id);
          continue;
        }
        const textChanged = existing.title !== snap.title || existing.content !== snap.content;
        if (textChanged || existing.position !== snap.position) {
          updateTabFields(
            tx,
            snap.id,
            {
              title: snap.title,
              content: snap.content,
              position: snap.position,
              ...(textChanged ? { revision: existing.revision + 1 } : {})
            },
            now
          );
        }
        if (textChanged) {
          touched.push(snap.id);
        }
      }
      touchArtifact(tx, artifactId, now, version.title);
      return { value: detail(tx, artifactId), tabIds: touched };
    },
    { source: "restore", restoredFrom: number }
  );
}

/** The number of the newest version, which is the document as it is now. */
export function currentVersionNumber(artifactId: string): number {
  return getLatestVersion(readDb(), artifactId)?.number ?? 0;
}
