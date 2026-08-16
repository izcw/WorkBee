import { useEffect, useState } from 'react';
import { Clock, ExternalLink } from 'lucide-react';
import type { PageId } from '../types';
import { Composer } from '../components/Composer';
import { ModalDialog } from '../components/ModalDialog';
import { Avatar, Card, Dropdown } from '../components/ui';
import { roleAvatar } from '../data/roleAvatars';
import poster from '../assets/images/poster.jpg';
import { useAgent } from '../agent/AgentContext';

function dateValue(value?: string) {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRecentDate(value?: string) {
  if (!value) return '最近';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '最近';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date);
}

const WELCOME_PHRASES = ['召集智能体开工', '把工作交给智能体', '你的 AI 工作团队', '为你调度每个任务'];

function TypewriterText() {
  const [text, setText] = useState('');
  useEffect(() => {
    let phraseIndex = 0;
    let charIndex = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const phrase = WELCOME_PHRASES[phraseIndex];
      if (charIndex < phrase.length) {
        charIndex += 1;
        setText(phrase.slice(0, charIndex));
        timer = setTimeout(tick, 120);
      } else {
        phraseIndex = (phraseIndex + 1) % WELCOME_PHRASES.length;
        charIndex = 0;
        timer = setTimeout(tick, 3000);
      }
    };
    timer = setTimeout(tick, 120);
    return () => clearTimeout(timer);
  }, []);
  return <>{text}<span className="typewriter-cursor" aria-hidden="true"/></>;
}

function NewWorkspaceDialog({ close, onCreated }: { close: () => void; onCreated: () => void }) {
  const { createProjectWithName } = useAgent();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    const nextName = name.trim();
    if (!nextName) { setError('请输入项目名称'); return; }
    setSaving(true); setError('');
    try { await createProjectWithName(nextName); close(); onCreated(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  };
  return <ModalDialog title="新建工作空间" close={close} className="project-rename-dialog new-workspace-dialog">
    <form onSubmit={event => { event.preventDefault(); save(); }}>
      <label>项目名称<input autoFocus maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="例如：我的项目" onFocus={event => event.currentTarget.select()}/></label>
      {error && <p className="project-rename-error">{error}</p>}
      <footer><button type="button" onClick={close} disabled={saving}>取消</button><button className="primary" type="submit" disabled={saving || !name.trim()}>{saving ? '创建中…' : '创建'}</button></footer>
    </form>
  </ModalDialog>;
}

function WorkspacePicker({ onNewWorkspace }: { onNewWorkspace: () => void }) {
  const { workspace, selectWorkspace } = useAgent();
  const change = (option: string) => {
    if (option === '新建工作空间') onNewWorkspace();
    else if (option === '选择本地文件夹') void selectWorkspace();
  };
  return <div className="workspace-picker"><Dropdown label="选择或新建工作空间" value={workspace ? workspace.name : '选择或新建工作空间'} options={['新建工作空间', '选择本地文件夹']} onChange={change}/></div>;
}

export function HomePage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { draft, setDraft, roles, selectedRoleId, selectedRoleIds, selectRole, createProject, approvalMode, setApprovalMode, projects, projectThreads, projectRoleIds, openProject, openThread, workspace, send } = useAgent();
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const latestThreads = new Map<string, ThreadSummary>();
  projectThreads.forEach(thread => {
    const current = latestThreads.get(thread.workspace_id);
    if (!current || dateValue(thread.updated_at) > dateValue(current.updated_at)) latestThreads.set(thread.workspace_id, thread);
  });
  const recentProjects = [...projects].sort((left, right) => {
    const leftActivity = Math.max(dateValue(left.last_opened_at), dateValue(latestThreads.get(left.id)?.updated_at));
    const rightActivity = Math.max(dateValue(right.last_opened_at), dateValue(latestThreads.get(right.id)?.updated_at));
    return rightActivity - leftActivity;
  }).slice(0, 6);
  const openRecentProject = async (project: Workspace) => {
    await openProject(project.id);
    const latestThread = latestThreads.get(project.id);
    if (latestThread) await openThread(latestThread.id);
    onNavigate('chat');
  };
  return <div className="home-page">
    <section className="welcome"><div><h1>WorkBee，<TypewriterText /></h1><p><strong>TaskBee</strong> 团队随时在线，WorkBee, Let Agents Work</p></div></section>
    <Composer value={draft} onChange={setDraft} onSubmit={value => { const proceed = workspace ? send(value) : createProject(value); proceed.then(() => onNavigate('chat')).catch(() => undefined); }} roles={roles} selectedRoleId={selectedRoleId} selectedRoleIds={selectedRoleIds} onRoleChange={selectRole} approvalMode={approvalMode} onApprovalModeChange={setApprovalMode}/>
    <WorkspacePicker onNewWorkspace={() => setNewWorkspaceOpen(true)}/>
    {newWorkspaceOpen && <NewWorkspaceDialog close={() => setNewWorkspaceOpen(false)} onCreated={() => onNavigate('chat')}/>}
    <section className="recent"><h2>最近项目</h2><div className="project-grid">
      <a className="project-click poster-link" href="https://www.workbee.zhangchengwei.work/" target="_blank" rel="noreferrer" title="打开 WorkBee 官网"><Card className="project-card poster-card">
        <img src={poster} alt="WorkBee 海报" draggable={false}/>
        <span className="poster-link-icon" aria-hidden="true"><ExternalLink size={13}/></span>
      </Card></a>
      {recentProjects.length === 0 && <p className="recent-empty">暂无最近项目</p>}
      {recentProjects.map(project => {
        const latestThread = latestThreads.get(project.id);
        const activityAt = dateValue(latestThread?.updated_at) > dateValue(project.last_opened_at) ? latestThread?.updated_at : project.last_opened_at;
        const projectRoles = (projectRoleIds[project.id] || []).map(id => roles.find(role => role.id === id)).filter((role): role is RoleConfig => Boolean(role));
        return <button className="project-click" key={project.id} title={project.path} onClick={() => openRecentProject(project).catch(() => undefined)}><Card className="project-card">
          <strong>{project.name}</strong><span className="status-chip"><Clock size={15}/>{formatRecentDate(activityAt)}</span>
          <p>{latestThread ? `最近对话：${latestThread.title}` : '暂无对话，点击进入项目'}</p><div className="avatar-stack" aria-label={`已配置角色：${projectRoles.map(role => role.name).join('、')}`}>
            {projectRoles.slice(0, 3).map(role => <Avatar key={role.id} image={roleAvatar(role)} size={27}/>)}
            {projectRoles.length > 3 && <strong className="avatar-stack-count" title={projectRoles.slice(3).map(role => role.name).join('、')}>+{projectRoles.length - 3}</strong>}
          </div>
        </Card></button>;
      })}
    </div></section>
  </div>;
}
