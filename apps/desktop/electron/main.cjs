const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const { AgentManager } = require('./agent-manager.cjs');
const { SecureStore } = require('./secure-store.cjs');
const { RoleStore } = require('./role-store.cjs');
const { ModelStore } = require('./model-store.cjs');
const { testOpenAIConnection } = require('./provider-test.cjs');

const isDev = !app.isPackaged;
const appIcon = path.join(__dirname, 'Aivra.png');
let agentManager;

function sendToRenderers(channel, payload) {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload);
}

function requireString(value, name, max = 200_000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name} 参数无效`);
  return value;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 832,
    minWidth: 1024,
    minHeight: 680,
    title: 'Aivra',
    icon: appIcon,
    transparent: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 17 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setVibrancy('tooltip');

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      event.preventDefault();
      if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools();
      else win.webContents.openDevTools({ mode: 'detach' });
    }
  });

  if (isDev) win.loadURL('http://127.0.0.1:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  // macOS ignores BrowserWindow.icon, so set the Dock icon explicitly as well.
  if (process.platform === 'darwin') app.dock.setIcon(appIcon);

  const secureStore = new SecureStore(app);
  const modelStore = new ModelStore(app, secureStore);
  const roleStore = new RoleStore(app, modelStore);
  agentManager = new AgentManager({ app, getProviderConfigs: () => roleStore.providersForAgent() });
  agentManager.on('event', message => sendToRenderers('agent:event', message));
  agentManager.on('status', status => sendToRenderers('agent:status', status));
  agentManager.on('diagnostic', message => console.error(`[agent] ${message}`));

  ipcMain.handle('window:minimize', event => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.handle('window:maximize', event => { const win = BrowserWindow.fromWebContents(event.sender); if (win?.isMaximized()) win.unmaximize(); else win?.maximize(); });
  ipcMain.handle('window:close', event => BrowserWindow.fromWebContents(event.sender)?.close());
  ipcMain.handle('agent:status', async () => ({ ...agentManager.getStatus(), keyAvailable: await secureStore.hasApiKey() }));
  ipcMain.handle('agent:select-workspace', async event => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'], title: '选择 Aivra 工作区' });
    if (result.canceled || !result.filePaths[0]) return null;
    const response = await agentManager.request('workspace.select', { path: result.filePaths[0] });
    return response.payload.workspace;
  });
  ipcMain.handle('agent:list-threads', async (_event, workspaceId) => {
    const response = await agentManager.request('thread.list', workspaceId ? { workspaceId: requireString(workspaceId, 'workspaceId', 128) } : {});
    return response.payload.threads;
  });
  ipcMain.handle('agent:workspace-tree', async (_event, workspaceId) => {
    const response = await agentManager.request('workspace.tree', { workspaceId: requireString(workspaceId, 'workspaceId', 128) });
    return response.payload.tree;
  });
  ipcMain.handle('agent:usage-summary', async () => {
    const response = await agentManager.request('usage.summary', {});
    return response.payload.usage;
  });
  ipcMain.handle('agent:get-thread', async (_event, threadId) => {
    const response = await agentManager.request('thread.get', { threadId: requireString(threadId, 'threadId', 128) });
    return response.payload.thread;
  });
  ipcMain.handle('agent:create-run', async (_event, input) => {
    if (!input || typeof input !== 'object') throw new Error('任务参数无效');
    const payload = {
      workspaceId: requireString(input.workspaceId, 'workspaceId', 128),
      prompt: requireString(input.prompt, 'prompt'),
      mode: input.mode === 'chat' ? 'chat' : 'task',
      roleIds: Array.isArray(input.roleIds) ? input.roleIds.slice(0, 20).map((id, index) => requireString(id, `roleIds[${index}]`, 64)) : [requireString(input.roleId || 'aivra', 'roleId', 64)],
      approvalMode: ['request', 'auto', 'full'].includes(input.approvalMode) ? input.approvalMode : 'request',
      workflowName: typeof input.workflowName === 'string' ? input.workflowName.slice(0, 80) : '',
      documents: Array.isArray(input.documents) ? input.documents.slice(0, 100).map((item, index) => requireString(item, `documents[${index}]`, 1024)) : [],
    };
    if (input.threadId) payload.threadId = requireString(input.threadId, 'threadId', 128);
    const response = await agentManager.request('run.create', payload);
    return response.payload;
  });
  ipcMain.handle('agent:cancel-run', async (_event, runId) => {
    const response = await agentManager.request('run.cancel', { runId: requireString(runId, 'runId', 128) });
    return response.payload;
  });
  ipcMain.handle('agent:resolve-approval', async (_event, input) => {
    if (!input || typeof input.approved !== 'boolean') throw new Error('审批参数无效');
    const response = await agentManager.request('approval.resolve', {
      approvalId: requireString(input.approvalId, 'approvalId', 128), approved: input.approved,
    });
    return response.payload;
  });
  ipcMain.handle('models:list', () => modelStore.list());
  ipcMain.handle('models:create', async (_event, input) => {
    if (input?.apiKey && (typeof input.apiKey !== 'string' || input.apiKey.length > 512)) throw new Error('API Key 格式无效');
    const saved = await modelStore.create(input);
    await agentManager.restart();
    return saved;
  });
  ipcMain.handle('models:update', async (_event, input) => {
    if (input?.apiKey && (typeof input.apiKey !== 'string' || input.apiKey.length > 512)) throw new Error('API Key 格式无效');
    const saved = await modelStore.update(input);
    await agentManager.restart();
    return saved;
  });
  ipcMain.handle('models:test', async (_event, input) => {
    if (!input || typeof input !== 'object') throw new Error('测试参数无效');
    const saved = input.id ? await modelStore.provider(requireString(input.id, 'modelId', 128)) : null;
    const baseUrl = requireString(input.baseUrl || saved?.baseUrl, 'baseUrl', 500).replace(/\/$/, '');
    const model = requireString(input.model || saved?.model, 'model', 200);
    const apiKey = typeof input.apiKey === 'string' && input.apiKey.trim() ? input.apiKey.trim() : saved?.apiKey;
    if (!apiKey) throw new Error('请先填写或保存 API Key');
    return testOpenAIConnection({ baseUrl, model, apiKey });
  });
  ipcMain.handle('models:delete', async (_event, modelId) => {
    const id = requireString(modelId, 'modelId', 128);
    if (await roleStore.usesModel(id)) throw new Error('该模型正在被角色使用，请先为相关角色切换模型');
    const result = await modelStore.delete(id);
    await agentManager.restart();
    return result;
  });
  ipcMain.handle('roles:list', () => roleStore.list());
  ipcMain.handle('roles:save', async (_event, input) => {
    const saved = await roleStore.save(input);
    await agentManager.restart();
    return saved;
  });
  createWindow();
  agentManager.start();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

let quitInProgress = false;
app.on('before-quit', event => {
  if (!agentManager || quitInProgress) return;
  event.preventDefault();
  quitInProgress = true;
  app.isQuitting = true;
  agentManager.stop().finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
