import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FakeEventSource,
  FakeServer,
  advance,
  artifact,
  nav,
  renderArtifacts,
  tab,
  type FakeArtifact
} from "./artifacts-page-harness";

vi.mock("next/navigation", () => {
  const scope = globalThis as unknown as { __artifactNav: { url: string; go: (url: string) => void } };
  const router = {
    push: (url: string) => scope.__artifactNav.go(url),
    replace: (url: string) => scope.__artifactNav.go(url)
  };
  return {
    useRouter: () => router,
    useSearchParams: () => new URLSearchParams(scope.__artifactNav.url.split("?")[1] ?? "")
  };
});

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

/** BlockNote needs a real browser; the page logic is proven against a textarea with the same contract. */
vi.mock("@/modules/artifacts/components/artifact-editor-loader", () => ({
  ArtifactEditorLoader: function StubEditor(props: {
    markdown: string;
    loadKey: string;
    ariaLabel: string;
    onMarkdownChange: (markdown: string) => void;
  }) {
    const [value, setValue] = useState(props.markdown);
    const [key, setKey] = useState(props.loadKey);
    if (key !== props.loadKey) {
      setKey(props.loadKey);
      setValue(props.markdown);
    }
    return (
      <textarea
        aria-label={props.ariaLabel}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          props.onMarkdownChange(event.target.value);
        }}
      />
    );
  }
}));

let server: FakeServer;
const writeText = vi.fn().mockResolvedValue(undefined);

function threeTabs(): FakeArtifact {
  return artifact("a1", "Plano", [
    tab("t1", "Resumo", "# Resumo", 0),
    tab("t2", "Riscos", "# Riscos", 1),
    tab("t3", "Anexos", "# Anexos", 2)
  ]);
}

const editor = (name: string | RegExp) => screen.getByRole("textbox", { name });
const tabList = () => screen.getByRole("list", { name: "Abas do artefato" });
const tabNames = () =>
  within(tabList())
    .getAllByRole("listitem")
    .map((li) => li.getAttribute("data-tab-id"));
const tabButton = (name: string) => within(tabList()).getByRole("button", { name });
const putCalls = () => server.calls.filter((call) => call.method === "PUT");
const writes = () => server.calls.filter((call) => ["PUT", "PATCH", "POST", "DELETE"].includes(call.method));

async function openArtifact(url = "/artifacts/a1?tab=t1") {
  renderArtifacts(url);
  await screen.findByRole("textbox", { name: /^Conteúdo da aba/ });
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  server = new FakeServer();
  server.artifacts = [threeTabs()];
  nav.url = "/artifacts";
  vi.stubGlobal("fetch", vi.fn(server.fetch));
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("artifacts page: list", () => {
  it("lists artifacts newest first and filters by title", async () => {
    server.artifacts = [
      artifact("old", "Relatório de PRs", [tab("o1", "Aba 1", "", 0)], Date.UTC(2026, 0, 1)),
      artifact("new", "Plano de rollout", [tab("n1", "Aba 1", "", 0)], Date.UTC(2026, 0, 2)),
      artifact("mid", "Notas", [tab("m1", "Aba 1", "", 0)], Date.UTC(2026, 0, 1, 12))
    ];
    renderArtifacts("/artifacts");

    const list = await screen.findByRole("navigation", { name: "Lista de artefatos" });
    await waitFor(() => expect(within(list).getAllByRole("button")).toHaveLength(3));
    expect(
      within(list)
        .getAllByRole("button")
        .map((b) => b.querySelector("span")?.textContent)
    ).toEqual(["Plano de rollout", "Notas", "Relatório de PRs"]);
    expect(within(list).getAllByRole("button")[0]!.querySelector("time")?.textContent).toMatch(/^há /);
    expect(screen.getByRole("button", { name: "Novo artefato" })).toBeEnabled();

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar artefatos" }), { target: { value: "RELATORIO" } });
    await waitFor(() => expect(within(list).getAllByRole("button")).toHaveLength(1));
    expect(within(list).getByText("Relatório de PRs")).toBeInTheDocument();
    expect(server.called("GET", /\?q=RELATORIO/)).toHaveLength(1);
  });

  it("empty main area invites to create", async () => {
    renderArtifacts("/artifacts");

    expect(await screen.findByText("Nenhum artefato aberto")).toBeInTheDocument();
    expect(screen.getByText(/Crie um artefato ou peça a um agente/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /^Conteúdo da aba/ })).not.toBeInTheDocument();
  });

  it("list empty states", async () => {
    server.artifacts = [];
    renderArtifacts("/artifacts");
    expect(await screen.findByText("Nenhum artefato ainda")).toBeInTheDocument();
    cleanup();

    server.artifacts = [threeTabs()];
    renderArtifacts("/artifacts");
    await screen.findByText("Plano");
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar artefatos" }), { target: { value: "xyz" } });
    expect(await screen.findByText("Nenhum artefato encontrado")).toBeInTheDocument();
    expect(screen.queryByText("Nenhum artefato ainda")).not.toBeInTheDocument();
  });

  it("Novo artefato creates and opens an untitled artifact", async () => {
    renderArtifacts("/artifacts");
    await screen.findByText("Plano");

    fireEvent.click(screen.getByRole("button", { name: "Novo artefato" }));

    const title = await screen.findByRole("textbox", { name: "Título do artefato" });
    await waitFor(() => expect(title).toHaveFocus());
    expect(title).toHaveValue("Sem título");
    const post = server.called("POST", /^\/api\/artifacts$/);
    expect(post).toHaveLength(1);
    expect(post[0]!.body).toMatchObject({ title: "Sem título" });
    expect(nav.url).toBe("/artifacts/new-1?tab=new-1-t1");
    const list = screen.getByRole("navigation", { name: "Lista de artefatos" });
    await waitFor(() => expect(within(list).getAllByRole("button")[0]).toHaveTextContent("Sem título"));
  });
});

describe("artifacts page: document", () => {
  it("opens the tab from the query", async () => {
    await openArtifact("/artifacts/a1?tab=t2");

    expect(screen.getByRole("textbox", { name: "Título do artefato" })).toHaveValue("Plano");
    expect(tabNames()).toEqual(["t1", "t2", "t3"]);
    expect(editor(/Riscos/)).toHaveValue("# Riscos");
    expect(tabButton("Riscos")).toHaveAttribute("aria-current", "page");
    expect(tabList().compareDocumentPosition(editor(/Riscos/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();

    await openArtifact("/artifacts/a1");
    expect(editor(/Resumo/)).toHaveValue("# Resumo");
    cleanup();

    await openArtifact("/artifacts/a1?tab=nope");
    expect(editor(/Resumo/)).toHaveValue("# Resumo");
  });

  it("switching tabs flushes the pending save", async () => {
    await openArtifact();
    fireEvent.change(editor(/Resumo/), { target: { value: "# Resumo editado" } });
    expect(putCalls()).toHaveLength(0);

    fireEvent.click(tabButton("Riscos"));

    await waitFor(() => expect(editor(/Riscos/)).toHaveValue("# Riscos"));
    const puts = putCalls();
    expect(puts).toHaveLength(1);
    expect(puts[0]!.path).toBe("/api/artifacts/a1/tabs/t1");
    expect(puts[0]!.body).toMatchObject({ baseRevision: 1, content: "# Resumo editado" });
    expect(server.find("a1").tabs[0]!.content).toBe("# Resumo editado");
    expect(nav.url).toBe("/artifacts/a1?tab=t2");
    expect(tabButton("Riscos")).toHaveAttribute("aria-current", "page");
  });

  it("Aba adds a numbered tab and focuses its name", async () => {
    await openArtifact();

    fireEvent.click(screen.getByRole("button", { name: "+ Aba" }));

    const name = await screen.findByRole("textbox", { name: "Nome da aba" });
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveValue("Aba 4");
    expect(server.called("POST", /\/tabs$/)).toHaveLength(1);
    expect(tabNames().at(-1)).toMatch(/^a1-n/);
    expect(nav.url).toMatch(/^\/artifacts\/a1\?tab=a1-n/);
    expect(editor(/Aba 4/)).toHaveValue("");
  });

  it("tab rename by double click and by menu", async () => {
    await openArtifact();

    // double click, Enter saves
    fireEvent.doubleClick(tabButton("Riscos"));
    let input = screen.getByRole("textbox", { name: "Nome da aba" });
    fireEvent.change(input, { target: { value: "Perigos" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(server.find("a1").tabs[1]!.title).toBe("Perigos"));
    expect(tabButton("Perigos")).toBeInTheDocument();
    expect(putCalls().at(-1)!.body).toMatchObject({ title: "Perigos", baseRevision: 1 });

    // menu Renomear, blur saves
    fireEvent.click(screen.getByRole("button", { name: "Opções da aba Anexos" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Renomear" }));
    input = screen.getByRole("textbox", { name: "Nome da aba" });
    fireEvent.change(input, { target: { value: "Apêndices" } });
    fireEvent.blur(input);
    await waitFor(() => expect(server.find("a1").tabs[2]!.title).toBe("Apêndices"));
    expect(tabButton("Apêndices")).toBeInTheDocument();

    // Escape cancels
    const before = putCalls().length;
    fireEvent.doubleClick(tabButton("Resumo"));
    input = screen.getByRole("textbox", { name: "Nome da aba" });
    fireEvent.change(input, { target: { value: "Outro nome" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);
    await settle();
    expect(tabButton("Resumo")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Nome da aba" })).not.toBeInTheDocument();
    expect(putCalls()).toHaveLength(before);
    expect(server.find("a1").tabs[0]!.title).toBe("Resumo");
  });

  it("dragging a tab reorders and saves", async () => {
    await openArtifact();
    const items = within(tabList()).getAllByRole("listitem");

    fireEvent.dragStart(items[2]!);
    fireEvent.dragOver(items[0]!);
    fireEvent.drop(items[0]!);

    await waitFor(() => expect(tabNames()).toEqual(["t3", "t1", "t2"]));
    const orders = server.called("PUT", /tab-order$/);
    expect(orders).toHaveLength(1);
    expect(orders[0]!.body).toMatchObject({ tabIds: ["t3", "t1", "t2"] });
    expect(server.find("a1").tabs.map((t) => t.id)).toEqual(["t3", "t1", "t2"]);
  });

  it("Excluir aba confirms and selects a neighbour", async () => {
    await openArtifact("/artifacts/a1?tab=t2");

    fireEvent.click(screen.getByRole("button", { name: "Opções da aba Riscos" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Excluir aba" }));
    expect(await screen.findByText("Excluir aba?")).toBeInTheDocument();
    expect(server.called("DELETE", /tabs/)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(tabNames()).toEqual(["t1", "t3"]));
    expect(server.called("DELETE", /tabs\/t2/)).toHaveLength(1);
    expect(tabButton("Resumo")).toHaveAttribute("aria-current", "page");
    expect(nav.url).toBe("/artifacts/a1?tab=t1");

    // deleting the first tab selects the next one
    fireEvent.click(screen.getByRole("button", { name: "Opções da aba Resumo" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Excluir aba" }));
    fireEvent.click(await screen.findByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(tabNames()).toEqual(["t3"]));
    expect(tabButton("Anexos")).toHaveAttribute("aria-current", "page");

    // one tab left: the item is disabled
    fireEvent.click(screen.getByRole("button", { name: "Opções da aba Anexos" }));
    expect(await screen.findByRole("menuitem", { name: "Excluir aba" })).toHaveAttribute("aria-disabled", "true");
  });

  it("autosaves one second after typing stops", async () => {
    await openArtifact();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    // editor
    fireEvent.change(editor(/Resumo/), { target: { value: "# Novo" } });
    await advance(999);
    expect(writes()).toHaveLength(0);
    await advance(1);
    expect(putCalls()).toHaveLength(1);
    expect(putCalls()[0]!.body).toMatchObject({ baseRevision: 1, content: "# Novo" });
    expect(screen.getByText("Salvo")).toBeInTheDocument();

    // artifact title
    fireEvent.change(screen.getByRole("textbox", { name: "Título do artefato" }), { target: { value: "Plano 2" } });
    await advance(999);
    expect(server.called("PATCH", /a1$/)).toHaveLength(0);
    await advance(1);
    expect(server.called("PATCH", /a1$/)).toHaveLength(1);
    expect(server.find("a1").title).toBe("Plano 2");

    // tab name
    fireEvent.doubleClick(tabButton("Riscos"));
    fireEvent.change(screen.getByRole("textbox", { name: "Nome da aba" }), { target: { value: "Perigos" } });
    const before = putCalls().length;
    await advance(999);
    expect(putCalls()).toHaveLength(before);
    await advance(1);
    expect(putCalls()).toHaveLength(before + 1);
    expect(putCalls().at(-1)!.body).toMatchObject({ title: "Perigos" });
  });

  it("shows Salvando while a save is in flight", async () => {
    await openArtifact();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inner = server.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "PUT") {
          await gate;
        }
        return inner(input, init);
      })
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    fireEvent.change(editor(/Resumo/), { target: { value: "# Novo" } });
    await advance(1000);
    expect(screen.getByText("Salvando…")).toBeInTheDocument();
    release();
    await advance(0);
    expect(screen.getByText("Salvo")).toBeInTheDocument();
    expect(screen.queryByText("Salvando…")).not.toBeInTheDocument();
  });

  it("viewing sends no write", async () => {
    await openArtifact();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await advance(5000);
    vi.useRealTimers();

    fireEvent.click(tabButton("Riscos"));
    await waitFor(() => expect(editor(/Riscos/)).toBeInTheDocument());
    fireEvent.click(tabButton("Anexos"));
    await waitFor(() => expect(editor(/Anexos/)).toBeInTheDocument());

    expect(writes()).toHaveLength(0);
  });

  it("failed save keeps content and retries", async () => {
    await openArtifact();
    server.fail(/tabs\/t1$/, "network", { method: "PUT" });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    fireEvent.change(editor(/Resumo/), { target: { value: "# Offline" } });
    await advance(1000);

    expect(screen.getByText("Não salvo")).toBeInTheDocument();
    expect(editor(/Resumo/)).toHaveValue("# Offline");
    expect(putCalls()).toHaveLength(1);

    // the next edit sends a new PUT
    fireEvent.change(editor(/Resumo/), { target: { value: "# Offline 2" } });
    await advance(1000);
    expect(putCalls()).toHaveLength(2);
    expect(putCalls()[1]!.body).toMatchObject({ content: "# Offline 2", baseRevision: 1 });
    expect(screen.getByText("Salvo")).toBeInTheDocument();
    expect(screen.queryByText("Não salvo")).not.toBeInTheDocument();

    // a 500 and the retry button
    server.fail(/tabs\/t1$/, 500, { method: "PUT" });
    fireEvent.change(editor(/Resumo/), { target: { value: "# Erro 500" } });
    await advance(1000);
    expect(screen.getByText("Não salvo")).toBeInTheDocument();
    expect(editor(/Resumo/)).toHaveValue("# Erro 500");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await advance(0);
    expect(server.find("a1").tabs[0]!.content).toBe("# Erro 500");
    expect(screen.getByText("Salvo")).toBeInTheDocument();
  });

  it("load failures", async () => {
    renderArtifacts("/artifacts/missing");
    expect(await screen.findByText("Artefato não encontrado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar para Artefatos" })).toHaveAttribute("href", "/artifacts");
    cleanup();

    server.fail(/^\/api\/artifacts\/a1$/, 500);
    renderArtifacts("/artifacts/a1");
    expect(await screen.findByText("Não foi possível carregar o artefato.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("textbox", { name: /^Conteúdo da aba/ })).toBeInTheDocument();
  });

  it("copies the open tab Markdown", async () => {
    await openArtifact();
    fireEvent.change(editor(/Resumo/), { target: { value: "# Ainda não salvo" } });

    fireEvent.click(screen.getByRole("button", { name: "Copiar Markdown" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("# Ainda não salvo"));
    expect(toast.success).toHaveBeenCalledWith("Markdown copiado");
  });

  it("deleting an artifact confirms and returns to the list", async () => {
    await openArtifact();

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    expect(await screen.findByText("Excluir artefato?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await settle();
    expect(server.called("DELETE", /a1$/)).toHaveLength(0);
    expect(server.artifacts).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(nav.url).toBe("/artifacts"));
    expect(server.called("DELETE", /a1\?clientId=/)).toHaveLength(1);
    await screen.findByText("Nenhum artefato ainda");
    expect(screen.queryByRole("textbox", { name: "Título do artefato" })).not.toBeInTheDocument();
  });

  it("versions list, preview and restore", async () => {
    const doc = server.find("a1");
    doc.versions = [
      {
        number: 1,
        source: "user",
        restoredFrom: null,
        title: "Plano antigo",
        tabs: [
          { id: "t1", title: "Resumo", position: 0, content: "# Resumo v1" },
          { id: "t9", title: "Só na v1", position: 1, content: "texto da v1" }
        ],
        createdAt: Date.UTC(2026, 0, 1),
        updatedAt: Date.UTC(2026, 0, 1)
      },
      {
        number: 2,
        source: "agent",
        restoredFrom: null,
        title: "Plano",
        tabs: doc.tabs.map(({ revision, ...rest }) => (void revision, rest)),
        createdAt: Date.UTC(2026, 0, 2),
        updatedAt: Date.UTC(2026, 0, 2)
      },
      {
        number: 3,
        source: "restore",
        restoredFrom: 1,
        title: "Plano antigo",
        tabs: [{ id: "t1", title: "Resumo", position: 0, content: "# Resumo v1" }],
        createdAt: Date.UTC(2026, 0, 3),
        updatedAt: Date.UTC(2026, 0, 3)
      }
    ];
    await openArtifact();

    fireEvent.click(screen.getByRole("button", { name: "Versões" }));
    const dialog = await screen.findByRole("dialog");
    const entries = await within(dialog).findAllByRole("button", { name: /^v\d/ });
    expect(entries.map((entry) => entry.textContent)).toEqual([
      expect.stringMatching(/^v3 · Restaurada da v1.*1 aba$/),
      expect.stringMatching(/^v2 · Agente.*3 abas$/),
      expect.stringMatching(/^v1 · Você.*2 abas$/)
    ]);

    fireEvent.click(entries[2]!);
    expect(await within(dialog).findByText("Somente leitura")).toBeInTheDocument();
    expect(within(dialog).getByText("# Resumo v1".replace("# ", ""), { selector: "h1" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Só na v1" }));
    expect(within(dialog).getByTestId("version-preview")).toHaveTextContent("texto da v1");

    fireEvent.click(within(dialog).getByRole("button", { name: "Restaurar esta versão" }));

    await waitFor(() => expect(server.called("POST", /versions\/1\/restore$/)).toHaveLength(1));
    await waitFor(() => expect(tabNames()).toEqual(["t1", "t9"]));
    expect(screen.getByRole("textbox", { name: "Título do artefato" })).toHaveValue("Plano antigo");
    await waitFor(() => expect(editor(/Resumo/)).toHaveValue("# Resumo v1"));
  });

  it("long tab names are truncated with the full name on hover", async () => {
    const long = "Uma aba com um nome realmente muito comprido que não cabe na coluna lateral";
    server.find("a1").tabs[1]!.title = long;
    await openArtifact();

    const button = tabButton(long);
    expect(button).toHaveAttribute("title", long);
    expect(button.className).toContain("truncate");
    expect(button.className).toContain("min-w-0");
  });
});

describe("artifacts page: following the agent", () => {
  async function openWithEvents(url = "/artifacts/a1?tab=t1") {
    await openArtifact(url);
    return FakeEventSource.current;
  }

  it("events refresh the list and the tab list", async () => {
    const source = await openWithEvents();
    await screen.findByRole("navigation", { name: "Lista de artefatos" });

    // an agent adds a tab, renames the artifact and creates another one
    const doc = server.find("a1");
    doc.tabs.push(tab("t4", "Decisões", "# D", 3));
    doc.title = "Plano revisado";
    doc.updatedAt += 5000;
    server.artifacts.push(artifact("a2", "Criado pelo agente", [tab("b1", "Aba 1", "", 0)], doc.updatedAt + 1000));
    await act(async () => {
      source.emit("artifact", { type: "upsert", id: "a1", tabIds: ["t4"], source: "agent" });
      source.emit("artifact", { type: "upsert", id: "a2", tabIds: ["b1"], source: "agent" });
    });

    await waitFor(() => expect(tabNames()).toEqual(["t1", "t2", "t3", "t4"]));
    expect(screen.getByRole("textbox", { name: "Título do artefato" })).toHaveValue("Plano revisado");
    const list = screen.getByRole("navigation", { name: "Lista de artefatos" });
    await waitFor(() => expect(within(list).getByText("Criado pelo agente")).toBeInTheDocument());
    expect(within(list).getByText("Plano revisado")).toBeInTheDocument();

    // and deletes the other one
    server.artifacts = server.artifacts.filter((a) => a.id !== "a2");
    await act(async () => {
      source.emit("artifact", { type: "delete", id: "a2", tabIds: [], source: "agent" });
    });
    await waitFor(() => expect(within(list).queryByText("Criado pelo agente")).not.toBeInTheDocument());
    expect(editor(/Resumo/)).toHaveValue("# Resumo");
  });

  it("a clean tab reloads on an event", async () => {
    const source = await openWithEvents();

    server.agentWrites("a1", "t1", "# Escrito pelo agente");
    await act(async () => {
      source.emit("artifact", { type: "upsert", id: "a1", tabIds: ["t1"], source: "agent" });
    });

    await waitFor(() => expect(editor(/Resumo/)).toHaveValue("# Escrito pelo agente"));
    expect(screen.queryByText("O agente atualizou esta aba.")).not.toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it("a dirty tab shows the banner", async () => {
    const source = await openWithEvents();
    fireEvent.change(editor(/Resumo/), { target: { value: "# Meu texto" } });

    server.agentWrites("a1", "t1", "# Do agente");
    await act(async () => {
      source.emit("artifact", { type: "upsert", id: "a1", tabIds: ["t1"], source: "agent" });
    });

    expect(await screen.findByText("O agente atualizou esta aba.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recarregar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manter o meu" })).toBeInTheDocument();
    expect(editor(/Resumo/)).toHaveValue("# Meu texto");
    expect(putCalls()).toHaveLength(0);
  });

  it("a stale save shows the banner", async () => {
    await openWithEvents();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.change(editor(/Resumo/), { target: { value: "# Meu texto" } });
    // the agent wrote and the event has not arrived yet: the PUT meets the conflict
    server.agentWrites("a1", "t1", "# Do agente");

    await advance(1000);

    expect(putCalls()).toHaveLength(1);
    expect(screen.getByText("O agente atualizou esta aba.")).toBeInTheDocument();
    expect(editor(/Resumo/)).toHaveValue("# Meu texto");
    expect(server.find("a1").tabs[0]!.content).toBe("# Do agente");
    expect(screen.queryByText("Salvo")).not.toBeInTheDocument();
  });

  it("events on other tabs leave the open tab alone", async () => {
    const source = await openWithEvents();
    fireEvent.change(editor(/Resumo/), { target: { value: "# Rascunho" } });
    const gets = () => server.called("GET", /tabs\/t1/);

    server.agentWrites("a1", "t2", "# Riscos revisados");
    server.find("a1").tabs[1]!.title = "Riscos (rev)";
    await act(async () => {
      source.emit("artifact", { type: "upsert", id: "a1", tabIds: ["t2"], source: "agent" });
    });

    await waitFor(() => expect(tabButton("Riscos (rev)")).toBeInTheDocument());
    expect(screen.queryByText("O agente atualizou esta aba.")).not.toBeInTheDocument();
    expect(editor(/Resumo/)).toHaveValue("# Rascunho");
    expect(gets()).toHaveLength(0);
    expect(tabButton("Resumo")).toHaveAttribute("aria-current", "page");
  });

  it("banner actions", async () => {
    const source = await openWithEvents();

    // Recarregar discards the edit
    fireEvent.change(editor(/Resumo/), { target: { value: "# Meu texto" } });
    server.agentWrites("a1", "t1", "# Do agente");
    await act(async () => {
      source.emit("artifact", { type: "upsert", id: "a1", tabIds: ["t1"], source: "agent" });
    });
    fireEvent.click(await screen.findByRole("button", { name: "Recarregar" }));
    await waitFor(() => expect(editor(/Resumo/)).toHaveValue("# Do agente"));
    expect(screen.queryByText("O agente atualizou esta aba.")).not.toBeInTheDocument();
    expect(putCalls()).toHaveLength(0);

    // Manter o meu writes on top, with the server revision
    fireEvent.change(editor(/Resumo/), { target: { value: "# Meu segundo texto" } });
    server.agentWrites("a1", "t1", "# Do agente de novo");
    await act(async () => {
      source.emit("artifact", { type: "upsert", id: "a1", tabIds: ["t1"], source: "agent" });
    });
    fireEvent.click(await screen.findByRole("button", { name: "Manter o meu" }));

    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(putCalls()[0]!.body).toMatchObject({ baseRevision: 3, content: "# Meu segundo texto" });
    expect(server.find("a1").tabs[0]!.content).toBe("# Meu segundo texto");
    await waitFor(() => expect(screen.queryByText("O agente atualizou esta aba.")).not.toBeInTheDocument());
    expect(editor(/Resumo/)).toHaveValue("# Meu segundo texto");
  });

  it("deleted elsewhere", async () => {
    const source = await openWithEvents("/artifacts/a1?tab=t2");

    const doc = server.find("a1");
    doc.tabs = doc.tabs.filter((t) => t.id !== "t2").map((t, position) => ({ ...t, position }));
    await act(async () => {
      source.emit("artifact", { type: "upsert", id: "a1", tabIds: ["t2"], source: "agent" });
    });

    await waitFor(() => expect(toast).toHaveBeenCalledWith("Esta aba foi excluída"));
    await waitFor(() => expect(editor(/Resumo/)).toHaveValue("# Resumo"));
    expect(nav.url).toBe("/artifacts/a1?tab=t1");
    expect(tabNames()).toEqual(["t1", "t3"]);

    server.artifacts = [];
    await act(async () => {
      source.emit("artifact", { type: "delete", id: "a1", tabIds: [], source: "agent" });
    });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Este artefato foi excluído"));
    expect(nav.url).toBe("/artifacts");
    expect(await screen.findByText("Nenhum artefato ainda")).toBeInTheDocument();
  });

  it("reconnect refetches", async () => {
    const source = await openWithEvents();
    // the first `ready` is the initial connection
    await act(async () => {
      source.emit("ready");
    });
    const listGets = () => server.called("GET", /^\/api\/artifacts$/).length;
    const docGets = () => server.called("GET", /^\/api\/artifacts\/a1$/).length;
    const [listBefore, docBefore] = [listGets(), docGets()];

    // clean tab: the server content is shown after the stream comes back
    server.agentWrites("a1", "t1", "# Enquanto offline");
    await act(async () => {
      source.emit("ready");
    });
    await waitFor(() => expect(editor(/Resumo/)).toHaveValue("# Enquanto offline"));
    expect(listGets()).toBeGreaterThan(listBefore);
    expect(docGets()).toBeGreaterThan(docBefore);

    // dirty tab: banner instead of a reload
    fireEvent.change(editor(/Resumo/), { target: { value: "# Meu texto" } });
    server.agentWrites("a1", "t1", "# Outra vez offline");
    await act(async () => {
      source.emit("ready");
    });
    expect(await screen.findByText("O agente atualizou esta aba.")).toBeInTheDocument();
    expect(editor(/Resumo/)).toHaveValue("# Meu texto");
  });
});
