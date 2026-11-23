# Contexto de domínio — PR Flow

Vocabulário compartilhado para humanos e agentes. Comportamento real está no código; este arquivo descreve **conceitos** e onde vivem.

## Notebook day

Dia de trabalho local (`YYYY-MM-DD`), alinhado ao fuso do usuário. Agrupa anotação (journal), atividade Jira, PR e commits de autoria. Usado para montar contexto de IA — módulo **`modules/notebook-day/`** (`buildNotebookDayContext`, `contextHasSummaryInput`, `formatDailySummaryContextData`). Re-exports legados em `modules/dashboard/lib/daily-summary-*.ts` (não confundir com briefing).

## Nota (journal)

Anotação markdown ativa de um notebook day; no máximo uma por dia (soft-delete). Corpo não vazio é obrigatório para existir.
_Avoid_: journal day; entry; strike

## Dia com nota

Notebook day que possui nota ativa. Critério único para streak do dashboard e marcador no calendário do journal.
_Avoid_: dia com journal (ambíguo — journal é a feature, a unidade é a nota)

## Dia útil (streak)

Segunda a sexta no fuso do notebook day. Sábado e domingo não entram no streak e não o quebram. Feriados contam como dia útil (o produto não tem calendário de feriados).
_Avoid_: business day de bolsa/bancário; dia de calendário genérico

## Streak do journal

Sequência atual de dias úteis consecutivos já fechados com dia com nota, contada a partir do último dia útil concluído (ontem útil se hoje ainda está em curso). O dia útil corrente, se ainda sem nota, é **pendente**: aparece na faixa, não incrementa o contador e não zera a sequência. Widget no dashboard: contador + faixa dos dias úteis recentes; CTA para `/journal` do dia corrente quando pendente.
_Avoid_: strike; streak de notebook day genérico (só conta nota, não task/Jira/PR); longest streak (só a sequência atual)

## Marcador de nota (calendário)

Indicador visual no seletor de notebook day (`NotebookDayPicker`) nos dias com nota, para achar e saltar entre dias já escritos. Não é um pin/favorito persistido — só deriva da existência da nota.
_Avoid_: pin favorito; bookmark; pin de mapa

## Briefing do dashboard

Único artefato de texto com IA persistido. Rota `/dashboard` (widget), cron `cron:dashboard-briefing` (horária). Mapa de batalha imediato do hub (fechamento do último dia útil, desbloqueios urgentes, foco de ataque — sem coaching). Leitura: `GET /api/dashboard/briefing` (rota legada `/api/dashboard/daily-summary` delega ao mesmo handler). UI: `DashboardBriefingWidget`, hook `useDashboardBriefing`. Serviço: `dashboard-briefing-service.ts`; persistência em `dashboard-briefing-repository.ts` (tabela legada `summaries`, linhas `type = dashboard`).

Arquivos `daily-summary-*` no dashboard são re-exports finos para compatibilidade; a implementação vive em `notebook-day`.

## Geração por LLM

Seam compartilhado em **`modules/llm-generation/`**: interface `LlmTextGenerator` (prompt → texto), adapter Gemini (`createGeminiLlmGenerator`), adapter em memória para testes. Consumidores: `dashboard-briefing-service`, rascunho do journal, nome de branch Jira. Entrada: `generateLlmText` / `hasLlmApiKey` (gerador padrão substituível com `setDefaultLlmGenerator`).

## Ticket Jira

Issue atribuída ao usuário no Jira; UI em **`/jira`** (módulo `modules/jira/`). No código: `JiraIssueDto`, cards e diálogo de detalhe. 
_Avoid_: "issue" só em código EN quando já é o termo da API Jira

## Chave de issue Jira (JOR-xxx)

Módulo **`modules/jira-issue-key/`** (helpers puros, seguro em Client Components): extração de chave em títulos/textos, `normalizeJiraIssueKey`, URLs de browse e rota interna `/jira?issue=…`, linkify em markdown. Seam server-only em **`modules/jira-issue-key/server`**: `JiraIssueKeySource`, `createPrMonitorCacheIssueKeySource` (cache PR). `syncJiraCache({ issueKeySource })` aceita fonte injetável em testes. Re-export legado: `prs/lib/core/jira-issue.ts`.

## Criação de branch com IA

Fluxo no ticket Jira: context menu (card ou diálogo) → wizard modal → escolher um ou mais repositórios monitorados → nome sugerido por IA (slug editável; prefixo `feat/` ou `fix/` automático) → base por repositório (default da repo) → criar refs remotas no GitHub. Mesmo nome em todos os repos; falha em um repo não cancela os outros; aviso se nome já existe antes do passo final. Sem chave LLM: slug manual. Sucesso: link por repo para abrir a PR no GitHub (página compare).
_Avoid_: criar branch local; um nome diferente por repo; path completo editável pelo usuário

## PR monitor cache

Cache Postgres das PRs monitoradas; atualizado por cron e `POST /api/prs`. Leitura via `GET /api/prs`. Domínio: `modules/prs/`. Keys Jira nos títulos alimentam o sync Jira via `jira-issue-key`.

## Agendamento de crons

Módulo **`modules/cron-scheduling/`**: specs (`CRON_JOB_SCHEDULE_SPECS`), `startAllCrons()` na subida do servidor, `registerScheduledCrons` testável com scheduler fake. Execução de domínio continua em `modules/devtools/lib/cron-job-runners.ts`.

## Flags de cron relacionadas

| Variável | Jobs afetados |
|----------|----------------|
| `DISABLE_PR_SYNC_CRON=1` | `cron:prs-sync` |
| `DISABLE_JIRA_SYNC_CRON=1` | `cron:jira-sync` |
| `DISABLE_DASHBOARD_BRIEFING_CRON=1` | `cron:dashboard-briefing` |

`SUMMARY_CRON_TZ` — fuso do job de briefing (padrão `America/Sao_Paulo`).

## Nomes no código (EN) vs domínio (pt-BR)

| Domínio (docs/UI) | Código |
|-------------------|--------|
| Briefing do dashboard | `dashboard-briefing-*`, `cron:dashboard-briefing` |
| Notebook day | `modules/notebook-day/` |
| Nota (journal) | `modules/journal/` |
| Quick note (captura rápida) | `modules/journal/lib/quick-note*.ts`, Ctrl+Space |
| Streak do journal | `modules/journal/lib/journal-streak.ts`, widget no dashboard |

## System log

Evento estruturado emitido pela aplicação (crons, sync, boot) via instrumentação interna. Destino: stdout (`docker compose logs -f app` no Compose). Não é feature de UI nem dado de produto no Postgres.
_Avoid_: log do Devtools, persistência de logs no Postgres

Campo **`source`** em duas camadas:

| Camada | Padrão | Exemplos | Quem emite |
|--------|--------|----------|------------|
| Orquestração | `cron:*`, `api:*` | `cron:jira-sync`, `api:prs-sync` | runners de cron, rotas HTTP |
| Domínio | `<módulo>:<ação>` | `jira:sync`, `prs:sync`, `jira-branch:create` | serviços de domínio |

Serviços logam detalhes internos sem saber o gatilho (manual, cron ou API). Orquestradores logam início/fim do fluxo que dispararam.

## Gh command log

Registro em arquivo dos comandos `gh` executados pelo monitor de PRs (`GhLogger`). Independente de system logs.
_Avoid_: system log

## Ambiente local (Jusfy Docker)

Stack pessoal definido fora do PR Flow (`docker-compose.dev.yml` em `LOCAL_DOCKER_ROOT`). UI em **`/devtools/local-docker`**: um gatilho sobe só o **Portainer**; stacks, serviços e volumes são gerenciados no painel Portainer (iframe bloqueado por CSP — fallback em nova aba). Módulo **`modules/local-docker/`**. Variáveis: `LOCAL_DOCKER_ROOT`, `JUSFY_ROOT`, opcional `LOCAL_DOCKER_PORTAINER_URL`.
_Avoid_: ligar/desligar cada serviço Jusfy dentro do PR Flow; confundir com o Compose do próprio PR Flow (`docker-compose.yml` na raiz do repo)

## Contagem de férias

Data de início das férias no browser (`localStorage`), módulo **`modules/vacation-countdown/`**. Dialog na primeira visita; widget no dashboard; na sidebar alterna com a previsão do tempo.
_Avoid_: persistir no Postgres; confundir com feriados ou calendário do Jira

## Eventos do dia (Google Calendar)

Widget do dashboard com os compromissos de hoje, via feed **iCal secreto** do Google Calendar (`GOOGLE_CALENDAR_ICAL_URL`). Módulo **`modules/day-calendar/`**; leitura sob demanda em `GET /api/dashboard/calendar-today` (cache em memória ~5 min). Fuso alinhado a `SUMMARY_CRON_TZ` (padrão `America/Sao_Paulo`).
_Avoid_: OAuth Google; confiar URL fora de `calendar.google.com`; commitar a URL privada

## Quick note (captura rápida)

Entrada curta via atalho (Ctrl+Space) que vira registro na nota do notebook day de hoje.
_Avoid_: quick chat

## Deck de atalhos

Coleção pessoal de atalhos no dashboard; o usuário define o que entra, a ordem, o ícone e a cor. Módulo **`modules/shortcut-deck/`**.
_Avoid_: bookmarks, favoritos; confundir com os cards fixos do hub (`DashboardHub`, navegação interna dos módulos)

## Atalho (deck)

Link nomeado no deck: rótulo, URL, ícone do catálogo tech e cor da paleta, com posição explícita na ordem.
_Avoid_: card do hub; “atalho” no sentido de tecla de atalho do teclado

## Documentação operacional

- `AGENTS.md` — rotas, stack, convenções
