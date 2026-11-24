import {
  TLINSTANCE_ID,
  sortByIndex,
  type SerializedSchema,
  type TLInstance,
  type TLPage,
  type TLRecord,
  type TLStore
} from "tldraw";
import {
  legacyWhiteboardHasShapes,
  readLegacyWhiteboard,
  type LegacyWhiteboard
} from "@/modules/whiteboard/lib/whiteboard-legacy-board";
import { isDocumentScopeRecord } from "@/modules/whiteboard/lib/whiteboard-tldraw";
import {
  whiteboardChangeEventSchema,
  whiteboardDocumentResponseSchema,
  whiteboardReadyEventSchema
} from "@/modules/whiteboard/lib/whiteboard-validation";

export type WhiteboardLoadStatus = "loading" | "ready" | "error";
export type WhiteboardSaveStatus = "saved" | "saving" | "error";

export type EventSourceLike = {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  close(): void;
};

export type WhiteboardSyncOptions = {
  store: TLStore;
  clientId: string;
  fetch?: typeof fetch;
  createEventSource?: (url: string) => EventSourceLike;
  readLegacyBoard?: () => Promise<LegacyWhiteboard | null>;
  /** Delay before sending a batch of user edits. */
  debounceMs?: number;
  onLoadStatus?: (status: WhiteboardLoadStatus) => void;
  onSaveStatus?: (status: WhiteboardSaveStatus) => void;
};

type ServerDocument = { clock: number; schema: SerializedSchema; records: TLRecord[] };

/**
 * Keeps a browser tldraw store in sync with the server board:
 * loads it, sends the user's document edits, applies server events outside the undo stack.
 */
export class WhiteboardSyncClient {
  private readonly store: TLStore;
  private readonly clientId: string;
  private readonly fetchFn: typeof fetch;
  private readonly createEventSource: (url: string) => EventSourceLike;
  private readonly readLegacyBoard: () => Promise<LegacyWhiteboard | null>;
  private readonly debounceMs: number;
  private readonly onLoadStatus: (status: WhiteboardLoadStatus) => void;
  private readonly onSaveStatus: (status: WhiteboardSaveStatus) => void;

  private clock = -1;
  private pending = new Map<string, TLRecord | null>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private stopListening: (() => void) | null = null;
  private events: EventSourceLike | null = null;
  private stopped = false;

  constructor(options: WhiteboardSyncOptions) {
    this.store = options.store;
    this.clientId = options.clientId;
    this.fetchFn = options.fetch ?? ((...args) => fetch(...args));
    this.createEventSource = options.createEventSource ?? ((url) => new EventSource(url));
    this.readLegacyBoard = options.readLegacyBoard ?? (() => readLegacyWhiteboard());
    this.debounceMs = options.debounceMs ?? 150;
    this.onLoadStatus = options.onLoadStatus ?? (() => {});
    this.onSaveStatus = options.onSaveStatus ?? (() => {});
  }

  /** Loads the board (importing the old local one when the server board is empty), then follows changes. */
  async start(): Promise<void> {
    this.stopped = false;
    this.onLoadStatus("loading");
    try {
      let document = await this.fetchDocument();
      if (isEmptyBoard(document.records)) {
        const legacy = await this.readLegacyBoard().catch(() => null);
        if (legacyWhiteboardHasShapes(legacy) && (await this.importLegacy(legacy))) {
          document = await this.fetchDocument();
        }
      }
      if (this.stopped) {
        return;
      }
      this.replaceDocument(document);
    } catch {
      if (!this.stopped) {
        this.onLoadStatus("error");
      }
      return;
    }
    if (this.stopped) {
      return;
    }

    this.stopListening?.();
    this.stopListening = this.store.listen(({ changes }) => this.queue(changes), {
      source: "user",
      scope: "document"
    });
    this.openEvents();
    this.onLoadStatus("ready");
  }

  stop(): void {
    this.stopped = true;
    this.stopListening?.();
    this.stopListening = null;
    this.events?.close();
    this.events = null;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** Sends what is queued now (tests and page hide). */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.inFlight;
    if (this.pending.size === 0) {
      return;
    }
    const batch = this.pending;
    this.pending = new Map();
    const put = [...batch.values()].filter((record): record is TLRecord => record !== null);
    const remove = [...batch.entries()].filter(([, record]) => record === null).map(([id]) => id);

    this.onSaveStatus("saving");
    this.inFlight = (async () => {
      try {
        const response = await this.fetchFn("/api/whiteboard/changes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: this.clientId, put, remove })
        });
        if (!response.ok) {
          throw new Error(`status ${response.status}`);
        }
        const { clock } = (await response.json()) as { clock?: number };
        if (typeof clock === "number") {
          this.clock = Math.max(this.clock, clock);
        }
        this.onSaveStatus(this.pending.size > 0 ? "saving" : "saved");
      } catch {
        // Keep the batch; newer edits to the same record win.
        for (const [id, record] of batch) {
          if (!this.pending.has(id)) {
            this.pending.set(id, record);
          }
        }
        this.onSaveStatus("error");
      }
    })();
    await this.inFlight;
    this.inFlight = null;
  }

  private queue(changes: { added: Record<string, TLRecord>; updated: Record<string, [TLRecord, TLRecord]>; removed: Record<string, TLRecord> }) {
    const shared = (record: TLRecord) => isDocumentScopeRecord(this.store, record);
    for (const record of Object.values(changes.added).filter(shared)) {
      this.pending.set(record.id, record);
    }
    for (const [, to] of Object.values(changes.updated)) {
      if (shared(to)) {
        this.pending.set(to.id, to);
      }
    }
    for (const record of Object.values(changes.removed).filter(shared)) {
      this.pending.set(record.id, null);
    }
    if (this.pending.size === 0) {
      return;
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.debounceMs);
  }

  private async fetchDocument(): Promise<ServerDocument> {
    const response = await this.fetchFn("/api/whiteboard", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    const parsed = whiteboardDocumentResponseSchema.parse(await response.json());
    return parsed as unknown as ServerDocument;
  }

  private async importLegacy(legacy: LegacyWhiteboard): Promise<boolean> {
    const response = await this.fetchFn("/api/whiteboard/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: this.clientId, schema: legacy.schema, records: legacy.records })
    });
    return response.ok;
  }

  private openEvents() {
    this.events?.close();
    const events = this.createEventSource(`/api/whiteboard/events?clientId=${encodeURIComponent(this.clientId)}`);
    this.events = events;
    events.addEventListener("ready", (event) => {
      const parsed = whiteboardReadyEventSchema.safeParse(safeJson(event.data));
      if (!parsed.success || parsed.data.clock === this.clock) {
        return;
      }
      // Reconnected after missing changes: send what we have, then take the server board.
      void this.resync();
    });
    events.addEventListener("changes", (event) => {
      const parsed = whiteboardChangeEventSchema.safeParse(safeJson(event.data));
      if (!parsed.success || parsed.data.sourceClientId === this.clientId) {
        return;
      }
      this.applyRemote(parsed.data.put as unknown as TLRecord[], parsed.data.remove);
      this.clock = Math.max(this.clock, parsed.data.clock);
    });
  }

  private async resync() {
    await this.flush();
    try {
      const document = await this.fetchDocument();
      if (!this.stopped) {
        this.replaceDocument(document);
      }
    } catch {
      // The next ready event retries.
    }
  }

  private replaceDocument(document: ServerDocument) {
    const migrated = this.store.schema.migrateStoreSnapshot({
      store: Object.fromEntries(document.records.map((record) => [record.id, record])) as Record<TLRecord["id"], TLRecord>,
      schema: document.schema
    });
    if (migrated.type === "error") {
      throw new Error(String(migrated.reason));
    }
    const incoming = Object.values(migrated.value) as TLRecord[];
    const keep = new Set<string>(incoming.map((record) => record.id));
    const stale = this.store
      .allRecords()
      .filter((record) => isDocumentScopeRecord(this.store, record) && !keep.has(record.id))
      .map((record) => record.id);
    this.applyRemote(incoming, stale);
    this.clock = document.clock;
  }

  private applyRemote(put: TLRecord[], remove: string[]) {
    this.store.mergeRemoteChanges(() => {
      const existing = remove.filter((id) => this.store.has(id as TLRecord["id"])) as TLRecord["id"][];
      if (existing.length > 0) {
        this.store.remove(existing);
      }
      if (put.length > 0) {
        this.store.put(put);
      }
      this.keepCurrentPageValid();
    });
  }

  /** When the open page was deleted elsewhere, move to the first remaining page. */
  private keepCurrentPageValid() {
    const instance = this.store.get(TLINSTANCE_ID) as TLInstance | undefined;
    if (!instance || this.store.has(instance.currentPageId)) {
      return;
    }
    const pages = (this.store.allRecords().filter((record) => record.typeName === "page") as TLPage[]).sort(sortByIndex);
    if (pages[0]) {
      this.store.put([{ ...instance, currentPageId: pages[0].id }]);
    }
  }
}

function safeJson(data: unknown): unknown {
  try {
    return typeof data === "string" ? JSON.parse(data) : data;
  } catch {
    return undefined;
  }
}

function isEmptyBoard(records: TLRecord[]): boolean {
  return records.filter((record) => record.typeName === "page").length <= 1 && !records.some((record) => record.typeName === "shape");
}
