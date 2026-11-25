import { act, render } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";
import { ArtifactsPage } from "@/modules/artifacts/components/artifacts-page";

/**
 * Navigation state shared with the `next/navigation` mock of a page test. It lives on `globalThis`
 * because `vi.mock` factories run before this module has finished loading.
 */
type Nav = { url: string; go: (url: string) => void };
const scope = globalThis as typeof globalThis & { __artifactNav?: Nav };
scope.__artifactNav ??= { url: "/artifacts", go: () => {} };
export const nav: Nav = scope.__artifactNav;

export type FakeTab = { id: string; title: string; position: number; content: string; revision: number };
export type FakeVersion = {
  number: number;
  source: "agent" | "user" | "restore";
  restoredFrom: number | null;
  title: string;
  tabs: Array<Omit<FakeTab, "revision">>;
  createdAt: number;
  updatedAt: number;
};
export type FakeArtifact = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  tabs: FakeTab[];
  versions: FakeVersion[];
};
export type FakeCall = { method: string; path: string; search: string; body: Record<string, unknown> | null };

type Failure = { match: RegExp; method?: string; result: "network" | number; times: number };

const NOW = Date.UTC(2026, 0, 2, 12, 0, 0);

export function tab(id: string, title: string, content: string, position: number, revision = 1): FakeTab {
  return { id, title, position, content, revision };
}

export function artifact(id: string, title: string, tabs: FakeTab[], updatedAt = NOW): FakeArtifact {
  return { id, title, createdAt: updatedAt, updatedAt, tabs, versions: [] };
}

function plain(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** A small in-memory stand-in for `/api/artifacts*`, enough to drive the page. */
export class FakeServer {
  artifacts: FakeArtifact[] = [];
  calls: FakeCall[] = [];
  failures: Failure[] = [];
  private nextId = 1;

  fail(match: RegExp, result: "network" | number, options: { method?: string; times?: number } = {}) {
    this.failures.push({ match, result, method: options.method, times: options.times ?? 1 });
  }

  called(method: string, pattern: RegExp): FakeCall[] {
    return this.calls.filter((call) => call.method === method && pattern.test(call.path + call.search));
  }

  find(id: string): FakeArtifact {
    return this.artifacts.find((a) => a.id === id)!;
  }

  /** An edit made by someone else (an agent): bumps the revision like the real server. */
  agentWrites(artifactId: string, tabId: string, content: string) {
    const found = this.find(artifactId).tabs.find((t) => t.id === tabId)!;
    found.content = content;
    found.revision += 1;
    this.find(artifactId).updatedAt += 1000;
  }

  private json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }

  private error(status: number, error: string, extra: Record<string, unknown> = {}) {
    return this.json({ error, message: error, ...extra }, status);
  }

  readonly fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    this.calls.push({ method, path: url.pathname, search: url.search, body });

    const failure = this.failures.find(
      (f) => f.times > 0 && f.match.test(url.pathname) && (!f.method || f.method === method)
    );
    if (failure) {
      failure.times -= 1;
      if (failure.result === "network") {
        throw new TypeError("network down");
      }
      return this.error(failure.result, "server_error");
    }
    return this.route(url, method, body);
  };

  private route(url: URL, method: string, body: Record<string, unknown> | null): Response {
    const path = url.pathname;
    if (path === "/api/artifacts" && method === "GET") {
      const q = plain(url.searchParams.get("q") ?? "");
      const rows = [...this.artifacts]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .filter((a) => plain(a.title).includes(q))
        .map((a) => ({
          id: a.id,
          title: a.title,
          updatedAt: a.updatedAt,
          tabCount: a.tabs.length,
          versionCount: a.versions.length
        }));
      return this.json({ artifacts: rows });
    }
    if (path === "/api/artifacts" && method === "POST") {
      const id = `new-${this.nextId++}`;
      const created = artifact(id, String(body?.title), [tab(`${id}-t1`, "Aba 1", "", 0)], NOW + 5000);
      this.artifacts.push(created);
      return this.json({ artifact: this.detail(created) }, 201);
    }

    const match = path.match(
      /^\/api\/artifacts\/([^/]+)(?:\/(tabs|tab-order|versions)(?:\/([^/]+))?(?:\/(restore))?)?$/
    );
    if (!match) {
      return this.error(404, "not_found");
    }
    const [, id, section, sub, restore] = match;
    const found = this.artifacts.find((a) => a.id === id);
    if (!found) {
      return this.error(404, "not_found");
    }

    if (!section) {
      if (method === "GET") return this.json({ artifact: this.detail(found) });
      if (method === "PATCH") {
        found.title = String(body?.title);
        found.updatedAt = NOW + 9000;
        return this.json({ artifact: this.detail(found) });
      }
      if (method === "DELETE") {
        this.artifacts = this.artifacts.filter((a) => a.id !== id);
        return new Response(null, { status: 204 });
      }
    }
    if (section === "tabs" && !sub && method === "POST") {
      const created = tab(
        `${id}-n${this.nextId++}`,
        String(body?.title ?? `Aba ${found.tabs.length + 1}`),
        "",
        found.tabs.length
      );
      found.tabs.push(created);
      return this.json({ tab: created }, 201);
    }
    if (section === "tabs" && sub) {
      const target = found.tabs.find((t) => t.id === sub);
      if (!target) return this.error(404, "not_found");
      if (method === "PUT") {
        if (body?.baseRevision !== target.revision) {
          return this.error(409, "revision_conflict", { tab: target });
        }
        if (typeof body?.title === "string") target.title = body.title;
        if (typeof body?.content === "string") target.content = body.content;
        target.revision += 1;
        found.updatedAt = NOW + 9000;
        return this.json({ tab: target });
      }
      if (method === "DELETE") {
        found.tabs = found.tabs.filter((t) => t.id !== sub).map((t, position) => ({ ...t, position }));
        return new Response(null, { status: 204 });
      }
    }
    if (section === "tab-order" && method === "PUT") {
      const ids = body?.tabIds as string[];
      found.tabs = ids.map((tabId, position) => ({ ...found.tabs.find((t) => t.id === tabId)!, position }));
      return this.json({ artifact: this.detail(found) });
    }
    if (section === "versions" && !sub && method === "GET") {
      return this.json({
        versions: [...found.versions]
          .sort((a, b) => b.number - a.number)
          .map(({ tabs, ...rest }) => ({ ...rest, tabCount: tabs.length }))
      });
    }
    if (section === "versions" && sub && !restore && method === "GET") {
      const version = found.versions.find((v) => v.number === Number(sub));
      return version ? this.json({ version }) : this.error(404, "not_found");
    }
    if (section === "versions" && restore && method === "POST") {
      const version = found.versions.find((v) => v.number === Number(sub));
      if (!version) return this.error(404, "not_found");
      found.title = version.title;
      found.tabs = version.tabs.map((t) => ({
        ...t,
        revision: (found.tabs.find((x) => x.id === t.id)?.revision ?? 0) + 1
      }));
      return this.json({ artifact: this.detail(found) });
    }
    return this.error(404, "not_found");
  }

  private detail(a: FakeArtifact) {
    const { versions, ...rest } = a;
    void versions;
    return { ...rest, tabs: [...a.tabs].sort((x, y) => x.position - y.position) };
  }
}

export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  private listeners = new Map<string, Set<(event: { data: string }) => void>>();
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: { data: string }) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown = {}) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: JSON.stringify(data) });
    }
  }

  static get current(): FakeEventSource {
    return FakeEventSource.instances.filter((source) => !source.closed).at(-1)!;
  }
}

function publishNav(url: string, go: (url: string) => void) {
  nav.url = url;
  nav.go = go;
}

function Harness({ initialUrl }: { initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl);
  publishNav(url, setUrl);
  return <ArtifactsPage />;
}

export function renderArtifacts(initialUrl: string) {
  nav.url = initialUrl;
  return render(<Harness initialUrl={initialUrl} />);
}

/** Moves fake timers and lets the promises they start settle. */
export async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
