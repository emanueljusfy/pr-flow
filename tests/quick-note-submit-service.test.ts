import { beforeEach, describe, expect, it, vi } from "vitest";

const appendQuickNoteToToday = vi.fn();

vi.mock("@/modules/journal/lib/note-service", () => ({
  appendQuickNoteToToday: (...args: unknown[]) => appendQuickNoteToToday(...args)
}));

const note = {
  id: "note-1",
  notebookDay: "2026-05-29",
  body: "### quick-note:\ntexto",
  createdAt: "2026-05-29T12:00:00.000Z",
  updatedAt: "2026-05-29T12:00:00.000Z"
};

describe("submitQuickNote", () => {
  beforeEach(() => {
    appendQuickNoteToToday.mockReset();
    appendQuickNoteToToday.mockResolvedValue({ ok: true, note });
  });

  it("appends the text to today's note", async () => {
    const { submitQuickNote } = await import("@/modules/journal/lib/quick-note-submit-service");
    const result = await submitQuickNote({ text: "Ideia do standup" });

    expect(result).toEqual({ ok: true, note });
    expect(appendQuickNoteToToday).toHaveBeenCalledWith({ text: "Ideia do standup" }, expect.any(Date));
  });

  it("returns validation errors without touching the journal", async () => {
    const { submitQuickNote } = await import("@/modules/journal/lib/quick-note-submit-service");
    const result = await submitQuickNote({ text: "   " });

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(appendQuickNoteToToday).not.toHaveBeenCalled();
  });

  it("propagates journal failures", async () => {
    appendQuickNoteToToday.mockResolvedValue({ ok: false, status: 409 });

    const { submitQuickNote } = await import("@/modules/journal/lib/quick-note-submit-service");
    const result = await submitQuickNote({ text: "x" });

    expect(result).toEqual({ ok: false, status: 409 });
  });
});
