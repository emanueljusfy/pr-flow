"use client";

import type { CSSProperties, ReactNode } from "react";
import { CornerDownRight, GitBranch, Layers } from "lucide-react";
import { ptBR } from "@/modules/messages/pt-BR";
import type { PrStackNode } from "@/modules/prs/lib/core/pr-stacks";
import type { MonitoredPr } from "@/modules/prs/lib/domain";
import { cn } from "@/lib/utils";

interface Props {
  repository: string;
  baseRefName: string;
  nodes: PrStackNode<MonitoredPr>[];
  variant: "card" | "compact";
  renderPr: (pr: MonitoredPr) => ReactNode;
}

/** Visual group for stacked PRs (each one based on the previous PR's branch). */
export function PrStackGroup({ repository, baseRefName, nodes, variant, renderPr }: Props) {
  const copy = ptBR.prStacks;

  return (
    <section
      aria-label={copy.groupAriaLabel(nodes.length, baseRefName)}
      className={cn("pr-stack", variant === "compact" && "pr-stack--compact")}
    >
      <header className="pr-stack__header">
        <Layers className="size-4" aria-hidden />
        <span className="pr-stack__title">{copy.title}</span>
        <span className="small muted">{copy.count(nodes.length)}</span>
        <span className="small muted">·</span>
        <span className="small muted">{repository}</span>
        {baseRefName ? (
          <span className="pr-stack__base small muted">
            <GitBranch className="size-3.5" aria-hidden />
            {copy.mergesInto} <code>{baseRefName}</code>
          </span>
        ) : null}
      </header>

      <ol className="pr-stack__list">
        {nodes.map((node) => (
          <li
            className="pr-stack__item"
            key={node.pr.id}
            style={{ "--pr-stack-depth": node.depth } as CSSProperties}
          >
            <span className="pr-stack__link small muted">
              {node.parentNumber === null ? (
                copy.stackBottom
              ) : (
                <>
                  <CornerDownRight className="size-3.5" aria-hidden />
                  {copy.stackedOn(node.parentNumber)}
                </>
              )}
            </span>
            {renderPr(node.pr)}
          </li>
        ))}
      </ol>
    </section>
  );
}
