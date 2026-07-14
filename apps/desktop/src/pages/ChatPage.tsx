import { useEffect, useRef, useState } from 'react';
import { ArrowDown, BookOpen, Check, ChevronRight, CircleAlert, File, FileCode2, Folder, FolderOpen, GripVertical, LoaderCircle, Plus, RefreshCw, Save, ShieldAlert, Square, Users, Workflow, X } from 'lucide-react';
import { useAgent } from '../agent/AgentContext';
import { Composer } from '../components/Composer';
import { ModalDialog } from '../components/ModalDialog';
import { Avatar, Card, Tabs } from '../components/ui';
import { KNOWLEDGE_DOCUMENTS } from '../data/catalog';
import { roleAvatar } from '../data/roleAvatars';

function Message({ role, content, roleId = 'aivra', createdAt, streaming = false, roles, messageRef }: { role: 'user' | 'assistant'; content: string; roleId?: string; createdAt?: string; streaming?: boolean; roles: RoleConfig[]; messageRef?: (node: HTMLDivElement | null) => void }) {
  const bot = role === 'assistant';
  const respondingRole = roles.find(item => item.id === roleId) || roles[0];
  const name = bot ? respondingRole?.name || 'Aivra' : '你';
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(createdAt ? new Date(createdAt) : new Date());
  return <div className={`message message-row ${bot ? 'team-message' : 'user-message'}`} ref={messageRef}>
    <Avatar image={bot ? roleAvatar(respondingRole) : undefined} kind={bot ? 'cat' : 'yellow'} size={30}/>
    <div className="message-content"><header><strong>{name}</strong><small>{bot ? '回复' : '发送'} · {time}</small>{streaming && <small className="streaming-label"><LoaderCircle size={12}/>正在处理</small>}</header>
      <Card className="message-card"><p className="message-text">{content || '正在思考…'}</p></Card>
    </div>
  </div>;
}

function messageSummary(message: ThreadMessage) {
  const text = message.content.replace(/\s+/g, ' ').trim() || '空消息';
  const summary = text.length > 38 ? `${text.slice(0, 38)}…` : text;
  return `${message.role === 'user' ? '你' : 'Aivra'}：${summary}`;
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

export function ChatPage() {
  const { workspace, runtime, roles, selectedRoleId, selectedRoleIds, selectRole, workflows, activeWorkflowId, setActiveWorkflow, addWorkflow, removeWorkflow, reorderWorkflows, pendingPrompt, clearPendingPrompt, draft, setDraft, messages, streaming, respondingRoleId, selectingRole, activeRun, error, approvals, mode, approvalMode, setMode, setApprovalMode, selectWorkspace, send, cancel } = useAgent();
  const messagesRef = useRef<HTMLDivElement>(null);
  const messageNodesRef = useRef(new Map<string, HTMLDivElement>());
  const followLatestRef = useRef(true);
  const userScrollingRef = useRef(false);
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyFrameRef = useRef<number | null>(null);
  const [showLatest, setShowLatest] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState('');
  const [draggedWorkflowId, setDraggedWorkflowId] = useState('');
  const pendingSendingRef = useRef('');

  useEffect(() => {
    if (!pendingPrompt || !runtime.ready || activeRun || pendingSendingRef.current === pendingPrompt) return;
    pendingSendingRef.current = pendingPrompt;
    send(pendingPrompt).then(() => { clearPendingPrompt(); setDraft(''); }).catch(() => { clearPendingPrompt(); pendingSendingRef.current = ''; });
  }, [pendingPrompt, workspace, runtime.ready, activeRun, send, clearPendingPrompt, setDraft]);

  const submit = async (value: string) => {
    followLatestRef.current = true; setShowLatest(false);
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
      {workspace && messages.length === 0 && !activeRun && <section className="agent-empty"><h2>准备好了</h2><p>可以试试：“先阅读 README，然后告诉我这个项目的结构和下一步建议。”</p></section>}
      {messages.map(message => <Message key={message.id} role={message.role} roleId={message.role_id} createdAt={message.created_at} content={message.content} roles={roles} messageRef={node => {
        if (node) messageNodesRef.current.set(message.id, node);
        else messageNodesRef.current.delete(message.id);
      }}/>) }
      {selectingRole && <div className="role-routing"><span className="routing-avatars">{roles.filter(role => selectedRoleIds.includes(role.id)).slice(0, 4).map(role => <Avatar key={role.id} image={roleAvatar(role)} size={26}/>)}</span><span><strong>正在选择合适的角色</strong><small>团队会根据当前问题和对话上下文决定由谁回答</small></span><LoaderCircle size={14}/></div>}
      {!selectingRole && (activeRun || streaming) && <Message role="assistant" roleId={respondingRoleId} content={streaming} streaming roles={roles}/>}
      {error && <div className="run-error"><CircleAlert size={16}/><span>{error}</span></div>}
      {approvals.length > 0 && <ApprovalCards/>}
    </div>
    {messages.length > 1 && <nav className="history-dots" aria-label="消息历史目录">
      {messages.map((message, index) => <button key={message.id} type="button" className={activeMessageId === message.id ? 'active' : ''} aria-label={`跳转到第 ${index + 1} 条消息：${messageSummary(message)}`} aria-current={activeMessageId === message.id ? 'location' : undefined} onClick={() => scrollToMessage(message.id)}>
        <i aria-hidden="true"/><span role="tooltip">{messageSummary(message)}</span>
      </button>)}
    </nav>}
    {showLatest && <button className="scroll-latest" onClick={() => scrollToLatest()}><ArrowDown size={15}/></button>}
    <div className="chat-composer agent-composer">
      {activeRun && <button className="cancel-run" onClick={cancel}><Square size={12}/>停止当前任务</button>}
      <Composer compact value={draft} onChange={setDraft} onSubmit={submit} disabled={Boolean(activeRun)} mode={mode} onModeChange={setMode}
        roles={roles} selectedRoleId={selectedRoleId} selectedRoleIds={selectedRoleIds} onRoleChange={selectRole} approvalMode={approvalMode} onApprovalModeChange={setApprovalMode}/>
      <div className="workflow-bar">{workflows.map(flow => <div draggable key={flow.id} className={`workflow-chip ${activeWorkflowId === flow.id ? 'active' : ''} ${draggedWorkflowId === flow.id ? 'dragging' : ''}`} title={flow.description || `${flow.documents.length} 个引用文档`} onDragStart={event => { setDraggedWorkflowId(flow.id); event.dataTransfer.effectAllowed = 'move'; }} onDragEnter={event => { event.preventDefault(); if (draggedWorkflowId && draggedWorkflowId !== flow.id) reorderWorkflows(draggedWorkflowId, flow.id); }} onDragOver={event => event.preventDefault()} onDragEnd={() => setDraggedWorkflowId('')}><button className="workflow-select" onClick={() => setActiveWorkflow(flow.id)}><GripVertical size={13}/><span>{flow.name}</span></button><button className="workflow-remove" aria-label={`删除流程 ${flow.name}`} disabled={workflows.length === 1} onClick={() => { if (confirm(`确定删除流程“${flow.name}”吗？`)) removeWorkflow(flow.id); }}><X size={13}/></button></div>)}<button className="workflow-add" onClick={addWorkflow}><Plus size={15}/>添加工作流</button></div>
    </div>
  </div>;
}

function ChatSidebar() {
  const { selectedRoleIds, selectRole, roles, workspace, selectWorkspace, fileTree, refreshFileTree, workflows, activeWorkflowId, updateWorkflow, toggleWorkflowDocument, setSelectedTeamRoleId } = useAgent();
  const [tab, setTab] = useState('Work');
  const [documentPicker, setDocumentPicker] = useState(false);
  const [refreshingFiles, setRefreshingFiles] = useState(false);
  const activeWorkflow = workflows.find(flow => flow.id === activeWorkflowId);
  const [workflowName, setWorkflowName] = useState(activeWorkflow?.name || '');
  const [workflowDescription, setWorkflowDescription] = useState(activeWorkflow?.description || '');
  useEffect(() => { setWorkflowName(activeWorkflow?.name || ''); setWorkflowDescription(activeWorkflow?.description || ''); }, [activeWorkflowId, activeWorkflow?.name, activeWorkflow?.description]);
  const selectedDocuments = KNOWLEDGE_DOCUMENTS.filter(document => activeWorkflow?.documents.includes(document.id));
  const addTeamMember = () => {
    setSelectedTeamRoleId('__new__');
    location.hash = '/team';
    setTimeout(() => window.dispatchEvent(new Event('aivra:open-right-panel')), 0);
  };
  const refreshFiles = async () => {
    if (refreshingFiles || !workspace) return;
    setRefreshingFiles(true);
    try { await refreshFileTree(); } finally { setRefreshingFiles(false); }
  };
  return <div className="chat-side-content agent-side"><Tabs items={['Work','文件','预览','Git']} value={tab} onChange={setTab}/>
    {tab === 'Work' && <div className="side-tab-panel work-panel">
      <section className="work-section project-section"><div className="work-section-heading"><span><FolderOpen size={15}/></span><div><h3>项目文件夹</h3><p>当前对话可访问的本地项目</p></div></div><button className="workspace-card" onClick={selectWorkspace}><span className="workspace-card-icon"><Folder size={17}/></span><span><strong>{workspace?.name || '选择本地文件夹'}</strong><small>{workspace?.path || 'Agent 只会访问你授权的文件夹'}</small></span><ChevronRight size={15}/></button></section>
      <section className="work-section"><div className="work-section-heading"><span><Users size={15}/></span><div><h3>Team</h3><p>选择参与当前流程的成员</p></div><small>{selectedRoleIds.length}/{roles.length}</small></div><div className="mini-agent-grid">{roles.map(role => <Card className={selectedRoleIds.includes(role.id) ? 'selected' : ''} key={role.id}><button onClick={() => selectRole(role.id)}><Avatar image={roleAvatar(role)} size={36}/><div><strong>{role.name}</strong><small>{role.role}</small></div><i>{selectedRoleIds.includes(role.id) ? <Check size={12}/> : <Plus size={12}/>}</i></button><footer><span>{role.modelName}</span><span>{role.keyAvailable ? '模型就绪' : '待配置'}</span></footer></Card>)}<button className="mini-agent-add" onClick={addTeamMember}><span><Plus size={18}/></span><strong>添加成员</strong><small>创建新的智能体</small></button></div></section>
      <section className="work-section"><div className="work-section-heading"><span><Workflow size={15}/></span><div><h3>流程</h3><p>设置当前流程的目标与说明</p></div></div><div className="workflow-editor"><label>流程名称<input value={workflowName} onChange={event => setWorkflowName(event.target.value)}/></label><label>流程描述<textarea value={workflowDescription} onChange={event => setWorkflowDescription(event.target.value)}/></label><button onClick={() => updateWorkflow({ name: workflowName, description: workflowDescription })}><Save size={13}/>保存流程</button></div></section>
      <section className="work-section document-section"><div className="work-section-heading"><span><BookOpen size={15}/></span><div><h3>文档</h3><p>从“文档”菜单中选择引用</p></div><small>{selectedDocuments.length}</small></div><div className="selected-document-list">{selectedDocuments.length ? selectedDocuments.map(document => <div key={document.id}><img src={document.icon} alt=""/><span><strong>{document.name}</strong><small>{document.location}</small></span><button aria-label={`移除 ${document.name}`} onClick={() => toggleWorkflowDocument(document.id)}><X size={13}/></button></div>) : <p>还没有为当前流程引用文档。</p>}</div><button className="choose-document-button" onClick={() => setDocumentPicker(true)}><Plus size={14}/>选择引用文档</button></section>
      {documentPicker && <ModalDialog title="选择引用文档" ariaLabel="选择引用文档" description="内容来自左侧“文档”菜单，勾选后将用于当前流程。" close={() => setDocumentPicker(false)} className="reference-picker-dialog"><div className="role-reference-list">{KNOWLEDGE_DOCUMENTS.map(document => <label key={document.id}><input type="checkbox" checked={activeWorkflow?.documents.includes(document.id) || false} onChange={() => toggleWorkflowDocument(document.id)}/><img src={document.icon} alt=""/><span><strong>{document.name}</strong><small>{document.type.toUpperCase()} · {document.location}</small></span></label>)}</div><footer><span>已选择 {selectedDocuments.length} 项</span><button onClick={() => setDocumentPicker(false)}>完成</button></footer></ModalDialog>}
    </div>}
    {tab === '文件' && <div className="side-tab-panel file-panel"><div className="file-panel-heading"><div><h3>{workspace?.name || '当前文件夹'}</h3><p>{workspace ? '项目目录结构' : '尚未选择项目文件夹'}</p></div><button title="刷新文件" aria-label="刷新文件" disabled={!workspace || refreshingFiles} onClick={refreshFiles}><RefreshCw className={refreshingFiles ? 'spinning' : ''} size={15}/></button></div>{fileTree.length ? <FileTree nodes={fileTree}/> : <div className="empty-tab"><p>选择当前文件夹后显示目录结构。</p></div>}</div>}
    {tab === '预览' && <div className="empty-tab"><strong>预览</strong><p>选择产出内容后，可在此处进行实时预览。</p></div>}
    {tab === 'Git' && <div className="empty-tab"><strong>Git</strong><p>Git 状态和变更预览将在这里显示。</p></div>}
  </div>;
}

ChatPage.Sidebar = ChatSidebar;

function FileTree({ nodes }: { nodes: FileTreeNode[] }) {
  return <div className="workspace-file-tree">{nodes.map(node => node.type === 'directory' ? <details key={node.path} open><summary><Folder size={14}/>{node.name}</summary><FileTree nodes={node.children || []}/></details> : <div className="tree-file" key={node.path} title={node.path}><File size={14}/><span>{node.name}</span></div>)}</div>;
}
