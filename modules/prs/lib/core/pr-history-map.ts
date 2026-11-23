import type { PrHistoryEvent, PrHistoryEventType } from "@/modules/prs/lib/domain";

export type PrHistoryGraphqlPullRequest = {
  id?: string | null;
  number?: number | null;
  url?: string | null;
  createdAt?: string | null;
  author?: { login?: string | null } | null;
  timelineItems?: { nodes?: Array<PrHistoryGraphqlTimelineNode | null> | null } | null;
};

export type PrHistoryGraphqlTimelineNode = {
  __typename?: string | null;
  id?: string | null;
  createdAt?: string | null;
  url?: string | null;
  body?: string | null;
  state?: string | null;
  author?: { login?: string | null } | null;
  actor?: { login?: string | null } | null;
  commit?: {
    oid?: string | null;
    committedDate?: string | null;
    messageHeadline?: string | null;
    url?: string | null;
    author?: { user?: { login?: string | null } | null; name?: string | null } | null;
  } | null;
};

function normalizeDetail(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  // Keep line breaks: comment bodies are markdown and the panel renders them as such.
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  return normalized || null;
}

function loginOf(value: { login?: string | null } | null | undefined): string {
  return value?.login?.trim() || "desconhecido";
}

function event(
  partial: Omit<PrHistoryEvent, "detail" | "reviewState"> & {
    detail?: string | null;
    reviewState?: string | null;
  }
): PrHistoryEvent {
  return {
    ...partial,
    detail: partial.detail ?? null,
    reviewState: partial.reviewState ?? null
  };
}

function mapTimelineNode(node: PrHistoryGraphqlTimelineNode): PrHistoryEvent | null {
  const typename = node.__typename ?? "";

  if (typename === "IssueComment") {
    const occurredAt = node.createdAt ?? "";
    if (!occurredAt || !node.id) {
      return null;
    }
    return event({
      id: node.id,
      type: "commented",
      occurredAt,
      actorLogin: loginOf(node.author),
      url: node.url ?? null,
      detail: normalizeDetail(node.body)
    });
  }

  if (typename === "PullRequestReview") {
    const occurredAt = node.createdAt ?? "";
    if (!occurredAt || !node.id) {
      return null;
    }
    const state = (node.state ?? "").trim();
    if (state === "PENDING") {
      return null;
    }
    return event({
      id: node.id,
      type: "review_submitted",
      occurredAt,
      actorLogin: loginOf(node.author),
      url: node.url ?? null,
      detail: normalizeDetail(node.body),
      reviewState: state || null
    });
  }

  if (typename === "PullRequestCommit") {
    const commit = node.commit;
    const occurredAt = commit?.committedDate ?? "";
    const oid = commit?.oid?.trim() ?? "";
    if (!occurredAt || !oid) {
      return null;
    }
    const actorLogin =
      commit?.author?.user?.login?.trim() ||
      commit?.author?.name?.trim() ||
      "desconhecido";
    return event({
      id: `commit:${oid}`,
      type: "commit",
      occurredAt,
      actorLogin,
      url: commit?.url ?? null,
      detail: normalizeDetail(commit?.messageHeadline)
    });
  }

  if (typename === "MergedEvent" || typename === "ClosedEvent" || typename === "ReopenedEvent") {
    const occurredAt = node.createdAt ?? "";
    if (!occurredAt || !node.id) {
      return null;
    }
    const typeMap: Record<string, PrHistoryEventType> = {
      MergedEvent: "merged",
      ClosedEvent: "closed",
      ReopenedEvent: "reopened"
    };
    return event({
      id: node.id,
      type: typeMap[typename]!,
      occurredAt,
      actorLogin: loginOf(node.actor),
      url: node.url ?? null
    });
  }

  return null;
}

/** Maps a GraphQL pullRequest payload into history events (newest first). */
export function mapPullRequestHistory(pr: PrHistoryGraphqlPullRequest): PrHistoryEvent[] {
  const events: PrHistoryEvent[] = [];

  const createdAt = pr.createdAt ?? "";
  if (createdAt) {
    events.push(
      event({
        id: `opened:${pr.id ?? pr.number ?? createdAt}`,
        type: "opened",
        occurredAt: createdAt,
        actorLogin: loginOf(pr.author),
        url: pr.url ?? null
      })
    );
  }

  for (const node of pr.timelineItems?.nodes ?? []) {
    if (!node) {
      continue;
    }
    const mapped = mapTimelineNode(node);
    if (mapped) {
      events.push(mapped);
    }
  }

  events.sort((a, b) => {
    const aTime = Date.parse(a.occurredAt);
    const bTime = Date.parse(b.occurredAt);
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
      return 0;
    }
    return bTime - aTime;
  });

  return events;
}
