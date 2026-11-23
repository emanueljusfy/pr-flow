# PR Flow — Design System

Especificação visual para manter consistência entre módulos (PRs, Journal, Dashboard, Jira).
**Implementação canônica dos tokens:** `app/globals.css` (bloco `.dark`). Este documento descreve intenção e uso; em caso de divergência, confiar no CSS e atualizar este arquivo.

## Direção

- **Produto:** cockpit local para dev — monitor de PRs + produtividade pessoal (journal, briefing IA).
- **Tom:** escuro flat estilo Herdr / IDE — near-black, hairline borders, profundidade por tipografia e panes inset, **sem** glow, glass ou gradientes de marca no chrome.
- **Tema:** apenas **dark** (`<html class="dark">` em `app/layout.tsx`).
- **Idioma da UI:** **pt-BR** (labels, aria-labels, mensagens). Evitar misturar EN (“Open Tasks”, “Create”, etc.).

## Chrome (shell)

- Fundo externo: `--app-bg-top` (`#0d0d0d`).
- Sidebar: `variant="inset"` — quieta, labels de seção em uppercase muted.
- Item ativo na nav: pill cinza (`#1f1f1f`), **sem** filamento laranja.
- Main: `SidebarInset` elevado (`--app-surface`), borda hairline, cantos ~12px.
- Avatar do usuário: círculo com inicial (estilo Spaces do Herdr).
- Acento ember só em CTAs, badge de contagem e marca “Flow” no header.

## Marca e acento

Cor de marca: **laranja ember** — quente, usada com parcimônia (ação/marca), distinta de status semânticos das PRs.

| Token | Valor | Uso |
|-------|--------|-----|
| `--brand` | `#f07832` | CTAs, primário shadcn, badges, spinners |
| `--brand-bright` | `#ff9a5c` | Hover, stats do hub, ícones de destaque |
| `--brand-dim` | `rgba(240, 120, 50, 0.12)` | Fundos sutis (seleção de PR, etc.) |
| `--brand-border` | `rgba(240, 120, 50, 0.36)` | Bordas de acento |
| `--brand-foreground` | `#1a0e06` | Texto sobre botão laranja sólido |
| `--app-link` | `#ffc18a` | Links em prose/markdown |
| `--app-accent` | `var(--brand-bright)` | Destaques de texto (stats, etc.) |

**Não usar laranja** para status de PR (approved / pending / changes) — esses têm paleta própria em `.pr-card`, `.status-pill`, filamento lateral do card. **Não** usar laranja no item ativo da sidebar.

## Superfície e texto (app)

| Token | Uso |
|-------|--------|
| `--app-bg-top` / `--app-bg-bottom` | Fundo flat do `body` (mesmo valor) |
| `--app-surface` | Main inset / painel elevado |
| `--app-surface-raised` | `.panel`, cards |
| `--app-surface-inset` | Áreas recuadas (`.panel-inset`) |
| `--app-border` | Bordas hairline (`#2a2a2a`) |
| `--app-border-strong` | Inputs, bordas internas |
| `--app-text` | Texto principal |
| `--app-text-muted` | Subtítulos, labels de seção |

`--app-glow` permanece no CSS como `transparent` (legado); não reintroduzir glows no chrome.

## Tipografia

- **Fonte:** Geist via `next/font` → `--font-sans` (`app/layout.tsx`).
- **Não** reintroduzir Inter/Arial no `body`.
- Títulos de página: `PageHeader` (`text-xl font-semibold`) — descrição opcional via `HelpHint` (ícone + tooltip), não parágrafo sob o título.
- Texto explicativo de widget/seção: `HelpHint`; empty states, contagens e erros permanecem visíveis.
- Widgets compactos do dashboard (férias, streak): `p-3`, badge `size-8`, métrica em `--brand-bright`, ação sempre visível na linha do título (`Button` `outline` `sm`) — sem CTA extra abaixo e sem revelar só no hover.
- Widgets em painel (calendário, deck, briefing): um `Surface` com `p-4`, badge `size-9`, título `text-sm font-semibold` + `HelpHint`, ação de header em `outline` `sm`.
- Hub: título + métrica, sem parágrafo descritivo; seta de navegação sempre visível (só muda cor no hover).
- Seções em cards PR: sentence case (`Quem já revisou`), **sem** ALL CAPS agressivo.

## Componentes

### `Surface` (`components/ui/surface.tsx`)

Wrapper padrão para blocos de conteúdo:

| Variant | Classe | Quando usar |
|---------|--------|-------------|
| `default` | `.panel` | Cards, editor Journal, briefing IA |
| `inset` | `.panel-inset` | Itens internos, textarea, listas |
| `dashed` | `.panel-dashed` | Empty states |

`.panel`: fill sólido (`--app-surface-raised`), borda hairline, **sem** blur/glass e **sem** barra de marca à esquerda. Status de domínio (PR/Jira) usa filamento de 2px na borda esquerda.

**Journal / Dashboard / Jira:** usar `Surface` + shadcn (`Button`, `Input`, `Dialog`).

**Módulo PRs:** mantém classes legadas `.panel`, `.pr-card`, `.button` em `globals.css` (já alinhadas aos tokens de marca).

### shadcn / Tailwind

**Agentes de IA:** leia [shadcn-for-agents.md](shadcn-for-agents.md) antes de criar botões, inputs, modais ou estilos novos.

- Botão primário: `Button` `variant="default"` → `--primary` (laranja).
- Outline/ghost para ações secundárias.
- Preferir `text-[var(--app-text)]`, `text-[var(--app-text-muted)]`, `text-[var(--brand)]` em layouts custom; `text-primary` onde shadcn já integra.

### Layout

- Conteúdo de rota: `app-shell` + `PageHeader` (`app/(shell)/*/page.tsx`).
- Hub inicial: `/dashboard` (`DashboardHub` + `DashboardBriefingWidget`).
- Shell: sidebar inset + main arredondado; header fino com “PR **Flow**” (`Flow` em `text-[var(--brand)]`).

## Cores semânticas (somente PRs)

Não reutilizar para marca global:

| Estado | Indicador |
|--------|-----------|
| Aprovada / pronta | Verde (`status-approved`, filamento `#2ecf78`) |
| Pendente, alterações, conflitos, sem reviewers | Vermelho (`status-changes`, filamento `#e25560`) |

## Motion

- Entrada da grid de PRs: `panel-in` em `.cards-grid > .panel` (stagger leve).
- Respeitar `prefers-reduced-motion` (já em weather rotator e grid).
- Microinterações pontuais (busca expansível, peek do card) — evitar animação excessiva em listas densas.

## Checklist para novas telas

1. Envolver seções em `Surface`, não `border border-border` cru.
2. Copy e `aria-label` em pt-BR.
3. Acento laranja só para **ação/marca**; status de domínio com tokens semânticos; nav ativa em cinza.
4. Reutilizar `PageHeader` na rota.
5. Após alterar tokens, sincronizar `app/globals.css` e este doc.
6. Evitar glow, glass (`backdrop-filter`) e gradientes no chrome.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---------|------------------|
| `app/globals.css` | Tokens, `.panel`, PR legacy, sidebar active |
| `app/layout.tsx` | Geist, `dark`, Toaster |
| `app/(shell)/layout.tsx` | Shell inset + header |
| `components/ui/surface.tsx` | Superfícies reutilizáveis |
| `components/layout/page-header.tsx` | Título + descrição de rota |
| `components/layout/app-sidebar.tsx` | Nav + clima + avatar |
| `modules/prs/**` | UI densa de PR (custom CSS) |
| `modules/{journal,dashboard,jira}/**` | shadcn + Surface |

---

*Última revisão: 2026-11-19 — chrome flat estilo Herdr (near-black, inset shell).*
