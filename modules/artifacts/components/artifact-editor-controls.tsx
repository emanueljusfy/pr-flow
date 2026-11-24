import { DragHandleMenu, RemoveBlockItem, getFormattingToolbarItems } from "@blocknote/react";
import type { ReactElement } from "react";
import { ptBR } from "@/modules/messages/pt-BR";

/** Formatting controls whose effect does not survive Markdown (colour, alignment, underline, cell merge). */
export const WITHHELD_TOOLBAR_KEYS = [
  "colorStyleButton",
  "textAlignLeftButton",
  "textAlignCenterButton",
  "textAlignRightButton",
  "underlineStyleButton",
  "tableCellMergeButton"
] as const;

/** The default formatting toolbar without the controls Markdown cannot keep. */
export function artifactFormattingToolbarItems(): ReactElement[] {
  return getFormattingToolbarItems().filter(
    (item) => !(WITHHELD_TOOLBAR_KEYS as readonly string[]).includes(String(item.key))
  );
}

/** Block menu behind the drag handle: delete only, no colours. */
export function ArtifactDragHandleMenu() {
  return (
    <DragHandleMenu>
      <RemoveBlockItem>{ptBR.artifacts.editor.deleteBlock}</RemoveBlockItem>
    </DragHandleMenu>
  );
}
