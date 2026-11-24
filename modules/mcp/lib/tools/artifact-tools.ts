import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  AGENT_ACTOR,
  ArtifactError,
  addTab,
  createArtifact,
  currentVersionNumber,
  deleteArtifact,
  deleteTab,
  editTab,
  getArtifact,
  getVersion,
  listArtifacts,
  listVersions,
  renameArtifact,
  reorderTabs,
  resolveTab,
  updateTab,
  type ArtifactTab
} from "@/modules/artifacts/lib/artifact-service";
import { ptBR } from "@/modules/messages/pt-BR";
import { errorToolResult, jsonToolResult } from "@/modules/mcp/lib/mcp-tool-result";
import { sanitizeErrorForLog } from "@/modules/observability/lib/log-sanitize";
import { writeSystemLogFireAndForget } from "@/modules/observability/lib/system-logger";

const MCP_ARTIFACTS_LOG_SOURCE = "mcp:artifacts";

// Limits (title length, content size, tab count) are enforced by the service so that a
// violation comes back as a Portuguese tool error instead of a protocol-level schema error.
const idSchema = z.string().describe("Artifact id from list_artifacts or create_artifact.");
const tabIdSchema = z.string().describe("Tab id from get_artifact.");
const optionalTabIdSchema = tabIdSchema
  .optional()
  .describe("Tab id. May be omitted only when the artifact has exactly one tab.");
const titleSchema = z.string().describe("1-200 characters.");
const contentSchema = z
  .string()
  .describe("Markdown (GFM): headings, lists, `- [ ]` checklists, tables, code, quotes, links.");

export function artifactUrl(id: string, tabId?: string): string {
  return tabId ? `/artifacts/${id}?tab=${tabId}` : `/artifacts/${id}`;
}

function failure(tool: string, error: unknown): CallToolResult {
  if (error instanceof ArtifactError) {
    return errorToolResult(error.message);
  }
  writeSystemLogFireAndForget({
    level: "error",
    source: MCP_ARTIFACTS_LOG_SOURCE,
    message: `${tool} failed`,
    details: { error: sanitizeErrorForLog(error) }
  });
  return errorToolResult(error instanceof Error ? error.message : String(error));
}

function run(tool: string, fn: () => unknown): CallToolResult {
  try {
    return jsonToolResult(fn());
  } catch (error) {
    return failure(tool, error);
  }
}

function tabResult(artifactId: string, tab: ArtifactTab) {
  return {
    id: artifactId,
    url: artifactUrl(artifactId, tab.id),
    version: currentVersionNumber(artifactId),
    tab: { id: tab.id, title: tab.title, position: tab.position, revision: tab.revision }
  };
}

const readAnnotations = { readOnlyHint: true, openWorldHint: false } as const;
const writeAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const destructiveAnnotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

export function registerArtifactTools(server: McpServer): void {
  server.registerTool(
    "list_artifacts",
    {
      title: "List artifacts",
      description:
        "Lists the user's artifacts (documents with tabs, PR Flow /artifacts), most recently changed first. `query` filters by title, ignoring case and accents.",
      inputSchema: { query: z.string().optional() },
      annotations: readAnnotations
    },
    async ({ query }) => run("list_artifacts", () => ({ artifacts: listArtifacts(query) }))
  );

  server.registerTool(
    "get_artifact",
    {
      title: "Get artifact",
      description:
        "Returns an artifact with every tab (Markdown content and revision) in order. With `tabId` only that tab; with `version` the snapshot of that version of the whole document.",
      inputSchema: {
        id: idSchema,
        tabId: tabIdSchema.optional(),
        version: z.number().int().optional().describe("Version number from list_artifact_versions.")
      },
      annotations: readAnnotations
    },
    async ({ id, tabId, version }) =>
      run("get_artifact", () => {
        if (version !== undefined) {
          const snapshot = getVersion(id, version);
          const tabs = tabId === undefined ? snapshot.tabs : snapshot.tabs.filter((tab) => tab.id === tabId);
          if (tabId !== undefined && tabs.length === 0) {
            throw new ArtifactError("not_found", ptBR.artifacts.errors.tabNotFound(tabId));
          }
          return { id, title: snapshot.title, url: artifactUrl(id, tabs[0]?.id), version: snapshot.number, tabs };
        }
        const artifact = getArtifact(id);
        const tabs = tabId === undefined ? artifact.tabs : [resolveTab(id, tabId)];
        return {
          id,
          title: artifact.title,
          url: artifactUrl(id, tabs[0]?.id),
          version: currentVersionNumber(id),
          tabs
        };
      })
  );

  server.registerTool(
    "create_artifact",
    {
      title: "Create artifact",
      description:
        "Creates an artifact. Give `tabs` for several pages, or `content` for a single page; with neither it has one empty tab 'Aba 1'. Returns the id and a url path to open it.",
      inputSchema: {
        title: titleSchema,
        tabs: z
          .array(z.object({ title: titleSchema, content: contentSchema.optional() }))
          .optional()
          .describe("Tabs in order, at most 50."),
        content: contentSchema.optional().describe("Content of the single tab when `tabs` is not given.")
      },
      annotations: writeAnnotations
    },
    async ({ title, tabs, content }) =>
      run("create_artifact", () => {
        const artifact = createArtifact(AGENT_ACTOR, {
          title,
          tabs: tabs ?? (content === undefined ? undefined : [{ content }])
        });
        return {
          id: artifact.id,
          url: artifactUrl(artifact.id, artifact.tabs[0]?.id),
          version: 1,
          tabs: artifact.tabs.map(({ id, title: tabTitle }) => ({ id, title: tabTitle }))
        };
      })
  );

  server.registerTool(
    "rename_artifact",
    {
      title: "Rename artifact",
      description: "Changes the artifact title.",
      inputSchema: { id: idSchema, title: titleSchema },
      annotations: writeAnnotations
    },
    async ({ id, title }) =>
      run("rename_artifact", () => {
        const artifact = renameArtifact(AGENT_ACTOR, id, title);
        return { id, title: artifact.title, version: currentVersionNumber(id) };
      })
  );

  server.registerTool(
    "update_artifact",
    {
      title: "Update artifact tab",
      description: "Replaces the whole Markdown content of one tab. To change a passage, prefer edit_artifact.",
      inputSchema: { id: idSchema, tabId: optionalTabIdSchema, content: contentSchema },
      annotations: writeAnnotations
    },
    async ({ id, tabId, content }) =>
      run("update_artifact", () => {
        const tab = resolveTab(id, tabId);
        return tabResult(id, updateTab(AGENT_ACTOR, id, tab.id, { content }));
      })
  );

  server.registerTool(
    "edit_artifact",
    {
      title: "Edit artifact tab",
      description:
        "Replaces one exact passage of a tab's Markdown. `old_str` must occur exactly once (include surrounding text to make it unique); otherwise nothing changes. Read the tab with get_artifact first.",
      inputSchema: {
        id: idSchema,
        tabId: optionalTabIdSchema,
        old_str: z.string().describe("Exact text to replace, copied from get_artifact. Not empty."),
        new_str: z.string().describe("Replacement text; may be empty to delete the passage.")
      },
      annotations: writeAnnotations
    },
    async ({ id, tabId, old_str, new_str }) =>
      run("edit_artifact", () => {
        const tab = resolveTab(id, tabId);
        return tabResult(id, editTab(AGENT_ACTOR, id, tab.id, old_str, new_str));
      })
  );

  server.registerTool(
    "add_artifact_tab",
    {
      title: "Add artifact tab",
      description:
        "Adds a tab. `position` is 0-based; later tabs shift right; default and anything past the end is last.",
      inputSchema: {
        id: idSchema,
        title: titleSchema,
        content: contentSchema.optional(),
        position: z.number().int().optional()
      },
      annotations: writeAnnotations
    },
    async ({ id, title, content, position }) =>
      run("add_artifact_tab", () => tabResult(id, addTab(AGENT_ACTOR, id, { title, content, position })))
  );

  server.registerTool(
    "rename_artifact_tab",
    {
      title: "Rename artifact tab",
      description: "Changes a tab's title.",
      inputSchema: { id: idSchema, tabId: tabIdSchema, title: titleSchema },
      annotations: writeAnnotations
    },
    async ({ id, tabId, title }) =>
      run("rename_artifact_tab", () => tabResult(id, updateTab(AGENT_ACTOR, id, tabId, { title })))
  );

  server.registerTool(
    "delete_artifact_tab",
    {
      title: "Delete artifact tab",
      description:
        "Deletes a tab. The only tab cannot be deleted. The tab comes back by restoring an earlier version in the UI.",
      inputSchema: { id: idSchema, tabId: tabIdSchema },
      annotations: destructiveAnnotations
    },
    async ({ id, tabId }) =>
      run("delete_artifact_tab", () => {
        deleteTab(AGENT_ACTOR, id, tabId);
        return { id, deletedTabId: tabId, version: currentVersionNumber(id) };
      })
  );

  server.registerTool(
    "reorder_artifact_tabs",
    {
      title: "Reorder artifact tabs",
      description: "Sets the tab order. `tabIds` must list every tab of the artifact exactly once.",
      inputSchema: { id: idSchema, tabIds: z.array(tabIdSchema) },
      annotations: writeAnnotations
    },
    async ({ id, tabIds }) =>
      run("reorder_artifact_tabs", () => {
        const artifact = reorderTabs(AGENT_ACTOR, id, tabIds);
        return {
          id,
          tabs: artifact.tabs.map(({ id: tabId, title }) => ({ id: tabId, title })),
          version: currentVersionNumber(id)
        };
      })
  );

  server.registerTool(
    "list_artifact_versions",
    {
      title: "List artifact versions",
      description:
        "Lists the versions of an artifact, newest first. Each is a snapshot of the whole document; read one with get_artifact { version }.",
      inputSchema: { id: idSchema },
      annotations: readAnnotations
    },
    async ({ id }) => run("list_artifact_versions", () => ({ versions: listVersions(id) }))
  );

  server.registerTool(
    "delete_artifact",
    {
      title: "Delete artifact",
      description: "Deletes an artifact with all its tabs and versions. Confirm with the user first.",
      inputSchema: { id: idSchema },
      annotations: destructiveAnnotations
    },
    async ({ id }) =>
      run("delete_artifact", () => {
        deleteArtifact(AGENT_ACTOR, id);
        return { id, deleted: true };
      })
  );
}
