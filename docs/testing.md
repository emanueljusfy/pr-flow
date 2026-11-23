# Testes, lint e typecheck

Como rodar as verificações deste repo sem cair nas armadilhas conhecidas. Vale para pessoas e agentes.

## Regra de ouro: sempre pelos scripts npm

Rode testes **só** por `npm test` / `npm run test:related`. **Nunca** `npx vitest` ou `vitest` direto.

Motivo: o SQLite vem do `node:sqlite`, que no Node 22 exige `NODE_OPTIONS=--experimental-sqlite`. Os scripts npm já passam a flag; o `npx vitest` não, e os testes de banco quebram com:

```
SQLite do Node está desligado. Use Node 22 e NODE_OPTIONS=--experimental-sqlite
```

Se aparecer esse erro, o teste não está quebrado: o comando é que está errado.

## Comandos

| Objetivo | Comando |
|----------|---------|
| Um arquivo de teste | `npm test -- tests/gh-client.test.ts` |
| Vários arquivos | `npm test -- tests/a.test.ts tests/b.test.tsx` |
| Filtrar por nome do teste | `npm test -- tests/a.test.ts -t "parte do nome"` |
| Testes afetados por arquivos de código | `npm run test:related -- modules/prs/lib/gh-client.ts` |
| Suíte inteira (~1 min) | `npm test` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Tudo (lint + tsc + testes) | `npm run check` |

Note o `--` antes dos argumentos: sem ele o npm engole os parâmetros.

## Fluxo recomendado para agentes

1. Durante a mudança: rode só o teste do arquivo que você mexeu (`npm test -- tests/<arquivo>`) ou `npm run test:related -- <arquivos alterados>`.
2. Antes de entregar ou abrir PR: `npm run check`.
3. Ao reportar, cole o resumo real (`Test Files … / Tests …`). Se algo falhou e não é seu, diga isso explicitamente com o nome do teste; não declare "tudo verde".

## Pre-commit (husky + lint-staged)

`git commit` roda `.husky/pre-commit` → `lint-staged` (config em `lint-staged.config.mjs`), que, quando há arquivos de código staged:

1. `eslint` nos arquivos staged;
2. `npm run typecheck` (projeto todo; erro de tipo pode aparecer em arquivo não tocado);
3. `npm run test:related` com os arquivos staged (Vitest segue o grafo de imports).

Regras:

- **Não use `git commit --no-verify`** para passar por cima de falha. Corrija a causa.
- Se o hook falhar, o commit **não** aconteceu: corrija, `git add` de novo e crie o commit (não use `--amend`, que alteraria o commit anterior).
- Os hooks são instalados pelo `npm install` (script `prepare` → `husky`). Em worktree nova, rode `npm install` / `npm ci` antes do primeiro commit.

## Lint

ESLint 9 (flat config, `eslint.config.mjs`) com `eslint-config-next` (core-web-vitals + typescript). Não existe mais `next lint`; use `npm run lint`.

`react-hooks/set-state-in-effect` e `react-hooks/refs` estão como **warning** porque há dívida antiga em componentes. Não crie ocorrências novas; ao mexer num componente que já tem o aviso, prefira corrigir.

## Escrevendo testes

- Ficam em `tests/` (Vitest, `jsdom`, `globals: true`, alias `@/` → raiz). Setup em `vitest.setup.ts` (jest-dom, `matchMedia` mockado, `vi.useRealTimers()` após cada teste).
- Descrições de teste em inglês; textos de UI esperados em pt-BR.
- Consulte a UI por papel e nome acessível (`getByRole("button", { name: "…" })`). Se mudar copy em `modules/messages/pt-BR.ts` ou um `aria-label`, atualize os testes que buscam esse texto.
- Componentes que usam providers: `tests/render-with-providers.tsx`.
- **Banco:** nunca use `data/pr-flow.sqlite`. Aponte `DATABASE_URL` para um arquivo temporário e feche a conexão no fim; o helper `tests/pr-ai-review-test-db.ts` (`withAiReviewTestDb`) faz isso. Restaure o `DATABASE_URL` anterior.
- Rede, `gh` e APIs externas (GitHub, Jira, Gemini, Slack) são mockados; teste não deve depender de `.env`.
