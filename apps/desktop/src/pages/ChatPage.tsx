import { useEffect, useRef, useState } from 'react';
import { ArrowDown, Check, CircleAlert, File, FileCode2, Folder, FolderOpen, LoaderCircle, Plus, ShieldAlert, Square, X } from 'lucide-react';
import { useAgent } from '../agent/AgentContext';
import { Composer } from '../components/Composer';
import { Avatar, Card, Tabs } from '../components/ui';
import aivraAvatar from '../assets/images/Team/Aivra.png';
import avaAvatar from '../assets/images/Team/Ava.png';
import emmaAvatar from '../assets/images/Team/Emma.png';

const roleImages: Record<string, string> = { aivra: aivraAvatar, ava: avaAvatar, emma: emmaAvatar };

function Message({ role, content, roleId = 'aivra', createdAt, streaming = false, roles }: { role: 'user' | 'assistant'; content: string; roleId?: string; createdAt?: string; streaming?: boolean; roles: RoleConfig[] }) {
  const bot = role === 'assistant';
  const respondingRole = roles.find(item => item.id === roleId) || roles[0];
  const name = bot ? respondingRole?.name || 'Aivra' : '你';
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(createdAt ? new Date(createdAt) : new Date());
  return <div className={`message message-row ${bot ? 'team-message' : 'user-message'}`}>
    <Avatar image={bot ? roleImages[roleId] || aivraAvatar : undefined} kind={bot ? 'cat' : 'yellow'} size={30}/>
    <div className="message-content"><header><strong>{name}</strong><small>{bot ? '回复' : '发送'} · {time}</small>{streaming && <small className="streaming-label"><LoaderCircle size={12}/>正在处理</small>}</header>
      <Card className="message-card"><p className="message-text">{content || '正在思考…'}</p></Card>
    </div>
  </div>;
}

function ApprovalCards() {
  const { approvals, resolveApproval } = useAgent();
  return <>{approvals.map(approval => <Card className="approval-card" key={approval.approvalId}>
    <div className="approval-title"><ShieldAlert size={18}/><div><strong>需要你的批准</strong><span>{approval.summary}</span></div></div>
    <pre>{safeArguments(approval.name, approval.arguments)}</pre>
    <div className="approval-actions"><button className="deny" onClick={() => resolveApproval(approval.approvalId, false)}><X size={14}/>拒绝</button><button className="approve" onClick={() => resolveApproval(approval.approvalId, true)}><Check size={14}/>批准一次</button></div>
  </Card>)}</>;
}

function safeArguments(name: string, args: Record<string, unknown>) {
  if (name === 'write_file') return `path: ${String(args.path || '')}\ncontent: ${String(args.content || '').slice(0, 500)}${String(args.content || '').length > 500 ? '…' : ''}`;
  return JSON.stringify(args, null, 2).slice(0, 800);
}

export function ChatPage() {
  const { workspace, runtime, roles, selectedRoleId, selectedRoleIds, selectRole, workflows, activeWorkflowId, setActiveWorkflow, addWorkflow, pendingPrompt, clearPendingPrompt, draft, setDraft, messages, streaming, respondingRoleId, activeRun, error, approvals, mode, approvalMode, setMode, setApprovalMode, selectWorkspace, send, cancel, threads, threadId, openThread } = useAgent();
  const messagesRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const pendingSendingRef = useRef('');

  useEffect(() => {
    if (!pendingPrompt || !workspace || !runtime.ready || activeRun || pendingSendingRef.current === pendingPrompt) return;
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
  useEffect(() => {
    if (!followLatestRef.current) return;
    const frame = requestAnimationFrame(() => scrollToLatest(false));
    return () => cancelAnimationFrame(frame);
  }, [messages.length, streaming, activeRun, approvals.length, error]);

  return <div className="chat-page agent-chat-page">
    <div className="messages agent-messages" ref={messagesRef} onScroll={() => {
      const node = messagesRef.current;
      if (!node) return;
      const atLatest = node.scrollHeight - node.scrollTop - node.clientHeight < 72;
      followLatestRef.current = atLatest; setShowLatest(!atLatest);
    }}>
      {!workspace && <section className="agent-onboarding"><div className="onboarding-icon"><FileCode2 size={28}/></div><h2>让 Aivra 在你的项目中工作</h2><p>选择一个本地文件夹后，Agent 只能读写该文件夹内的文件，文件夹外访问会被工具层和系统沙箱拒绝。</p><button onClick={selectWorkspace}><FolderOpen size={16}/>选择工作区</button></section>}
      {workspace && messages.length === 0 && !activeRun && <section className="agent-empty"><h2>准备好了</h2><p>可以试试：“先阅读 README，然后告诉我这个项目的结构和下一步建议。”</p></section>}
      {messages.map(message => <Message key={message.id} role={message.role} roleId={message.role_id} createdAt={message.created_at} content={message.content} roles={roles}/>)}
      {(activeRun || streaming) && <Message role="assistant" roleId={respondingRoleId} content={streaming} streaming roles={roles}/>}
      {error && <div className="run-error"><CircleAlert size={16}/><span>{error}</span></div>}
      {approvals.length > 0 && <ApprovalCards/>}
    </div>
    {threads.length > 0 && <nav className="history-dots" aria-label="对话历史">{threads.map(thread => <button key={thread.id} className={thread.id === threadId ? 'active' : ''} onClick={() => openThread(thread.id)}><i/><span>{thread.title.length > 20 ? `${thread.title.slice(0,20)}…` : thread.title}</span></button>)}</nav>}
    {showLatest && <button className="scroll-latest" onClick={() => scrollToLatest()}><ArrowDown size={15}/>回到最新</button>}
    <div className="chat-composer agent-composer">
      {activeRun && <button className="cancel-run" onClick={cancel}><Square size={12}/>停止当前任务</button>}
      <div className="composer-workspace"><button onClick={selectWorkspace} title={workspace?.path}><FolderOpen size={15}/><span><small>当前文件夹</small><strong>{workspace ? workspace.name : '选择当前文件夹'}</strong></span><em>{workspace ? '切换' : '选择'}</em></button>{workspace && <p>Agent 只能读写此文件夹，文件夹外访问已禁止。</p>}</div>
      <Composer compact value={draft} onChange={setDraft} onSubmit={submit} disabled={!workspace || Boolean(activeRun)} mode={mode} onModeChange={setMode}
        roles={roles} selectedRoleId={selectedRoleId} selectedRoleIds={selectedRoleIds} onRoleChange={selectRole} approvalMode={approvalMode} onApprovalModeChange={setApprovalMode}/>
      <div className="ui-tabs workflow-bar">{workflows.map(flow => <button key={flow.id} className={activeWorkflowId === flow.id ? 'active' : ''} onClick={() => setActiveWorkflow(flow.id)} title={`${flow.roleIds.length} 个候选角色 · ${flow.documents.length} 个文档`}>{flow.name}<small>{flow.roleIds.length + flow.documents.length}</small></button>)}<button onClick={addWorkflow}>＋ 添加</button></div>
    </div>
  </div>;
}

function ChatSidebar() {
  const { runtime, selectedRole, selectedRoleIds, selectRole, roles, workspace, activity, selectWorkspace, fileTree, workflows, activeWorkflowId, toggleWorkflowDocument } = useAgent();
  const [tab, setTab] = useState('Work');
  const activeWorkflow = workflows.find(flow => flow.id === activeWorkflowId);
  const documents = flattenFiles(fileTree).slice(0, 80);
  return <div className="chat-side-content agent-side"><Tabs items={['运行','Work','文件','预览','Git']} value={tab} onChange={setTab}/>
    {tab === '运行' && <div className="side-tab-panel">
      <h3>Agent</h3><Card className="runtime-card"><span className={`runtime-dot runtime-${runtime.status}`}/><div><strong>{runtime.ready ? 'Agent 已就绪' : runtime.status === 'starting' ? 'Agent 启动中' : 'Agent 未连接'}</strong><small>{selectedRole.name} · {selectedRole.model}</small></div></Card>
      <h3>工作区</h3><button className="workspace-card" onClick={selectWorkspace}><FolderOpen size={17}/><span><strong>{workspace?.name || '选择本地文件夹'}</strong><small>{workspace?.path || 'Agent 只会访问授权范围'}</small></span></button>
      <h3>执行过程</h3><div className="activity-list">{activity.length === 0 ? <p>工具调用和结果会显示在这里。</p> : activity.map(item => <div key={item.id} className={`activity-${item.state}`}>{item.state === 'running' ? <LoaderCircle size={14}/> : item.state === 'done' ? <Check size={14}/> : <CircleAlert size={14}/>}<span><strong>{item.label}</strong>{item.detail && <small>{item.detail}</small>}</span></div>)}</div>
    </div>}
    {tab === 'Work' && <div className="side-tab-panel"><h3>流程 · {activeWorkflow?.name}</h3><p className="workflow-help">为当前流程单独配置候选角色和引用文档；运行时会根据对话智能选择真正参与的角色。</p><h3>Team</h3><div className="mini-agent-grid">{roles.map(role => <Card className={selectedRoleIds.includes(role.id) ? 'selected' : ''} key={role.id}><button onClick={() => selectRole(role.id)}><Avatar image={roleImages[role.id] || aivraAvatar} size={36}/><div><strong>{role.name}</strong><small>{role.role}</small></div><i>{selectedRoleIds.includes(role.id) ? <Check size={12}/> : <Plus size={12}/>}</i></button><footer><span>{role.modelName}</span><span>{role.keyAvailable ? '模型就绪' : '待配置'}</span></footer></Card>)}</div><h3>引用文档</h3><div className="document-picker">{documents.length === 0 ? <p>选择工作区后可为本流程添加文档。</p> : documents.map(path => <label key={path}><input type="checkbox" checked={activeWorkflow?.documents.includes(path) || false} onChange={() => toggleWorkflowDocument(path)}/><File size={14}/><span>{path}</span></label>)}</div><h3>状态</h3><div className="status-grid"><Card><strong>{runtime.ready ? '空闲中' : '未连接'}</strong><small>Agent 状态</small></Card><Card><strong>{activity.length}</strong><small>本轮工具调用</small></Card></div></div>}
    {tab === '文件' && <div className="side-tab-panel"><h3>{workspace?.name || '当前文件夹'}</h3>{fileTree.length ? <FileTree nodes={fileTree}/> : <div className="empty-tab"><p>选择当前文件夹后显示目录结构。</p></div>}</div>}
    {tab === '预览' && <div className="empty-tab"><strong>预览</strong><p>选择产出内容后，可在此处进行实时预览。</p></div>}
    {tab === 'Git' && <div className="empty-tab"><strong>Git</strong><p>Git 状态和变更预览将在这里显示。</p></div>}
  </div>;
}

ChatPage.Sidebar = ChatSidebar;

function flattenFiles(nodes: FileTreeNode[]): string[] {
  return nodes.flatMap(node => node.type === 'file' ? [node.path] : flattenFiles(node.children || []));
}

function FileTree({ nodes }: { nodes: FileTreeNode[] }) {
  return <div className="workspace-file-tree">{nodes.map(node => node.type === 'directory' ? <details key={node.path} open><summary><Folder size={14}/>{node.name}</summary><FileTree nodes={node.children || []}/></details> : <div className="tree-file" key={node.path} title={node.path}><File size={14}/><span>{node.name}</span></div>)}</div>;
}
