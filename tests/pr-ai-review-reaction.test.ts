import { beforeEach, describe, expect, it, vi } from "vitest";

const getPrSlackShareThreadByUrl = vi.fn();
const findPrMentionsInSlackChannel = vi.fn();
const resolveSlackChannelId = vi.fn(async (nameOrId: string) => (nameOrId.startsWith("C") ? nameOrId : "C0PRCHAN"));
const addSlackReaction = vi.fn();
const isSlackConfigured = vi.fn(() => true);

vi.mock("@/modules/prs/lib/pr-slack-share-repository", () => ({
  getPrSlackShareThreadByUrl: (...args: unknown[]) => getPrSlackShareThreadByUrl(...args)
}));
vi.mock("@/modules/slack/lib/slack-channel-history", () => ({
  findPrMentionsInSlackChannel: (...args: unknown[]) => findPrMentionsInSlackChannel(...args),
  resolveSlackChannelId: (nameOrId: string) => resolveSlackChannelId(nameOrId)
}));
vi.mock("@/modules/slack/lib/slack-client", () => ({
  addSlackReaction: (...args: unknown[]) => addSlackReaction(...args)
}));
vi.mock("@/modules/slack/lib/slack-config", () => ({
  isSlackConfigured: () => isSlackConfigured(),
  getSlackPrChannel: () => "squad-jornada-pr"
}));
vi.mock("@/modules/observability/lib/system-logger", () => ({
  writeSystemLogFireAndForget: vi.fn()
}));

import { reactToAiReviewVerdict } from "@/modules/pr-ai-review/lib/slack-reaction";

const PR_URL = "https://github.com/jusfy/justracker-thanos/pull/699";

function mention(ts: string, threadTs = ts) {
  return { ts, threadTs, postedAt: "", user: "U1", botId: null, replyCount: 0, text: PR_URL, permalink: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  isSlackConfigured.mockReturnValue(true);
  addSlackReaction.mockResolvedValue(true);
  getPrSlackShareThreadByUrl.mockResolvedValue({ channel: "C0SHARED", threadTs: "111.000" });
});

describe("reactToAiReviewVerdict", () => {
  it("approve reacts white_check_mark", async () => {
    await expect(reactToAiReviewVerdict({ prUrl: PR_URL, verdict: "APPROVE" })).resolves.toBe("reacted");
    expect(addSlackReaction).toHaveBeenCalledWith({ channel: "C0SHARED", timestamp: "111.000", name: "white_check_mark" });
  });

  it("comment and request changes react speech_balloon", async () => {
    await expect(reactToAiReviewVerdict({ prUrl: PR_URL, verdict: "COMMENT" })).resolves.toBe("reacted");
    await expect(reactToAiReviewVerdict({ prUrl: PR_URL, verdict: "REQUEST_CHANGES" })).resolves.toBe("reacted");
    expect(addSlackReaction.mock.calls.map(([input]) => input.name)).toEqual(["speech_balloon", "speech_balloon"]);
  });

  it("finds announcement from share then channel history", async () => {
    // Recorded share wins without scanning the channel.
    await reactToAiReviewVerdict({ prUrl: PR_URL, verdict: "APPROVE" });
    expect(findPrMentionsInSlackChannel).not.toHaveBeenCalled();

    // No share: oldest top-level message linking the PR (newest first; replies ignored), 30-day window.
    getPrSlackShareThreadByUrl.mockResolvedValue(null);
    findPrMentionsInSlackChannel.mockResolvedValue({
      channelId: "C0PRCHAN",
      mentionsByUrl: new Map([[PR_URL, [mention("300.000"), mention("250.000", "200.000"), mention("200.000")]]])
    });
    await reactToAiReviewVerdict({ prUrl: PR_URL, verdict: "APPROVE" });
    expect(findPrMentionsInSlackChannel).toHaveBeenCalledWith({
      channel: "squad-jornada-pr",
      urls: [PR_URL],
      lookbackDays: 30
    });
    expect(addSlackReaction).toHaveBeenLastCalledWith({
      channel: "C0PRCHAN",
      timestamp: "200.000",
      name: "white_check_mark"
    });
  });

  it("not found announcement", async () => {
    getPrSlackShareThreadByUrl.mockResolvedValue(null);
    findPrMentionsInSlackChannel.mockResolvedValue({
      channelId: "C0PRCHAN",
      mentionsByUrl: new Map([[PR_URL, [mention("250.000", "200.000")]]])
    });
    await expect(reactToAiReviewVerdict({ prUrl: PR_URL, verdict: "APPROVE" })).resolves.toBe("not_found");
    expect(addSlackReaction).not.toHaveBeenCalled();
  });

  it("skipped when slack not configured and error on api failure", async () => {
    isSlackConfigured.mockReturnValue(false);
    await expect(reactToAiReviewVerdict({ prUrl: PR_URL, verdict: "APPROVE" })).resolves.toBe("skipped");
    expect(addSlackReaction).not.toHaveBeenCalled();

    isSlackConfigured.mockReturnValue(true);
    addSlackReaction.mockRejectedValue(new Error("Slack: ratelimited"));
    await expect(reactToAiReviewVerdict({ prUrl: PR_URL, verdict: "APPROVE" })).resolves.toBe("error");

    getPrSlackShareThreadByUrl.mockResolvedValue(null);
    findPrMentionsInSlackChannel.mockRejectedValue(new Error("missing_scope"));
    await expect(reactToAiReviewVerdict({ prUrl: PR_URL, verdict: "COMMENT" })).resolves.toBe("error");
  });

  it("already reacted", async () => {
    addSlackReaction.mockResolvedValue(false);
    await expect(reactToAiReviewVerdict({ prUrl: PR_URL, verdict: "APPROVE" })).resolves.toBe("already_reacted");
  });
});
