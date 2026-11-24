import { describe, expect, it } from "vitest";
import {
  WITHHELD_TOOLBAR_KEYS,
  ArtifactDragHandleMenu,
  artifactFormattingToolbarItems
} from "@/modules/artifacts/components/artifact-editor-controls";
import {
  artifactSchema,
  createArtifactMarkdownConverter,
  exportMarkdown,
  loadMarkdown
} from "@/modules/artifacts/components/artifact-editor-schema";
import { getFormattingToolbarItems, RemoveBlockItem } from "@blocknote/react";
import { Children, isValidElement } from "react";

const SAMPLE = `# Title

Paragraph with **bold**, *italic*, \`code\` and a [link](https://example.com).

- bullet one
- bullet two
  - nested

1. first
2. second

- [ ] todo
- [x] done

> a quote

\`\`\`ts
const a = 1;
\`\`\`

| a | b |
| --- | --- |
| 1 | 2 |
`;

function through(markdown: string): string {
  const editor = createArtifactMarkdownConverter();
  loadMarkdown(editor, markdown);
  return exportMarkdown(editor);
}

describe("artifact editor markdown", () => {
  it("round trips the supported blocks", () => {
    const editor = createArtifactMarkdownConverter();
    loadMarkdown(editor, SAMPLE);

    const types = new Set(editor.document.map((block) => block.type));
    expect([...types].sort()).toEqual(
      [
        "bulletListItem",
        "checkListItem",
        "codeBlock",
        "heading",
        "numberedListItem",
        "paragraph",
        "quote",
        "table"
      ].sort()
    );
    const first = exportMarkdown(editor);
    expect(first).toContain("# Title");
    expect(first).toContain("**bold**");
    expect(first).toContain("*italic*");
    expect(first).toContain("`code`");
    expect(first).toContain("[link](https://example.com)");
    expect(first).toContain("* bullet two\n  * nested");
    expect(first).toContain("1. first\n2. second");
    expect(first).toContain("* [ ] todo\n* [x] done");
    expect(first).toContain("> a quote");
    expect(first).toContain("```ts\nconst a = 1;\n```");
    expect(first).toMatch(/\| a\s+\| b\s+\|\n\| -+\s*\| -+\s*\|\n\| 1\s+\| 2\s+\|/);
    expect(through(first)).toBe(first);
    expect(through(through(first))).toBe(first);
  });

  it("save reopen save is stable", () => {
    const saved = through(SAMPLE);
    // reopening what was saved and saving again without an edit changes nothing
    expect(through(saved)).toBe(saved);
    // a document an agent wrote differently settles after one pass
    const agent = "Title\n=====\n\n+ one\n+ two\n\n---\n";
    expect(through(through(agent))).toBe(through(agent));
  });

  it("offers no colour or alignment", () => {
    expect(Object.keys(artifactSchema.styleSchema).sort()).toEqual(["bold", "code", "italic", "strike"]);
    expect(artifactSchema.styleSchema).not.toHaveProperty("textColor");
    expect(artifactSchema.styleSchema).not.toHaveProperty("backgroundColor");
    expect(artifactSchema.blockSchema).not.toHaveProperty("image");

    const defaults = getFormattingToolbarItems().map((item) => String(item.key));
    for (const key of WITHHELD_TOOLBAR_KEYS) {
      expect(defaults, `${key} is a default control`).toContain(key);
    }
    const kept = artifactFormattingToolbarItems().map((item) => String(item.key));
    for (const key of WITHHELD_TOOLBAR_KEYS) {
      expect(kept).not.toContain(key);
    }
    expect(kept).toEqual(expect.arrayContaining(["boldStyleButton", "italicStyleButton", "createLinkButton"]));

    const menu = ArtifactDragHandleMenu();
    const items = Children.toArray((menu.props as { children: React.ReactNode }).children);
    expect(items.map((item) => (isValidElement(item) ? item.type : null))).toEqual([RemoveBlockItem]);
  });
});
