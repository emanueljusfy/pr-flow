import {
  DocumentRecordType,
  PageRecordType,
  TLDOCUMENT_ID,
  type SerializedSchema,
  type TLRecord,
  type TLStore
} from "tldraw";
import { ptBR } from "@/modules/messages/pt-BR";
import { WhiteboardOpError, type OpResult } from "@/modules/whiteboard/lib/whiteboard-board-ops";
import { loadStoredWhiteboard, persistWhiteboardChange } from "@/modules/whiteboard/lib/whiteboard-repository";
import {
  createWhiteboardStore,
  isDocumentScopeRecord,
  type WhiteboardDiff
} from "@/modules/whiteboard/lib/whiteboard-tldraw";

/** `clientId` of changes made through MCP tools. */
export const WHITEBOARD_MCP_CLIENT_ID = "mcp";

export type WhiteboardChangeEvent = {
  clock: number;
  sourceClientId: string;
  put: TLRecord[];
  remove: string[];
};

export type WhiteboardDocument = {
  clock: number;
  schema: SerializedSchema;
  records: TLRecord[];
};

type Subscriber = { clientId: string; listener: (event: WhiteboardChangeEvent) => void };

type WhiteboardState = {
  store: TLStore;
  clock: number;
  subscribers: Set<Subscriber>;
};

/** A record sent by a client that the board cannot accept. */
export class WhiteboardRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhiteboardRecordError";
  }
}

export class WhiteboardNotEmptyError extends Error {
  constructor() {
    super(ptBR.whiteboard.errors.boardNotEmpty);
    this.name = "WhiteboardNotEmptyError";
  }
}

const globalKey = "__prFlowWhiteboard" as const;
type GlobalWithWhiteboard = typeof globalThis & { [globalKey]?: WhiteboardState };

function documentRecords(store: TLStore): TLRecord[] {
  return store.allRecords().filter((record) => isDocumentScopeRecord(store, record));
}

function seedRecords(): TLRecord[] {
  return [
    DocumentRecordType.create({ id: TLDOCUMENT_ID }),
    PageRecordType.create({
      id: PageRecordType.createId(),
      name: ptBR.whiteboard.defaultPageName,
      index: "a1" as never
    })
  ] as TLRecord[];
}

function loadState(): WhiteboardState {
  const store = createWhiteboardStore();
  const stored = loadStoredWhiteboard();
  let clock = stored.clock;

  if (stored.records.length === 0 || !stored.schema) {
    store.mergeRemoteChanges(() => store.put(seedRecords()));
    clock += 1;
    persistWhiteboardChange({
      put: documentRecords(store),
      remove: [],
      schema: store.schema.serialize(),
      clock,
      replaceAll: true
    });
  } else {
    const migrated = migrateRecords(store, stored.records, stored.schema);
    store.mergeRemoteChanges(() => store.put(migrated));
  }

  return { store, clock, subscribers: new Set() };
}

function getState(): WhiteboardState {
  const scope = globalThis as GlobalWithWhiteboard;
  scope[globalKey] ??= loadState();
  return scope[globalKey];
}

/** Drops the in-memory board so the next call reloads it from SQLite (tests, DB swaps). */
export function resetWhiteboardState(): void {
  delete (globalThis as GlobalWithWhiteboard)[globalKey];
}

function migrateRecords(store: TLStore, records: TLRecord[], schema: SerializedSchema): TLRecord[] {
  const result = store.schema.migrateStoreSnapshot({
    store: Object.fromEntries(records.map((record) => [record.id, record])) as Record<TLRecord["id"], TLRecord>,
    schema
  });
  if (result.type === "error") {
    throw new WhiteboardRecordError(ptBR.whiteboard.errors.invalidRecord("snapshot", String(result.reason)));
  }
  return Object.values(result.value) as TLRecord[];
}

export function getWhiteboardStore(): TLStore {
  return getState().store;
}

export function getWhiteboardDocument(): WhiteboardDocument {
  const { store, clock } = getState();
  return { clock, schema: store.schema.serialize(), records: documentRecords(store) };
}

/** Validates every record of a diff against the tldraw schema without applying it. */
function validateDiff(store: TLStore, diff: WhiteboardDiff): TLRecord[] {
  return diff.put.map((record) => {
    if (!isDocumentScopeRecord(store, record)) {
      throw new WhiteboardRecordError(ptBR.whiteboard.errors.notDocumentRecord(String(record.typeName)));
    }
    const before = (store.get(record.id) as TLRecord | undefined) ?? null;
    try {
      return store.schema.validateRecord(store, record, before ? "updateRecord" : "createRecord", before);
    } catch (error) {
      throw new WhiteboardRecordError(
        ptBR.whiteboard.errors.invalidRecord(String(record.id), error instanceof Error ? error.message : String(error))
      );
    }
  });
}

function commit(state: WhiteboardState, sourceClientId: string, diff: WhiteboardDiff, replaceAll = false): number {
  const put = validateDiff(state.store, diff);
  const remove = replaceAll
    ? documentRecords(state.store)
        .map((record) => record.id)
        .filter((id) => !put.some((record) => record.id === id))
    : diff.remove.filter((id) => state.store.has(id));
  const clock = state.clock + 1;

  persistWhiteboardChange({ put, remove, schema: state.store.schema.serialize(), clock, replaceAll });
  state.store.mergeRemoteChanges(() => {
    if (remove.length > 0) {
      state.store.remove(remove);
    }
    if (put.length > 0) {
      state.store.put(put);
    }
  });
  state.clock = clock;

  const event: WhiteboardChangeEvent = { clock, sourceClientId, put, remove };
  for (const subscriber of state.subscribers) {
    if (subscriber.clientId !== sourceClientId) {
      subscriber.listener(event);
    }
  }
  return clock;
}

/** Applies a tab's changes (last write wins per record). Throws WhiteboardRecordError on an invalid record. */
export function applyWhiteboardChanges(input: { clientId: string; put: TLRecord[]; remove: string[] }): number {
  return commit(getState(), input.clientId, { put: input.put, remove: input.remove as TLRecord["id"][] });
}

/** Runs a board operation against the current store and commits its diff as one change. */
export function runWhiteboardOp<T>(op: (store: TLStore) => OpResult<T>): T & { clock: number } {
  const state = getState();
  const { diff, result } = op(state.store);
  let clock = state.clock;
  if (diff.put.length > 0 || diff.remove.length > 0) {
    try {
      clock = commit(state, WHITEBOARD_MCP_CLIENT_ID, diff);
    } catch (error) {
      if (error instanceof WhiteboardRecordError) {
        throw new WhiteboardOpError(error.message);
      }
      throw error;
    }
  }
  return { ...result, clock };
}

/** Reads the board without changing it. */
export function readWhiteboard<T>(read: (store: TLStore) => T): T {
  return read(getState().store);
}

/** True when the board has one page and no shapes (what a fresh server board looks like). */
export function isWhiteboardEmpty(store: TLStore = getState().store): boolean {
  const records = documentRecords(store);
  return (
    records.filter((record) => record.typeName === "page").length <= 1 &&
    !records.some((record) => record.typeName === "shape")
  );
}

/** Replaces an empty board with a tldraw snapshot (the old IndexedDB board). */
export function importWhiteboardSnapshot(input: {
  clientId: string;
  schema: SerializedSchema;
  records: TLRecord[];
}): { clock: number; imported: number } {
  const state = getState();
  if (!isWhiteboardEmpty(state.store)) {
    throw new WhiteboardNotEmptyError();
  }
  const migrated = migrateRecords(state.store, input.records, input.schema).filter((record) =>
    isDocumentScopeRecord(state.store, record)
  );
  const hasDocument = migrated.some((record) => record.id === TLDOCUMENT_ID);
  const put = hasDocument ? migrated : [DocumentRecordType.create({ id: TLDOCUMENT_ID }) as TLRecord, ...migrated];
  const clock = commit(state, input.clientId, { put, remove: [] }, true);
  return { clock, imported: migrated.length };
}

/** Subscribes to board changes made by anyone but `clientId`. */
export function subscribeWhiteboard(
  clientId: string,
  listener: (event: WhiteboardChangeEvent) => void
): () => void {
  const subscriber: Subscriber = { clientId, listener };
  const { subscribers } = getState();
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}
