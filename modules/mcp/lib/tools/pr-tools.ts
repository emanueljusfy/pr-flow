import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { errorToolResult, jsonToolResult } from "@/modules/mcp/lib/mcp-tool-result";
import { writeSystemLogFireAndForget } from "@/modules/observability/lib/system-logger";
import { sanitizeErrorForLog } from "@/modules/observability/lib/log-sanitize";
import {
  PR_REVIEW_REMINDER_REVIEWERS_PLACEHOLDER,
  PR_REVIEW_REMINDER_SCHEDULE_INTERVALS,
  buildPrReviewReminderMessage,
  formatPendingReviewerMentions
} from "@/modules/prs/lib/core/pr-review-reminder";
import type { MonitoredPr, PrApiResponse, ReviewerQueueApiResponse } from "@/modules/prs/lib/domain";
import { PrCacheNotReadyError } from "@/modules/prs/lib/pr-cache-errors";
import { getMonitorFromCache, getReviewerQueueFromCache } from "@/modules/prs/lib/pr-read-service";
import {
  cancelPrReviewReminderSchedule,
  schedulePrReviewReminderAfterSend
} from "@/modules/prs/lib/pr-review-reminder-schedule-service";
import { postPrReviewReminderDigest, renderPrReviewReminderDigest } from "@/modules/prs/lib/pr-review-reminder-digest-service";
import { postPrReviewReminder } from "@/modules/prs/lib/pr-review-reminder-service";
import { getPrSlackShareThreadByUrl, recordPrSlackShare } from "@/modules/prs/lib/pr-slack-share-repository";
import { syncPrCache } from "@/modules/prs/lib/pr-sync-service";
import { SlackApiError } from "@/modules/slack/lib/slack-client";
import { findPrMentionsInSlackChannel } from "@/modules/slack/lib/slack-channel-history";
import { SlackConfigError, getSlackPrChannel } from "@/modules/slack/lib/slack-config";
import { SlackPrShareError, sharePrToSlackChannel } from "@/modules/slack/lib/slack-pr-share-service";

const MCP_PR_TOOLS_LOG_SOURCE = "mcp:prs";

const repositorySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Use owner/repo.");

const prUrlSchema = z.string().url().describe("GitHub pull request URL, e.g. https://github.com/owner/repo/pull/123");

const prStatusSchema = z.enum(["approved", "changes_requested", "pending_review", "no_reviewers"]);

type MonitorData = Extract<PrApiResponse, { status: "ok" | "stale" }>;

async function loadMonitor(): Promise<
  { ok: true; monitor: MonitorData } | { ok: false; message: string }
> {
  try {
    const response = await getMonitorFromCache();
    if (response.status === "ok" || response.status === "stale") {
      return { ok: true, monitor: response };
    }
    return { ok: false, message: response.message };
  } catch (error) {
    if (error instanceof PrCacheNotReadyError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

async function loadReviewerQueue(): Promise<
  | { ok: true; queue: Extract<ReviewerQueueApiResponse, { status: "ok" | "stale" }> }
  | { ok: false; message: string }
> {
  try {
    const response = await getReviewerQueueFromCache();
    if (response.status === "ok" || response.status === "stale") {
      return { ok: true, queue: response };
    }
    return { ok: false, message: response.message };
  } catch (error) {
    if (error instanceof PrCacheNotReadyError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

function cacheMeta(source: { status: string; fetchedAt: string; githubLogin: string; message?: string }) {
  return {
    cacheStatus: source.status,
    fetchedAt: source.fetchedAt,
    githubLogin: source.githubLogin,
    ...(source.status === "stale" && source.message ? { staleReason: source.message } : {})
  };
}

/** Compact view of a monitored PR for the model (drops redundant UI-only fields). */
export function toMcpPr(pr: MonitoredPr) {
  return {
    url: pr.url,
    repository: pr.repository,
    number: pr.number,
    title: pr.title,
    createdAt: pr.createdAt,
    status: pr.statusGeral,
    readyToMerge: pr.readyToMerge ?? false,
    hasConflicts: pr.hasConflicts ?? false,
    hasUnresolvedComments: pr.hasUnresolvedComments ?? false,
    reviewers: {
      approved: pr.aprovou,
      changesRequested: pr.solicitouAlteracoes,
      pending: pr.pendente,
      /** Pending because their approval / change request was dismissed (e.g. by a new push). */
      dismissed: pr.dismissed ?? [],
      requestedCount: pr.requestedReviewersCount
    },
    slackShare: pr.slackShare ?? null,
    reviewReminderSchedule: pr.reviewReminderSchedule ?? null
  };
}

function findPrInMonitor(monitor: MonitorData, url: string): MonitoredPr | undefined {
  const normalized = url.trim().replace(/\/+$/, "");
  return monitor.data.find((pr) => pr.url.replace(/\/+$/, "") === normalized);
}

function slackToolError(error: unknown, fallback: string, details: Record<string, unknown>) {
  if (error instanceof SlackConfigError || error instanceof SlackApiError) {
    logToolFailure(error instanceof SlackApiError ? "error" : "warn", error.message, details);
    return errorToolResult(error.message);
  }
  logToolFailure("error", fallback, { ...details, error: sanitizeErrorForLog(error) });
  return errorToolResult(fallback);
}

function logToolFailure(level: "warn" | "error", message: string, details: Record<string, unknown>) {
  writeSystemLogFireAndForget({ level, source: MCP_PR_TOOLS_LOG_SOURCE, message, details });
}

export function registerPrTools(server: McpServer): void {
  server.registerTool(
    "list_my_prs",
    {
      title: "List my pull requests",
      description:
        "Lists the open pull requests authored by the user in the monitored repositories (from PR Flow's local cache, synced every 10 min). Includes review status per reviewer, merge readiness, Slack share and reminder state.",
      inputSchema: {
        repository: repositorySchema.optional().describe("Filter by owner/repo."),
        status: prStatusSchema.optional().describe("Filter by overall review status."),
        onlyWithPendingReviewers: z
          .boolean()
          .optional()
          .describe("Only PRs that still have reviewers who have not reviewed.")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ repository, status, onlyWithPendingReviewers }) => {
      const loaded = await loadMonitor();
      if (!loaded.ok) {
        return errorToolResult(loaded.message);
      }

      const prs = loaded.monitor.data
        .filter((pr) => !repository || pr.repository.toLowerCase() === repository.toLowerCase())
        .filter((pr) => !status || pr.statusGeral === status)
        .filter((pr) => !onlyWithPendingReviewers || pr.pendente.length > 0)
        .map(toMcpPr);

      return jsonToolResult({ ...cacheMeta(loaded.monitor), count: prs.length, prs });
    }
  );

  server.registerTool(
    "get_pr",
    {
      title: "Get pull request details",
      description:
        "Returns one of the user's monitored pull requests by URL, including reviewer breakdown and the latest local review findings.",
      inputSchema: { url: prUrlSchema },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ url }) => {
      const loaded = await loadMonitor();
      if (!loaded.ok) {
        return errorToolResult(loaded.message);
      }

      const pr = findPrInMonitor(loaded.monitor, url);
      if (!pr) {
        return errorToolResult(
          "PR não encontrada no monitor (só PRs abertas do usuário nos repositórios monitorados). Rode sync_prs se ela acabou de ser aberta."
        );
      }

      return jsonToolResult({
        ...cacheMeta(loaded.monitor),
        pr: toMcpPr(pr)
      });
    }
  );

  server.registerTool(
    "list_review_queue",
    {
      title: "List PRs awaiting my review",
      description:
        "Lists open pull requests where the user is a requested reviewer, with the user's own review status (pending, reviewed, dismissed) and the latest local review.",
      inputSchema: {
        myReviewStatus: z
          .enum(["pending", "reviewed", "dismissed"])
          .optional()
          .describe("Filter by the user's own review status.")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ myReviewStatus }) => {
      const loaded = await loadReviewerQueue();
      if (!loaded.ok) {
        return errorToolResult(loaded.message);
      }

      const prs = loaded.queue.data.filter((pr) => !myReviewStatus || pr.myReviewStatus === myReviewStatus);
      return jsonToolResult({ ...cacheMeta(loaded.queue), count: prs.length, prs });
    }
  );

  server.registerTool(
    "sync_prs",
    {
      title: "Sync pull requests from GitHub",
      description:
        "Forces a sync of the PR cache with GitHub now (normally runs every 10 min). Use when a PR was just opened or reviewed and the cache looks outdated.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async () => {
      const sync = await syncPrCache();
      if (sync.status === "ok") {
        return jsonToolResult({ status: "ok", prCount: sync.prCount });
      }
      logToolFailure(sync.status === "error" ? "error" : "warn", sync.error ?? "Falha ao sincronizar PRs.", {
        status: sync.status
      });
      return errorToolResult(sync.error ?? "Falha ao sincronizar PRs com o GitHub.", { status: sync.status });
    }
  );

  server.registerTool(
    "share_pr_to_slack",
    {
      title: "Share pull request(s) to Slack",
      description:
        "Posts the PR to the team's Slack PR channel (SLACK_PR_CHANNEL) with a thread mentioning the author, the same as the Slack button in /prs. The first PR's title must contain a Jira key (e.g. FT-123 or JOR-45). Pass several URLs to share related PRs (same ticket) in one message. This publishes a message visible to the team: confirm with the user before calling.",
      inputSchema: {
        urls: z.array(prUrlSchema).min(1).max(10).describe("PR URLs to share; the first one is the main PR."),
        title: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("Override the title used to build the message. Defaults to the main PR's title from the cache.")
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ urls, title }) => {
      const uniqueUrls = [...new Set(urls)];
      const loaded = await loadMonitor();
      const monitor = loaded.ok ? loaded.monitor : null;
      const mainPr = monitor ? findPrInMonitor(monitor, uniqueUrls[0]!) : undefined;
      const resolvedTitle = title ?? mainPr?.title;

      if (!resolvedTitle) {
        return errorToolResult(
          "PR principal não está no cache; informe `title` (com a chave Jira) ou rode sync_prs antes."
        );
      }

      try {
        const result = await sharePrToSlackChannel({ title: resolvedTitle, selectedPrUrls: uniqueUrls });

        const shares = [];
        for (const url of uniqueUrls) {
          const pr = monitor ? findPrInMonitor(monitor, url) : undefined;
          shares.push({
            url,
            ...(await recordPrSlackShare({
              prUrl: url,
              prId: pr?.id ?? null,
              channel: result.channel,
              threadTs: result.threadTs
            }))
          });
        }

        writeSystemLogFireAndForget({
          level: "info",
          source: MCP_PR_TOOLS_LOG_SOURCE,
          message: `PR compartilhada no Slack via MCP (${uniqueUrls.length}).`,
          details: { urls: uniqueUrls, channel: result.channel }
        });

        return jsonToolResult({ ok: true, channel: result.channel, threadTs: result.threadTs, shares });
      } catch (error) {
        const details = { urls: uniqueUrls };
        if (error instanceof SlackConfigError || error instanceof SlackPrShareError || error instanceof SlackApiError) {
          logToolFailure(error instanceof SlackApiError ? "error" : "warn", error.message, details);
          return errorToolResult(error.message);
        }
        logToolFailure("error", "Não foi possível enviar a PR para o Slack.", {
          ...details,
          error: sanitizeErrorForLog(error)
        });
        return errorToolResult("Não foi possível enviar a PR para o Slack.");
      }
    }
  );

  server.registerTool(
    "send_pr_review_reminder",
    {
      title: "Send review reminder in the PR's Slack thread",
      description: `Replies in the PR's Slack share thread mentioning the reviewers still pending (resolved GitHub login -> Slack user). The PR must have been shared with share_pr_to_slack first. Optionally schedules the reminder to repeat every N minutes (${PR_REVIEW_REMINDER_SCHEDULE_INTERVALS.join(", ")}) until nobody is pending. This publishes a message visible to the team: confirm with the user before calling.`,
      inputSchema: {
        url: prUrlSchema,
        message: z
          .string()
          .trim()
          .min(1)
          .max(4000)
          .optional()
          .describe("Custom text. Use {reviewers} or @github-login to mention people. Defaults to the standard reminder."),
        scheduleIntervalMinutes: z
          .union(PR_REVIEW_REMINDER_SCHEDULE_INTERVALS.map((n) => z.literal(n)) as [
            z.ZodLiteral<60>,
            z.ZodLiteral<120>,
            z.ZodLiteral<240>,
            z.ZodLiteral<480>,
            z.ZodLiteral<1440>
          ])
          .optional()
          .describe("Repeat interval in minutes. Omit to send only once.")
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ url, message, scheduleIntervalMinutes }) => {
      const loaded = await loadMonitor();
      if (!loaded.ok) {
        return errorToolResult(loaded.message);
      }

      const pr = findPrInMonitor(loaded.monitor, url);
      if (!pr) {
        return errorToolResult("PR não encontrada no monitor. Rode sync_prs se ela acabou de ser aberta.");
      }

      const pendingReviewers = pr.pendente;
      const resolvedMessage = message
        ?.split(PR_REVIEW_REMINDER_REVIEWERS_PLACEHOLDER)
        .join(formatPendingReviewerMentions(pendingReviewers));

      const result = await postPrReviewReminder({
        url: pr.url,
        repository: pr.repository,
        number: pr.number,
        message: resolvedMessage,
        pendingReviewers
      });

      if (result.status !== "ok") {
        logToolFailure(result.status === "error" ? "error" : "warn", result.message, {
          url: pr.url,
          code: result.status
        });
        return errorToolResult(result.message, { code: result.status });
      }

      let schedule = null;
      if (scheduleIntervalMinutes != null) {
        schedule = await schedulePrReviewReminderAfterSend({
          url: pr.url,
          repository: pr.repository,
          number: pr.number,
          message: resolvedMessage ?? buildPrReviewReminderMessage(pendingReviewers),
          pendingReviewers,
          intervalMinutes: scheduleIntervalMinutes
        });
      }

      writeSystemLogFireAndForget({
        level: "info",
        source: MCP_PR_TOOLS_LOG_SOURCE,
        message: `Lembrete de revisão publicado via MCP em ${pr.repository}#${pr.number}.`,
        details: { url: pr.url, channel: result.channel, scheduleIntervalMinutes: schedule?.intervalMinutes ?? null }
      });

      return jsonToolResult({ ok: true, channel: result.channel, postedText: result.body, pendingReviewers, schedule });
    }
  );

  server.registerTool(
    "send_review_reminder_digest",
    {
      title: "Send one review reminder for several PRs",
      description:
        "Posts ONE top-level message in the team's Slack PR channel listing several PRs, each with its pending reviewers mentioned (including reviewers whose approval was dismissed by a new push). Use instead of calling send_pr_review_reminder once per PR. Defaults to every open PR of the user that has pending reviewers. Use dryRun to preview the text. Unless dryRun, this publishes a message visible to the team: confirm with the user before calling.",
      inputSchema: {
        urls: z
          .array(prUrlSchema)
          .min(1)
          .max(30)
          .optional()
          .describe("PRs to include. Omit to include every PR with pending reviewers."),
        message: z
          .string()
          .trim()
          .min(1)
          .max(1000)
          .optional()
          .describe("Intro line shown above the list. Defaults to the standard reminder."),
        dryRun: z.boolean().default(false).describe("Return the rendered text without posting.")
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ urls, message, dryRun }) => {
      const loaded = await loadMonitor();
      if (!loaded.ok) {
        return errorToolResult(loaded.message);
      }

      const uniqueUrls = urls ? [...new Set(urls)] : null;
      const notFound: string[] = [];
      const candidates: MonitoredPr[] = [];
      if (uniqueUrls) {
        for (const url of uniqueUrls) {
          const pr = findPrInMonitor(loaded.monitor, url);
          if (pr) {
            candidates.push(pr);
          } else {
            notFound.push(url);
          }
        }
      } else {
        candidates.push(...loaded.monitor.data);
      }

      const included = candidates.filter((pr) => pr.pendente.length > 0);
      const skippedNoPending = candidates.filter((pr) => pr.pendente.length === 0).map((pr) => pr.url);
      if (included.length === 0) {
        return errorToolResult("Nenhuma das PRs tem revisor pendente.", { notFound, skippedNoPending });
      }

      const items = included.map((pr) => ({
        url: pr.url,
        repository: pr.repository,
        number: pr.number,
        title: pr.title,
        pendingReviewers: pr.pendente,
        dismissedReviewers: pr.dismissed ?? []
      }));
      const summary = {
        prs: included.map((pr) => ({ url: pr.url, pending: pr.pendente, dismissed: pr.dismissed ?? [] })),
        notFound,
        skippedNoPending
      };

      try {
        if (dryRun) {
          const text = await renderPrReviewReminderDigest(items, message);
          return jsonToolResult({ ok: true, dryRun: true, text, ...summary });
        }

        const result = await postPrReviewReminderDigest({ items, intro: message });
        writeSystemLogFireAndForget({
          level: "info",
          source: MCP_PR_TOOLS_LOG_SOURCE,
          message: `Lembrete de revisão em lote publicado via MCP (${items.length} PRs).`,
          details: { urls: items.map((item) => item.url), channel: result.channel }
        });
        return jsonToolResult({ ok: true, channel: result.channel, ts: result.ts, postedText: result.text, ...summary });
      } catch (error) {
        return slackToolError(error, "Não foi possível publicar o lembrete em lote.", {
          urls: items.map((item) => item.url)
        });
      }
    }
  );

  server.registerTool(
    "find_pr_in_slack",
    {
      title: "Find PR links already posted in the Slack channel",
      description:
        "Searches the team's Slack PR channel history for messages that link the given PRs, including ones posted by hand (PR Flow otherwise only knows the shares it made itself). Returns each message with its thread, author and permalink, newest first, plus the share PR Flow has on record. Thread replies are not scanned. With recordAsShare, a PR that PR Flow has no share for adopts the newest message's thread, so send_pr_review_reminder can reply there.",
      inputSchema: {
        urls: z.array(prUrlSchema).min(1).max(20),
        lookbackDays: z.number().int().min(1).max(90).default(30).describe("How far back to scan the channel."),
        recordAsShare: z
          .boolean()
          .default(false)
          .describe("Record the newest found message as the PR's Slack share when none is on record.")
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ urls, lookbackDays, recordAsShare }) => {
      const uniqueUrls = [...new Set(urls.map((url) => url.trim()))];
      const loaded = await loadMonitor();
      const monitor = loaded.ok ? loaded.monitor : null;

      try {
        const found = await findPrMentionsInSlackChannel({ channel: getSlackPrChannel(), urls: uniqueUrls, lookbackDays });

        const results = [];
        for (const url of uniqueUrls) {
          const pr = monitor ? findPrInMonitor(monitor, url) : undefined;
          const prUrl = pr?.url ?? url;
          const mentions = found.mentionsByUrl.get(url) ?? [];
          const knownShare = await getPrSlackShareThreadByUrl(prUrl);

          let recorded = false;
          if (recordAsShare && !knownShare && mentions[0]) {
            await recordPrSlackShare({
              prUrl,
              prId: pr?.id ?? null,
              channel: found.channelId,
              threadTs: mentions[0].threadTs
            });
            recorded = true;
          }

          results.push({ url: prUrl, found: mentions.length > 0, knownShare, recorded, mentions });
        }

        return jsonToolResult({
          channel: found.channelId,
          lookbackDays,
          scannedMessages: found.scannedMessages,
          oldestScannedAt: found.oldestScannedAt,
          truncated: found.truncated,
          results
        });
      } catch (error) {
        return slackToolError(error, "Não foi possível buscar a PR no canal do Slack.", { urls: uniqueUrls });
      }
    }
  );

  server.registerTool(
    "cancel_pr_review_reminder",
    {
      title: "Cancel scheduled review reminder",
      description: "Stops the recurring review reminder for a PR, if one is scheduled.",
      inputSchema: { url: prUrlSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ url }) => {
      const cancelled = await cancelPrReviewReminderSchedule(url.trim());
      return jsonToolResult({ ok: true, cancelled });
    }
  );
}
