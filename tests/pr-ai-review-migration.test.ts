import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AI_REVIEW_PROMPT_TEMPLATE } from "@/modules/pr-ai-review/lib/prompt-template";
import { openNodeSqlite } from "@/modules/db/lib/node-sqlite";
import { getAiReviewConfig } from "@/modules/pr-ai-review/lib/repository";
import { withAiReviewTestDb } from "./pr-ai-review-test-db";

const DRIZZLE_DIR = path.join(process.cwd(), "drizzle");
const tempDirs: string[] = [];

/** Migrations folder holding only 0000..0006, i.e. the schema before the AI reviewer. */
function migrationsBefore0007(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pr-flow-mig-"));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, "meta"));
  const journal = JSON.parse(fs.readFileSync(path.join(DRIZZLE_DIR, "meta", "_journal.json"), "utf8")) as {
    entries: Array<{ tag: string }>;
  };
  journal.entries = journal.entries.filter((entry) => entry.tag < "0007");
  fs.writeFileSync(path.join(dir, "meta", "_journal.json"), JSON.stringify(journal));
  for (const entry of journal.entries) {
    fs.copyFileSync(path.join(DRIZZLE_DIR, `${entry.tag}.sql`), path.join(dir, `${entry.tag}.sql`));
  }
  return dir;
}

async function migrateTo0006(): Promise<string> {
  const { closeDb, getDb } = await import("@/modules/db/lib/db");
  process.env.PR_FLOW_MIGRATIONS_DIR = migrationsBefore0007();
  getDb();
  await closeDb();
  delete process.env.PR_FLOW_MIGRATIONS_DIR;
  return process.env.DATABASE_URL!.slice("file:".length);
}

function tableNames(file: string): string[] {
  const db = openNodeSqlite(file);
  try {
    return (db.prepare("select name from sqlite_master where type = 'table'").all() as Array<{ name: string }>).map(
      (row) => row.name
    );
  } finally {
    db.close();
  }
}

afterEach(() => {
  delete process.env.PR_FLOW_MIGRATIONS_DIR;
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("migration 0007", () => {
  it("migrates pr review routine", async () => {
    await withAiReviewTestDb(async () => {
      const file = await migrateTo0006();
      const raw = openNodeSqlite(file);
      raw
        .prepare(
          "insert into routines (id, name, prompt, agent_id, schedule_kind, interval_minutes, cwd, notify_slack, enabled, next_run_at, created_at, updated_at) values (?, ?, ?, ?, 'preset', ?, ?, 0, ?, ?, ?, ?)"
        )
        .run("r1", "PR Review", "old multi-PR prompt", "cursor-agent", 30, "/home/rigon/jusfy", 1, 1, 1, 1);
      raw.prepare("insert into routine_runs (id, routine_id, status, started_at, created_at) values ('x', 'r1', 'succeeded', 1, 1)").run();
      raw.close();

      const config = await getAiReviewConfig();
      expect(config).toMatchObject({
        enabled: true,
        intervalMinutes: 30,
        agentId: "cursor-agent",
        cwd: "/home/rigon/jusfy",
        authorLogins: ["leocaldeirajusfy", "felipegmotta", "cavanus", "davi-graciano-costa"],
        repoPattern: "justracker-*",
        promptTemplate: DEFAULT_AI_REVIEW_PROMPT_TEMPLATE,
        promptIsDefault: true
      });
      const { closeDb } = await import("@/modules/db/lib/db");
      await closeDb();
      const tables = tableNames(file);
      expect(tables).not.toContain("routines");
      expect(tables).not.toContain("routine_runs");
      expect(tables).toEqual(expect.arrayContaining(["pr_ai_review_config", "pr_ai_review_runs"]));
    });
  });

  it("default config without routine", async () => {
    await withAiReviewTestDb(async () => {
      await migrateTo0006();
      const config = await getAiReviewConfig();
      expect(config).toMatchObject({
        enabled: false,
        intervalMinutes: 15,
        agentId: "claude",
        cwd: null,
        authorLogins: [],
        repoPattern: "",
        promptIsDefault: true
      });
    });
  });
});
