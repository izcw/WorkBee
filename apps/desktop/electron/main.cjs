const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { exec } = require('node:child_process');
const { promisify } = require('node:util');
const { AgentManager } = require('./agent-manager.cjs');
const { SecureStore } = require('./secure-store.cjs');
const { RoleStore } = require('./role-store.cjs');
const { ModelStore } = require('./model-store.cjs');
const { testOpenAIConnection } = require('./provider-test.cjs');
const execAsync = promisify(exec);

const isDev = !app.isPackaged;
const isMac = process.platform === 'darwin';
const appIcon = path.join(__dirname, 'Aivra.png');
let agentManager;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else app.on('second-instance', () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (window?.isMinimized()) window.restore();
  window?.focus();
});

function sendToRenderers(channel, payload) {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload);
}

function requireString(value, name, max = 200_000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name} 参数无效`);
  return value;
}

const GITHUB_MCP_URL = 'https://api.githubcopilot.com/mcp/';

async function verifyGithubMcp(token) {
  const response = await fetch(GITHUB_MCP_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'MCP-Protocol-Version': '2025-03-26',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'Aivra', version: '0.1.0' } } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(response.status === 401 ? 'GitHub PAT 无效，或尚未授予 MCP 访问权限' : `GitHub MCP 连接失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}`);
  }
  const payload = await response.text();
  if (!payload.includes('result') && !payload.includes('serverInfo')) throw new Error('GitHub MCP 未返回有效的初始化响应');
  return { serverUrl: GITHUB_MCP_URL };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 832,
    minWidth: 1024,
    minHeight: 680,
    title: 'Aivra',
    icon: appIcon,
    ...(isMac
      ? { transparent: true, titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 17 } }
      : { frame: false, backgroundColor: '#f7f7f7' }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isMac) win.setVibrancy('tooltip');
  else win.setMenuBarVisibility(false);

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

if (hasSingleInstanceLock) app.whenReady().then(() => {
  if (!isMac) Menu.setApplicationMenu(null);
  // macOS ignores BrowserWindow.icon, so set the Dock icon explicitly as well.
  if (process.platform === 'darwin') app.dock.setIcon(appIcon);

  const secureStore = new SecureStore(app);
  const modelStore = new ModelStore(app, secureStore);
  const roleStore = new RoleStore(app, modelStore);
  agentManager = new AgentManager({ app, getProviderConfigs: () => roleStore.providersForAgent(), getGithubMcpToken: () => secureStore.getApiKey('github-mcp-token') });
  agentManager.on('event', message => sendToRenderers('agent:event', message));
  agentManager.on('status', status => sendToRenderers('agent:status', status));
  agentManager.on('diagnostic', message => console.error(`[agent] ${message}`));

  ipcMain.handle('window:minimize', event => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.handle('window:maximize', event => { const win = BrowserWindow.fromWebContents(event.sender); if (win?.isMaximized()) win.unmaximize(); else win?.maximize(); });
  ipcMain.handle('window:close', event => BrowserWindow.fromWebContents(event.sender)?.close());
  ipcMain.handle('agent:status', async () => ({ ...agentManager.getStatus(), keyAvailable: await secureStore.hasApiKey() }));
  ipcMain.handle('agent:ensure-ready', async () => agentManager.ensureReady());
  ipcMain.handle('plugins:github-status', async () => ({ connected: await secureStore.hasApiKey('github-mcp-token'), serverUrl: GITHUB_MCP_URL }));
  ipcMain.handle('plugins:github-open-token-page', async () => {
    await shell.openExternal('https://github.com/settings/personal-access-tokens/new');
    return { opened: true };
  });
  ipcMain.handle('plugins:github-connect', async (_event, input) => {
    const token = requireString(input?.token, 'GitHub PAT', 500);
    const result = await verifyGithubMcp(token);
    await secureStore.setApiKey('github-mcp-token', token);
    await agentManager.restart();
    return { connected: true, ...result };
  });
  ipcMain.handle('plugins:github-disconnect', async () => {
    await secureStore.setApiKey('github-mcp-token', '');
    await agentManager.restart();
    return { connected: false };
  });
  ipcMain.handle('agent:select-workspace', async event => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'], title: '选择 Aivra 工作区' });
    if (result.canceled || !result.filePaths[0]) return null;
    const response = await agentManager.requestReady('workspace.select', { path: result.filePaths[0] });
    return response.payload.workspace;
  });
  ipcMain.handle('agent:open-workspace', async (_event, workspacePath) => {
    if (typeof workspacePath !== 'string' || !workspacePath.trim()) return;
    const error = await shell.openPath(workspacePath);
    if (error) throw new Error(error);
  });
  ipcMain.handle('agent:execute-command', async (_event, input) => {
    const command = typeof input?.command === 'string' ? input.command.trim() : '';
    if (!command || command.length > 2000) throw new Error('命令不能为空或过长');
    const cwd = typeof input?.cwd === 'string' && input.cwd.trim() ? input.cwd : app.getPath('home');
    try {
      const result = await execAsync(command, { cwd, timeout: 15000, maxBuffer: 512 * 1024, shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh' });
      return { stdout: result.stdout, stderr: result.stderr, code: 0 };
    } catch (error) {
      return { stdout: error.stdout || '', stderr: error.stderr || error.message, code: typeof error.code === 'number' ? error.code : 1 };
    }
  });
  ipcMain.handle('agent:create-project', async () => {
    const id = randomUUID();
    const projectPath = path.join(app.getPath('userData'), 'projects', id);
    await fs.mkdir(projectPath, { recursive: true });
    const response = await agentManager.requestReady('workspace.select', { path: projectPath, name: `新项目 ${new Date().toLocaleDateString('zh-CN')}` });
    return response.payload.workspace;
  });
  ipcMain.handle('agent:list-workspaces', async () => {
    const response = await agentManager.requestReady('workspace.list', {});
    return response.payload.workspaces;
  });
  ipcMain.handle('agent:delete-workspace', async (_event, workspaceId) => {
    const response = await agentManager.requestReady('workspace.delete', { workspaceId: requireString(workspaceId, 'workspaceId', 128) });
    return response.payload;
  });
  ipcMain.handle('agent:rename-workspace', async (_event, input) => {
    if (!input || typeof input !== 'object') throw new Error('项目标题参数无效');
    const response = await agentManager.requestReady('workspace.rename', {
      workspaceId: requireString(input.workspaceId, 'workspaceId', 128),
      name: requireString(input.name, 'name', 80).trim(),
    });
    return response.payload;
  });
  ipcMain.handle('agent:list-threads', async (_event, workspaceId) => {
    const response = await agentManager.requestReady('thread.list', workspaceId ? { workspaceId: requireString(workspaceId, 'workspaceId', 128) } : {});
    return response.payload.threads;
  });
  ipcMain.handle('agent:create-thread', async (_event, workspaceId) => {
    const response = await agentManager.requestReady('thread.create', { workspaceId: requireString(workspaceId, 'workspaceId', 128) });
    return response.payload;
  });
  ipcMain.handle('agent:delete-thread', async (_event, threadId) => {
    const response = await agentManager.requestReady('thread.delete', { threadId: requireString(threadId, 'threadId', 128) });
    return response.payload;
  });
  ipcMain.handle('agent:workspace-tree', async (_event, workspaceId) => {
    const response = await agentManager.requestReady('workspace.tree', { workspaceId: requireString(workspaceId, 'workspaceId', 128) });
    return response.payload.tree;
  });
  ipcMain.handle('agent:usage-summary', async () => {
    const response = await agentManager.requestReady('usage.summary', {});
    return response.payload.usage;
  });
  ipcMain.handle('agent:get-thread', async (_event, threadId) => {
    const response = await agentManager.requestReady('thread.get', { threadId: requireString(threadId, 'threadId', 128) });
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
    const response = await agentManager.requestReady('run.create', payload);
    return response.payload;
  });
  ipcMain.handle('agent:cancel-run', async (_event, runId) => {
    const response = await agentManager.requestReady('run.cancel', { runId: requireString(runId, 'runId', 128) });
    return response.payload;
  });
  ipcMain.handle('agent:resolve-approval', async (_event, input) => {
    if (!input || typeof input.approved !== 'boolean') throw new Error('审批参数无效');
    const response = await agentManager.requestReady('approval.resolve', {
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
  ipcMain.handle('roles:delete', async (_event, roleId) => {
    const result = await roleStore.delete(requireString(roleId, 'roleId', 128));
    if (result.deleted) await agentManager.restart();
    return result;
  });
  createWindow();
  agentManager.start().catch(error => console.error(`[agent] ${error.message}`));
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
