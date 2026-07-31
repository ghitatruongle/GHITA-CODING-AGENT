// ==============================================================================
// GHITA CODING AGENT — i18n Type Definitions
// ==============================================================================

/**
 * Canonical locale codes supported by the desktop app.
 * Adding a new language requires: a translation file under `apps/desktop/src/i18n/`,
 * an entry in the `translations` map in `context.tsx`, and an entry in
 * `LANGUAGE_OPTIONS` in `apps/desktop/src/views/SettingsView.tsx`.
 */
export type LocaleCode = 'vi' | 'en' | 'zh' | 'ru' | 'ja' | 'ko';

export const SUPPORTED_LOCALES: readonly LocaleCode[] = [
  'vi',
  'en',
  'zh',
  'ru',
  'ja',
  'ko',
] as const;

export const DEFAULT_LOCALE: LocaleCode = 'vi';

export function isLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export interface TranslationKeys {
  common: {
    save: string;
    cancel: string;
    remove: string;
    copy: string;
    enable: string;
    disable: string;
    active: string;
    off: string;
    running: string;
    connected: string;
    disconnected: string;
    error: string;
    loading: string;
    enabled: string;
    disabled: string;
    yes: string;
    no: string;
    clear: string;
    back: string;
    search: string;
    install: string;
    uninstall: string;
    add: string;
    delete: string;
    copied: string;
    run: string;
  };
  app: {
    brand: string;
    version: string;
    deviceReconnected: string;
    devicePaired: string;
    commandReceived: string;
    messageFromMobile: string;
    deviceApproved: string;
    deviceRejected: string;
    deviceDisconnected: string;
  };
  tabBar: {
    code: string;
    api: string;
    skills: string;
    agents: string;
    devices: string;
    dashboard: string;
    monitoring: string;
    quota: string;
    codeGraph: string;
    marketplace: string;
    workflow: string;
    ecosystem: string;
    settings: string;
  };
  mainLayout: {
    terminal: string;
    chat: string;
    viewError: string;
    retry: string;
    listening: string;
    noDevices: string;
    unknown: string;
    devices: string;
  };
  settings: {
    title: string;
    subtitle: string;
    appearance: string;
    theme: string;
    themeDesc: string;
    language: string;
    languageDesc: string;
    logging: string;
    logLevel: string;
    logLevelDesc: string;
    aiProviders: string;
    apiKeys: string;
    apiKeysDesc: string;
    openApiManager: string;
    mcpServers: string;
    mcpServersDesc: string;
    hooks: string;
    hooksDesc: string;
    info: string;
    version: string;
    platform: string;
    platformDesc: string;
    windows: string;
    linux: string;
    themeDark: string;
    themeLight: string;
    logDebug: string;
    logInfo: string;
    logWarn: string;
    logError: string;
    mcpNamePlaceholder: string;
    mcpCommandPlaceholder: string;
    hookToolPlaceholder: string;
    hookCommandPlaceholder: string;
  };
  codeView: {
    fileSaved: string;
    saveFailed: string;
    filesSaved: string;
    modified: string;
    unsaved: string;
    shortcuts: string;
    loadingEditor: string;
    openFileHint: string;
    shortcutSave: string;
    shortcutClose: string;
    shortcutSaveAll: string;
    unsavedChangesConfirm: string;
    binaryNotSupported: string;
    readFailed: string;
    aiProposedEdit: string;
    accept: string;
    reject: string;
    editApplied: string;
    editRejected: string;
  };
  devices: {
    title: string;
    subtitle: string;
    communicationServer: string;
    statusRunning: string;
    statusError: string;
    statusOff: string;
    uptime: string;
    starting: string;
    stopServer: string;
    startServer: string;
    ipAddress: string;
    port: string;
    hostname: string;
    searching: string;
    otherIps: string;
    connectionAddress: string;
    pairingCode: string;
    expiresAfter: string;
    pairingInstructions: string;
    bluetoothConnection: string;
    bluetoothGuide: string;
    bluetoothHostname: string;
    bluetoothHint: string;
    connectedDevices: string;
    lastSeen: string;
    unpair: string;
    connectionGuide: string;
    guideStep1: string;
    guideStep2: string;
    guideStep3: string;
    guideStep4: string;
    guideStep5: string;
    lanEnabled: string;
    lanEnabledDesc: string;
  };
  dashboard: {
    title: string;
    subtitle: string;
    totalTokens: string;
    totalCost: string;
    activeAgents: string;
    mcpConnections: string;
    contextUsed: string;
    serverAndDevices: string;
    socketServer: string;
    connectedDevices: string;
    listening: string;
    error: string;
    offline: string;
    online: string;
    mcpServers: string;
    mcpEmpty: string;
    hooks: string;
    hooksEmpty: string;
    contextWindow: string;
    tokenUsage: string;
    contextWarning: string;
    contextRemaining: string;
    modelContextProtocol: string;
    ralphLoopSession: string;
    explorePlanUI: string;
  };
  marketplace: {
    title: string;
    subtitle: string;
    installedBadge: string;
    searchPlaceholder: string;
    filterAll: string;
    filterCode: string;
    filterBundle: string;
    filterInstalled: string;
    emptyTitle: string;
    emptyHint: string;
    author: string;
    permissions: string;
    activated: string;
    deactivated: string;
    version: string;
    downloads: string;
    rating: string;
    update: string;
    updateAvailable: string;
    sortBy: string;
    sortByDownloads: string;
    sortByRating: string;
    sortByNewest: string;
    plugin_ghita_github_assistant_desc: string;
    plugin_ghita_docker_orchestrator_desc: string;
    skill_docker_list_desc: string;
    plugin_ghita_vercel_deployer_desc: string;
    plugin_ghita_db_client_desc: string;
    skill_db_query_desc: string;
    plugin_ghita_jira_connector_desc: string;
    plugin_ghita_vision_grounding_extra_desc: string;
  };
  workflow: {
    dragNodes: string;
    dragNodesDesc: string;
    startTrigger: string;
    runCommand: string;
    callMcpTool: string;
    conditionalCheck: string;
    repeatLoop: string;
    endNode: string;
    resetDemo: string;
    clearCanvas: string;
    visualCanvas: string;
    doubleClickHint: string;
    activeSteps: string;
    connections: string;
    configPanel: string;
    stepTitle: string;
    tip: string;
    selectNodeHint: string;
    compiledJson: string;
    startPipeline: string;
    runUnitTests: string;
    testsPassed: string;
    deployVercel: string;
    triggerAutoFix: string;
  };
  ecosystem: {
    title: string;
    subtitle: string;
    grpcDaemon: string;
    grpcDesc: string;
    serverPort: string;
    daemonConsole: string;
    startDaemon: string;
    stopDaemon: string;
    agentProtocol: string;
    agentProtocolDesc: string;
    apiPort: string;
    requestsMonitor: string;
    noRequestLogs: string;
    enableAp: string;
    disableAp: string;
    dynamicRouter: string;
    dynamicRouterDesc: string;
    maxCostPerTask: string;
    complexityRouting: string;
    automaticRouting: string;
    forcedLowCost: string;
    forcedHighQuality: string;
    autoOptimize: string;
    provider: string;
    modelName: string;
    mappedComplexity: string;
    costPer1k: string;
    avgLatency: string;
    routingState: string;
    running: string;
    stopped: string;
    compliant: string;
    disabledLabel: string;
    demoMode: string;
  };
  chat: {
    welcomeMessage: string;
    notConnected: string;
    notConnectedHint: string;
    noProvider: string;
    noProviderHint: string;
    systemError: string;
    connecting: string;
    reconnect: string;
    searchModel: string;
    noModelFound: string;
    advanced: string;
    agentRole: string;
    workflows: string;
    ralphRunning: string;
    attachedImage: string;
    approveTool: string;
    toolName: string;
    parameters: string;
    warning: string;
    reject: string;
    approve: string;
    placeholderConnected: string;
    placeholderNoApi: string;
    placeholderConnecting: string;
    placeholderDisconnected: string;
    compactContext: string;
    clearChat: string;
    help: string;
    codeReview: string;
    featureDev: string;
    deployCheck: string;
    summary: string;
    systemPrompt: string;
    openclawEngine: string;
    skillLearned: string;
    runningAutomation: string;
    noConfig: string;
    description: string;
    skillSaved: string;
    attachImage: string;
    chatHistory: string;
    newChat: string;
    deleteChat: string;
    backToChat: string;
    noHistory: string;
    runningCmd: string;
    runSuccessNoOutput: string;
    runErrorExitCode: string;
    runSuccess: string;
    runError: string;
    messagesCount: string;
    compactSuccess: string;
    noWorkspace: string;
    permissionCustom: string;
    permissionAuto: string;
    liveAgentEvents: string;
    clear: string;
  };
  terminal: {
    title: string;
    shellSwitchHint: string;
    running: string;
    placeholder: string;
    failedToExecute: string;
    permissionHint: string;
    pathNotFound: string;
  };
  errorFallback: {
    title: string;
    retry: string;
  };
  fileExplorer: {
    explorer: string;
    openFolder: string;
    newFile: string;
    newFolder: string;
    noFolderOpen: string;
    openFolderButton: string;
    loading: string;
    emptyFolder: string;
    newFilePrompt: string;
    newFolderPrompt: string;
    deleteConfirm: string;
    delete: string;
    rename: string;
    renamePrompt: string;
    renameInvalid: string;
  };
  apiManager: {
    title: string;
    activeProviders: string;
    addKeyHint: string;
    searchPlaceholder: string;
    favorites: string;
    freeLocal: string;
    paid: string;
    custom: string;
    active: string;
    ready: string;
    notSet: string;
    model: string;
    deleteKey: string;
    save: string;
    removeFavorite: string;
    addFavorite: string;
    fetchModels: string;
    selectModel: string;
    noKeyNeeded: string;
    enterApiKey: string;
    apiKey: string;
    baseUrl: string;
    hide: string;
    show: string;
    fetch: string;
    // Phase 1.1: Multi-key
    addKey: string;
    removeKey: string;
    keyStrategy: string;
    strategyRoundRobin: string;
    strategyFailover: string;
    strategyRandom: string;
    keysCount: string;
    keyHealth: string;
    keyHealthy: string;
    keyCoolingDown: string;
    keyDisabled: string;
  };
  skillManager: {
    title: string;
    subtitle: string;
    enabledSkills: string;
    testRun: string;
    running: string;
  };
  agentGroups: {
    title: string;
    subtitle: string;
    registeredAgents: string;
    runGroupTask: string;
    runningGroup: string;
    skillsCount: string;
  };
  codeEditor: {
    loading: string;
  };
  // v0.7.0 — Command Palette
  commandPalette: {
    title: string;
    searchPlaceholder: string;
    searchLabel: string;
    resultsLabel: string;
    noResults: string;
    navCode: string;
    navApi: string;
    navSkills: string;
    navAgents: string;
    navDashboard: string;
    navSettings: string;
    terminalOpen: string;
    terminalClose: string;
    chatOpen: string;
    chatClose: string;
    sidebarToggle: string;
    searchFiles: string;
  };
  // v0.7.0 — Activity Bar
  activityBar: {
    label: string;
    code: string;
    search: string;
    sourceControl: string;
    debug: string;
    extensions: string;
    settings: string;
  };
  // v0.7.0 — Editor
  editor: {
    find: string;
    replace: string;
    goToLine: string;
    wordWrap: string;
    wordWrapToggle: string;
    minimap: string;
    minimapToggle: string;
    lineNumbers: string;
    lineNumbersToggle: string;
    fontSize: string;
    tabSize: string;
    indentUsingSpaces: string;
    indentUsingTabs: string;
    formatDocument: string;
    copyLineUp: string;
    copyLineDown: string;
    deleteLine: string;
    moveLineUp: string;
    moveLineDown: string;
    toggleComment: string;
    blockComment: string;
    lineComment: string;
    editorConfig: string;
  };
  // v0.7.0 — Welcome
  welcome: {
    title: string;
    subtitle: string;
    openFolder: string;
    recentWorkspaces: string;
    noRecentWorkspaces: string;
    tips: string;
    shortcuts: string;
    shortcutOpenFolder: string;
    shortcutCommandPalette: string;
    shortcutToggleTerminal: string;
    shortcutToggleChat: string;
    shortcutSaveFile: string;
    learnMore: string;
  };
  docsGriller: {
    title: string;
    scanDocs: string;
    scanning: string;
    scanPrompt: string;
    supportedFormats: string;
    docsScanned: string;
    contradictions: string;
    questions: string;
    contradictionsFound: string;
    older: string;
    newer: string;
    socraticQuestions: string;
    sources: string;
    designDecisions: string;
    allConsistent: string;
  };
  sandbox: {
    loadingStatus: string;
    notReadyTitle: string;
    retry: string;
    title: string;
    containers: string;
    totalCpu: string;
    totalRam: string;
    networkIo: string;
    noContainers: string;
    noContainersDesc: string;
  };
  // Phase 7: Notification System (Q3 2026)
  notification: {
    ariaLabel: string;
    title: string;
    empty: string;
    unread: string;
    unreadBadge: string;
    dismiss: string;
  };
  // Phase 8: Voice I/O (Q3 2026)
  voice: {
    start: string;
    stop: string;
    listening: string;
    unsupported: string;
    unsupportedHint: string;
  };
  // Phase 9: Monitoring Dashboard (Q3 2026)
  monitoring: {
    title: string;
    loading: string;
    totalErrors: string;
    errorGroups: string;
    alertRules: string;
    telemetryEvents: string;
    recentErrors: string;
    recentTelemetry: string;
    noErrors: string;
    noTelemetry: string;
    severityCritical: string;
    severityError: string;
    severityWarning: string;
    severityInfo: string;
    errorLoadFailed: string;
    buildDuration: string;
    occurrences: string;
    lastSeen: string;
    refresh: string;
  };
  // Phase 10: Quota & Rate Limiting (Q3 2026)
  quota: {
    title: string;
    loading: string;
    monthlyBudget: string;
    spent: string;
    cap: string;
    remaining: string;
    activeRateLimits: string;
    noRateLimits: string;
    usageByModel: string;
    recentUsage: string;
    noUsage24h: string;
    noRecentUsage: string;
    period: string;
    totalRequests: string;
    totalTokens: string;
    totalCost: string;
    noUsage: string;
    rateLimitRequests: string;
    perWindow: string;
    refresh: string;
    budgetUsage: string;
  };
  // Phase 11: Code Knowledge Graph (Q3 2026)
  codeGraph: {
    title: string;
    workspacePath: string;
    workspacePathPlaceholder: string;
    build: string;
    building: string;
    cancel: string;
    empty: string;
    filterPlaceholder: string;
    filterAriaLabel: string;
    noWorkspacePath: string;
    errorEnterPath: string;
    errorBuildFailed: string;
    columnName: string;
    columnKind: string;
    columnFile: string;
    columnLine: string;
    showingNofM: string;
    type: string;
    count: string;
    lastSeen: string;
    lastUpdated: string;
  };
}
