import { Plus } from 'lucide-react';
import { AddCard, Avatar, Card, StatusDot } from '../components/ui';
import aivraAvatar from '../assets/images/Team/Aivra.png';
import avaAvatar from '../assets/images/Team/Ava.png';
import emmaAvatar from '../assets/images/Team/Emma.png';

const team = [
  {name:'Aivra（艾拉）',role:'Team Leader',image:aivraAvatar,desc:'项目管理专家，擅长统筹规划、数据分析。熟悉敏捷开发流程，善于跨部门协调。'},
  {name:'Ava',role:'招聘分析',image:avaAvatar,desc:'负责候选人筛选、技能匹配和招聘流程协调，快速形成清晰的评估结论。'},
  {name:'Emma',role:'资料研究',image:emmaAvatar,desc:'负责资料收集、信息归纳和重点提炼，为团队提供可靠的研究支持。'},
];

function TeamSidebar() {
  return <div className="team-stats"><h3>今日消耗Token</h3><strong>3,853/1000万</strong><div className="progress"><i /></div><h3>行动明细</h3><div className="action-stats">{['行动中','进行中','进行中'].map((x,i)=><div key={i}><strong>1</strong><span>{x}</span></div>)}</div></div>;
}

export function TeamPage() {
  return <div className="team-page"><div className="team-grid">{team.map(agent => <Card className="agent-card" key={agent.name}><div className="agent-head"><Avatar image={agent.image} size={70}/><div><strong>{agent.name}</strong><span>{agent.role}</span><StatusDot/></div></div><hr/><h4>简介</h4><p className="two-line">{agent.desc}</p><h4>技能</h4><div className="tags"><span>分派任务</span><span>管理团队</span></div><h4>知识库</h4><div className="tags"><span>管理手册</span><span>流程执行手册</span></div></Card>)}<AddCard label="添加智能体"/></div></div>;
}
TeamPage.Sidebar = TeamSidebar;
