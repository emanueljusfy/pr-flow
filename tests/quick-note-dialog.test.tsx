import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickNoteDialog } from "@/components/quick-note/quick-note-dialog";

describe("QuickNoteDialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens on Ctrl+Space and submits with Ctrl+Enter", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        note: {
          id: "note-1",
          notebookDay: "2026-05-29",
          body: "### quick-note (29/05/2026, 14:30):\nIdeia",
          createdAt: "2026-05-29T12:00:00.000Z",
          updatedAt: "2026-05-29T14:30:00.000Z"
        }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QuickNoteDialog />);

    fireEvent.keyDown(window, { key: " ", code: "Space", ctrlKey: true });

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/texto da nota rápida/i), {
      target: { value: "Ideia" }
    });
    fireEvent.keyDown(screen.getByLabelText(/texto da nota rápida/i), {
      key: "Enter",
      ctrlKey: true
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/journal/quick-note",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "Ideia" })
      })
    );
  });
});
