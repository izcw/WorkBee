import { useEffect, useRef, useState } from 'react';
import { Archive, ArrowDown, BookOpen, Check, ChevronRight, CircleAlert, Copy, File, FileCode2, Folder, FolderOpen, GripVertical, LoaderCircle, Minus, Pencil, Plus, RefreshCw, Save, ShieldAlert, Users, Workflow, X, ExternalLink, Clock3, Trash2 } from 'lucide-react';
import { useAgent } from '../agent/AgentContext';
import { Composer } from '../components/Composer';
import { SettingsModal } from '../components/SettingsModal';
import { Avatar, Card, Tabs } from '../components/ui';
import { RoleCard } from '../components/RoleCard';
import { KNOWLEDGE_DOCUMENTS } from '../data/catalog';
import { roleAvatar } from '../data/roleAvatars';

function Message({ role, content, roleId = 'workbee', createdAt, streaming = false, streamingStatus = '', elapsedSeconds = 0, error = false, roles, editable = false, onEdit, messageRef }: { role: 'user' | 'assistant'; content: string; roleId?: string; createdAt?: string; streaming?: boolean; streamingStatus?: string; elapsedSeconds?: number; error?: boolean; roles: RoleConfig[]; editable?: boolean; onEdit?: () => void; messageRef?: (node: HTMLDivElement | null) => void }) {
  const [copied, setCopied] = useState(false);
  const bot = role === 'assistant';
  const respondingRole = roles.find(item => item.id === roleId) || roles[0];
  const name = bot ? respondingRole?.name || 'WorkBee' : '你';
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(createdAt ? new Date(createdAt) : new Date());
  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { setCopied(false); }
  };
  return <div className={`message message-row ${bot ? 'team-message' : 'user-message'} ${error ? 'message-error' : ''}`} ref={messageRef}>
    <Avatar image={bot ? roleAvatar(respondingRole) : undefined} kind={bot ? 'cat' : 'yellow'} size={30}/>
    <div className="message-content"><header><strong>{name}</strong><small>{bot ? '回复' : '发送'} · {time}</small>{streaming && <small className="streaming-label"><LoaderCircle size={12}/>{streamingStatus || '正在准备回复'} · {elapsedSeconds}秒</small>}</header>
      <Card className={`message-card ${streaming && !content ? 'streaming-stage-card' : ''}`}><p className="message-text">{content || streamingStatus || '正在准备回复'}</p>{streaming && content && <i className="stream-cursor" aria-hidden="true"/>}</Card>
      {!streaming && <div className="message-actions" aria-label="消息操作">
        <button type="button" title="复制全部内容" aria-label="复制全部内容" onClick={copyMessage}>{copied ? <Check size={14}/> : <Copy size={14}/>}</button>
        {editable && <button type="button" title="编辑并重新发送" aria-label="编辑并重新发送" onClick={onEdit}><Pencil size={14}/></button>}
      </div>}
    </div>
  </div>;
}

function messageSummary(message: ThreadMessage) {
  const text = message.content.replace(/\s+/g, ' ').trim() || '空消息';
  const summary = text.length > 20 ? `${text.slice(0, 20)}…` : text;
  return `${message.role === 'user' ? '你' : 'WorkBee'}：${summary}`;
}

function ApprovalCards() {
  const { approvals, resolveApproval } = useAgent();
  return <>{approvals.map(approval => <Card className="approval-card" key={approval.approvalId}>
    <div className="approval-title"><ShieldAlert size={18}/><div><strong>需要你的批准</strong><span>{approval.summary}</span></div></div>
    <pre>{safeArguments(approval.name, approval.arguments)}</pre>
    <div className="approval-actions"><button className="deny" onClick={() => resolveApproval(approval.approvalId, false)}><X size={14}/>取消</button><button className="approve" onClick={() => resolveApproval(approval.approvalId, true)}><Check size={14}/>确认</button></div>
  </Card>)}</>;
}

function safeArguments(name: string, args: Record<string, unknown>) {
  if (name === 'write_file') return `path: ${String(args.path || '')}\ncontent: ${String(args.content || '').slice(0, 500)}${String(args.content || '').length > 500 ? '…' : ''}`;
  return JSON.stringify(args, null, 2).slice(0, 800);
}

type TaskRecord = { id: string; title: string; schedule: string; repeat: string; status?: string; runAt?: number; runCount?: number; lastRunAt?: number; archivedAt?: number };

function readTaskRecords(key: string): TaskRecord[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}

export function ChatPage() {
  const { workspace, runtime, roles, selectedRoleId, selectedRoleIds, selectRole, workflows, activeWorkflowId, setActiveWorkflow, addWorkflow, removeWorkflow, reorderWorkflows, pendingPrompt, clearPendingPrompt, draft, setDraft, messages, streaming, streamingStatus, respondingRoleId, selectingRole, activeRun, runStartedAt, editingMessageId, editMessage, recoverableRuns, error, approvals, mode, approvalMode, setMode, setApprovalMode, selectWorkspace, send, resumeRun, cancel } = useAgent();
  const messagesRef = useRef<HTMLDivElement>(null);
  const messageNodesRef = useRef(new Map<string, HTMLDivElement>());
  const followLatestRef = useRef(true);
  const userScrollingRef = useRef(false);
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyFrameRef = useRef<number | null>(null);
  const [showLatest, setShowLatest] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [recurrence, setRecurrence] = useState('不循环');
  const [activeMessageId, setActiveMessageId] = useState('');
  const [draggedWorkflowId, setDraggedWorkflowId] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const pendingSendingRef = useRef('');
  const scheduledRunRef = useRef(false);
  const interruptedRun = recoverableRuns.find(run => run.workspace_id === workspace?.id);

  useEffect(() => {
    if (!runStartedAt) { setElapsedSeconds(0); return; }
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - runStartedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [runStartedAt]);

  useEffect(() => {
    if (!pendingPrompt || !runtime.ready || activeRun || pendingSendingRef.current === pendingPrompt) return;
    pendingSendingRef.current = pendingPrompt;
    send(pendingPrompt).then(() => { clearPendingPrompt(); setDraft(''); }).catch(() => { clearPendingPrompt(); pendingSendingRef.current = ''; });
  }, [pendingPrompt, workspace, runtime.ready, activeRun, send, clearPendingPrompt, setDraft]);
  useEffect(() => { const restoreSchedule = (event: Event) => { const task = (event as CustomEvent<{ schedule: string; repeat: string }>).detail; setScheduleAt(task.schedule && task.schedule !== '按周期执行' ? task.schedule.replace(' ', 'T').slice(0, 16) : ''); setRecurrence(task.repeat || '不循环'); }; addEventListener('workbee:restore-task-schedule', restoreSchedule); return () => removeEventListener('workbee:restore-task-schedule', restoreSchedule); }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (scheduledRunRef.current || activeRun) return;
      let tasks: Array<{ id: string; title: string; schedule: string; repeat: string; runAt?: number; status?: string; runCount?: number }> = [];
      try { tasks = JSON.parse(localStorage.getItem('workbee.tasks.v1') || '[]'); } catch { return; }
      const task = tasks.find(item => item.status !== 'done' && item.status !== 'running' && item.runAt && item.runAt <= Date.now());
      if (!task) return;
      scheduledRunRef.current = true;
      const repeatMs: Record<string, number> = { '每小时': 60 * 60 * 1000, '每天': 24 * 60 * 60 * 1000, '每周': 7 * 24 * 60 * 60 * 1000, '每月': 30 * 24 * 60 * 60 * 1000 };
      const nextTasks = tasks.map(item => item.id === task.id ? { ...item, status: 'running' } : item);
      localStorage.setItem('workbee.tasks.v1', JSON.stringify(nextTasks));
      window.dispatchEvent(new Event('workbee:tasks-updated'));
      send(task.title).then(() => {
        const saved = JSON.parse(localStorage.getItem('workbee.tasks.v1') || '[]');
        const nextRun = repeatMs[task.repeat] ? Date.now() + repeatMs[task.repeat] : undefined;
        const completedAt = Date.now();
        const updated = saved.map((item: typeof task) => item.id === task.id ? { ...item, status: nextRun ? 'scheduled' : 'done', lastRunAt: completedAt, runCount: (item.runCount || 0) + 1, runAt: nextRun } : item);
        if (nextRun) {
          localStorage.setItem('workbee.tasks.v1', JSON.stringify(updated));
        } else {
          const completed = updated.find((item: typeof task) => item.id === task.id);
          const archived = readTaskRecords('workbee.tasks.archive.v1');
          localStorage.setItem('workbee.tasks.v1', JSON.stringify(updated.filter((item: typeof task) => item.id !== task.id)));
          if (completed) localStorage.setItem('workbee.tasks.archive.v1', JSON.stringify([{ ...completed, archivedAt: completedAt }, ...archived.filter(item => item.id !== task.id)]));
        }
        window.dispatchEvent(new Event('workbee:tasks-updated'));
      }).catch(() => {
        const saved = JSON.parse(localStorage.getItem('workbee.tasks.v1') || '[]');
        localStorage.setItem('workbee.tasks.v1', JSON.stringify(saved.map((item: typeof task) => item.id === task.id ? { ...item, status: 'error' } : item)));
        window.dispatchEvent(new Event('workbee:tasks-updated'));
      }).finally(() => { scheduledRunRef.current = false; });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [activeRun, send]);

  const submit = async (value: string) => {
    followLatestRef.current = true; setShowLatest(false);
    if (!editingMessageId && mode === 'task' && (scheduleAt || recurrence !== '不循环')) {
      const stored = JSON.parse(localStorage.getItem('workbee.tasks.v1') || '[]');
      const repeatMs: Record<string, number> = { '每小时': 60 * 60 * 1000, '每天': 24 * 60 * 60 * 1000, '每周': 7 * 24 * 60 * 60 * 1000, '每月': 30 * 24 * 60 * 60 * 1000 };
      stored.push({ id: `task-${Date.now()}`, title: value.slice(0, 42), schedule: scheduleAt ? scheduleAt.replace('T', ' ') : '按周期执行', repeat: recurrence, runAt: scheduleAt ? new Date(scheduleAt).getTime() : Date.now() + (repeatMs[recurrence] || 0), status: 'scheduled' });
      localStorage.setItem('workbee.tasks.v1', JSON.stringify(stored));
      setTimeout(() => window.dispatchEvent(new Event('workbee:tasks-updated')), 0);
      setScheduleAt(''); setDraft('');
      return;
    }
    try { await send(value); setDraft(''); } catch { /* context surfaces the error */ }
  };
  const scrollToLatest = (smooth = true) => {
    const node = messagesRef.current;
    if (!node) return;
    followLatestRef.current = true; setShowLatest(false);
    node.scrollTo({ top: node.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };
  const updateActiveMessage = () => {
    const container = messagesRef.current;
    if (!container || messages.length === 0) {
      setActiveMessageId('');
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const markerLine = containerRect.top + 18;
    let nextId = messages[0].id;
    for (const message of messages) {
      const messageNode = messageNodesRef.current.get(message.id);
      if (messageNode && messageNode.getBoundingClientRect().bottom > markerLine) {
        nextId = message.id;
        break;
      }
    }
    if (container.scrollHeight - container.scrollTop - container.clientHeight < 2) nextId = messages[messages.length - 1].id;
    setActiveMessageId(current => current === nextId ? current : nextId);
  };
  const scheduleActiveMessageUpdate = () => {
    if (historyFrameRef.current !== null) return;
    historyFrameRef.current = requestAnimationFrame(() => {
      historyFrameRef.current = null;
      updateActiveMessage();
    });
  };
  const scrollToMessage = (messageId: string) => {
    const container = messagesRef.current;
    const messageNode = messageNodesRef.current.get(messageId);
    if (!container || !messageNode) return;
    followLatestRef.current = false;
    userScrollingRef.current = false;
    setActiveMessageId(messageId);
    const top = messageNode.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 10;
    container.scrollTo({ top, behavior: 'smooth' });
  };
  const pauseAutoScroll = () => {
    userScrollingRef.current = true;
    followLatestRef.current = false;
    setShowLatest(true);
    if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
    scrollIdleTimerRef.current = setTimeout(() => {
      userScrollingRef.current = false;
      const node = messagesRef.current;
      if (!node) return;
      const atLatest = node.scrollHeight - node.scrollTop - node.clientHeight < 72;
      followLatestRef.current = atLatest;
      setShowLatest(!atLatest);
    }, 180);
  };
  useEffect(() => () => {
    if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
    if (historyFrameRef.current !== null) cancelAnimationFrame(historyFrameRef.current);
  }, []);
  useEffect(() => {
    if (!followLatestRef.current) return;
    const frame = requestAnimationFrame(() => scrollToLatest(false));
    return () => cancelAnimationFrame(frame);
  }, [messages.length, streaming, activeRun, approvals.length, error]);
  useEffect(() => {
    const frame = requestAnimationFrame(updateActiveMessage);
    return () => cancelAnimationFrame(frame);
  }, [messages]);

  return <div className="chat-page agent-chat-page">
    <section className="chat-message-box">
    <div className="messages agent-messages" ref={messagesRef} onWheel={pauseAutoScroll} onTouchStart={pauseAutoScroll} onPointerDown={event => {
      if (event.pointerType !== 'mouse' || event.currentTarget === event.target) pauseAutoScroll();
    }} onScroll={() => {
      const node = messagesRef.current;
      if (!node) return;
      scheduleActiveMessageUpdate();
      const atLatest = node.scrollHeight - node.scrollTop - node.clientHeight < 72;
      if (userScrollingRef.current) { followLatestRef.current = false; setShowLatest(true); return; }
      followLatestRef.current = atLatest; setShowLatest(!atLatest);
    }}>
      {!workspace && <section className="agent-onboarding"><div className="onboarding-icon"><FileCode2 size={28}/></div><h2>开始一个新项目</h2><p>普通问答不需要选择文件夹。只有需要读取或修改你电脑里的现有内容时，再添加本地文件夹即可。</p><button onClick={selectWorkspace}><FolderOpen size={16}/>添加本地文件夹</button></section>}
      {interruptedRun && !activeRun && <Card className={`recovery-card ${interruptedRun.safeToResume ? '' : 'unsafe'}`}>
        <div><strong>{interruptedRun.safeToResume ? '发现未完成的本地任务' : '任务中断，需人工检查'}</strong><span>{interruptedRun.title}</span></div>
        {interruptedRun.safeToResume
          ? <button onClick={() => resumeRun(interruptedRun.id)}>安全续跑</button>
          : <small>该任务此前已执行过可能产生副作用的工具，为避免重复写入，WorkBee 不会自动重放。</small>}
      </Card>}
      {workspace && messages.length === 0 && !activeRun && <section className="agent-empty"><h2>准备好了</h2><p>可以试试：“先阅读 README，然后告诉我这个项目的结构和下一步建议。”</p></section>}
      {messages.map(message => <Message key={message.id} role={message.role} roleId={message.role_id} createdAt={message.created_at} content={message.content} error={message.is_error} roles={roles} editable={!activeRun && message.id === [...messages].reverse().find(item => item.role === 'user')?.id} onEdit={() => editMessage(message)} messageRef={node => {
        if (node) messageNodesRef.current.set(message.id, node);
        else messageNodesRef.current.delete(message.id);
      }}/>) }
      {selectingRole && <div className="role-routing"><span className="routing-avatars">{roles.filter(role => selectedRoleIds.includes(role.id)).slice(0, 4).map(role => <Avatar key={role.id} image={roleAvatar(role)} size={26}/>)}</span><span><strong>正在选择合适的角色 · {elapsedSeconds}秒</strong><small>团队会根据当前问题和对话上下文决定由谁回答</small></span><LoaderCircle size={14}/></div>}
      {!selectingRole && (activeRun || streaming) && <Message role="assistant" roleId={respondingRoleId} content={streaming} streaming streamingStatus={streamingStatus} elapsedSeconds={elapsedSeconds} roles={roles}/>}
      {error && <div className="run-error"><CircleAlert size={16}/><span>{error}</span></div>}
      {approvals.length > 0 && <ApprovalCards/>}
    </div>
    {messages.length > 1 && <nav className="history-dots" aria-label="消息历史目录">
      {messages.map((message, index) => <div key={message.id} role="button" tabIndex={0} className={activeMessageId === message.id ? 'active' : ''} aria-label={`跳转到第 ${index + 1} 条消息：${messageSummary(message)}`} aria-current={activeMessageId === message.id ? 'location' : undefined} onClick={() => scrollToMessage(message.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') scrollToMessage(message.id); }}>
        <i aria-hidden="true"/><span role="tooltip">{messageSummary(message)}</span>
      </div>)}
    </nav>}
    {showLatest && <button className="scroll-latest" onClick={() => scrollToLatest()}><ArrowDown size={15}/></button>}
    </section>
    <div className="chat-composer agent-composer">
      {mode === 'task' && <div className="task-schedule"><div className="task-schedule-switcher"><button className={!scheduleAt && recurrence === '不循环' ? 'active' : ''} onClick={() => { setScheduleAt(''); setRecurrence('不循环'); }}><Clock3 size={12}/>单次</button><button className={recurrence !== '不循环' ? 'active' : ''} onClick={() => { setScheduleAt(''); setRecurrence('每天'); }}><RefreshCw size={12}/>循环</button></div><div className="task-schedule-control">{scheduleAt || recurrence === '不循环' ? <><input type="datetime-local" value={scheduleAt} onChange={event => setScheduleAt(event.target.value)} aria-label="执行时间"/><span>执行一次</span></> : <><select value={recurrence} onChange={event => setRecurrence(event.target.value)} aria-label="循环执行"><option>每小时</option><option>每天</option><option>每周</option><option>每月</option></select><span>重复执行</span></>}</div></div>}
      <Composer compact value={draft} onChange={setDraft} onSubmit={submit} disabled={Boolean(activeRun)} running={Boolean(activeRun)} onCancel={cancel} mode={mode} onModeChange={setMode}
        roles={roles} selectedRoleId={selectedRoleId} selectedRoleIds={selectedRoleIds} onRoleChange={selectRole} approvalMode={approvalMode} onApprovalModeChange={setApprovalMode}/>
      <div className="workflow-bar">{workflows.map(flow => <div draggable key={flow.id} className={`workflow-chip ${activeWorkflowId === flow.id ? 'active' : ''} ${draggedWorkflowId === flow.id ? 'dragging' : ''}`} title={flow.description || `${flow.documents.length} 个引用文档`} onDragStart={event => { setDraggedWorkflowId(flow.id); event.dataTransfer.effectAllowed = 'move'; }} onDragEnter={event => { event.preventDefault(); if (draggedWorkflowId && draggedWorkflowId !== flow.id) reorderWorkflows(draggedWorkflowId, flow.id); }} onDragOver={event => event.preventDefault()} onDragEnd={() => setDraggedWorkflowId('')}><button className="workflow-select" onClick={() => setActiveWorkflow(flow.id)}><GripVertical size={13}/><span>{flow.name}</span></button><button className="workflow-remove" aria-label={`删除流程 ${flow.name}`} disabled={workflows.length === 1} onClick={() => { if (confirm(`确定删除流程“${flow.name}”吗？`)) removeWorkflow(flow.id); }}><X size={13}/></button></div>)}<button className="workflow-add" onClick={addWorkflow}><Plus size={15}/>添加工作流</button></div>
    </div>
  </div>;
}

function ChatSidebar() {
  const { selectedRoleIds, selectRole, roles, workspace, selectWorkspace, fileTree, refreshFileTree, workflows, activeWorkflowId, updateWorkflow, toggleWorkflowDocument, setDraft, setMode } = useAgent();
  const [tab, setTab] = useState('Work');
  const [documentPicker, setDocumentPicker] = useState(false);
  const [rolePicker, setRolePicker] = useState(false);
  const [folderMenu, setFolderMenu] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState('');
  const [activeTaskId, setActiveTaskId] = useState('');
  const [taskEditing, setTaskEditing] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [tasks, setTasks] = useState<TaskRecord[]>(() => readTaskRecords('workbee.tasks.v1').filter(task => task.status !== 'done'));
  const [archivedTasks, setArchivedTasks] = useState<TaskRecord[]>(() => readTaskRecords('workbee.tasks.archive.v1'));
  const [refreshingFiles, setRefreshingFiles] = useState(false);
  const activeWorkflow = workflows.find(flow => flow.id === activeWorkflowId);
  const [workflowName, setWorkflowName] = useState(activeWorkflow?.name || '');
  const [workflowDescription, setWorkflowDescription] = useState(activeWorkflow?.description || '');
  const [workflowEditing, setWorkflowEditing] = useState(false);
  useEffect(() => { setWorkflowName(activeWorkflow?.name || ''); setWorkflowDescription(activeWorkflow?.description || ''); setWorkflowEditing(false); }, [activeWorkflowId, activeWorkflow?.name, activeWorkflow?.description]);
  useEffect(() => { const refreshTasks = () => { const active = readTaskRecords('workbee.tasks.v1'); const completed = active.filter(task => task.status === 'done'); if (completed.length) { const archived = readTaskRecords('workbee.tasks.archive.v1'); localStorage.setItem('workbee.tasks.archive.v1', JSON.stringify([...completed.map(task => ({ ...task, archivedAt: task.lastRunAt || Date.now() })), ...archived.filter(item => !completed.some(task => task.id === item.id))])); localStorage.setItem('workbee.tasks.v1', JSON.stringify(active.filter(task => task.status !== 'done'))); } setTasks(active.filter(task => task.status !== 'done')); setArchivedTasks(readTaskRecords('workbee.tasks.archive.v1')); }; refreshTasks(); addEventListener('workbee:tasks-updated', refreshTasks); return () => removeEventListener('workbee:tasks-updated', refreshTasks); }, []);
  useEffect(() => { const restoreTask = (event: Event) => { const task = (event as CustomEvent<{ title: string; schedule: string; repeat: string }>).detail; setDraft(task.title); setMode('task'); window.dispatchEvent(new CustomEvent('workbee:restore-task-schedule', { detail: task })); }; addEventListener('workbee:edit-task', restoreTask); return () => removeEventListener('workbee:edit-task', restoreTask); }, [setDraft, setMode]);
  const selectedDocuments = KNOWLEDGE_DOCUMENTS.filter(document => activeWorkflow?.documents.includes(document.id));
  const teamMembers = roles.filter(role => selectedRoleIds.includes(role.id));
  const teamRows = Array.from({ length: Math.max(1, Math.ceil((teamMembers.length + 1) / 2)) }, (_, index) => teamMembers.slice(index * 2, index * 2 + 2));
  const addTeamMember = () => setRolePicker(true);
  useEffect(() => { localStorage.setItem('workbee.tasks.v1', JSON.stringify(tasks)); }, [tasks]);
  useEffect(() => { localStorage.setItem('workbee.tasks.archive.v1', JSON.stringify(archivedTasks)); }, [archivedTasks]);
  const refreshFiles = async () => {
    if (refreshingFiles || !workspace) return;
    setRefreshingFiles(true);
    try { await refreshFileTree(); } finally { setRefreshingFiles(false); }
  };
  return <div className="chat-side-content agent-side"><Tabs items={['Work','文件','预览','Git']} value={tab} onChange={setTab}/>
    {tab === 'Work' && <div className="side-tab-panel work-panel">
      <section className="work-section project-section"><div className="work-section-heading"><span><FolderOpen size={15}/></span><div><h3>项目文件夹</h3></div></div><div className="workspace-picker-wrap" title={workspace?.path || '尚未选择文件夹'} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFolderMenu(false); }}><button className="workspace-card" aria-expanded={folderMenu} onClick={() => setFolderMenu(value => !value)}><span><strong>{workspace?.name || '选择本地文件夹'}</strong><small>{workspace?.path || 'Agent 只会访问你授权的文件夹'}</small></span><ChevronRight size={15}/></button>{folderMenu && <div className="workspace-float-menu"><button onClick={() => { setFolderMenu(false); selectWorkspace(); }}><FolderOpen size={14}/>更换文件夹</button>{workspace && <button onClick={() => { setFolderMenu(false); window.workbeeDesktop?.agent.openWorkspace(workspace.path)?.catch(error => alert(error instanceof Error ? error.message : String(error))); }}><ExternalLink size={14}/>打开文件夹</button>}</div>}</div></section>
      <section className="work-section"><div className="work-section-heading"><span><Workflow size={15}/></span><div><h3>流程</h3></div><button className="workflow-edit-toggle" onClick={() => setWorkflowEditing(value => !value)}>{workflowEditing ? <X size={14}/> : <Pencil size={14}/>}</button></div>{workflowEditing ? <div className="workflow-editor"><label>流程名称<input value={workflowName} onChange={event => setWorkflowName(event.target.value)}/></label><label>流程描述<textarea value={workflowDescription} onChange={event => setWorkflowDescription(event.target.value)}/></label><button onClick={() => { updateWorkflow({ name: workflowName, description: workflowDescription }); setWorkflowEditing(false); }}><Save size={13}/>保存流程</button></div> : <div className="workflow-readonly"><strong>{activeWorkflow?.name}</strong><p>{activeWorkflow?.description || '暂无流程描述'}</p></div>}</section>
      <section className="work-section"><div className="work-section-heading"><span><Users size={15}/></span><div><h3>Team</h3></div><small>{selectedRoleIds.length}/{roles.length}</small></div><div className="mini-agent-grid">{teamRows.map((row, rowIndex) => <div className="mini-agent-row" key={`team-row-${rowIndex}`}>{row.map(role => <RoleCard key={role.id} role={role} compact action={<button className="role-remove" aria-label={`移除 ${role.name}`} onClick={() => selectRole(role.id)}><Minus size={14}/></button>}/>)}{rowIndex === teamRows.length - 1 && <button className="mini-agent-add" onClick={addTeamMember}><span><Plus size={18}/></span><strong>选择角色</strong></button>}</div>)}</div></section>
      {rolePicker && <SettingsModal title="选择参与角色" close={() => setRolePicker(false)}><div className="settings-modal-list role-reference-list">{roles.map(role => <label key={role.id}><input type="checkbox" checked={selectedRoleIds.includes(role.id)} onChange={() => selectRole(role.id)}/><img src={roleAvatar(role)} alt=""/><span><strong>{role.name}</strong><small>{role.role} · {role.modelName}</small></span></label>)}</div><footer className="settings-modal-footer"><span>已选择 {selectedRoleIds.length} 个角色</span><button onClick={() => setRolePicker(false)}>完成</button></footer></SettingsModal>}
      <section className="work-section"><div className="work-section-heading"><span><Clock3 size={15}/></span><div><h3>任务</h3></div><div className="task-heading-actions"><button aria-label="查看任务归档" title="查看任务归档" onClick={() => setArchiveOpen(true)}><Archive size={14}/></button><button aria-label={taskEditing ? '完成任务编辑' : '编辑任务列表'} title={taskEditing ? '完成编辑' : '编辑任务列表'} className={taskEditing ? 'active' : ''} onClick={() => setTaskEditing(value => !value)}>{taskEditing ? <Check size={14}/> : <Pencil size={14}/>}</button></div></div><div className="task-list">{tasks.length ? tasks.map(task => {
        const recurring = task.repeat !== '不循环';
        const executed = task.status === 'done';
        return <div className={`task-row ${taskEditing ? 'editing' : ''} ${task.status === 'error' ? 'task-failed' : ''} ${activeTaskId === task.id ? 'active' : ''} ${draggedTaskId === task.id ? 'dragging' : ''}`} draggable={taskEditing} key={task.id} onDragStart={() => taskEditing && setDraggedTaskId(task.id)} onDragOver={event => taskEditing && event.preventDefault()} onDrop={() => { if (!taskEditing) return; const from = tasks.findIndex(item => item.id === draggedTaskId); const to = tasks.findIndex(item => item.id === task.id); if (from >= 0 && to >= 0 && from !== to) setTasks(items => { const next = [...items]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); return next; }); setDraggedTaskId(''); }} onDragEnd={() => setDraggedTaskId('')}>
          <GripVertical className="task-drag-handle" size={13}/><span className={`task-status ${recurring ? 'task-run-count' : executed ? 'task-complete' : 'task-pending'}`} aria-label={recurring ? `已执行 ${task.runCount || 0} 次` : executed ? '已执行' : '未执行'}>{recurring ? task.runCount || 0 : <Check size={13}/>}</span>
          <button className="task-title" onClick={() => setActiveTaskId(value => value === task.id ? '' : task.id)}><strong>{task.title}</strong><small>{task.status === 'error' ? '执行失败 · ' : task.status === 'running' ? '执行中 · ' : ''}{task.schedule} · {task.repeat}</small></button>
          {taskEditing && <span className="task-actions"><button className="task-edit" aria-label="编辑任务" onClick={() => { setDraft(task.title); setMode('task'); window.dispatchEvent(new CustomEvent('workbee:edit-task', { detail: task })); }}><Pencil size={13}/></button><button aria-label="删除任务" onClick={() => { if (confirm(`确定删除任务“${task.title}”吗？`)) setTasks(items => items.filter(item => item.id !== task.id)); }}><Trash2 size={13}/></button></span>}
        </div>;
      }) : <p className="task-empty">在输入框切换到“任务”后设置执行时间。</p>}</div>{archiveOpen && <SettingsModal title="任务归档"  close={() => setArchiveOpen(false)}><div className="settings-modal-list task-archive-list">{archivedTasks.length ? archivedTasks.map(task => <div className="task-archive-row" key={task.id}><span className="task-status task-complete"><Check size={13}/></span><span><strong>{task.title}</strong><small>{task.schedule} · 完成于 {task.lastRunAt ? new Date(task.lastRunAt).toLocaleString('zh-CN') : '未知时间'}</small></span></div>) : <p className="task-empty">暂无已完成的单次任务。</p>}</div></SettingsModal>}</section>
      <section className="work-section document-section"><div className="work-section-heading"><span><BookOpen size={15}/></span><div><h3>文档</h3></div><small>{selectedDocuments.length}</small></div><div className="selected-document-list">{selectedDocuments.length ? selectedDocuments.map(document => <div key={document.id}><img src={document.icon} alt=""/><span><strong>{document.name}</strong><small>{document.location}</small></span><button aria-label={`移除 ${document.name}`} onClick={() => toggleWorkflowDocument(document.id)}><X size={13}/></button></div>) : <p>还没有为当前流程引用文档。</p>}</div><button className="choose-document-button" onClick={() => setDocumentPicker(true)}><Plus size={14}/>选择引用文档</button></section>
      {documentPicker && <SettingsModal title="选择引用文档" ariaLabel="选择引用文档" description="内容来自左侧“文档”菜单，勾选后将用于当前流程。" close={() => setDocumentPicker(false)}><div className="settings-modal-list role-reference-list">{KNOWLEDGE_DOCUMENTS.map(document => <label key={document.id}><input type="checkbox" checked={activeWorkflow?.documents.includes(document.id) || false} onChange={() => toggleWorkflowDocument(document.id)}/><img src={document.icon} alt=""/><span><strong>{document.name}</strong><small>{document.type.toUpperCase()} · {document.location}</small></span></label>)}</div><footer className="settings-modal-footer"><span>已选择 {selectedDocuments.length} 项</span><button onClick={() => setDocumentPicker(false)}>完成</button></footer></SettingsModal>}
    </div>}
    {tab === '文件' && <div className="side-tab-panel file-panel"><div className="file-panel-heading"><div><h3>{workspace?.name || '当前文件夹'}</h3><p title={workspace?.path || ''}>{workspace?.path || '尚未选择项目文件夹'}</p></div><div className="file-panel-actions"><button title="打开当前文件夹" aria-label="打开当前文件夹" disabled={!workspace} onClick={() => workspace && window.workbeeDesktop?.agent.openWorkspace(workspace.path)?.catch(error => alert(error instanceof Error ? error.message : String(error)))}><ExternalLink size={15}/></button><button title="刷新文件" aria-label="刷新文件" disabled={!workspace || refreshingFiles} onClick={refreshFiles}><RefreshCw className={refreshingFiles ? 'spinning' : ''} size={15}/></button></div></div>{fileTree.length ? <FileTree nodes={fileTree}/> : <div className="empty-tab"><p>选择当前文件夹后显示目录结构。</p></div>}</div>}
    {tab === '预览' && <div className="empty-tab"><strong>预览</strong><p>选择产出内容后，可在此处进行实时预览。</p></div>}
    {tab === 'Git' && <div className="empty-tab"><strong>Git</strong><p>Git 状态和变更预览将在这里显示。</p></div>}
  </div>;
}

ChatPage.Sidebar = ChatSidebar;

function FileTree({ nodes }: { nodes: FileTreeNode[] }) {
  return <div className="workspace-file-tree">{nodes.map(node => node.type === 'directory' ? <details key={node.path} open><summary><Folder size={14}/>{node.name}</summary><FileTree nodes={node.children || []}/></details> : <div className="tree-file" key={node.path} title={node.path}><File size={14}/><span>{node.name}</span></div>)}</div>;
}
