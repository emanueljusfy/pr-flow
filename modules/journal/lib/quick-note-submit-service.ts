import type { NoteDto } from "@/modules/journal/lib/domain";
import { appendQuickNoteToToday } from "@/modules/journal/lib/note-service";
import { validateQuickNoteInput, type QuickNoteInput } from "@/modules/journal/lib/note-validation";

export type SubmitQuickNoteResult =
  | { ok: true; note: NoteDto }
  | { ok: false; status: 400; errors: Record<string, string> }
  | { ok: false; status: 404 }
  | { ok: false; status: 409 };

export async function submitQuickNote(
  input: QuickNoteInput,
  now: Date = new Date()
): Promise<SubmitQuickNoteResult> {
  const validation = validateQuickNoteInput(input);
  if (!validation.ok) {
    return { ok: false, status: 400, errors: validation.errors };
  }

  const journalResult = await appendQuickNoteToToday({ text: validation.value.text }, now);
  if (!journalResult.ok) {
    return journalResult;
  }

  return { ok: true, note: journalResult.note };
}
