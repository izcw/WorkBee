import { Clock } from 'lucide-react';
import type { PageId } from '../types';
import { Composer } from '../components/Composer';
import { Avatar, Card } from '../components/ui';
import aivraAvatar from '../assets/images/Team/Aivra.png';
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

export function HomePage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { draft, setDraft, roles, selectedRoleId, selectedRoleIds, selectRole, createProject, approvalMode, setApprovalMode, projects, projectThreads, openProject, openThread } = useAgent();
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
    <section className="welcome"><Avatar image={aivraAvatar} size={76} /><div><h1>Aivra</h1><p><strong>Aivra</strong> 团队随时在线</p></div></section>
    <Composer value={draft} onChange={setDraft} onSubmit={value => { createProject(value).then(() => onNavigate('chat')).catch(() => onNavigate('chat')); }} roles={roles} selectedRoleId={selectedRoleId} selectedRoleIds={selectedRoleIds} onRoleChange={selectRole} approvalMode={approvalMode} onApprovalModeChange={setApprovalMode}/>
    <section className="recent"><h2>最近项目</h2><div className="project-grid">
      {recentProjects.length === 0 && <p className="recent-empty">暂无最近项目</p>}
      {recentProjects.map(project => {
        const latestThread = latestThreads.get(project.id);
        const activityAt = dateValue(latestThread?.updated_at) > dateValue(project.last_opened_at) ? latestThread?.updated_at : project.last_opened_at;
        return <button className="project-click" key={project.id} title={project.path} onClick={() => openRecentProject(project).catch(() => undefined)}><Card className="project-card">
          <strong>{project.name}</strong><span className="status-chip"><Clock size={15}/>{formatRecentDate(activityAt)}</span>
          <p>{latestThread ? `最近对话：${latestThread.title}` : '暂无对话，点击进入项目'}</p><div className="avatar-stack"><Avatar image={aivraAvatar} size={30}/></div>
        </Card></button>;
      })}
    </div></section>
  </div>;
}
