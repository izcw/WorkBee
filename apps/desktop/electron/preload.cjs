const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aivraDesktop', {
  platform: process.platform,
  isDesktop: true,
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
  agent: {
    status: () => ipcRenderer.invoke('agent:status'),
    ensureReady: () => ipcRenderer.invoke('agent:ensure-ready'),
    selectWorkspace: () => ipcRenderer.invoke('agent:select-workspace'),
    openWorkspace: workspacePath => ipcRenderer.invoke('agent:open-workspace', workspacePath),
    executeCommand: input => ipcRenderer.invoke('agent:execute-command', input),
    createProject: () => ipcRenderer.invoke('agent:create-project'),
    listWorkspaces: () => ipcRenderer.invoke('agent:list-workspaces'),
    deleteWorkspace: workspaceId => ipcRenderer.invoke('agent:delete-workspace', workspaceId),
    renameWorkspace: input => ipcRenderer.invoke('agent:rename-workspace', input),
    listThreads: workspaceId => ipcRenderer.invoke('agent:list-threads', workspaceId),
    createThread: workspaceId => ipcRenderer.invoke('agent:create-thread', workspaceId),
    deleteThread: threadId => ipcRenderer.invoke('agent:delete-thread', threadId),
    workspaceTree: workspaceId => ipcRenderer.invoke('agent:workspace-tree', workspaceId),
    usageSummary: () => ipcRenderer.invoke('agent:usage-summary'),
    getThread: threadId => ipcRenderer.invoke('agent:get-thread', threadId),
    createRun: input => ipcRenderer.invoke('agent:create-run', input),
    cancelRun: runId => ipcRenderer.invoke('agent:cancel-run', runId),
    resolveApproval: input => ipcRenderer.invoke('agent:resolve-approval', input),
    onEvent: callback => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('agent:event', listener);
      return () => ipcRenderer.removeListener('agent:event', listener);
    },
    onStatus: callback => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('agent:status', listener);
      return () => ipcRenderer.removeListener('agent:status', listener);
    },
  },
  models: {
    list: () => ipcRenderer.invoke('models:list'),
    create: input => ipcRenderer.invoke('models:create', input),
    update: input => ipcRenderer.invoke('models:update', input),
    delete: modelId => ipcRenderer.invoke('models:delete', modelId),
    test: input => ipcRenderer.invoke('models:test', input),
  },
  roles: {
    list: () => ipcRenderer.invoke('roles:list'),
    save: input => ipcRenderer.invoke('roles:save', input),
  },
  plugins: {
    githubStatus: () => ipcRenderer.invoke('plugins:github-status'),
    openGithubTokenPage: () => ipcRenderer.invoke('plugins:github-open-token-page'),
    connectGithub: input => ipcRenderer.invoke('plugins:github-connect', input),
    disconnectGithub: () => ipcRenderer.invoke('plugins:github-disconnect'),
  },
});
