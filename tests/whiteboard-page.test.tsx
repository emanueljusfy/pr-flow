import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TLRecord, TLStore } from "tldraw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ptBR } from "@/modules/messages/pt-BR";
import WhiteboardCanvas from "@/modules/whiteboard/components/whiteboard-canvas";
import { createWhiteboardStore, getDefaultShapeProps } from "@/modules/whiteboard/lib/whiteboard-tldraw";

const mounted: { store: TLStore | null } = { store: null };

vi.mock("tldraw", async (importOriginal) => {
  const actual = await importOriginal<typeof import("tldraw")>();
  return {
    ...actual,
    Tldraw: ({ store }: { store: TLStore }) => {
      mounted.store = store;
      return <div data-testid="tldraw-canvas" />;
    }
  };
});

class SilentEventSource {
  addEventListener() {}
  close() {}
}

function serverDocument() {
  const store = createWhiteboardStore();
  return {
    clock: 1,
    schema: store.schema.serialize(),
    records: [
      { id: "document:document", typeName: "document", gridSize: 10, name: "", meta: {} },
      { id: "page:one", typeName: "page", name: "Página 1", index: "a1", meta: {} }
    ]
  };
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("whiteboard canvas states", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mounted.store = null;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", SilentEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows loading while the board loads", async () => {
    let resolve: (response: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise<Response>((r) => (resolve = r)));
    render(<WhiteboardCanvas />);
    expect(screen.getByText(ptBR.whiteboard.loading)).toBeInTheDocument();
    expect(screen.queryByTestId("tldraw-canvas")).not.toBeInTheDocument();
    await act(async () => resolve(jsonResponse(serverDocument())));
    await waitFor(() => expect(screen.getByTestId("tldraw-canvas")).toBeInTheDocument());
  });

  it("load error shows retry", async () => {
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 }));
    render(<WhiteboardCanvas />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ptBR.whiteboard.loadError);
    expect(screen.queryByTestId("tldraw-canvas")).not.toBeInTheDocument();

    fetchMock.mockImplementation(async () => jsonResponse(serverDocument()));
    fireEvent.click(screen.getByRole("button", { name: ptBR.whiteboard.retry }));
    await waitFor(() => expect(screen.getByTestId("tldraw-canvas")).toBeInTheDocument());
    expect(mounted.store?.get("page:one" as never)).toMatchObject({ name: "Página 1" });
  });

  it("shows not saved state", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/whiteboard" ? jsonResponse(serverDocument()) : new Response("down", { status: 503 })
    );
    render(<WhiteboardCanvas />);
    await screen.findByTestId("tldraw-canvas");
    expect(screen.queryByText(ptBR.whiteboard.notSaved)).not.toBeInTheDocument();

    const shape = {
      id: "shape:x",
      typeName: "shape",
      type: "geo",
      parentId: "page:one",
      index: "a1",
      x: 0,
      y: 0,
      rotation: 0,
      isLocked: false,
      opacity: 1,
      meta: {},
      props: getDefaultShapeProps("geo")
    } as unknown as TLRecord;
    act(() => mounted.store!.put([shape]));

    expect(await screen.findByRole("status")).toHaveTextContent(ptBR.whiteboard.notSaved);
    expect(fetchMock).toHaveBeenCalledWith("/api/whiteboard/changes", expect.objectContaining({ method: "POST" }));
  });
});
