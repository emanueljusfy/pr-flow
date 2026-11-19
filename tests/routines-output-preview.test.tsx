import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoutineStdoutPreview } from "@/modules/routines/components/routine-stdout-preview";

describe("RoutineStdoutPreview", () => {
  it("renders GFM bold and pipe table as HTML", () => {
    const markdown = [
      "## Resumo",
      "",
      "Status **aprovado** no head atual.",
      "",
      "| revisor | pr | resultado |",
      "| --- | --- | --- |",
      "| @davi | repo#1 | pulado |"
    ].join("\n");

    render(<RoutineStdoutPreview markdown={markdown} emptyLabel="Sem saída padrão." />);

    const preview = screen.getByTestId("routine-stdout-preview");
    expect(within(preview).queryByText(/\*\*aprovado\*\*/)).not.toBeInTheDocument();
    expect(within(preview).getByText("aprovado").tagName).toBe("STRONG");
    expect(within(preview).getByRole("table")).toBeInTheDocument();
    expect(within(preview).getByRole("columnheader", { name: "revisor" })).toBeInTheDocument();
    expect(within(preview).getByRole("cell", { name: "@davi" })).toBeInTheDocument();
  });

  it("does not execute script tags from stdout markdown", () => {
    render(
      <RoutineStdoutPreview
        markdown={'# Title\n<script>alert("xss")</script>'}
        emptyLabel="Sem saída padrão."
      />
    );

    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });
});
