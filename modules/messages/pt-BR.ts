/** User-facing copy in pt-BR. Code identifiers stay English; import from here at UI/API edges. */

export const ptBR = {
  helpHint: {
    ariaLabel: "Mais informações"
  },
  briefing: {
    widgetTitle: "Briefing do dia",
    widgetHelp:
      "Mapa de batalha do dia: fechamento de ontem, desbloqueios urgentes e foco de ataque. Atualizado automaticamente a cada hora.",
    refresh: "Atualizar",
    refreshAriaLabel: "Atualizar briefing",
    dayMeta: (day: string, previousBusinessDay: string | null) =>
      previousBusinessDay
        ? `Hoje: ${day} · Último dia útil: ${previousBusinessDay}`
        : `Hoje: ${day}`,
    waiting:
      "O briefing ainda não foi gerado nesta hora. A rotina automática roda a cada hora; você também pode forçar em Devtools → Crons (Dash — briefing).",
    loading: "Carregando briefing…",
    missingApiKeyHint:
      "Adicione GEMINI_API_KEY no .env e reinicie o app.",
    rateLimitLink: "Gerenciar limite no Google AI Studio",
    updatedAt: (when: string) =>
      `Atualizado em ${when} · próxima rotina em até 1 hora`,
    missingApiKey: "Configure GEMINI_API_KEY no .env para gerar o briefing do dash.",
    invalidDate: "Data inválida. Use o formato YYYY-MM-DD.",
    generationFailed: "Falha ao gerar briefing do dash."
  },
  quickNote: {
    title: "Nota rápida",
    description:
      "Salva no caderno de hoje. Ctrl+Enter para salvar.",
    placeholder: "Digite sua nota rápida...",
    textAriaLabel: "Texto da nota rápida",
    savedJournal: "Salvo no caderno de hoje.",
    saveError: "Não foi possível salvar a nota rápida."
  },
  gemini: {
    rateLimit:
      "O limite de uso da API Gemini foi atingido (cota mensal ou muitas requisições). O briefing automático volta quando a cota for liberada. Para ajustar o limite, acesse o Google AI Studio.",
    unavailable:
      "Os modelos de IA estão temporariamente indisponíveis (alta demanda no Google). O app já tentou modelos alternativos automaticamente — aguarde alguns minutos e tente novamente."
  },
  jiraBranch: {
    missingApiKeyHint: "IA indisponível — informe o slug manualmente.",
    createSuccess: "Branch criada no GitHub.",
    createPartial: (count: number) => `Branch criada em ${count} repositório(s).`,
    createNone: "Nenhuma branch nova foi criada."
  },
  cron: {
    manualConfirmation: "Confirmo execução manual deste cron no PR Flow."
  },
  vacation: {
    setupTitle: "Quando começam as férias?",
    setupDescription:
      "Informe a data de início para acompanhar a contagem no dashboard e na barra lateral.",
    editTitle: "Alterar data das férias",
    editDescription: "A contagem usa o dia de início das férias no fuso local.",
    dateLabel: "Data de início",
    datePlaceholder: "Selecionar data",
    save: "Salvar",
    skip: "Configurar depois",
    cancel: "Cancelar",
    configure: "Configurar",
    edit: "Alterar",
    widgetTitle: "Férias",
    widgetEmpty: "Defina a data de início para ver a contagem regressiva.",
    sidebarEyebrow: "Férias",
    sidebarUnit: "dias",
    sidebarToday: "Hoje",
    sidebarOngoing: "Já!",
    today: "As férias começam hoje!",
    ongoing: "Você já está de férias.",
    daysRemaining: (days: number) =>
      days === 1 ? "Falta 1 dia para as férias." : `Faltam ${days} dias para as férias.`
  },
  dayCalendar: {
    widgetTitle: "Eventos do dia",
    widgetHelp: "Compromissos de hoje do Google Calendar (feed iCal secreto).",
    noEvents: "Agenda livre por agora.",
    loading: "Carregando agenda…",
    listAriaLabel: "Eventos de hoje",
    retry: "Tentar novamente",
    missingConfig:
      "Configure GOOGLE_CALENDAR_ICAL_URL no .env com o endereço secreto do iCal do Google Calendar.",
    invalidDate: "Data inválida. Use o formato YYYY-MM-DD.",
    loadFailed: "Não foi possível carregar os eventos do calendário."
  },
  shortcutDeck: {
    widgetTitle: "Deck de atalhos",
    widgetEmpty: "Adicione links rápidos para ferramentas do dia a dia.",
    widgetHelp: "Acesso rápido às ferramentas que você mais usa.",
    configure: "Configurar",
    manage: "Gerenciar",
    manageAriaLabel: "Gerenciar deck de atalhos",
    deckAriaLabel: "Atalhos configurados",
    listAriaLabel: "Lista de atalhos",
    manageTitle: "Deck de atalhos",
    manageDescription:
      "Configure links com ícone, cor e ordem. URLs externas abrem em nova aba.",
    emptyManage: "Nenhum atalho ainda. Adicione o primeiro.",
    addShortcut: "Adicionar atalho",
    addFormTitle: "Novo atalho",
    editFormTitle: "Editar atalho",
    labelField: "Nome",
    labelPlaceholder: "Ex.: Slack, Argo CD",
    urlField: "URL",
    urlPlaceholder: "https://… ou /rota-interna",
    iconField: "Ícone",
    colorField: "Cor",
    labelRequired: "Informe um nome.",
    urlInvalid: "Informe uma URL http(s) ou um caminho interno começando com /.",
    maxReached: (max: number) => `Limite de ${max} atalhos atingido.`,
    add: "Adicionar",
    save: "Salvar",
    cancel: "Cancelar",
    done: "Concluir",
    edit: "Editar atalho",
    remove: "Remover atalho",
    moveUp: "Mover para cima",
    moveDown: "Mover para baixo"
  },
  localReview: {
    summary: (count: number) =>
      count === 1 ? "Revisão local · 1 achado" : `Revisão local · ${count} achados`,
    running: "Revisão local em andamento",
    runningDetail: (started: string, elapsed: string) => `Começou às ${started} · há ${elapsed}`,
    queueRunning: (repository: string, prNumber: number) => `Revisando ${repository} #${prNumber}`,
    finished: (repository: string, prNumber: number, count: number) =>
      count === 1
        ? `Revisão de ${repository} #${prNumber} concluída · 1 achado`
        : `Revisão de ${repository} #${prNumber} concluída · ${count} achados`,
    finishedFailed: (repository: string, prNumber: number) =>
      `Revisão de ${repository} #${prNumber} terminou com falha`,
    cronRunning: "Pode levar vários minutos. O andamento e o término aparecem em Para revisar.",
    failed: "A última revisão local falhou",
    interrupted: "A revisão foi interrompida antes de terminar.",
    human: "A IA sugere. Você decide. Nada é aprovado nem rejeitado no GitHub.",
    queueHint: "Revise uma PR da fila agora, ou espere a próxima da cron. O andamento fica neste card.",
    modelTitle: "Modelo da revisão",
    modelDescription: "Vale para o orquestrador e para os subagentes.",
    modelHaiku: "Haiku",
    modelHaikuHint: "Mais barato. É o padrão da cron.",
    modelSonnet: "Sonnet",
    modelSonnetHint: "Mais capaz e gasta mais da cota.",
    modelOpus: "Opus",
    modelOpusHint: "O mais capaz. Use pouco.",
    modelStart: "Começar revisão",
    modelCancel: "Cancelar",
    usageHeading: "Uso",
    usageScope: "Orquestrador e subagentes",
    usageChosen: (model: string) => `Modelo escolhido: ${model}`,
    usageOrchestrator: "Orquestrador",
    usageSubagents: "Subagentes",
    usagePeakOrchestrator: (peak: string, window: string, percent: number) =>
      `Pico da janela do orquestrador ${peak} de ${window} (${percent}%)`,
    usagePeakSubagents: (peak: string, window: string, percent: number) =>
      `Pico da janela dos subagentes ${peak} de ${window} (${percent}%)`,
    usageInput: "Entrada",
    usageOutput: "Saída",
    usageCacheRead: "Cache lido",
    usageCacheCreate: "Cache criado",
    usageThinking: "Thinking",
    usagePeak: (peak: string, window: string, percent: number) =>
      `Pico da janela ${peak} de ${window} (${percent}%)`,
    usageWindow: (window: string) => `Janela de ${window}`,
    usageWindowUnknown: "O tamanho da janela não veio no resultado.",
    usageCost: (amount: string) => `Estimativa de lista ${amount}.`,
    usageCostNote: "A assinatura não cobra este valor por chamada.",
    trigger: "Revisar agora",
    retry: "Tentar de novo",
    again: "Revisar de novo",
    started: (repository: string, prNumber: number) => `Revisão de ${repository} #${prNumber} começou.`,
    busyOther: (repository: string, prNumber: number) =>
      `Já existe uma revisão em andamento em ${repository} #${prNumber}.`,
    already: "Esta revisão já está em andamento.",
    missing: "Essa PR não está entre as suas PRs abertas nem na fila para revisar.",
    closed: "Essa PR não está mais aberta.",
    triggerFailed: "Não foi possível começar a revisão.",
    clean: "Nenhum achado acima do limiar de confiança.",
    read: "Ler revisão",
    openOnGitHub: "Abrir no GitHub",
    missingPage: "Não há revisão local desta PR.",
    summaryHeading: "Resumo",
    findingsHeading: "Achados",
    notCommentedHeading: "O que não foi comentado",
    traceabilityHeading: "Entrega",
    metaHeading: "Meta-revisão",
    docsHeading: "Documentos lidos",
    droppedNone: "Nenhum achado descartado.",
    droppedHeading: "Descartados",
    confidence: (percent: number) => `${percent}% de confiança`,
    agentsHeading: "Subagentes",
    agentEmpty: "Nada acima do limiar.",
    noteLabel: "Parecer",
    agents: {
      correctness: "Correção",
      security: "Segurança",
      contracts: "Contratos",
      tests: "Testes",
      delivery: "Requisitos",
      conventions: "Convenções",
      "second-pass": "Segunda leitura",
      "meta-review": "Meta-revisão"
    },
    agentDescriptions: {
      correctness: "Lógica e bugs no diff.",
      security: "Segurança, dados e permissões.",
      contracts: "Contratos, tipos e assinaturas.",
      tests: "Testes e o que ficou sem cobertura.",
      delivery: "Jira, spec e o que a PR prometeu entregar.",
      conventions: "Regras escritas do repositório.",
      "second-pass": "Relê o diff e justifica o que ficou sem comentário.",
      "meta-review": "Confere o código e derruba achado que não existe."
    },
    traceStatus: {
      met: "Atendido",
      unmet: "Não atendido",
      unclear: "Incerto"
    }
  },
  journalDayDraft: {
    action: "Gerar anotações",
    actionAriaLabel: "Gerar anotações do dia",
    pending: "Gerando…",
    pendingAriaLabel: "Gerando anotações do dia",
    failed: "Não foi possível gerar as anotações do dia.",
    missingApiKey: "Configure GEMINI_API_KEY no .env para gerar as anotações do dia.",
    invalidDate: "Data inválida. Use o formato YYYY-MM-DD.",
    invalidJson: "JSON inválido.",
    noInput:
      "Não há anotação, ticket Jira movimentado nem atividade de PR neste dia para montar as anotações."
  },
  journalStreak: {
    widgetTitle: "Streak do journal",
    widgetEmpty: "Nenhum streak ainda — escreva no journal hoje.",
    streakLabel: (days: number) =>
      days === 1 ? "1 dia útil seguido" : `${days} dias úteis seguidos`,
    stripAriaLabel: "Dias úteis recentes com nota no journal",
    dayFilled: (day: string) => `${day}: com nota`,
    dayPending: (day: string) => `${day}: pendente`,
    dayEmpty: (day: string) => `${day}: sem nota`,
    openToday: "Abrir hoje",
    openTodayAriaLabel: "Abrir journal de hoje",
    openJournal: "Abrir",
    openJournalAriaLabel: "Abrir journal",
    loading: "Carregando streak…",
    loadFailed: "Não foi possível carregar o streak do journal.",
    retry: "Tentar novamente",
    calendarHasNote: "Dia com nota"
  },
  prReviewers: {
    sectionTitle: "Revisores",
    empty: "Ninguém revisou ainda",
    status: {
      approved: "Aprovou",
      changes_requested: "Pediu alterações",
      commented: "Comentou",
      pending: "Pendente",
      dismissed: "Dismissed"
    },
    statusAriaLabel: {
      approved: (login: string) => `${login}: aprovou`,
      changes_requested: (login: string) => `${login}: pediu alterações`,
      commented: (login: string) => `${login}: comentou`,
      pending: (login: string) => `${login}: revisão pendente`,
      dismissed: (login: string) => `${login}: aprovação invalidada`
    }
  },
  prViewMode: {
    groupAriaLabel: "Modo de exibição das PRs",
    cards: "Cards",
    compact: "Compacta",
    cardsAriaLabel: "Exibir PRs em cards",
    compactAriaLabel: "Exibir PRs em lista compacta",
    reviewersAriaLabel: "Revisores da PR",
    noReviewers: "Sem revisores"
  },
  prStacks: {
    title: "Stack",
    count: (n: number) => (n === 1 ? "1 PR" : `${n} PRs`),
    mergesInto: "merge em",
    stackBottom: "Base da stack",
    stackedOn: (parentNumber: number) => `empilha em #${parentNumber}`,
    groupAriaLabel: (count: number, baseRefName: string) =>
      baseRefName
        ? `Stack de ${count} PRs (merge em ${baseRefName})`
        : `Stack de ${count} PRs`
  },
  prHistory: {
    panelTitle: "Histórico da PR",
    emptySelection: "Selecione uma PR para ver o histórico.",
    loading: "Carregando histórico…",
    loadFailed: "Não foi possível carregar o histórico da PR.",
    retry: "Tentar novamente",
    closeAriaLabel: "Fechar histórico da PR",
    openOnGithub: "Abrir no GitHub",
    eventLinkAriaLabel: "Abrir evento no GitHub",
    timelineAriaLabel: "Linha do tempo da PR",
    refreshAriaLabel: "Atualizar histórico da PR",
    refreshingAriaLabel: "Atualizando histórico da PR",
    expandDetail: "Ver mais",
    collapseDetail: "Ver menos",
    opened: (actor: string) => `${actor} abriu a PR`,
    commented: (actor: string) => `${actor} comentou`,
    reviewApproved: (actor: string) => `${actor} aprovou`,
    reviewChanges: (actor: string) => `${actor} pediu alterações`,
    reviewCommented: (actor: string) => `${actor} comentou na revisão`,
    reviewSubmitted: (actor: string) => `${actor} enviou uma revisão`,
    commit: (actor: string) => `${actor} enviou um commit`,
    merged: (actor: string) => `${actor} fez merge`,
    closed: (actor: string) => `${actor} fechou a PR`,
    reopened: (actor: string) => `${actor} reabriu a PR`
  },
  reviewReminder: {
    ariaLabel: "Lembrar revisão na thread do Slack",
    tooltip: "Lembrar revisores pendentes no Slack",
    tooltipScheduled: (intervalLabel: string) =>
      `Lembrete agendado (${intervalLabel}). Clique para publicar de novo ou alterar.`,
    confirmTitle: "Publicar lembrete de revisão?",
    confirmDescription: (prNumber: number) =>
      `A mensagem marca quem ainda não revisou. Edite se quiser e publique na thread do Slack da PR #${prNumber}.`,
    messageLabel: "Mensagem do lembrete",
    frequencyLabel: "Repetir lembrete",
    frequencyNone: "Não repetir",
    frequencyOption: (hours: number) => (hours === 1 ? "A cada 1 hora" : `A cada ${hours} horas`),
    confirm: "Publicar lembrete",
    cancel: "Cancelar",
    cancelSchedule: "Cancelar agendamento",
    cancellingSchedule: "Cancelando…",
    sending: "Publicando…",
    success: "Lembrete publicado na thread do Slack.",
    successScheduled: (intervalLabel: string) =>
      `Lembrete publicado e agendado (${intervalLabel}).`,
    scheduleCancelled: "Agendamento de lembrete cancelado.",
    error: "Não foi possível publicar o lembrete de revisão.",
    cancelScheduleError: "Não foi possível cancelar o agendamento.",
    emptyMessage: "Escreva uma mensagem antes de publicar.",
    notShared: "Envie a PR ao Slack antes de publicar o lembrete na thread.",
    noPending: "Ninguém está pendente de revisão nesta PR."
  },
  notifications: {
    prefsTriggerLabel: "Alertas",
    prefsTriggerAriaLabel: "Configurar alertas",
    prefsTitle: "Alertas configuráveis",
    prefsPermissionGranted: "Notificações do navegador ativas.",
    prefsPermissionDenied: "Permissão negada — alertas aparecem como toast.",
    prefsPermissionDefault: "Permita notificações para alertas com o app em segundo plano.",
    allowBrowserNotifications: "Permitir notificações",
    savePreferences: "Salvar preferências",
    alertsSection: "Tipos de alerta",
    monitoringSection: "Monitoramento",
    pollEnabled: "Sync rápido no expediente",
    pollIntervalSeconds: "Intervalo (segundos)",
    workdayStartHour: "Início do expediente",
    workdayEndHour: "Fim do expediente",
    soundEnabled: "Alerta sonoro",
    staleDaysLabel: "Dias sem movimento",
    alertPrStatusChanged: "Status da minha PR mudou",
    alertReviewerQueueNew: "Nova PR na fila de revisão",
    alertPrApproved: "PR aprovada",
    alertPrChangesRequested: "Alterações solicitadas",
    alertPrStale: "PR parada há muitos dias",
    bellAriaLabel: (count: number) =>
      count === 0 ? "Alertas, nenhum não lido" : count === 1 ? "1 alerta não lido" : `${count} alertas não lidos`,
    inboxTitle: "Alertas recentes",
    inboxDescription: "Lista dos alertas recentes de PRs.",
    inboxEmpty: "Nenhum alerta recente.",
    markAllRead: "Marcar todas como lidas",
    clearAll: "Limpar tudo",
    markRead: "Marcar como lida",
    markUnread: "Marcar como não lida",
    removeItem: "Apagar alerta"
  },
  aiReview: {
    panelTitle: "Revisor IA",
    panelDescription:
      "Revisa com um agente local as PRs da sua fila que ainda faltam avaliar, uma por vez, e reage no anúncio da PR no canal.",
    enabledLabel: "Ligado",
    intervalLabel: "A cada",
    intervalOption: (minutes: number) =>
      minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`,
    agentLabel: "Agente",
    agentNotInstalled: "não instalado",
    authorsLabel: "Autores",
    authorsPlaceholder: "login1, login2 (vazio = qualquer autor)",
    repoPatternLabel: "Repositórios",
    repoPatternPlaceholder: "justracker-* (vazio = qualquer repo)",
    cwdLabel: "Diretório de trabalho",
    cwdPlaceholder: "/caminho/absoluto (vazio = diretório do app)",
    editPrompt: "Editar prompt",
    promptDialogTitle: "Prompt do Revisor IA",
    promptDialogDescription:
      "Usado em cada PR. Placeholders: {{pr_url}} (obrigatório), {{repository}}, {{number}}, {{title}}, {{author}}, {{head_sha}}.",
    promptResetDefault: "Restaurar padrão",
    save: "Salvar",
    cancel: "Cancelar",
    runNow: "Rodar agora",
    lastRun: (when: string, count: number) =>
      `Última execução: ${when} · ${count === 1 ? "1 PR revisada" : `${count} PRs revisadas`}`,
    noRunsYet: "Nenhuma execução ainda",
    nextRun: (when: string) => `Próxima: ${when}`,
    configSaved: "Revisor IA atualizado",
    configFailed: "Não foi possível salvar o Revisor IA.",
    loadFailed: "Não foi possível carregar o Revisor IA.",
    cycleStarted: (count: number) =>
      count === 1 ? "IA revisando 1 PR" : `IA revisando ${count} PRs`,
    nothingToReview: "Nenhuma PR para a IA revisar agora.",
    runFailed: "Não foi possível iniciar a revisão da IA.",
    conflict: "Já existe uma revisão da IA em andamento.",
    prNotInQueue: "A PR não está na sua fila de revisão.",
    reviewWithAi: "Revisar com IA",
    reviewWithAiAria: (label: string) => `Revisar ${label} com IA`,
    logsAria: (label: string) => `Ver revisões da IA de ${label}`,
    badgeRunning: "IA revisando…",
    badgeFailed: "IA: Falhou",
    badgeStale: "IA: desatualizada",
    badgeVerdict: {
      APPROVE: "IA: Aprovado",
      COMMENT: "IA: Comentou",
      REQUEST_CHANGES: "IA: Pediu mudanças"
    },
    verdictLabel: {
      APPROVE: "Aprovado",
      COMMENT: "Comentou",
      REQUEST_CHANGES: "Pediu mudanças"
    },
    noVerdict: "sem review postada",
    statusRunning: "Em execução",
    statusSucceeded: "Concluída",
    statusFailed: "Falhou",
    logsSheetTitle: (label: string) => `Revisões da IA — ${label}`,
    logsSheetDescription: "Execuções do agente nesta PR, mais recente primeiro.",
    logsEmpty: "Nenhuma revisão da IA para esta PR.",
    logsLoadFailed: "Não foi possível carregar as revisões.",
    logsStdoutLabel: "Saída padrão",
    logsStderrLabel: "Saída de erro",
    logsStdoutEmpty: "Sem saída padrão.",
    logsStderrEmpty: "Sem saída de erro.",
    logsCostUnknown: "Custo não informado",
    logsOpenReview: "Abrir review no GitHub",
    slackReaction: {
      reacted: "Reação adicionada no canal",
      already_reacted: "Reação já estava no canal",
      not_found: "Anúncio da PR não encontrado no canal",
      error: "Falha ao reagir no canal",
      skipped: "Slack não configurado"
    },
    alertStarted: (label: string) => `IA revisando ${label}`,
    alertStartedBody: "Revisão em andamento.",
    alertFinished: (label: string, outcome: string) => `IA terminou ${label}: ${outcome}`,
    alertFailed: (label: string) => `IA falhou em ${label}`
  }
} as const;

export const GEMINI_RATE_LIMIT_USER_MESSAGE = ptBR.gemini.rateLimit;
export const GEMINI_UNAVAILABLE_USER_MESSAGE = ptBR.gemini.unavailable;
export const CRON_MANUAL_CONFIRMATION_PHRASE = ptBR.cron.manualConfirmation;
