import { describe, expect, it } from "vitest";
import {
  formatSlackGithubUserMentions,
  scoreGithubLoginAgainstSlackUser
} from "@/modules/slack/lib/slack-github-user-resolve";

describe("scoreGithubLoginAgainstSlackUser", () => {
  it("scores exact email-local / login matches highly", () => {
    expect(
      scoreGithubLoginAgainstSlackUser("cavanus", null, {
        id: "U1",
        name: "jairo",
        realName: "Jairo Cavanus",
        displayName: "",
        email: "jairo.cavanus@jusfy.com.br"
      })
    ).toBeGreaterThanOrEqual(80);
  });

  it("scores github profile name against slack real name", () => {
    expect(
      scoreGithubLoginAgainstSlackUser(
        "felipegmotta",
        { login: "felipegmotta", name: "Felipe Motta", email: null },
        {
          id: "U2",
          name: "felipe",
          realName: "Felipe Motta",
          displayName: "",
          email: "felipe.motta@jusfy.com.br"
        }
      )
    ).toBeGreaterThanOrEqual(95);
  });
});

describe("formatSlackGithubUserMentions", () => {
  it("rewrites known github logins into slack user mentions", () => {
    expect(
      formatSlackGithubUserMentions("Olá @bruno e @carla!", new Map([["bruno", "U111"], ["carla", "U222"]]))
    ).toBe("Olá <@U111> e <@U222>!");
  });

  it("keeps unknown logins as plain text", () => {
    expect(formatSlackGithubUserMentions("Olá @bruno!", new Map())).toBe("Olá @bruno!");
  });
});
