import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Runs `fn` against a fresh SQLite file and a fresh in-memory board. */
export async function withWhiteboardTestDb<T>(fn: () => Promise<T> | T): Promise<T> {
  const previous = process.env.DATABASE_URL;
  const file = path.join(
    os.tmpdir(),
    `pr-flow-whiteboard-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
  );
  process.env.DATABASE_URL = `file:${file}`;

  const { closeDb } = await import("@/modules/db/lib/db");
  const { resetWhiteboardState } = await import("@/modules/whiteboard/lib/whiteboard-document-service");
  await closeDb();
  resetWhiteboardState();

  try {
    return await fn();
  } finally {
    resetWhiteboardState();
    await closeDb();
    if (previous === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previous;
    }
    try {
      fs.unlinkSync(file);
    } catch {
      // ignore
    }
  }
}
