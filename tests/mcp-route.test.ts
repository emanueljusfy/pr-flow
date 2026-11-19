import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "@/app/api/mcp/route";
import type { MonitoredPr } from "@/modules/prs/lib/domain";

const getMonitorFromCache = vi.fn();
const getReviewerQueueFromCache = vi.fn();
const sharePrToSlackChannel = vi.fn();
const recordPrSlackShare = vi.fn();
const postPrReviewReminder = vi.fn();
const schedulePrReviewReminderAfterSend = vi.fn();
const renderPrReviewReminderDigest = vi.fn();
const postPrReviewReminderDigest = vi.fn();
const findPrMentionsInSlackChannel = vi.fn();
const getPrSlackShareThreadByUrl = vi.fn();

vi.mock("@/modules/prs/lib/pr-read-service", () => ({
  getMonitorFromCache: () => getMonitorFromCache(),
  getReviewerQueueFromCache: () => getReviewerQueueFromCache()
}));
vi.mock("@/modules/slack/lib/slack-pr-share-service", () => ({
  SlackPrShareError: class SlackPrShareError extends Error {},
  sharePrToSlackChannel: (...args: unknown[]) => sharePrToSlackChannel(...args)
}));
vi.mock("@/modules/prs/lib/pr-slack-share-repository", () => ({
  recordPrSlackShare: (...args: unknown[]) => recordPrSlackShare(...args),
  getPrSlackShareThreadByUrl: (...args: unknown[]) => getPrSlackShareThreadByUrl(...args)
}));
vi.mock("@/modules/prs/lib/pr-review-reminder-digest-service", () => ({
  renderPrReviewReminderDigest: (...args: unknown[]) => renderPrReviewReminderDigest(...args),
  postPrReviewReminderDigest: (...args: unknown[]) => postPrReviewReminderDigest(...args)
}));
vi.mock("@/modules/slack/lib/slack-channel-history", () => ({
  findPrMentionsInSlackChannel: (...args: unknown[]) => findPrMentionsInSlackChannel(...args)
}));
vi.mock("@/modules/prs/lib/pr-review-reminder-service", () => ({
  postPrReviewReminder: (...args: unknown[]) => postPrReviewReminder(...args)
}));
vi.mock("@/modules/prs/lib/pr-review-reminder-schedule-service", () => ({
  schedulePrReviewReminderAfterSend: (...args: unknown[]) => schedulePrReviewReminderAfterSend(...args),
  cancelPrReviewReminderSchedule: vi.fn().mockResolvedValue(true)
}));
vi.mock("@/modules/prs/lib/pr-sync-service", () => ({ syncPrCache: vi.fn() }));
vi.mock("@/modules/observability/lib/system-logger", () => ({ writeSystemLogFireAndForget: vi.fn() }));

const PR_URL = "https://github.com/acme/api/pull/7";

const pr: MonitoredPr = {
  id: "PR_7",
  number: 7,
  title: "FT-123 add endpoint",
  url: PR_URL,
  repository: "acme/api",
  createdAt: "2026-11-10T12:00:00.000Z",
  avaliou: ["ana"],
  naoAvaliou: ["bruno"],
  semReviewersSolicitados: false,
  aprovou: ["ana"],
  solicitouAlteracoes: [],
  pendente: ["bruno"],
  requestedReviewersCount: 2,
  statusGeral: "pending_review"
};

const routeFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  const handler = { POST, GET, DELETE }[request.method as "POST" | "GET" | "DELETE"];
  return handler(request);
};

async function connectClient(headers?: Record<string, string>) {
  const client = new Client({ name: "test", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), {
    fetch: routeFetch,
    requestInit: headers ? { headers } : undefined
  });
  await client.connect(transport);
  return client;
}

function parseText(result: Awaited<ReturnType<Client["callTool"]>>) {
  const [first] = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(first!.text);
}

describe("/api/mcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMonitorFromCache.mockResolvedValue({
      status: "ok",
      data: [pr],
      fetchedAt: "2026-11-18T10:00:00.000Z",
      githubLogin: "me"
    });
  });

  afterEach(() => {
    delete process.env.PR_FLOW_MCP_TOKEN;
  });

  it("lists PR and Slack tools", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "list_my_prs",
        "get_pr",
        "list_review_queue",
        "sync_prs",
        "share_pr_to_slack",
        "send_pr_review_reminder",
        "cancel_pr_review_reminder",
        "send_review_reminder_digest",
        "find_pr_in_slack"
      ])
    );
    expect(tools.map((tool) => tool.name)).not.toContain("start_local_review");
  });

  it("list_my_prs filters by pending reviewers", async () => {
    const client = await connectClient();
    const result = await client.callTool({ name: "list_my_prs", arguments: { onlyWithPendingReviewers: true } });
    const body = parseText(result);
    expect(body.count).toBe(1);
    expect(body.prs[0]).toMatchObject({ url: PR_URL, status: "pending_review", reviewers: { pending: ["bruno"] } });
  });

  it("share_pr_to_slack uses the cached title and records the share", async () => {
    sharePrToSlackChannel.mockResolvedValue({ channel: "C1", threadTs: "123.4" });
    recordPrSlackShare.mockResolvedValue({ sharedAt: "2026-11-18T10:00:00.000Z", channel: "C1" });

    const client = await connectClient();
    const result = await client.callTool({ name: "share_pr_to_slack", arguments: { urls: [PR_URL] } });

    expect(result.isError).toBeFalsy();
    expect(sharePrToSlackChannel).toHaveBeenCalledWith({ title: pr.title, selectedPrUrls: [PR_URL] });
    expect(recordPrSlackShare).toHaveBeenCalledWith({ prUrl: PR_URL, prId: "PR_7", channel: "C1", threadTs: "123.4" });
  });

  it("send_pr_review_reminder renders {reviewers} and schedules", async () => {
    postPrReviewReminder.mockResolvedValue({ status: "ok", body: "Oi <@U1>", channel: "C1" });
    schedulePrReviewReminderAfterSend.mockResolvedValue({ intervalMinutes: 60, nextRunAt: "x" });

    const client = await connectClient();
    const result = await client.callTool({
      name: "send_pr_review_reminder",
      arguments: { url: PR_URL, message: "Oi {reviewers}", scheduleIntervalMinutes: 60 }
    });

    expect(result.isError).toBeFalsy();
    expect(postPrReviewReminder).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Oi @bruno", pendingReviewers: ["bruno"] })
    );
    expect(schedulePrReviewReminderAfterSend).toHaveBeenCalledWith(
      expect.objectContaining({ intervalMinutes: 60, message: "Oi @bruno" })
    );
  });

  it("returns a tool error when the PR was not shared yet", async () => {
    postPrReviewReminder.mockResolvedValue({ status: "not_shared", message: "Envie a PR ao Slack antes." });

    const client = await connectClient();
    const result = await client.callTool({ name: "send_pr_review_reminder", arguments: { url: PR_URL } });

    expect(result.isError).toBe(true);
    expect(parseText(result).code).toBe("not_shared");
  });

  it("send_review_reminder_digest previews PRs with pending reviewers without posting", async () => {
    const approvedPr: MonitoredPr = { ...pr, id: "PR_8", number: 8, url: "https://github.com/acme/api/pull/8", pendente: [] };
    getMonitorFromCache.mockResolvedValue({
      status: "ok",
      data: [{ ...pr, pendente: ["bruno", "felipe"], dismissed: ["felipe"] }, approvedPr],
      fetchedAt: "2026-11-18T10:00:00.000Z",
      githubLogin: "me"
    });
    renderPrReviewReminderDigest.mockResolvedValue("preview");

    const client = await connectClient();
    const result = await client.callTool({ name: "send_review_reminder_digest", arguments: { dryRun: true } });
    const body = parseText(result);

    expect(result.isError).toBeFalsy();
    expect(body).toMatchObject({ dryRun: true, text: "preview", skippedNoPending: [approvedPr.url] });
    expect(renderPrReviewReminderDigest).toHaveBeenCalledWith(
      [expect.objectContaining({ url: PR_URL, pendingReviewers: ["bruno", "felipe"], dismissedReviewers: ["felipe"] })],
      undefined
    );
    expect(postPrReviewReminderDigest).not.toHaveBeenCalled();
  });

  it("find_pr_in_slack adopts a hand-posted thread only when no share is on record", async () => {
    findPrMentionsInSlackChannel.mockResolvedValue({
      channelId: "C9",
      scannedMessages: 40,
      oldestScannedAt: "2026-11-01T00:00:00.000Z",
      truncated: false,
      mentionsByUrl: new Map([[PR_URL, [{ ts: "111.2", threadTs: "111.2", text: PR_URL, permalink: null }]]])
    });
    getPrSlackShareThreadByUrl.mockResolvedValue(null);
    recordPrSlackShare.mockResolvedValue({ sharedAt: "x", channel: "C9" });

    const client = await connectClient();
    const result = await client.callTool({ name: "find_pr_in_slack", arguments: { urls: [PR_URL], recordAsShare: true } });
    const body = parseText(result);

    expect(result.isError).toBeFalsy();
    expect(body.results[0]).toMatchObject({ url: PR_URL, found: true, recorded: true });
    expect(recordPrSlackShare).toHaveBeenCalledWith({ prUrl: PR_URL, prId: "PR_7", channel: "C9", threadTs: "111.2" });
  });

  it("requires the bearer token when PR_FLOW_MCP_TOKEN is set", async () => {
    process.env.PR_FLOW_MCP_TOKEN = "secret";
    await expect(connectClient()).rejects.toThrow();

    const client = await connectClient({ Authorization: "Bearer secret" });
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
  });
});
