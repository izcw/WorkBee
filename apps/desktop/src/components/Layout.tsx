import { useEffect, useRef, useState } from 'react';
import { Box, ChevronDown, ChevronRight, FileText, Folder, LogOut, MessageSquare, Minus, MoreHorizontal, PanelBottom, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Pencil, Plus, PlusSquare, Settings, Square, Terminal, ToolCase, Trash2, Users, X } from 'lucide-react';
import type { PageId } from '../types';
import { Avatar, SearchInput } from './ui';
import { SettingsDialog } from './SettingsDialog';
import { ModalDialog } from './ModalDialog';
import { useAgent } from '../agent/AgentContext';

const navigation = [
  { id: 'team', label: '团队', icon: Users },
  { id: 'skills', label: '技能', icon: ToolCase },
  { id: 'plugins', label: '插件', icon: Box },
  { id: 'docs', label: '文档', icon: FileText },
] as const;

function ProfileMenu({ close, openSettings }: { close: () => void; openSettings: () => void }) {
  const { usage } = useAgent();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dismiss = (event: MouseEvent) => !ref.current?.contains(event.target as Node) && close();
    addEventListener('mousedown', dismiss);
    return () => removeEventListener('mousedown', dismiss);
  }, [close]);
  return <div className="profile-menu" ref={ref}>
    <div className="account-summary"><Avatar kind="yellow" size={30}/><div><strong>Yoko</strong><span>izcw@workbee.ai</span></div></div>
    <div className="usage"><span>累计 Token</span><strong>{new Intl.NumberFormat('zh-CN').format(usage.totalTokens)}</strong><small>峰值 {new Intl.NumberFormat('zh-CN').format(usage.peakTokens)}</small></div>
    <button onClick={() => { close(); openSettings(); }}><Settings size={16}/>设置</button><button><LogOut size={16}/>退出登录</button>
  </div>;
}

function RenameProjectDialog({ project, close }: { project: Workspace; close: () => void }) {
  const { renameProject } = useAgent();
  const [name, setName] = useState(project.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    const nextName = name.trim();
    if (!nextName) { setError('项目标题不能为空'); return; }
    if (nextName === project.name) { close(); return; }
    setSaving(true); setError('');
    try { await renameProject(project.id, nextName); close(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  };
  return <ModalDialog title="编辑项目标题" description="修改后会同步显示在项目列表和最近项目中。" close={close} className="project-rename-dialog">
    <form onSubmit={event => { event.preventDefault(); save(); }}>
      <label>项目标题<input autoFocus maxLength={80} value={name} onChange={event => setName(event.target.value)} onFocus={event => event.currentTarget.select()}/></label>
      {error && <p className="project-rename-error">{error}</p>}
      <footer><button type="button" onClick={close} disabled={saving}>取消</button><button className="primary" type="submit" disabled={saving || !name.trim()}>{saving ? '保存中…' : '保存'}</button></footer>
    </form>
  </ModalDialog>;
}

export function Sidebar({ page, onNavigate, openSettings }: { page: PageId; onNavigate: (page: PageId) => void; openSettings: () => void }) {
  const { workspace, projects, projectThreads, threadId, startNewConversation, openProject, newProjectThread, deleteProject, deleteThread, openThread } = useAgent();
  const [profileOpen, setProfileOpen] = useState(false);
  const [openTreeMenu, setOpenTreeMenu] = useState('');
  const [editingProject, setEditingProject] = useState<Workspace | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<string[]>(() => {
    try { const saved = JSON.parse(localStorage.getItem('aivra.expandedProjects.v1') || '[]'); return Array.isArray(saved) ? saved : []; }
    catch { return []; }
  });
  useEffect(() => { localStorage.setItem('aivra.expandedProjects.v1', JSON.stringify(expandedProjects)); }, [expandedProjects]);
  useEffect(() => {
    const dismiss = () => setOpenTreeMenu('');
    addEventListener('mousedown', dismiss);
    return () => removeEventListener('mousedown', dismiss);
  }, []);
  const toggleProject = (id: string) => setExpandedProjects(items => items.includes(id) ? items.filter(item => item !== id) : [...items, id]);
  return <aside className="sidebar">
    <div className="brand-row"><button className="brand" onClick={() => onNavigate('home')}>WorkBee</button></div>
    <SearchInput className="sidebar-search"/>
    <nav className="main-nav">
      <button className={`${page === 'home' ? 'active' : ''}`} onClick={() => { startNewConversation('', true); onNavigate('home'); }}><PlusSquare size={17}/><span>新建项目</span></button>
      {navigation.map(item => <button title={item.label} key={item.id} className={page === item.id ? 'active' : ''} onClick={() => onNavigate(item.id)}><item.icon size={17}/><span>{item.label}</span></button>)}
    </nav>
    <div className="chat-nav">
      <div className="project-tree-heading"><span>项目</span><small>{projects.length}</small></div>
      {projects.length === 0 && <p className="project-tree-empty">尚未创建项目</p>}
      {projects.map(project => {
        const expanded = expandedProjects.includes(project.id);
        const active = workspace?.id === project.id;
        const conversations = projectThreads.filter(thread => thread.workspace_id === project.id);
        return <div className="conversation-group" key={project.id}>
          <div className={`conversation-parent-row ${active && page === 'chat' ? 'active' : ''}`}>
            <button className="conversation-parent" title={project.path} aria-expanded={expanded} onClick={() => toggleProject(project.id)}>
              {expanded ? <ChevronDown className="project-chevron" size={13}/> : <ChevronRight className="project-chevron" size={13}/>}<span className="project-folder-icon"><Folder size={15}/></span><span>{project.name}</span>
            </button>
            <div className="tree-action" onMouseDown={event => event.stopPropagation()}>
              <button className="project-menu-button" title="项目操作" aria-label={`${project.name} 项目操作`} onClick={() => setOpenTreeMenu(value => value === `project:${project.id}` ? '' : `project:${project.id}`)}><MoreHorizontal size={15}/></button>
              {openTreeMenu === `project:${project.id}` && <div className="tree-action-menu" role="menu"><button role="menuitem" onClick={() => {
                setOpenTreeMenu('');
                setEditingProject(project);
              }}><Pencil size={13}/>编辑</button><button className="danger" role="menuitem" onClick={() => {
                setOpenTreeMenu('');
                if (!confirm(`确定从 WorkBee 中删除项目“${project.name}”及其全部对话历史吗？\n\n磁盘中的项目文件夹不会被删除。`)) return;
                deleteProject(project.id).then(() => setExpandedProjects(items => items.filter(item => item !== project.id))).catch(reason => alert(reason instanceof Error ? reason.message : String(reason)));
              }}><Trash2 size={13}/>删除项目</button></div>}
            </div>
            <button className="project-add-thread" title="在当前项目中新建对话" aria-label={`在 ${project.name} 中新建对话`} onClick={() => {
              setExpandedProjects(items => items.includes(project.id) ? items : [...items, project.id]);
              newProjectThread(project.id).then(() => onNavigate('chat')).catch(() => undefined);
            }}><Plus size={15}/></button>
          </div>
          {expanded && <div className="conversation-history">
            {conversations.length === 0 && <span className="empty-thread">暂无对话</span>}
            {conversations.map(thread => <div className="thread-tree-row" key={thread.id}>
              <button className={`thread-open-button ${thread.id === threadId ? 'active' : ''}`} title={thread.title} onClick={() => {
                const activate = active ? Promise.resolve() : openProject(project.id);
                activate.then(() => openThread(thread.id)).then(() => onNavigate('chat')).catch(() => undefined);
              }}><MessageSquare size={13}/><span>{thread.title}</span></button>
              <div className="tree-action thread-action" onMouseDown={event => event.stopPropagation()}>
                <button className="thread-menu-button" title="对话操作" aria-label={`${thread.title} 对话操作`} onClick={() => setOpenTreeMenu(value => value === `thread:${thread.id}` ? '' : `thread:${thread.id}`)}><MoreHorizontal size={14}/></button>
                {openTreeMenu === `thread:${thread.id}` && <div className="tree-action-menu" role="menu"><button className="danger" role="menuitem" onClick={() => {
                  setOpenTreeMenu('');
                  if (!confirm(`确定删除对话“${thread.title}”吗？此操作无法撤销。`)) return;
                  deleteThread(thread.id).catch(reason => alert(reason instanceof Error ? reason.message : String(reason)));
                }}><Trash2 size={13}/>删除对话</button></div>}
              </div>
            </div>)}
          </div>}
        </div>;
      })}
    </div>
    {editingProject && <RenameProjectDialog project={editingProject} close={() => setEditingProject(null)}/>}
    <div className="profile-wrap"><button className="profile" onClick={() => setProfileOpen(value => !value)}><Avatar kind="yellow" size={36}/><strong>Yoko</strong><ChevronRight size={15}/></button>{profileOpen && <ProfileMenu close={() => setProfileOpen(false)} openSettings={openSettings}/>}</div>
  </aside>;
}

function TerminalPanel({ workspace, close }: { workspace: Workspace | null; close: () => void }) {
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalLines, setTerminalLines] = useState<string[]>(['WorkBee Terminal · 当前工作区命令窗口', '输入命令并按 Enter 执行']);
  return <section className="terminal-panel"><header><span><Terminal size={14}/>终端{workspace && <small>{workspace.path}</small>}</span><button onClick={close} aria-label="关闭终端"><X size={15}/></button></header><div className="terminal-output">{terminalLines.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}</div><form onSubmit={async event => { event.preventDefault(); const command = terminalInput.trim(); if (!command) return; setTerminalLines(lines => [...lines, `$ ${command}`]); setTerminalInput(''); try { const result = await window.aivraDesktop?.agent.executeCommand({ command, cwd: workspace?.path }); setTerminalLines(lines => [...lines, ...(result ? [result.stdout, result.stderr].filter(Boolean) : ['桌面端不可用'])]); } catch (error) { setTerminalLines(lines => [...lines, error instanceof Error ? error.message : String(error)]); } }}><span>$</span><input value={terminalInput} onChange={event => setTerminalInput(event.target.value)} placeholder={workspace ? '输入命令…' : '请先选择项目文件夹'} disabled={!workspace}/></form></section>;
}

export function AppLayout({ page, onNavigate, children, right, marketView, onMarketViewChange }: { page: PageId; onNavigate: (page: PageId) => void; children: React.ReactNode; right?: React.ReactNode; marketView?: 'market' | 'mine'; onMarketViewChange?: (view: 'market' | 'mine') => void }) {
  const { workspace } = useAgent();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<'profile' | 'general' | 'models'>('profile');
  const [terminalOpen, setTerminalOpen] = useState(false);
  const isMac = window.aivraDesktop?.platform === 'darwin';
  useEffect(() => {
    if (page !== 'chat') setTerminalOpen(false);
  }, [page]);
  useEffect(() => {
    const openRightPanel = () => setRightCollapsed(false);
    addEventListener('aivra:open-right-panel', openRightPanel);
    return () => removeEventListener('aivra:open-right-panel', openRightPanel);
  }, []);
  useEffect(() => {
    const openModelSettings = () => { setSettingsSection('models'); setSettingsOpen(true); };
    addEventListener('aivra:open-settings-models', openModelSettings);
    return () => removeEventListener('aivra:open-settings-models', openModelSettings);
  }, []);
  return <div className={`app-shell platform-${isMac ? 'darwin' : 'windows'} ${right ? 'has-right' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${rightCollapsed ? 'right-collapsed' : ''}`}>
    <header className="drag-region">
      <button className="drag-control drag-left" onClick={() => setSidebarCollapsed(value => !value)} aria-label={sidebarCollapsed ? '展开左侧栏' : '隐藏左侧栏'}>{sidebarCollapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}</button>
      {page === 'chat' && <strong>{workspace?.name || ''}</strong>}
      {(page === 'skills' || page === 'plugins') && <div className="drag-tabs"><button className={marketView !== 'mine' ? 'active' : ''} onClick={() => onMarketViewChange?.('market')}>{page === 'skills' ? '技能市场' : '插件市场'}</button><button className={marketView === 'mine' ? 'active' : ''} onClick={() => onMarketViewChange?.('mine')}>我的</button></div>}
      {right && <>{page === 'chat' && <button className="drag-control drag-terminal" onClick={() => setTerminalOpen(value => !value)} aria-label={terminalOpen ? '关闭终端' : '打开终端'}>{terminalOpen ? <PanelBottom size={17}/> : <Terminal size={17}/>}</button>}<button className="drag-control drag-right" onClick={() => setRightCollapsed(value => !value)} aria-label={rightCollapsed ? '展开右侧栏' : '隐藏右侧栏'}>{rightCollapsed ? <PanelRightOpen size={17}/> : <PanelRightClose size={17}/>}</button></>}
      {!isMac && <div className="window-controls" aria-label="Window controls"><button title="Minimize" aria-label="Minimize" onClick={() => void window.aivraDesktop?.window.minimize()}><Minus size={16}/></button><button title="Maximize" aria-label="Maximize" onClick={() => void window.aivraDesktop?.window.maximize()}><Square size={14}/></button><button className="close" title="Close" aria-label="Close" onClick={() => void window.aivraDesktop?.window.close()}><X size={16}/></button></div>}
    </header>
    {!sidebarCollapsed && <Sidebar page={page} onNavigate={onNavigate} openSettings={() => { setSettingsSection('profile'); setSettingsOpen(true); }}/>}
    <main className="workspace">{children}{terminalOpen && <TerminalPanel workspace={workspace} close={() => setTerminalOpen(false)}/>}</main>
    {right && <aside className={`right-panel ${page === 'chat' ? 'chat-right-panel' : ''}`} aria-hidden={rightCollapsed}>{right}</aside>}
    {settingsOpen && <SettingsDialog initialSection={settingsSection} close={() => setSettingsOpen(false)}/>}
  </div>;
}
