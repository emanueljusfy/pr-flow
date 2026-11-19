import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export async function withRoutinesTestDb<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.DATABASE_URL;
  const file = path.join(
    os.tmpdir(),
    `pr-flow-routines-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
  );
  process.env.DATABASE_URL = `file:${file}`;

  const { closeDb } = await import("@/modules/db/lib/db");
  closeDb();

  try {
    return await fn();
  } finally {
    closeDb();
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
