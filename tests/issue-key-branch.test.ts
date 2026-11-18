import { describe, expect, it } from "vitest";
import { extractJiraIssueKeyFromBranch } from "@/modules/jira-issue-key/lib/issue-key-branch";

describe("extractJiraIssueKeyFromBranch", () => {
  it("extrai chave do padrao git_convention/jor-123/info", () => {
    expect(extractJiraIssueKeyFromBranch("git_convention/jor-123/ajuste-fluxo")).toBe("JOR-123");
  });

  it("normaliza casing no segmento", () => {
    expect(extractJiraIssueKeyFromBranch("git_convention/JOR-99/deploy")).toBe("JOR-99");
  });

  it("extrai chave FT do segmento da branch", () => {
    expect(extractJiraIssueKeyFromBranch("fix/ft-3380/retry-api")).toBe("FT-3380");
    expect(extractJiraIssueKeyFromBranch("feat/FT-12/x")).toBe("FT-12");
  });

  it("retorna null sem segmento jor/ft", () => {
    expect(extractJiraIssueKeyFromBranch("feature/minha-branch")).toBeNull();
  });
});
