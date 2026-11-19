import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPrTools } from "@/modules/mcp/lib/tools/pr-tools";

export const PR_FLOW_MCP_SERVER_NAME = "pr-flow";

const PR_FLOW_MCP_INSTRUCTIONS = [
  "PR Flow is the user's local work hub. Tools read from its local cache (GitHub PRs synced every 10 min) and act on Slack through the app's own bot.",
  "Prefer list_my_prs / list_review_queue / get_pr for questions about the user's pull requests; call sync_prs only when the data looks outdated.",
  "share_pr_to_slack, send_pr_review_reminder and send_review_reminder_digest post messages the whole team sees: confirm with the user before calling them.",
  "To remind reviewers of several PRs, prefer one send_review_reminder_digest over many send_pr_review_reminder calls.",
  "reviewers.dismissed lists people whose approval was dismissed (e.g. by a new push); they are also in reviewers.pending.",
  "To check whether a PR was already posted in the Slack channel (even by hand), use find_pr_in_slack.",
  "Messages and errors returned by the tools are in Brazilian Portuguese; answer the user in the language they use."
].join("\n");

/** Builds a fresh server per request (stateless Streamable HTTP). New tool groups register here. */
export function createPrFlowMcpServer(): McpServer {
  const server = new McpServer(
    { name: PR_FLOW_MCP_SERVER_NAME, version: "1.0.0" },
    { instructions: PR_FLOW_MCP_INSTRUCTIONS }
  );

  registerPrTools(server);

  return server;
}
