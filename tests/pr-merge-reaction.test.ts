import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MonitoredPr } from "@/modules/prs/lib/domain";

const getPullRequestState = vi.fn();
const getPrSlackShareThreadByUrl = vi.fn();
const findPrMentionsInSlackChannel = vi.fn();
const resolveSlackChannelId = vi.fn(async (nameOrId: string) => (nameOrId.startsWith("C") ? nameOrId : "C0PRCHAN"));
const addSlackReaction = vi.fn();
const isSlackConfigured = vi.fn(() => true);
const writeSystemLogFireAndForget = vi.fn();

vi.mock("@/modules/prs/lib/gh-client", () => ({
  getPullRequestState: (...args: unknown[]) => getPullRequestState(...args)
}));
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
  writeSystemLogFireAndForget: (...args: unknown[]) => writeSystemLogFireAndForget(...args)
}));

import { findPrsThatLeftMonitor, reactToMergedPrs } from "@/modules/prs/lib/pr-merge-reaction-service";

function pr(id: string, number: number): MonitoredPr {
  return {
    id,
    number,
    url: `https://github.com/acme/app/pull/${number}`,
    repository: "acme/app"
  } as MonitoredPr;
}

beforeEach(() => {
  vi.clearAllMocks();
  isSlackConfigured.mockReturnValue(true);
  addSlackReaction.mockResolvedValue(true);
});

describe("findPrsThatLeftMonitor", () => {
  it("returns PRs missing from the next snapshot", () => {
    expect(findPrsThatLeftMonitor([pr("a", 1), pr("b", 2)], [pr("b", 2)]).map((p) => p.id)).toEqual(["a"]);
  });

  it("returns nothing on the first sync", () => {
    expect(findPrsThatLeftMonitor(null, [pr("a", 1)])).toEqual([]);
  });
});

describe("reactToMergedPrs", () => {
  it("reacts with rocket on the recorded share message of a merged PR", async () => {
    getPullRequestState.mockResolvedValue("MERGED");
    getPrSlackShareThreadByUrl.mockResolvedValue({ channel: "squad-jornada-pr", threadTs: "111.222" });

    const outcomes = await reactToMergedPrs([pr("a", 1)]);

    expect(addSlackReaction).toHaveBeenCalledWith({ channel: "C0PRCHAN", timestamp: "111.222", name: "rocket" });
    expect(outcomes).toEqual([{ url: pr("a", 1).url, status: "reacted" }]);
    expect(findPrMentionsInSlackChannel).not.toHaveBeenCalled();
  });

  it("skips PRs closed without merge", async () => {
    getPullRequestState.mockResolvedValue("CLOSED");

    const outcomes = await reactToMergedPrs([pr("a", 1)]);

    expect(addSlackReaction).not.toHaveBeenCalled();
    expect(outcomes[0]?.status).toBe("not_merged");
  });

  it("finds a hand-posted message in the channel when there is no recorded share", async () => {
    getPullRequestState.mockResolvedValue("MERGED");
    getPrSlackShareThreadByUrl.mockResolvedValue(null);
    const url = pr("a", 1).url;
    findPrMentionsInSlackChannel.mockResolvedValue({
      channelId: "C0PRCHAN",
      mentionsByUrl: new Map([
        [
          url,
          [
            { ts: "300.0", threadTs: "200.0" },
            { ts: "200.0", threadTs: "200.0" },
            { ts: "100.0", threadTs: "100.0" }
          ]
        ]
      ])
    });

    await reactToMergedPrs([pr("a", 1)]);

    expect(addSlackReaction).toHaveBeenCalledWith({ channel: "C0PRCHAN", timestamp: "100.0", name: "rocket" });
  });

  it("reports not_found when the PR was never posted", async () => {
    getPullRequestState.mockResolvedValue("MERGED");
    getPrSlackShareThreadByUrl.mockResolvedValue(null);
    findPrMentionsInSlackChannel.mockResolvedValue({ channelId: "C0PRCHAN", mentionsByUrl: new Map() });

    const outcomes = await reactToMergedPrs([pr("a", 1)]);

    expect(addSlackReaction).not.toHaveBeenCalled();
    expect(outcomes[0]?.status).toBe("not_found");
  });

  it("treats an existing reaction as already_reacted", async () => {
    getPullRequestState.mockResolvedValue("MERGED");
    getPrSlackShareThreadByUrl.mockResolvedValue({ channel: "C0PRCHAN", threadTs: "1.1" });
    addSlackReaction.mockResolvedValue(false);

    const outcomes = await reactToMergedPrs([pr("a", 1)]);

    expect(outcomes[0]?.status).toBe("already_reacted");
  });

  it("logs a warning when Slack fails", async () => {
    getPullRequestState.mockResolvedValue("MERGED");
    getPrSlackShareThreadByUrl.mockResolvedValue({ channel: "C0PRCHAN", threadTs: "1.1" });
    addSlackReaction.mockRejectedValue(new Error("missing_scope"));

    const outcomes = await reactToMergedPrs([pr("a", 1)]);

    expect(outcomes[0]).toMatchObject({ status: "error", error: "missing_scope" });
    expect(writeSystemLogFireAndForget).toHaveBeenCalledWith(expect.objectContaining({ level: "warn" }));
  });

  it("does nothing when Slack is not configured", async () => {
    isSlackConfigured.mockReturnValue(false);

    expect(await reactToMergedPrs([pr("a", 1)])).toEqual([]);
    expect(getPullRequestState).not.toHaveBeenCalled();
  });
});
