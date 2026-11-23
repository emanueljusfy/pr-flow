"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type Props = {
  markdown: string;
  className?: string;
};

const markdownComponents: Components = {
  a: ({ href, children, node: _node, ...props }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  )
};

/**
 * Renders a GitHub comment body (markdown + inline HTML such as <details>).
 * rehype-raw parses the HTML, rehype-sanitize (GitHub schema) runs after it and
 * strips HTML comments, scripts and unsafe attributes.
 */
export function PrHistoryDetailMarkdown({ markdown, className }: Props) {
  return (
    <div className={cn("pr-history-markdown", className)} data-testid="pr-history-detail-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={markdownComponents}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
