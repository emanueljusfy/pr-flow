"use client";

import { pt } from "@blocknote/core/locales";
import {
  AddBlockButton,
  DragHandleButton,
  FormattingToolbar,
  FormattingToolbarController,
  SideMenu,
  SideMenuController,
  TableHandlesController,
  useCreateBlockNote
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import { useEffect, useRef } from "react";
import { artifactSchema, exportMarkdown, loadMarkdown } from "@/modules/artifacts/components/artifact-editor-schema";
import {
  ArtifactDragHandleMenu,
  artifactFormattingToolbarItems
} from "@/modules/artifacts/components/artifact-editor-controls";
import "@/modules/artifacts/components/artifacts.css";

export type ArtifactEditorProps = {
  /** Markdown to show. A new `loadKey` replaces the document with it. */
  markdown: string;
  /** Changes whenever `markdown` must replace what is in the editor (tab opened, reloaded). */
  loadKey: string;
  ariaLabel: string;
  /** Called with the editor's Markdown after each user edit, never for a load. */
  onMarkdownChange: (markdown: string) => void;
};

/** BlockNote editor that reads and writes Markdown. Loaded client-only through `artifact-editor-loader`. */
export default function ArtifactEditorView({ markdown, loadKey, ariaLabel, onMarkdownChange }: ArtifactEditorProps) {
  const editor = useCreateBlockNote({
    schema: artifactSchema,
    dictionary: pt,
    domAttributes: { editor: { "aria-label": ariaLabel } }
  });
  const lastMarkdown = useRef<string | null>(null);
  const loadedKey = useRef<string | null>(null);

  useEffect(() => {
    if (loadedKey.current === loadKey) {
      return;
    }
    loadedKey.current = loadKey;
    loadMarkdown(editor, markdown);
    lastMarkdown.current = exportMarkdown(editor);
  }, [editor, loadKey, markdown]);

  return (
    <BlockNoteView
      editor={editor}
      theme="dark"
      className="pr-flow-artifact-editor"
      formattingToolbar={false}
      sideMenu={false}
      tableHandles={false}
      filePanel={false}
      emojiPicker={false}
      comments={false}
      onChange={() => {
        const next = exportMarkdown(editor);
        if (next === lastMarkdown.current) {
          return;
        }
        lastMarkdown.current = next;
        onMarkdownChange(next);
      }}
    >
      <FormattingToolbarController
        formattingToolbar={() => <FormattingToolbar>{artifactFormattingToolbarItems()}</FormattingToolbar>}
      />
      <SideMenuController
        sideMenu={(props) => (
          <SideMenu {...props}>
            <AddBlockButton />
            <DragHandleButton {...props}>
              <ArtifactDragHandleMenu />
            </DragHandleButton>
          </SideMenu>
        )}
      />
      <TableHandlesController tableCellHandle={() => null} />
    </BlockNoteView>
  );
}
