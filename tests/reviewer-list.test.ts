import { describe, expect, it } from "vitest";
import { buildReviewerList } from "@/modules/prs/lib/core/reviewer-list";

describe("buildReviewerList", () => {
  it("monta uma lista unica com status por revisor", () => {
    expect(
      buildReviewerList({
        solicitouAlteracoes: ["marcos"],
        pendente: ["bruno"],
        aprovou: ["ana"],
        avaliou: ["ana", "marcos", "carla"],
        naoAvaliou: ["bruno"]
      })
    ).toEqual([
      { login: "marcos", status: "changes_requested" },
      { login: "bruno", status: "pending" },
      { login: "ana", status: "approved" },
      { login: "carla", status: "commented" }
    ]);
  });

  it("nao duplica login quando o mesmo aparece em mais de um bucket", () => {
    expect(
      buildReviewerList({
        solicitouAlteracoes: ["ana"],
        pendente: [],
        aprovou: [],
        avaliou: ["ana"],
        naoAvaliou: []
      })
    ).toEqual([{ login: "ana", status: "changes_requested" }]);
  });
});
