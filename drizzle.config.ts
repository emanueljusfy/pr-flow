import { defineConfig } from "drizzle-kit";

function sqliteFile() {
  const url = process.env.DATABASE_URL ?? "file:./data/pr-flow.sqlite";
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    return "./data/pr-flow.sqlite";
  }
  return url.startsWith("file:") ? url.slice("file:".length) : url;
}

export default defineConfig({
  schema: [
    "./modules/journal/lib/schema.ts",
    "./modules/app/lib/schema.ts",
    "./modules/dashboard/lib/dashboard-briefing-schema.ts",
    "./modules/jira/lib/schema.ts",
    "./modules/prs/lib/schema.ts",
    "./modules/pr-ai-review/lib/schema.ts",
    "./modules/whiteboard/lib/schema.ts"
  ],
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: sqliteFile()
  }
});
