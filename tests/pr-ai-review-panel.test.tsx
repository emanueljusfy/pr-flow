import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { AiReviewPanel } from "@/modules/pr-ai-review/components/ai-review-panel";
import { aiConfig, aiRun, stubFetch } from "./pr-ai-review-fixtures";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
}));

const AGENTS = [
  { id: "claude", label: "Claude Code", binary: "claude", installed: true },
  { id: "cursor-agent", label: "Cursor Agent", binary: "agent", installed: false }
];

function setup(routes: Parameters<typeof stubFetch>[0] = {}) {
  const stub = stubFetch({
    "GET /api/prs/ai-review/config": { body: aiConfig() },
    "GET /api/prs/ai-review/agents": { body: AGENTS },
    ...routes
  });
  vi.stubGlobal("fetch", vi.fn(stub.fetchMock));
  return stub;
}

beforeEach(() => {
  vi.mocked(toast).mockClear();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AiReviewPanel", () => {
  it("renders panel controls and last run", async () => {
    setup();
    const runs = [
      aiRun({ id: "a", cycleId: "c2", startedAt: "2026-11-23T11:00:00.000Z" }),
      aiRun({ id: "b", cycleId: "c2", startedAt: "2026-11-23T11:06:00.000Z", prNumber: 700 }),
      aiRun({ id: "c", cycleId: "c1", startedAt: "2026-11-23T09:00:00.000Z" }),
      aiRun({ id: "d", cycleId: null, startedAt: "2026-11-23T12:00:00.000Z" })
    ];
    render(<AiReviewPanel runs={runs} onRunStarted={vi.fn()} />);

    expect(screen.getByRole("region", { name: "Revisor IA" })).toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: "Ligado" })).toBeInTheDocument();
    expect(screen.getByLabelText("A cada")).toHaveTextContent("15 min");
    expect(screen.getByLabelText("Agente")).toHaveTextContent("Claude Code");
    expect(screen.getByLabelText("Autores")).toHaveValue("cavanus");
    expect(screen.getByLabelText("Repositórios")).toHaveValue("justracker-*");
    expect(screen.getByRole("button", { name: /Editar prompt/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Rodar agora/ })).toBeEnabled();
    // Latest cycle c2: started at its first run, 2 PRs; single-PR runs do not count as a cycle.
    expect(screen.getByTestId("ai-review-last-run")).toHaveTextContent(/Última execução: 23 nov, \d{2}:00 · 2 PRs revisadas/);
  });

  it("shows env defaults as placeholders when fields were not edited", async () => {
    setup({
      "GET /api/prs/ai-review/config": {
        body: aiConfig({
          authorLogins: [],
          repoPattern: "",
          cwd: null,
          defaults: { authorLogins: ["cavanus", "felipegmotta"], repoPattern: "justracker-*", cwd: "/home/me/jusfy" }
        })
      }
    });
    render(<AiReviewPanel runs={[]} onRunStarted={vi.fn()} />);
    const authors = await screen.findByLabelText("Autores");
    expect(authors).toHaveValue("");
    expect(authors).toHaveAttribute("placeholder", "cavanus, felipegmotta");
    expect(screen.getByLabelText("Repositórios")).toHaveAttribute("placeholder", "justracker-*");
    expect(screen.getByLabelText("Diretório de trabalho")).toHaveAttribute("placeholder", "/home/me/jusfy");
  });

  it("shows no runs yet", async () => {
    setup();
    render(<AiReviewPanel runs={[]} onRunStarted={vi.fn()} />);
    expect(await screen.findByText("Nenhuma execução ainda")).toBeInTheDocument();
  });

  it("saves config and toasts", async () => {
    const stub = setup({
      "PUT /api/prs/ai-review/config": (init) => ({
        body: aiConfig({ ...(JSON.parse(String(init?.body)) as object) })
      })
    });
    render(<AiReviewPanel runs={[]} onRunStarted={vi.fn()} />);
    const toggle = await screen.findByRole("checkbox", { name: "Ligado" });
    fireEvent.click(toggle);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Revisor IA atualizado"));
    expect(stub.calls.find((call) => call.method === "PUT")?.body).toEqual({ enabled: true });

    const authors = screen.getByLabelText("Autores");
    fireEvent.change(authors, { target: { value: "cavanus, @felipegmotta" } });
    fireEvent.blur(authors);
    await waitFor(() =>
      expect(stub.calls.filter((call) => call.method === "PUT").at(-1)?.body).toEqual({
        authorLogins: ["cavanus", "@felipegmotta"]
      })
    );
  });

  it("shows template error", async () => {
    setup({
      "PUT /api/prs/ai-review/config": { status: 400, body: { error: "O prompt precisa conter {{pr_url}}." } }
    });
    render(<AiReviewPanel runs={[]} onRunStarted={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Editar prompt/ }));
    const textarea = await screen.findByRole("textbox", { name: "Prompt do Revisor IA" });
    expect(textarea).toHaveValue("revise {{pr_url}}");
    fireEvent.change(textarea, { target: { value: "sem placeholder" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("O prompt precisa conter {{pr_url}}.");
    expect(screen.getByRole("textbox", { name: "Prompt do Revisor IA" })).toBeInTheDocument();
  });

  it("run now starts cycle and disables while running", async () => {
    const stub = setup({
      "POST /api/prs/ai-review/run": { status: 202, body: { prUrls: ["a", "b"] } }
    });
    const onRunStarted = vi.fn();
    const { rerender } = render(<AiReviewPanel runs={[]} onRunStarted={onRunStarted} />);
    await screen.findByRole("checkbox", { name: "Ligado" });
    fireEvent.click(screen.getByRole("button", { name: /Rodar agora/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("IA revisando 2 PRs"));
    expect(onRunStarted).toHaveBeenCalledTimes(1);
    const post = stub.calls.find((call) => call.method === "POST");
    expect(post?.url).toBe("/api/prs/ai-review/run");
    expect(post?.body).toBeUndefined();

    await act(async () => {
      rerender(<AiReviewPanel runs={[aiRun({ status: "running", verdict: null })]} onRunStarted={onRunStarted} />);
    });
    expect(screen.getByRole("button", { name: /Rodar agora/ })).toBeDisabled();
  });

  it("toasts when nothing to review", async () => {
    setup({ "POST /api/prs/ai-review/run": { status: 200, body: { prUrls: [] } } });
    const onRunStarted = vi.fn();
    render(<AiReviewPanel runs={[]} onRunStarted={onRunStarted} />);
    await screen.findByRole("checkbox", { name: "Ligado" });
    fireEvent.click(screen.getByRole("button", { name: /Rodar agora/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Nenhuma PR para a IA revisar agora."));
    expect(onRunStarted).not.toHaveBeenCalled();
  });

  it("shows queue error from run now", async () => {
    setup({ "POST /api/prs/ai-review/run": { status: 502, body: { error: "GraphQL caiu" } } });
    render(<AiReviewPanel runs={[]} onRunStarted={vi.fn()} />);
    await screen.findByRole("checkbox", { name: "Ligado" });
    fireEvent.click(screen.getByRole("button", { name: /Rodar agora/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("GraphQL caiu"));
  });
});
