import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ArtifactEditorView from "@/modules/artifacts/components/artifact-editor";

const SAMPLE = `# Title

- [ ] todo
- [x] done

| a | b |
| --- | --- |
| 1 | 2 |
`;

describe("artifact editor component", () => {
  afterEach(cleanup);

  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

  it("opening a tab emits no edit", async () => {
    // an empty tab, a tab with every block kind, and switching between them: none of them is an edit
    for (const markdown of ["", SAMPLE, "plain text"]) {
      const onChange = vi.fn();
      const view = render(
        <ArtifactEditorView markdown={markdown} loadKey="first" ariaLabel="Editor" onMarkdownChange={onChange} />
      );
      await settle();
      expect(onChange, JSON.stringify(markdown.slice(0, 20))).not.toHaveBeenCalled();

      view.rerender(
        <ArtifactEditorView markdown="# Outra aba" loadKey="second" ariaLabel="Editor" onMarkdownChange={onChange} />
      );
      await settle();
      expect(onChange).not.toHaveBeenCalled();
      expect(view.container.querySelector(".bn-editor")?.textContent).toContain("Outra aba");
      view.unmount();
    }
  });
});
