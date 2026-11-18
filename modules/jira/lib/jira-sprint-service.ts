import { jiraAgileFetch } from "@/modules/jira/lib/jira-agile-client";
import {
  getJiraSprintBoardIdOverride,
  getJiraSprintProjectKey
} from "@/modules/jira/lib/jira-config";
import { JiraApiError } from "@/modules/jira/lib/jira-errors";
import type { JiraSprintDto, JiraSprintsResponse } from "@/modules/jira/lib/domain";

type JiraBoard = {
  id: number;
  name: string;
  type: string;
};

type JiraBoardListResponse = {
  values: JiraBoard[];
};

type JiraSprintApi = {
  id: number;
  name: string;
  state: "active" | "future" | "closed";
  startDate?: string;
  endDate?: string;
};

type JiraSprintListResponse = {
  values: JiraSprintApi[];
};

type ResolvedSprintBoard = {
  boardId: number;
  boardName: string;
  boardType: string;
};

const SPRINT_STATE_ORDER: Record<JiraSprintDto["state"], number> = {
  active: 0,
  future: 1,
  closed: 2
};

function mapSprint(sprint: JiraSprintApi): JiraSprintDto {
  return {
    id: sprint.id,
    name: sprint.name,
    state: sprint.state,
    startDate: sprint.startDate ?? null,
    endDate: sprint.endDate ?? null
  };
}

function sortSprints(a: JiraSprintDto, b: JiraSprintDto): number {
  const stateDiff = SPRINT_STATE_ORDER[a.state] - SPRINT_STATE_ORDER[b.state];
  if (stateDiff !== 0) {
    return stateDiff;
  }

  const aEnd = a.endDate ? Date.parse(a.endDate) : 0;
  const bEnd = b.endDate ? Date.parse(b.endDate) : 0;
  return bEnd - aEnd;
}

function emptySprintsResponse(board: ResolvedSprintBoard): JiraSprintsResponse {
  return {
    boardId: board.boardId,
    boardName: board.boardName,
    projectKey: getJiraSprintProjectKey(),
    sprints: [],
    cachedAt: null
  };
}

function isBoardWithoutSprintsError(error: unknown): boolean {
  if (!(error instanceof JiraApiError) || error.status !== 400) {
    return false;
  }
  return /não aceita sprints|does not support sprints/i.test(error.message);
}

export async function resolveSprintBoard(): Promise<ResolvedSprintBoard> {
  const override = getJiraSprintBoardIdOverride();
  if (override) {
    const board = await jiraAgileFetch<JiraBoard>(`/board/${override}`);
    return { boardId: board.id, boardName: board.name, boardType: board.type };
  }

  const projectKey = getJiraSprintProjectKey();
  const boards = await jiraAgileFetch<JiraBoardListResponse>(
    `/board?projectKeyOrId=${encodeURIComponent(projectKey)}`
  );

  const scrumBoard = boards.values.find((board) => board.type === "scrum") ?? boards.values[0];
  if (!scrumBoard) {
    throw new JiraApiError(`Nenhum board encontrado para o projeto ${projectKey}.`, 404);
  }

  return {
    boardId: scrumBoard.id,
    boardName: scrumBoard.name,
    boardType: scrumBoard.type
  };
}

export async function fetchJiraSprints(maxResults = 50): Promise<JiraSprintsResponse> {
  const board = await resolveSprintBoard();

  // Kanban boards have no sprint API; keep sync/UI working with filter "all".
  if (board.boardType === "kanban") {
    return emptySprintsResponse(board);
  }

  try {
    const payload = await jiraAgileFetch<JiraSprintListResponse>(
      `/board/${board.boardId}/sprint?state=active,future,closed&maxResults=${maxResults}`
    );

    const sprints = (payload.values ?? []).map(mapSprint).sort(sortSprints);

    return {
      boardId: board.boardId,
      boardName: board.boardName,
      projectKey: getJiraSprintProjectKey(),
      sprints,
      cachedAt: null
    };
  } catch (error) {
    if (isBoardWithoutSprintsError(error)) {
      return emptySprintsResponse(board);
    }
    throw error;
  }
}
