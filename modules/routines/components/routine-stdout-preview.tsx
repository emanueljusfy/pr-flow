"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { cn } from "@/lib/utils";

type RoutineStdoutPreviewProps = {
  markdown: string;
  emptyLabel: string;
};

const previewProseClass = cn(
  "routine-stdout-preview prose prose-sm dark:prose-invert max-w-none",
  "min-h-0 flex-1 overflow-auto rounded-md border border-[var(--app-border)] p-3 md:p-4",
  "bg-[var(--app-surface-inset)] text-[var(--app-text)]",
  "prose-headings:text-[var(--app-text)] prose-headings:font-semibold",
  "prose-p:text-[var(--app-text-soft)] prose-li:text-[var(--app-text-soft)]",
  "prose-strong:text-[var(--app-text)]",
  "prose-a:text-[var(--app-link)] prose-a:underline-offset-2 hover:prose-a:underline",
  "prose-code:text-[var(--brand-bright)] prose-code:before:content-none prose-code:after:content-none",
  "prose-pre:border prose-pre:border-[var(--app-border)] prose-pre:bg-black/30",
  "prose-blockquote:border-[var(--brand-border)] prose-blockquote:text-[var(--app-text-muted)]",
  "prose-hr:border-[var(--app-border)]",
  "prose-th:text-[var(--app-text)] prose-td:text-[var(--app-text-soft)]",
  "prose-table:block prose-table:overflow-x-auto"
);

export function RoutineStdoutPreview({ markdown, emptyLabel }: RoutineStdoutPreviewProps) {
  if (markdown.trim().length === 0) {
    return (
      <p
        className="rounded-md border border-dashed border-[var(--app-border)] bg-[var(--app-surface-inset)] px-3 py-4 text-xs text-[var(--app-text-muted)]"
        data-testid="routine-stdout-empty"
      >
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className={previewProseClass} data-testid="routine-stdout-preview">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
