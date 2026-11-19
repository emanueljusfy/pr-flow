import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrCard } from "@/modules/prs/components/pr-card";
import type { MonitoredPr } from "@/modules/prs/lib/domain";
import { renderWithProviders } from "@/tests/render-with-providers";

const samplePr: MonitoredPr = {
  id: "PR_1",
  number: 7,
  title: "fix: simplify retries",
  url: "https://github.com/acme/a/pull/7",
  repository: "acme/a",
  createdAt: "2026-05-28T10:00:00Z",
  avaliou: ["ana"],
  naoAvaliou: ["bruno"],
  semReviewersSolicitados: false,
  aprovou: ["ana"],
  solicitouAlteracoes: [],
  pendente: ["bruno"],
  requestedReviewersCount: 2,
  statusGeral: "pending_review"
};

describe("PrCard compact variant", () => {
  it("renders a single row with reviewer pins instead of the reviewer list", () => {
    const { container } = renderWithProviders(<PrCard pr={samplePr} variant="compact" />);

    expect(container.querySelector(".pr-card")).toHaveClass("pr-card--compact");
    expect(container.querySelector(".pr-compact-row")).toBeInTheDocument();
    expect(screen.queryByText("Revisores")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Revisores da PR")).toBeInTheDocument();
    expect(screen.getByLabelText("ana: aprovou")).toBeInTheDocument();
    expect(screen.getByLabelText("bruno: revisão pendente")).toBeInTheDocument();
    expect(screen.getByLabelText("Abrir PR #7 no GitHub")).toBeInTheDocument();
    expect(screen.getByText("fix: simplify retries")).toBeInTheDocument();
  });

  it("shows a muted label when no reviewers were requested", () => {
    renderWithProviders(
      <PrCard
        pr={{ ...samplePr, statusGeral: "no_reviewers", semReviewersSolicitados: true, pendente: [], avaliou: [], aprovou: [] }}
        variant="compact"
      />
    );

    expect(screen.getByText("Sem revisores")).toBeInTheDocument();
  });
});
