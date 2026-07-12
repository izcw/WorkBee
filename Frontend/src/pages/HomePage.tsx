import { Clock } from 'lucide-react';
import type { PageId } from '../types';
import { Composer } from '../components/Composer';
import { Avatar, Card } from '../components/ui';
import aivraAvatar from '../assets/images/Team/Aivra.png';
import avaAvatar from '../assets/images/Team/Ava.png';
import emmaAvatar from '../assets/images/Team/Emma.png';

const projects = [
  { title: '简历筛选', desc: '批量分析候选人简历，评估匹配度，安排面试流程', avatars: [aivraAvatar, avaAvatar, emmaAvatar] },
  { title: '数据分析', desc: '数据清洗、报表生成、洞察分析与可视化', avatars: [avaAvatar, emmaAvatar, aivraAvatar] },
];

export function HomePage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  return <div className="home-page">
    <section className="welcome"><Avatar image={aivraAvatar} size={76} /><div><h1>Aivra</h1><p><strong>Aivra</strong> 团队随时在线</p></div></section>
    <Composer />
    <section className="recent"><h2>最近项目</h2><div className="project-grid">
      {projects.map(project => <div className="project-click" key={project.title} onClick={() => onNavigate('chat')} role="button" tabIndex={0}><Card className="project-card">
        <strong>{project.title}</strong><span className="status-chip"><Clock size={15}/>进行中</span>
        <p>{project.desc}</p><div className="avatar-stack">{project.avatars.map((image, index) => <Avatar key={index} image={image} size={30}/>)}{project.title === '简历筛选' && <small>+1</small>}</div>
      </Card></div>)}
    </div></section>
  </div>;
}
