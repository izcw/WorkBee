import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export type RuntimeState = { status: string; ready: boolean; message?: string };
export type Approval = { approvalId: string; runId?: string; name: string; summary: string; arguments: Record<string, unknown>; risk: string };
export type Activity = { id: string; label: string; detail?: string; state: 'running' | 'done' | 'error' };
export type WorkflowStep = { id: string; name: string; roleIds: string[]; documents: string[] };

type AgentContextValue = {
  runtime: RuntimeState;
  keyAvailable: boolean;
  models: ModelConfig[];
  usage: UsageSummary;
  fileTree: FileTreeNode[];
  roles: RoleConfig[];
  selectedRoleId: string;
  selectedRoleIds: string[];
  selectedRole: RoleConfig;
  selectedTeamRoleId: string;
  setSelectedTeamRoleId(id: string): void;
  workflows: WorkflowStep[];
  activeWorkflowId: string;
  setActiveWorkflow(id: string): void;
  addWorkflow(): void;
  toggleWorkflowDocument(path: string): void;
  pendingPrompt: string;
  startNewConversation(prompt?: string, preserveSelectedRoles?: boolean): void;
  clearPendingPrompt(): void;
  draft: string;
  setDraft(value: string): void;
  workspace: Workspace | null;
  threads: ThreadSummary[];
  threadId?: string;
  messages: ThreadMessage[];
  streaming: string;
  respondingRoleId: string;
  activeRun?: string;
  error?: string;
  approvals: Approval[];
  activity: Activity[];
  mode: 'chat' | 'task';
  approvalMode: 'request' | 'auto' | 'full';
  setMode(mode: 'chat' | 'task'): void;
  setApprovalMode(mode: 'request' | 'auto' | 'full'): void;
  selectRole(id: string): void;
  selectModel(modelId: string): Promise<void>;
  selectWorkspace(): Promise<void>;
  openThread(id: string): Promise<void>;
  newThread(): void;
  send(prompt: string): Promise<void>;
  cancel(): Promise<void>;
  resolveApproval(id: string, approved: boolean): Promise<void>;
  createModel(input: ModelInput): Promise<ModelConfig>;
  updateModel(input: ModelInput & { id: string }): Promise<ModelConfig>;
  deleteModel(id: string): Promise<void>;
  testModel(input: ModelInput): Promise<{ success: boolean; latencyMs: number; message: string }>;
  saveRole(input: { id: string; modelId: string; description?: string; skills?: string[]; knowledge?: string[] }): Promise<void>;
};

const defaultModel: ModelConfig = { id: 'deepseek-default', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', keyAvailable: false, maskedKey: '' };
const defaultRole: RoleConfig = { id: 'aivra', name: 'Aivra', role: '默认 Agent', modelId: defaultModel.id, modelName: defaultModel.name, baseUrl: defaultModel.baseUrl, model: defaultModel.model, keyAvailable: false, description: '项目管理与编程助手', skills: [], knowledge: [] };

const AgentContext = createContext<AgentContextValue | null>(null);
const emptyUsage: UsageSummary = { totalTokens: 0, peakTokens: 0, longestTaskSeconds: 0, byModel: [], daily: [] };
const initialWorkflows: WorkflowStep[] = ['需求','设计','实现','测试','行动'].map((name, index) => ({ id: `flow-${index + 1}`, name, roleIds: ['aivra'], documents: [] }));

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const api = window.aivraDesktop;
  const [runtime, setRuntime] = useState<RuntimeState>({ status: api ? 'starting' : 'browser', ready: false });
  const [keyAvailable, setKeyAvailable] = useState(false);
  const [models, setModels] = useState<ModelConfig[]>([defaultModel]);
  const [usage, setUsage] = useState<UsageSummary>(emptyUsage);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [roles, setRoles] = useState<RoleConfig[]>([defaultRole]);
  const [selectedRoleId, setSelectedRoleId] = useState('aivra');
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(['aivra']);
  const [selectedTeamRoleId, setSelectedTeamRoleId] = useState('aivra');
  const [workflows, setWorkflows] = useState<WorkflowStep[]>(() => {
    try { const saved = localStorage.getItem('aivra.workflows'); const parsed = saved ? JSON.parse(saved) : null; return Array.isArray(parsed) && parsed.length ? parsed : initialWorkflows; }
    catch { return initialWorkflows; }
  });
  const [activeWorkflowId, setActiveWorkflowId] = useState(initialWorkflows[4].id);
  const [draft, setDraft] = useState('');
  const [pendingPrompt, setPendingPrompt] = useState('');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadId, setThreadId] = useState<string>();
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [streaming, setStreaming] = useState('');
  const [respondingRoleId, setRespondingRoleId] = useState('aivra');
  const [activeRun, setActiveRun] = useState<string>();
  const [error, setError] = useState<string>();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [mode, setMode] = useState<'chat' | 'task'>('task');
  const [approvalMode, setApprovalMode] = useState<'request' | 'auto' | 'full'>('request');
  const workspaceRef = useRef<Workspace | null>(null);
  workspaceRef.current = workspace;

  useEffect(() => { localStorage.setItem('aivra.workflows', JSON.stringify(workflows)); }, [workflows]);

  const refreshThreads = useCallback(async () => {
    if (!api || !workspaceRef.current) return;
    setThreads(await api.agent.listThreads(workspaceRef.current.id));
  }, [api]);
  const refreshUsage = useCallback(async () => { if (api) setUsage(await api.agent.usageSummary()); }, [api]);
  const refreshFileTree = useCallback(async () => { if (api && workspaceRef.current) setFileTree(await api.agent.workspaceTree(workspaceRef.current.id)); }, [api]);

  const loadThread = useCallback(async (id: string) => {
    if (!api) return;
    const detail = await api.agent.getThread(id);
    setThreadId(id);
    setMessages(detail.messages);
  }, [api]);

  useEffect(() => {
    if (!api) return;
    Promise.all([api.agent.status(), api.roles.list(), api.models.list(), api.agent.usageSummary().catch(() => emptyUsage)]).then(([status, configuredRoles, configuredModels, currentUsage]) => {
      setRuntime({ status: String(status.status || 'offline'), ready: Boolean(status.ready), message: status.message ? String(status.message) : undefined });
      setRoles(configuredRoles);
      setModels(configuredModels);
      setUsage(currentUsage);
      setKeyAvailable(Boolean(configuredRoles.find(role => role.id === 'aivra')?.keyAvailable));
    }).catch(reason => setError(String(reason)));
    const removeStatus = api.agent.onStatus(status => {
      setRuntime({ status: String(status.status || 'offline'), ready: Boolean(status.ready), message: status.message ? String(status.message) : undefined });
    });
    const removeEvent = api.agent.onEvent(event => {
      const payload = event.payload;
      if (event.type === 'run.started') {
        setActiveRun(String(payload.runId || event.runId));
        if (Array.isArray(payload.roleIds) && payload.roleIds[0]) setRespondingRoleId(String(payload.roleIds[0]));
        setStreaming(''); setError(undefined);
      } else if (event.type === 'model.delta') {
        setStreaming(value => value + String(payload.delta || ''));
      } else if (event.type === 'tool.requested') {
        const toolCallId = String(payload.toolCallId || event.id);
        setActivity(items => [...items.slice(-7), { id: toolCallId, label: `调用 ${String(payload.name)}`, detail: summarizeTool(payload), state: 'running' }]);
      } else if (event.type === 'tool.completed') {
        const toolCallId = String(payload.toolCallId || event.id);
        setActivity(items => items.map(item => item.id === toolCallId ? { ...item, state: payload.error ? 'error' : 'done', detail: String(payload.error || payload.result || item.detail || '').slice(0, 300) } : item));
      } else if (event.type === 'agent.started') {
        const roleId = String(payload.roleId || event.id);
        setActivity(items => [...items.slice(-7), { id: `agent-${roleId}`, label: `${String(payload.name)} 正在分析`, detail: String(payload.model || ''), state: 'running' }]);
      } else if (event.type === 'agent.completed') {
        const roleId = String(payload.roleId || event.id);
        setActivity(items => items.map(item => item.id === `agent-${roleId}` ? { ...item, label: `${String(payload.name)} 已完成分析`, state: 'done' } : item));
      } else if (event.type === 'team.selected') {
        const names = Array.isArray(payload.names) ? payload.names.map(String).join('、') : '';
        if (payload.answerRoleId) setRespondingRoleId(String(payload.answerRoleId));
        setActivity(items => [...items.slice(-7), { id: `team-${event.runId}`, label: '已智能选择参与角色', detail: names, state: 'done' }]);
      } else if (event.type === 'approval.required') {
        setApprovals(items => [...items, {
          approvalId: String(payload.approvalId), runId: event.runId, name: String(payload.name),
          summary: String(payload.summary), arguments: (payload.arguments || {}) as Record<string, unknown>, risk: String(payload.risk || 'high'),
        }]);
      } else if (event.type === 'run.completed') {
        const completedThread = String(payload.threadId || '');
        setActiveRun(undefined); setStreaming(''); setApprovals([]);
        if (completedThread) loadThread(completedThread).catch(reason => setError(String(reason)));
        refreshThreads().catch(() => undefined);
        refreshUsage().catch(() => undefined); refreshFileTree().catch(() => undefined);
      } else if (event.type === 'run.failed' || event.type === 'run.cancelled') {
        setActiveRun(undefined); setStreaming(''); setApprovals([]);
        if (event.type === 'run.failed') setError(String(payload.message || 'Agent 运行失败'));
        const failedThread = String(payload.threadId || '');
        if (failedThread) loadThread(failedThread).catch(() => undefined);
      }
    });
    return () => { removeStatus(); removeEvent(); };
  }, [api, loadThread, refreshThreads, refreshUsage, refreshFileTree]);

  const selectWorkspace = async () => {
    if (!api) { setError('请在 Aivra 桌面应用中使用本地 Agent'); return; }
    setError(undefined);
    const selected = await api.agent.selectWorkspace();
    if (!selected) return;
    setWorkspace(selected); workspaceRef.current = selected; setThreadId(undefined); setMessages([]); setActivity([]);
    setThreads(await api.agent.listThreads(selected.id));
    setFileTree(await api.agent.workspaceTree(selected.id));
  };

  const openThread = async (id: string) => { setStreaming(''); setError(undefined); await loadThread(id); };
  const newThread = () => { setThreadId(undefined); setMessages([]); setStreaming(''); setError(undefined); setApprovals([]); setActivity([]); };
  const startNewConversation = (prompt = '', preserveSelectedRoles = false) => {
    newThread();
    if (!preserveSelectedRoles) {
      setSelectedRoleId('aivra'); setSelectedRoleIds(['aivra']);
      setKeyAvailable(Boolean(roles.find(role => role.id === 'aivra')?.keyAvailable));
      setWorkflows(items => items.map(flow => flow.id === activeWorkflowId ? { ...flow, roleIds: ['aivra'] } : flow));
    }
    setDraft(prompt); setPendingPrompt(prompt.trim());
  };
  const send = async (prompt: string) => {
    const reject = (message: string) => { setError(message); throw new Error(message); };
    if (!api) return reject('请在 Aivra 桌面应用中使用本地 Agent');
    if (!workspace) return reject('请先选择当前文件夹');
    if (!runtime.ready) return reject(runtime.message || 'Agent 尚未就绪，请稍后再试');
    const activeWorkflow = workflows.find(flow => flow.id === activeWorkflowId);
    const workflowRoleIds = activeWorkflow?.roleIds.length ? activeWorkflow.roleIds : selectedRoleIds;
    const selectedRoles = roles.filter(role => workflowRoleIds.includes(role.id));
    const missingRole = selectedRoles.find(role => !role.keyAvailable);
    if (missingRole) return reject(`角色 ${missingRole.name} 的模型 ${missingRole.modelName} 尚未配置 API Key，请点击左下角头像 → 设置 → 模型`);
    const content = prompt.trim();
    if (!content || activeRun) return;
    setError(undefined); setStreaming(''); setActivity([]);
    setMessages(items => [...items, { id: `local-${Date.now()}`, role: 'user', content, created_at: new Date().toISOString() }]);
    try {
      const created = await api.agent.createRun({ workspaceId: workspace.id, threadId, prompt: content, mode, roleIds: workflowRoleIds, approvalMode, workflowName: activeWorkflow?.name, documents: activeWorkflow?.documents || [] });
      setThreadId(created.threadId); setActiveRun(created.runId);
      await refreshThreads();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message); setActiveRun(undefined);
      throw reason;
    }
  };
  const cancel = async () => { if (api && activeRun) await api.agent.cancelRun(activeRun); };
  const resolveApproval = async (id: string, approved: boolean) => {
    if (!api) return;
    await api.agent.resolveApproval({ approvalId: id, approved });
    setApprovals(items => items.filter(item => item.approvalId !== id));
  };
  const selectRole = (id: string) => {
    if (!roles.some(role => role.id === id)) return;
    setSelectedRoleIds(items => {
      const next = items.includes(id) ? (items.length === 1 ? items : items.filter(item => item !== id)) : [...items, id];
      const primary = next.includes(id) ? id : next[0];
      setSelectedRoleId(primary);
      setKeyAvailable(Boolean(roles.find(role => role.id === primary)?.keyAvailable));
      setWorkflows(flows => flows.map(flow => flow.id === activeWorkflowId ? { ...flow, roleIds: next } : flow));
      return next;
    });
  };

  const refreshConfiguration = async () => {
    if (!api) return;
    const [configuredModels, configuredRoles] = await Promise.all([api.models.list(), api.roles.list()]);
    setModels(configuredModels); setRoles(configuredRoles);
    setKeyAvailable(Boolean(configuredRoles.find(role => role.id === selectedRoleId)?.keyAvailable));
  };
  const createModel = async (input: ModelInput) => { if (!api) throw new Error('仅桌面应用支持模型配置'); const saved = await api.models.create(input); await refreshConfiguration(); return saved; };
  const updateModel = async (input: ModelInput & { id: string }) => { if (!api) throw new Error('仅桌面应用支持模型配置'); const saved = await api.models.update(input); await refreshConfiguration(); return saved; };
  const deleteModel = async (id: string) => { if (!api) throw new Error('仅桌面应用支持模型配置'); await api.models.delete(id); await refreshConfiguration(); };
  const testModel = async (input: ModelInput) => { if (!api) throw new Error('仅桌面应用支持连接测试'); return api.models.test(input); };

  const saveRole = async (input: { id: string; modelId: string; description?: string; skills?: string[]; knowledge?: string[] }) => {
    if (!api) throw new Error('仅桌面应用支持角色配置');
    const saved = await api.roles.save(input);
    setRoles(items => items.map(item => item.id === saved.id ? saved : item));
    if (saved.id === selectedRoleId) setKeyAvailable(saved.keyAvailable);
  };
  const setActiveWorkflow = (id: string) => {
    const flow = workflows.find(item => item.id === id);
    if (!flow) return;
    const next = flow.roleIds.length ? flow.roleIds : ['aivra'];
    setActiveWorkflowId(id); setSelectedRoleIds(next); setSelectedRoleId(next[0]);
    setKeyAvailable(Boolean(roles.find(role => role.id === next[0])?.keyAvailable));
  };
  const addWorkflow = () => {
    const flow = { id: `flow-${Date.now()}`, name: `流程 ${workflows.length + 1}`, roleIds: ['aivra'], documents: [] };
    setWorkflows(items => [...items, flow]); setActiveWorkflowId(flow.id); setSelectedRoleIds(flow.roleIds); setSelectedRoleId('aivra');
  };
  const toggleWorkflowDocument = (path: string) => setWorkflows(items => items.map(flow => flow.id === activeWorkflowId ? { ...flow, documents: flow.documents.includes(path) ? flow.documents.filter(item => item !== path) : [...flow.documents, path] } : flow));
  const selectModel = async (modelId: string) => {
    try { await saveRole({ id: selectedRoleId, modelId }); setError(undefined); }
    catch (reason) { const message = reason instanceof Error ? reason.message : String(reason); setError(message); throw reason; }
  };

  const selectedRole = roles.find(role => role.id === selectedRoleId) || defaultRole;

  return <AgentContext.Provider value={{ runtime, keyAvailable, models, usage, fileTree, roles, selectedRoleId, selectedRoleIds, selectedRole, selectedTeamRoleId, setSelectedTeamRoleId, workflows, activeWorkflowId, setActiveWorkflow, addWorkflow, toggleWorkflowDocument, pendingPrompt, startNewConversation, clearPendingPrompt: () => setPendingPrompt(''), draft, setDraft, workspace, threads, threadId, messages, streaming, respondingRoleId, activeRun, error, approvals, activity, mode, approvalMode, setMode, setApprovalMode, selectRole, selectModel, selectWorkspace, openThread, newThread, send, cancel, resolveApproval, createModel, updateModel, deleteModel, testModel, saveRole }}>{children}</AgentContext.Provider>;
}

function summarizeTool(payload: Record<string, unknown>) {
  const args = (payload.arguments || {}) as Record<string, unknown>;
  if (payload.name === 'read_file' || payload.name === 'write_file') return String(args.path || '');
  return '';
}

export function useAgent() {
  const value = useContext(AgentContext);
  if (!value) throw new Error('useAgent must be used within AgentProvider');
  return value;
}
