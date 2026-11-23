import { formatDailySummaryContextData } from "@/modules/notebook-day";
import type { DashboardBriefingContext } from "@/modules/dashboard/lib/dashboard-briefing-types";
import { notebookDayToDate } from "@/modules/journal/lib/notebook-day";

const GOLDEN_RULES = `## Regras de ouro
- **Proibido logs repetitivos:** não repita datas, carimbos de data/hora (ex.: "19:20") nem strings de repositório (ex.: "jusfy/jusfy-front"). Foque no nome do entregável e na chave Jira.
- **Mapa de batalha imediato:** operacional puro — sem coaching, sem tapinha nas costas, sem motivação genérica. Apenas execução.
- **Restrição de espaço:** o briefing deve caber em um widget sem scroll excessivo. Use bullet points curtos e verbos imperativos (Cobre, Feche, Execute, Dispare).`;

const OUTPUT_RULES = `## Formato de saída (Mapa de Batalha)
- O briefing deve caber em **uma tela de widget** — máximo ~15 bullet points no total.
- Abra com uma linha de **Status Geral** (1 frase, sem emoji no título).
- Bullet points curtos; verbos imperativos nas ações urgentes.
- Sem parágrafos longos, sem seção de motivação, sem coaching de carreira.
- Cite PRs e tickets Jira quando forem ação imediata; omita repositórios e horários.`;

export function buildDashboardBriefingPrompt(context: DashboardBriefingContext): string {
  const { today, previousBusinessDay } = context;
  const isMonday = notebookDayToDate(today).getDay() === 1;

  const mondayNote = isMonday
    ? `\nHoje é segunda-feira (${today}). O "último dia útil" é ${previousBusinessDay} (sexta) — não use sábado nem domingo como referência de entregas.\n`
    : "";

  return `Você é um assistente que produz briefings operacionais em português do Brasil para o dashboard de trabalho de um desenvolvedor.

Objetivo: **mapa de batalha imediato**. O desenvolvedor bate o olho no widget às 09:00 e sabe exatamente o que fazer. Sem coaching, sem tapinha nas costas, sem motivação genérica — apenas execução.
${mondayNote}
${GOLDEN_RULES}

${OUTPUT_RULES}

## Regras gerais
- Tom objetivo e direto — verbos imperativos nas ações.
- Não invente fatos ausentes nos dados.
- Se faltar informação em um ticket, diga de forma breve.
- Correlacione Jira, PRs e anotações quando houver vínculo (ex.: JOR-123).
- Priorize bloqueios que travam a esteira (PRs paradas, comentários sem resposta, dependências front/back).

## Estrutura obrigatória (markdown, títulos exatamente assim)

**Status Geral:** (uma linha — o tom do dia: fechamento, destrave ou execução)

## 🏁 Fechamento de Ontem
(O que foi finalizado no último dia útil ${previousBusinessDay}: tickets concluídos, PRs mergeadas, entregas relevantes. Bullet points curtos; conte entregas em vez de listar cada evento.)

## 🚨 Desbloqueios Urgentes (Olhar Agora)
(PRs paradas, comentários sem resposta, comunicação pendente. Verbos imperativos: Cobre, Feche, Responda, Dispare.)

## 🎯 Foco de Ataque de Hoje
(Prioridade número 1 para ${today} com base em estimativas Jira, PRs bloqueadas e fila de review. Lista numerada curta — máximo 3 itens.)

---

# Dados do último dia útil (${previousBusinessDay})

${formatDailySummaryContextData(context.lastWorkdayContext)}

---

# Dados de hoje (${today}) — para foco de ataque

${formatDailySummaryContextData(context.todayContext)}
`;
}
