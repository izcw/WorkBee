import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export type RuntimeState = { status: string; ready: boolean; message?: string };
export type Approval = { approvalId: string; runId?: string; name: string; summary: string; arguments: Record<string, unknown>; risk: string };
export type Activity = { id: string; label: string; detail?: string; state: 'running' | 'done' | 'error' };
export type WorkflowStep = { id: string; name: string; description: string; roleIds: string[]; documents: string[] };
export type RoleInput = { id?: string; name?: string; role?: string; avatar?: string; modelId: string; description?: string; skills?: string[]; knowledge?: string[] };

type AgentContextValue = {
  runtime: RuntimeState;
  keyAvailable: boolean;
  models: ModelConfig[];
  usage: UsageSummary;
  fileTree: FileTreeNode[];
  refreshFileTree(): Promise<void>;
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
  removeWorkflow(id: string): void;
  updateWorkflow(input: { name?: string; description?: string }): void;
  reorderWorkflows(sourceId: string, targetId: string): void;
  toggleWorkflowDocument(path: string): void;
  pendingPrompt: string;
  startNewConversation(prompt?: string, preserveSelectedRoles?: boolean): void;
  clearPendingPrompt(): void;
  draft: string;
  setDraft(value: string): void;
  workspace: Workspace | null;
  projects: Workspace[];
  threads: ThreadSummary[];
  projectThreads: ThreadSummary[];
  threadId?: string;
  messages: ThreadMessage[];
  streaming: string;
  respondingRoleId: string;
  selectingRole: boolean;
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
  createProject(prompt?: string): Promise<void>;
  openProject(id: string): Promise<void>;
  newProjectThread(projectId: string): Promise<void>;
  renameProject(projectId: string, name: string): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  deleteThread(threadId: string): Promise<void>;
  openThread(id: string): Promise<void>;
  newThread(): void;
  send(prompt: string): Promise<void>;
  cancel(): Promise<void>;
  resolveApproval(id: string, approved: boolean): Promise<void>;
  createModel(input: ModelInput): Promise<ModelConfig>;
  updateModel(input: ModelInput & { id: string }): Promise<ModelConfig>;
  deleteModel(id: string): Promise<void>;
  testModel(input: ModelInput): Promise<{ success: boolean; latencyMs: number; message: string }>;
  saveRole(input: RoleInput): Promise<RoleConfig>;
};

const defaultModel: ModelConfig = { id: 'deepseek-default', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', keyAvailable: false, maskedKey: '' };
const defaultRole: RoleConfig = {
  id: 'aivra', name: 'Aivra', role: '全能统筹 Agent', modelId: defaultModel.id, modelName: defaultModel.name,
  baseUrl: defaultModel.baseUrl, model: defaultModel.model, keyAvailable: false,
  description: '全盘统筹并完成文件处理、软件开发、产品设计、办公文档、研究分析和结果验证。',
  skills: ['全局规划与执行', '文件读写与整理', '软件开发与测试', '产品与设计协作', '文档与办公处理', '研究与数据分析'],
  knowledge: ['aivra-working-principles', 'software-delivery-baseline', 'product-design-guidelines'],
};

const AgentContext = createContext<AgentContextValue | null>(null);
const emptyUsage: UsageSummary = { totalTokens: 0, peakTokens: 0, longestTaskSeconds: 0, byModel: [], daily: [] };
const defaultRoleIds = ['aivra', 'nova', 'mira', 'sage'];
const initialWorkflows: WorkflowStep[] = [
  { id: 'flow-work-assistant', name: 'AI 工作助手', description: '处理日常工作中的资料整理、文档撰写、分析总结、计划制定、协作沟通和任务推进。', roleIds: ['aivra', 'sage', 'mira'], documents: [] },
  { id: 'flow-create', name: '创建', description: '把一个想法变成可交付的内容或产品：明确目标、制定方案、完成制作并检查结果。', roleIds: ['aivra', 'mira', 'nova'], documents: [] },
  { id: 'flow-learn-explore', name: '学习和探索', description: '围绕新主题收集信息、解释概念、比较方案，并把探索结果整理成清晰结论。', roleIds: ['aivra', 'sage', 'mira'], documents: [] },
  { id: 'flow-build-debug-ship', name: '构建、调试并发布', description: '理解代码库，规划并实现改动，定位问题、运行验证，最后整理为可发布的交付结果。', roleIds: ['aivra', 'nova', 'mira'], documents: [] },
];
const previousBuiltInWorkflowIds = new Set([...initialWorkflows.map(flow => flow.id), 'flow-ide', 'flow-coding-assistant']);

function normalizeWorkflows(value: unknown): WorkflowStep[] {
  if (!Array.isArray(value)) return [];
  return value.filter((flow): flow is WorkflowStep => Boolean(flow && typeof flow === 'object' && typeof flow.id === 'string' && typeof flow.name === 'string'))
    .map(flow => ({
      ...flow,
      description: typeof flow.description === 'string' ? flow.description : '',
      roleIds: Array.isArray(flow.roleIds) ? flow.roleIds.filter((id): id is string => typeof id === 'string') : [...defaultRoleIds],
      documents: Array.isArray(flow.documents) ? flow.documents.filter((path): path is string => typeof path === 'string') : [],
    }));
}

function isUntouchedLegacyDefault(flow: WorkflowStep) {
  return flow.id === 'flow-default'
    && flow.name === '通用执行'
    && flow.description === '由统筹、工程、设计和研究角色根据问题自动选择负责人，检查上下文、执行并验证交付。'
    && flow.documents.length === 0
    && flow.roleIds.join(',') === defaultRoleIds.join(',');
}

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const api = window.aivraDesktop;
  const [runtime, setRuntime] = useState<RuntimeState>({ status: api ? 'starting' : 'browser', ready: false });
  const [keyAvailable, setKeyAvailable] = useState(false);
  const [models, setModels] = useState<ModelConfig[]>([defaultModel]);
  const [usage, setUsage] = useState<UsageSummary>(emptyUsage);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [roles, setRoles] = useState<RoleConfig[]>([defaultRole]);
  const [selectedRoleId, setSelectedRoleId] = useState('aivra');
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(defaultRoleIds);
  const [selectedTeamRoleId, setSelectedTeamRoleId] = useState('aivra');
  const [workflows, setWorkflows] = useState<WorkflowStep[]>(() => {
    try {
      const saved = localStorage.getItem('aivra.workflows.v5');
      const parsed = normalizeWorkflows(saved ? JSON.parse(saved) : null);
      if (parsed.length) return parsed;

      const previousSaved = localStorage.getItem('aivra.workflows.v4') || localStorage.getItem('aivra.workflows.v3');
      const custom = normalizeWorkflows(previousSaved ? JSON.parse(previousSaved) : null)
        .filter(flow => !isUntouchedLegacyDefault(flow) && !previousBuiltInWorkflowIds.has(flow.id));
      return [...initialWorkflows, ...custom];
    }
    catch { return initialWorkflows; }
  });
  const [activeWorkflowId, setActiveWorkflowId] = useState(initialWorkflows[0].id);
  const [draft, setDraft] = useState('');
  const [pendingPrompt, setPendingPrompt] = useState('');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [projects, setProjects] = useState<Workspace[]>([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [projectThreads, setProjectThreads] = useState<ThreadSummary[]>([]);
  const [threadId, setThreadId] = useState<string>();
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [streaming, setStreaming] = useState('');
  const [respondingRoleId, setRespondingRoleId] = useState('aivra');
  const [selectingRole, setSelectingRole] = useState(false);
  const [activeRun, setActiveRun] = useState<string>();
  const [error, setError] = useState<string>();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [mode, setMode] = useState<'chat' | 'task'>('chat');
  const [approvalMode, setApprovalMode] = useState<'request' | 'auto' | 'full'>('request');
  const workspaceRef = useRef<Workspace | null>(null);
  const projectsRef = useRef<Workspace[]>([]);
  workspaceRef.current = workspace;
  projectsRef.current = projects;

  useEffect(() => { localStorage.setItem('aivra.workflows.v5', JSON.stringify(workflows)); }, [workflows]);

  const refreshThreads = useCallback(async () => {
    if (!api || !workspaceRef.current) return;
    const [currentThreads, allThreads, savedProjects] = await Promise.all([
      api.agent.listThreads(workspaceRef.current.id), api.agent.listThreads(), api.agent.listWorkspaces(),
    ]);
    setThreads(currentThreads); setProjectThreads(allThreads); setProjects(savedProjects);
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
    const initialRuntime = api.agent.ensureReady().catch(reason => ({
      status: 'error', ready: false, message: reason instanceof Error ? reason.message : String(reason),
    }));
    Promise.all([
      initialRuntime, api.roles.list(), api.models.list(), api.agent.usageSummary().catch(() => emptyUsage),
      api.agent.listWorkspaces().catch(() => [] as Workspace[]), api.agent.listThreads().catch(() => [] as ThreadSummary[]),
    ]).then(async ([status, configuredRoles, configuredModels, currentUsage, savedProjects, savedThreads]) => {
      setRuntime({ status: String(status.status || 'offline'), ready: Boolean(status.ready), message: status.message ? String(status.message) : undefined });
      setRoles(configuredRoles);
      setModels(configuredModels);
      setUsage(currentUsage);
      setKeyAvailable(Boolean(configuredRoles.find(role => role.id === 'aivra')?.keyAvailable));
      setProjects(savedProjects); setProjectThreads(savedThreads);
      const savedProjectId = localStorage.getItem('aivra.activeProject.v1');
      const restoredProject = savedProjects.find(project => project.id === savedProjectId) || savedProjects[0];
      if (restoredProject) {
        setWorkspace(restoredProject); workspaceRef.current = restoredProject;
        setThreads(savedThreads.filter(thread => thread.workspace_id === restoredProject.id));
        localStorage.setItem('aivra.activeProject.v1', restoredProject.id);
        api.agent.workspaceTree(restoredProject.id).then(setFileTree).catch(() => setFileTree([]));
        const savedThreadId = localStorage.getItem('aivra.activeThread.v1');
        const restoredThread = savedThreads.find(thread => thread.id === savedThreadId && thread.workspace_id === restoredProject.id);
        if (restoredThread) await loadThread(restoredThread.id).catch(() => localStorage.removeItem('aivra.activeThread.v1'));
      }
    }).catch(reason => setError(String(reason)));
    const removeStatus = api.agent.onStatus(status => {
      setRuntime({ status: String(status.status || 'offline'), ready: Boolean(status.ready), message: status.message ? String(status.message) : undefined });
    });
    const removeEvent = api.agent.onEvent(event => {
      const payload = event.payload;
      if (event.type === 'run.started') {
        setActiveRun(String(payload.runId || event.runId));
        const runRoleIds = Array.isArray(payload.roleIds) ? payload.roleIds : [];
        setSelectingRole(runRoleIds.length > 1);
        if (runRoleIds.length === 1 && runRoleIds[0]) setRespondingRoleId(String(runRoleIds[0]));
        setStreaming(''); setError(undefined);
      } else if (event.type === 'team.selecting') {
        setSelectingRole(true);
        setActivity(items => [...items.slice(-7), { id: `team-selecting-${event.runId}`, label: '正在智能选择角色', detail: Array.isArray(payload.names) ? payload.names.map(String).join('、') : '', state: 'running' }]);
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
        setSelectingRole(false);
        setActivity(items => [...items.map(item => item.id === `team-selecting-${event.runId}` ? { ...item, state: 'done' as const, label: '已智能选择角色', detail: names } : item).slice(-7), { id: `team-${event.runId}`, label: '当前回答角色', detail: names, state: 'done' }]);
      } else if (event.type === 'approval.required') {
        setApprovals(items => [...items, {
          approvalId: String(payload.approvalId), runId: event.runId, name: String(payload.name),
          summary: String(payload.summary), arguments: (payload.arguments || {}) as Record<string, unknown>, risk: String(payload.risk || 'high'),
        }]);
      } else if (event.type === 'run.completed') {
        const completedThread = String(payload.threadId || '');
        setActiveRun(undefined); setStreaming(''); setApprovals([]); setSelectingRole(false);
        if (completedThread) loadThread(completedThread).catch(reason => setError(String(reason)));
        refreshThreads().catch(() => undefined);
        refreshUsage().catch(() => undefined); refreshFileTree().catch(() => undefined);
      } else if (event.type === 'run.failed' || event.type === 'run.cancelled') {
        setActiveRun(undefined); setStreaming(''); setApprovals([]); setSelectingRole(false);
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
    localStorage.setItem('aivra.activeProject.v1', selected.id); localStorage.removeItem('aivra.activeThread.v1');
    const [currentThreads, allThreads, savedProjects, tree] = await Promise.all([
      api.agent.listThreads(selected.id), api.agent.listThreads(), api.agent.listWorkspaces(), api.agent.workspaceTree(selected.id),
    ]);
    setThreads(currentThreads); setProjectThreads(allThreads); setProjects(savedProjects); setFileTree(tree);
  };

  const provisionProject = async () => {
    if (!api) throw new Error('请在 Aivra 桌面应用中创建项目');
    const project = await api.agent.createProject();
    setWorkspace(project); workspaceRef.current = project; setThreadId(undefined); setMessages([]); setActivity([]); setFileTree([]);
    localStorage.setItem('aivra.activeProject.v1', project.id); localStorage.removeItem('aivra.activeThread.v1');
    const [currentThreads, allThreads, savedProjects] = await Promise.all([
      api.agent.listThreads(project.id), api.agent.listThreads(), api.agent.listWorkspaces(),
    ]);
    setThreads(currentThreads); setProjectThreads(allThreads); setProjects(savedProjects);
    return project;
  };
  const createProject = async (prompt = '') => {
    setError(undefined);
    await provisionProject();
    if (prompt.trim()) { setDraft(prompt); setPendingPrompt(prompt.trim()); }
    else { setDraft(''); setPendingPrompt(''); }
  };

  const openProject = async (id: string) => {
    if (!api) return;
    const project = projectsRef.current.find(item => item.id === id);
    if (!project) return;
    setWorkspace(project); workspaceRef.current = project; setThreadId(undefined); setMessages([]); setStreaming(''); setError(undefined); setActivity([]);
    localStorage.setItem('aivra.activeProject.v1', id); localStorage.removeItem('aivra.activeThread.v1');
    const [currentThreads, tree] = await Promise.all([api.agent.listThreads(id), api.agent.workspaceTree(id)]);
    setThreads(currentThreads); setFileTree(tree);
  };
  const openThread = async (id: string) => {
    setStreaming(''); setSelectingRole(false); setError(undefined); await loadThread(id);
    localStorage.setItem('aivra.activeThread.v1', id);
  };
  const newProjectThread = async (projectId: string) => {
    if (!api) return;
    await openProject(projectId);
    const created = await api.agent.createThread(projectId);
    setThreadId(created.threadId); setMessages([]); setDraft(''); setPendingPrompt('');
    localStorage.setItem('aivra.activeThread.v1', created.threadId);
    await refreshThreads();
  };
  const newThread = () => {
    setThreadId(undefined); setMessages([]); setStreaming(''); setSelectingRole(false); setError(undefined); setApprovals([]); setActivity([]); setDraft(''); setPendingPrompt('');
    localStorage.removeItem('aivra.activeThread.v1');
  };
  const deleteThread = async (id: string) => {
    if (!api) return;
    if (activeRun && id === threadId) throw new Error('当前对话正在运行，请先停止任务');
    const result = await api.agent.deleteThread(id);
    if (!result.deleted) return;
    const [allThreads, savedProjects] = await Promise.all([api.agent.listThreads(), api.agent.listWorkspaces()]);
    setProjectThreads(allThreads); setProjects(savedProjects);
    if (workspaceRef.current) setThreads(allThreads.filter(item => item.workspace_id === workspaceRef.current?.id));
    if (id === threadId) newThread();
  };
  const deleteProject = async (id: string) => {
    if (!api) return;
    if (activeRun && workspaceRef.current?.id === id) throw new Error('当前项目有任务正在运行，请先停止任务');
    const result = await api.agent.deleteWorkspace(id);
    if (!result.deleted) return;
    const [savedProjects, allThreads] = await Promise.all([api.agent.listWorkspaces(), api.agent.listThreads()]);
    setProjects(savedProjects); setProjectThreads(allThreads);
    if (workspaceRef.current?.id !== id) return;
    newThread();
    const nextProject = savedProjects[0];
    if (!nextProject) {
      setWorkspace(null); workspaceRef.current = null; setThreads([]); setFileTree([]);
      localStorage.removeItem('aivra.activeProject.v1');
      return;
    }
    setWorkspace(nextProject); workspaceRef.current = nextProject;
    setThreads(allThreads.filter(item => item.workspace_id === nextProject.id));
    localStorage.setItem('aivra.activeProject.v1', nextProject.id);
    setFileTree(await api.agent.workspaceTree(nextProject.id).catch(() => []));
  };
  const renameProject = async (id: string, name: string) => {
    if (!api) throw new Error('仅桌面应用支持编辑项目标题');
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('项目标题不能为空');
    const result = await api.agent.renameWorkspace({ workspaceId: id, name: trimmedName });
    if (!result.updated) throw new Error('项目不存在或已被删除');
    setProjects(items => items.map(item => item.id === id ? { ...item, name: result.name } : item));
    setProjectThreads(items => items.map(item => item.workspace_id === id ? { ...item, workspace_name: result.name } : item));
    setThreads(items => items.map(item => item.workspace_id === id ? { ...item, workspace_name: result.name } : item));
    if (workspaceRef.current?.id === id) {
      const updated = { ...workspaceRef.current, name: result.name };
      workspaceRef.current = updated; setWorkspace(updated);
    }
  };
  const startNewConversation = (prompt = '', preserveSelectedRoles = false) => {
    newThread();
    if (!preserveSelectedRoles) {
      setSelectedRoleId('aivra'); setSelectedRoleIds(defaultRoleIds);
      setKeyAvailable(Boolean(roles.find(role => role.id === 'aivra')?.keyAvailable));
      setWorkflows(items => items.map(flow => flow.id === activeWorkflowId ? { ...flow, roleIds: defaultRoleIds } : flow));
    }
    setDraft(prompt); setPendingPrompt(prompt.trim());
  };
  const send = async (prompt: string) => {
    const reject = (message: string) => { setError(message); throw new Error(message); };
    if (!api) return reject('请在 Aivra 桌面应用中使用本地 Agent');
    try {
      if (!runtime.ready) setRuntime({ status: 'starting', ready: false, message: '正在启动 Agent…' });
      const status = await api.agent.ensureReady();
      setRuntime({ status: String(status.status || 'offline'), ready: Boolean(status.ready), message: status.message ? String(status.message) : undefined });
      if (!status.ready) return reject(status.message ? String(status.message) : 'Agent 启动失败，请重试');
    } catch (reason) {
      return reject(reason instanceof Error ? reason.message : String(reason));
    }
    let activeWorkspace = workspace;
    if (!activeWorkspace) {
      try { activeWorkspace = await provisionProject(); }
      catch (reason) { return reject(reason instanceof Error ? reason.message : String(reason)); }
    }
    const activeWorkflow = workflows.find(flow => flow.id === activeWorkflowId);
    const workflowRoleIds = activeWorkflow?.roleIds.length ? activeWorkflow.roleIds : selectedRoleIds;
    const selectedRoles = roles.filter(role => workflowRoleIds.includes(role.id));
    const missingRole = selectedRoles.find(role => !role.keyAvailable);
    if (missingRole) return reject(`角色 ${missingRole.name} 的模型 ${missingRole.modelName} 尚未配置 API Key，请点击左下角头像 → 设置 → 模型`);
    const content = prompt.trim();
    if (!content || activeRun) return;
    setError(undefined); setStreaming(''); setActivity([]); setSelectingRole(workflowRoleIds.length > 1);
    setMessages(items => [...items, { id: `local-${Date.now()}`, role: 'user', content, created_at: new Date().toISOString() }]);
    try {
      const created = await api.agent.createRun({ workspaceId: activeWorkspace.id, threadId, prompt: content, mode, roleIds: workflowRoleIds, approvalMode, workflowName: activeWorkflow?.name, documents: activeWorkflow?.documents || [] });
      setThreadId(created.threadId); setActiveRun(created.runId);
      localStorage.setItem('aivra.activeProject.v1', activeWorkspace.id); localStorage.setItem('aivra.activeThread.v1', created.threadId);
      await refreshThreads();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message); setActiveRun(undefined); setSelectingRole(false);
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

  const saveRole = async (input: RoleInput) => {
    if (!api) throw new Error('仅桌面应用支持角色配置');
    const saved = await api.roles.save(input);
    setRoles(items => items.some(item => item.id === saved.id) ? items.map(item => item.id === saved.id ? saved : item) : [...items, saved]);
    if (saved.id === selectedRoleId) setKeyAvailable(saved.keyAvailable);
    setSelectedTeamRoleId(saved.id);
    return saved;
  };
  const setActiveWorkflow = (id: string) => {
    const flow = workflows.find(item => item.id === id);
    if (!flow) return;
    const next = flow.roleIds.length ? flow.roleIds : defaultRoleIds;
    setActiveWorkflowId(id); setSelectedRoleIds(next); setSelectedRoleId(next[0]);
    setKeyAvailable(Boolean(roles.find(role => role.id === next[0])?.keyAvailable));
  };
  const addWorkflow = () => {
    const flow = { id: `flow-${Date.now()}`, name: `流程 ${workflows.length + 1}`, description: '描述这个流程的目标和交付结果。', roleIds: defaultRoleIds, documents: [] };
    setWorkflows(items => [...items, flow]); setActiveWorkflowId(flow.id); setSelectedRoleIds(flow.roleIds); setSelectedRoleId('aivra');
  };
  const removeWorkflow = (id: string) => setWorkflows(items => {
    if (items.length === 1) return items;
    const index = items.findIndex(item => item.id === id);
    const next = items.filter(item => item.id !== id);
    if (id === activeWorkflowId) {
      const replacement = next[Math.min(Math.max(index, 0), next.length - 1)];
      if (replacement) {
        setActiveWorkflowId(replacement.id); setSelectedRoleIds(replacement.roleIds.length ? replacement.roleIds : defaultRoleIds);
        setSelectedRoleId((replacement.roleIds.length ? replacement.roleIds : defaultRoleIds)[0]);
      }
    }
    return next;
  });
  const updateWorkflow = (input: { name?: string; description?: string }) => setWorkflows(items => items.map(flow => flow.id === activeWorkflowId ? {
    ...flow,
    name: input.name === undefined ? flow.name : input.name.trim().slice(0, 40) || flow.name,
    description: input.description === undefined ? flow.description : input.description.slice(0, 300),
  } : flow));
  const reorderWorkflows = (sourceId: string, targetId: string) => setWorkflows(items => {
    const sourceIndex = items.findIndex(item => item.id === sourceId);
    const targetIndex = items.findIndex(item => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return items;
    const next = [...items];
    const [source] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, source);
    return next;
  });
  const toggleWorkflowDocument = (path: string) => setWorkflows(items => items.map(flow => flow.id === activeWorkflowId ? { ...flow, documents: flow.documents.includes(path) ? flow.documents.filter(item => item !== path) : [...flow.documents, path] } : flow));
  const selectModel = async (modelId: string) => {
    try { await saveRole({ id: selectedRoleId, modelId }); setError(undefined); }
    catch (reason) { const message = reason instanceof Error ? reason.message : String(reason); setError(message); throw reason; }
  };

  const selectedRole = roles.find(role => role.id === selectedRoleId) || defaultRole;

  return <AgentContext.Provider value={{ runtime, keyAvailable, models, usage, fileTree, refreshFileTree, roles, selectedRoleId, selectedRoleIds, selectedRole, selectedTeamRoleId, setSelectedTeamRoleId, workflows, activeWorkflowId, setActiveWorkflow, addWorkflow, removeWorkflow, updateWorkflow, reorderWorkflows, toggleWorkflowDocument, pendingPrompt, startNewConversation, clearPendingPrompt: () => setPendingPrompt(''), draft, setDraft, workspace, projects, threads, projectThreads, threadId, messages, streaming, respondingRoleId, selectingRole, activeRun, error, approvals, activity, mode, approvalMode, setMode, setApprovalMode, selectRole, selectModel, selectWorkspace, createProject, openProject, newProjectThread, renameProject, deleteProject, deleteThread, openThread, newThread, send, cancel, resolveApproval, createModel, updateModel, deleteModel, testModel, saveRole }}>{children}</AgentContext.Provider>;
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
