import { useEffect, useRef, useState } from 'react';
import { Box, ChevronDown, ChevronRight, FileText, LogOut, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, PlusSquare, Settings, ToolCase, Users } from 'lucide-react';
import type { PageId } from '../types';
import { Avatar, SearchInput } from './ui';

const navigation = [
  { id: 'team', label: '团队', icon: Users },
  { id: 'skills', label: '技能', icon: ToolCase },
  { id: 'plugins', label: '插件', icon: Box },
  { id: 'docs', label: '文档', icon: FileText },
] as const;

function ProfileMenu({ close }: { close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dismiss = (event: MouseEvent) => !ref.current?.contains(event.target as Node) && close();
    addEventListener('mousedown', dismiss);
    return () => removeEventListener('mousedown', dismiss);
  }, [close]);
  return <div className="profile-menu" ref={ref}>
    <div className="account-summary"><Avatar kind="yellow" size={38}/><div><strong>Yoko</strong><span>yoko@aivra.ai</span></div></div>
    <div className="usage"><span>本月剩余用量</span><strong>76%</strong><i><b/></i></div>
    <button><Settings size={16}/>设置</button><button><LogOut size={16}/>退出登录</button>
  </div>;
}

export function Sidebar({ page, onNavigate }: { page: PageId; onNavigate: (page: PageId) => void }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(true);
  return <aside className="sidebar">
    <div className="brand-row"><button className="brand" onClick={() => onNavigate('home')}>Aivra</button></div>
    <SearchInput className="sidebar-search"/>
    <nav className="main-nav">
      <button className={`side-new ${page === 'home' ? 'active' : ''}`} onClick={() => onNavigate('home')}><PlusSquare size={17}/><span>新建对话</span></button>
      {navigation.map(item => <button title={item.label} key={item.id} className={page === item.id ? 'active' : ''} onClick={() => onNavigate(item.id)}><item.icon size={17}/><span>{item.label}</span></button>)}
    </nav>
    <div className="chat-nav"><span>对话</span><div className="conversation-group"><button className={`conversation-parent ${page === 'chat' ? 'active' : ''}`} onClick={() => setResumeOpen(value => !value)}><span>简历筛选</span>{resumeOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</button>{resumeOpen && <div className="conversation-history"><button onClick={() => onNavigate('chat')}>前端工程师简历筛选</button><button onClick={() => onNavigate('chat')}>补充候选人评估条件</button><button onClick={() => onNavigate('chat')}>生成面试名单</button></div>}</div></div>
    <div className="profile-wrap"><button className="profile" onClick={() => setProfileOpen(value => !value)}><Avatar kind="yellow" size={36}/><strong>Yoko</strong><ChevronRight size={15}/></button>{profileOpen && <ProfileMenu close={() => setProfileOpen(false)}/>}</div>
  </aside>;
}

export function AppLayout({ page, onNavigate, children, right }: { page: PageId; onNavigate: (page: PageId) => void; children: React.ReactNode; right?: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [marketTab, setMarketTab] = useState(page === 'plugins' ? '插件市场' : '技能市场');
  useEffect(() => {
    if (page === 'skills') setMarketTab('技能市场');
    if (page === 'plugins') setMarketTab('插件市场');
  }, [page]);
  return <div className={`app-shell ${right ? 'has-right' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${rightCollapsed ? 'right-collapsed' : ''}`}>
    <header className="drag-region">
      <button className="drag-control drag-left" onClick={() => setSidebarCollapsed(value => !value)} aria-label={sidebarCollapsed ? '展开左侧栏' : '隐藏左侧栏'}>{sidebarCollapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}</button>
      {page === 'chat' && <strong>简历筛选</strong>}
      {(page === 'skills' || page === 'plugins') && <div className="drag-tabs">{[page === 'skills' ? '技能市场' : '插件市场','我的'].map(item => <button key={item} className={marketTab === item ? 'active' : ''} onClick={() => setMarketTab(item)}>{item}</button>)}</div>}
      {right && <button className="drag-control drag-right" onClick={() => setRightCollapsed(value => !value)} aria-label={rightCollapsed ? '展开右侧栏' : '隐藏右侧栏'}>{rightCollapsed ? <PanelRightOpen size={17}/> : <PanelRightClose size={17}/>}</button>}
    </header>
    {!sidebarCollapsed && <Sidebar page={page} onNavigate={onNavigate}/>} 
    <main className="workspace">{children}</main>
    {right && !rightCollapsed && <aside className="right-panel">{right}</aside>}
  </div>;
}
