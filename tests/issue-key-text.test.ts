import { describe, expect, it } from "vitest";
import { textMentionsIssueKey } from "@/modules/jira-issue-key/lib/issue-key-text";

describe("textMentionsIssueKey", () => {
  it("detecta chave no titulo via extractJiraIssueKey", () => {
    expect(textMentionsIssueKey("JOR-123 Feature X", "JOR-123")).toBe(true);
  });

  it("detecta chave no meio do texto com limite de palavra", () => {
    expect(textMentionsIssueKey("Pair no JOR-123 com o time", "JOR-123")).toBe(true);
  });

  it("ignora chave diferente", () => {
    expect(textMentionsIssueKey("Trabalho em JOR-999", "JOR-123")).toBe(false);
  });

  it("nao confunde prefixo numerico", () => {
    expect(textMentionsIssueKey("JOR-1234 deploy", "JOR-123")).toBe(false);
  });

  it("detecta chave FT no titulo e no meio do texto", () => {
    expect(textMentionsIssueKey("FT-3380 retry API", "FT-3380")).toBe(true);
    expect(textMentionsIssueKey("Pair no FT-3380 com o time", "FT-3380")).toBe(true);
  });
});
