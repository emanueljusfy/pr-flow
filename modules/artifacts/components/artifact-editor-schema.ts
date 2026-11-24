import { BlockNoteEditor, BlockNoteSchema, defaultBlockSpecs, defaultStyleSpecs } from "@blocknote/core";

/** Blocks Markdown can hold: no images, files, audio, video or toggle lists. */
const { paragraph, heading, quote, codeBlock, bulletListItem, numberedListItem, checkListItem, table } =
  defaultBlockSpecs;

/** Styles Markdown can hold: no text or background colour, no underline. */
const { bold, italic, strike, code } = defaultStyleSpecs;

export const artifactSchema = BlockNoteSchema.create({
  blockSpecs: { paragraph, heading, quote, codeBlock, bulletListItem, numberedListItem, checkListItem, table },
  styleSpecs: { bold, italic, strike, code }
});

export type ArtifactEditor = BlockNoteEditor<
  typeof artifactSchema.blockSchema,
  typeof artifactSchema.inlineContentSchema,
  typeof artifactSchema.styleSchema
>;

/** A view-less editor that only converts between Markdown and blocks. */
export function createArtifactMarkdownConverter(): ArtifactEditor {
  return BlockNoteEditor.create({ schema: artifactSchema });
}

/** Replaces the document of `editor` with `markdown`. */
export function loadMarkdown(editor: ArtifactEditor, markdown: string): void {
  const blocks = editor.tryParseMarkdownToBlocks(markdown);
  editor.replaceBlocks(editor.document, blocks);
}

export function exportMarkdown(editor: ArtifactEditor): string {
  return editor.blocksToMarkdownLossy(editor.document);
}
