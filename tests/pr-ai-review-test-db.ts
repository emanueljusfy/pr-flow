import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export async function withAiReviewTestDb<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.DATABASE_URL;
  const file = path.join(
    os.tmpdir(),
    `pr-flow-ai-review-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
  );
  process.env.DATABASE_URL = `file:${file}`;

  const { closeDb } = await import("@/modules/db/lib/db");
  await closeDb();

  try {
    return await fn();
  } finally {
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
