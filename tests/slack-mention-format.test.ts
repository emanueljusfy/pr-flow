import { afterEach, describe, expect, it } from "vitest";
import {
  formatSlackUsergroupMentions,
  SLACK_JUSTRACKER_USERGROUP_ID_DEFAULT
} from "@/modules/slack/lib/slack-mention-format";

describe("formatSlackUsergroupMentions", () => {
  afterEach(() => {
    delete process.env.SLACK_JUSTRACKER_USERGROUP_ID;
  });

  it("leaves text unchanged when usergroup id is explicitly null", () => {
    expect(formatSlackUsergroupMentions("Olá @justracker!", null)).toBe("Olá @justracker!");
  });

  it("rewrites @justracker into a subteam mention", () => {
    expect(formatSlackUsergroupMentions("Olá @justracker!", "S012ABC")).toBe(
      "Olá <!subteam^S012ABC|justracker>!"
    );
  });

  it("defaults to the JusTracker usergroup id", () => {
    expect(formatSlackUsergroupMentions("Ping @justracker agora")).toBe(
      `Ping <!subteam^${SLACK_JUSTRACKER_USERGROUP_ID_DEFAULT}|justracker> agora`
    );
  });
});
