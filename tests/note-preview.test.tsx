import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NotePreview } from "@/modules/journal/lib/note-preview";

describe("NotePreview", () => {
  it("does not render executable script tags from unsafe markdown", () => {
    render(<NotePreview markdown={'# Title\n<script>alert("xss")</script>'} />);

    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("linkifica JOR-xxx para a tela do Jira no preview", () => {
    render(<NotePreview markdown="Revisar jor-182 amanhã." />);

    const link = screen.getByRole("link", { name: "JOR-182" });
    expect(link).toHaveAttribute("data-jira-issue-link");
    expect(link).toHaveAttribute("href", "/jira?issue=JOR-182");
  });
});
