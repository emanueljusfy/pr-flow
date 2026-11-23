# Agentes — PR Flow

Guia rápido para trabalhar neste repositório. Vocabulário de domínio (notebook day, briefing): **[CONTEXT.md](CONTEXT.md)**.

## Antes de mudar UI

1. **[docs/shadcn-for-agents.md](docs/shadcn-for-agents.md)** — usar **preferencialmente** componentes shadcn (`@/components/ui/*`); quando adicionar UI nova, começar por aqui.
2. **[docs/design-system.md](docs/design-system.md)** — chrome flat estilo Herdr (near-black, inset shell), acento ember só em ação/marca, `Surface`, pt-BR, e o que não misturar com cores de status de PR.

## Antes de validar dados (API, env, JSON externo)

1. **[docs/zod-validation.md](docs/zod-validation.md)** — usar **Zod** para query params, body JSON, respostas de terceiros e cache; ver quando é opcional e como nomear arquivos (vs. `schema.ts` do Drizzle).

Implementação dos tokens: `app/globals.css` (`.dark`).

## Antes de rodar testes, lint ou typecheck

1. **[docs/testing.md](docs/testing.md)** — rodar testes **só** via `npm test -- <arquivo>` / `npm run test:related -- <arquivos>` (nunca `npx vitest`: falta a flag `--experimental-sqlite` e os testes de banco quebram). Antes de entregar: `npm run check`.
2. O `git commit` passa pelo pre-commit (husky + lint-staged: ESLint nos staged, `tsc` no projeto, testes relacionados). Não use `--no-verify`; se falhar, corrija e faça um commit novo.

## Stack

- Next.js (App Router), React, TypeScript
- Tailwind v4 + shadcn/ui (`components/ui/`)
- SQLite + Drizzle (Journal, Dashboard/briefing, cache Jira). Arquivo em `data/pr-flow.sqlite` (`DATABASE_URL=file:./data/pr-flow.sqlite`)
- PRs via GitHub CLI / `GH_TOKEN`

## Rotas principais

| Rota | Módulo |
|------|--------|
| `/dashboard` | Hub + férias + eventos do dia (iCal Google) + deck de atalhos + streak do journal + briefing (IA, horária) |
| `/prs` | Minhas pull requests (monitor completo) |
| `/prs/reviews` | PRs em que sou revisor + Revisor IA (agente local revisa a fila filtrada e reage ✅/💬 no anúncio do canal) |
| `/journal` | Notas markdown por dia |
| `/jira` | Tickets Jira atribuídos ao usuário |
| `/whiteboard` | Quadro (tldraw), salvo no IndexedDB do navegador; preset de cores em `modules/whiteboard/` |
| `/settings/*` | Configurações em abas: `alerts`, `crons` (forçar execução com confirmação manual), `repositories`, `local-docker` |
| `/api/mcp` | Servidor MCP (PRs + Slack) — ferramentas em `modules/mcp/lib/tools/` |

Redirect `/` → `/dashboard`.

Rodapé do sidebar: **Configurações** → abas Alertas, Crons, Repositórios, Ambiente local (`modules/settings/`; `/devtools/*` antigos redirecionam). Stack Jusfy local: `LOCAL_DOCKER_ROOT` + `JUSFY_ROOT` no `.env`; o app executa `docker compose` no host (requer CLI Docker acessível ao processo Node).

## Comandos

```bash
npm run dev           # http://localhost:3847 (host)
npm run docker:dev    # mesmo app no Docker com hot reload (sem rebuild)
npm run docker:up     # imagem de produção; ./data com UID do host
npm test                          # suíte inteira (~1 min); um arquivo: npm test -- tests/x.test.ts
npm run test:related -- <arquivos> # só testes afetados pelos arquivos
npm run lint                      # ESLint (eslint.config.mjs)
npm run typecheck                 # tsc --noEmit
npm run check                     # lint + typecheck + testes
npm run build
```

Ver `README.md` para `GH_TOKEN`, `GEMINI_API_KEY`, `JIRA_EMAIL`, `JIRA_TOKEN` e `GOOGLE_CALENDAR_ICAL_URL` (feed iCal secreto). Repositórios GitHub monitorados: cadastro em **Configurações → Repositórios** (tabela `monitored_repositories`); na primeira execução importa `MONITORED_REPOSITORIES` do `.env` se o banco estiver vazio. Crons: `modules/cron-scheduling/` (`startAllCrons` em `instrumentation.ts`). Jira sync 10 min (`DISABLE_JIRA_SYNC_CRON=1`). Briefing horário (`DISABLE_DASHBOARD_BRIEFING_CRON=1`). Revisor IA: `cron:pr-ai-review` a cada minuto, ciclo no intervalo configurado em `/prs/reviews` (`DISABLE_PR_AI_REVIEW_CRON=1`); módulo `modules/pr-ai-review/`.

## Convenções de código

- **Idioma:** código (identificadores, rotas, módulos, comentários, descrições de teste) em **inglês**; **pt-BR** só em UI e mensagens ao usuário. Copy pt-BR centralizado em `modules/messages/pt-BR.ts`. Prompts LLM permanecem pt-BR (saída do produto). Ver também `docs/design-system.md`.
- UI nova fora do módulo PRs: `Surface` + shadcn; não criar terceiro estilo de card. Ver `docs/shadcn-for-agents.md`.
- Dados não confiáveis (request, env, APIs externas, `sessionStorage`): validar com **Zod** quando possível. Ver `docs/zod-validation.md`.
- Não commitar `.env`.
- Testes: Vitest em `tests/`; atualizar se mudar labels pt-BR ou `aria-label`. Como rodar e escrever: `docs/testing.md`.

## tlc-spec-lean

mutations: 3
