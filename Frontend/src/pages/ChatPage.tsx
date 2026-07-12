import { useState } from 'react';
import { File, Folder, Plus, X } from 'lucide-react';
import { Composer } from '../components/Composer';
import { Avatar, Card, Pill, Tabs } from '../components/ui';
import avaAvatar from '../assets/images/Team/Ava.png';
import emmaAvatar from '../assets/images/Team/Emma.png';

function Message({ name = 'Yoko', time, children, bot }: { name?: string; time: string; children: React.ReactNode; bot?: boolean }) {
  return <div className={`message message-row ${bot ? 'team-message' : 'user-message'}`}>
    <Avatar image={bot ? (name === 'Emma' ? emmaAvatar : avaAvatar) : undefined} kind={bot ? 'cat' : 'yellow'} size={30}/>
    <div className="message-content"><header><strong>{name}</strong><small>{time}</small></header><Card className="message-card">{bot && <span className="thinking">Thinking：正在处理任务并汇总相关信息。</span>}<p>{children}</p></Card></div>
  </div>;
}

const agents = [{ name: 'Ava', role: 'Team leader 全盘统筹', image: avaAvatar }, { name: 'Ella', role: 'HR 候选人评估', image: emmaAvatar }, { name: 'Emma', role: '部门负责', image: emmaAvatar }];

function ChatSidebar() {
  const [tab, setTab] = useState('Work');
  return <div className="chat-side-content"><Tabs items={['Work','产出','预览','Git']} value={tab} onChange={setTab}/>{tab === 'Work' && <div className="side-tab-panel"><h3>Team</h3><div className="mini-agent-grid">
    {agents.map(a => <Card key={a.name}><Avatar image={a.image} size={36} /><div><strong>{a.name}</strong><small>{a.role}</small></div><footer><span>分派任务</span><span>信息聚合</span></footer></Card>)}<button className="mini-add"><Plus size={36} /></button>
  </div><h3>文档</h3><div className="files"><div><Folder size={18} />Resume_List<X size={17} /></div><div><File size={18} />招聘要求.md<X size={17} /></div><div><File size={18} />公司介绍.pdf<X size={17} /></div><button className="add-document"><Plus size={16}/>添加文档</button></div><h3>状态</h3><div className="status-grid"><Card><strong>空闲中</strong><small>查看全部 &gt;</small></Card><Card><strong>4K</strong><small>会话消耗Token &gt;</small></Card></div></div>}{tab === '产出' && <div className="empty-tab"><strong>产出</strong><p>任务生成的文档、报告和代码将在这里显示。</p></div>}{tab === '预览' && <div className="empty-tab"><strong>预览</strong><p>选择产出内容后，可在此处进行实时预览。</p></div>}{tab === 'Git' && <div className="empty-tab"><strong>Git</strong><p>当前工作区尚未关联远程仓库。</p></div>}</div>;
}

const history = ['帮我筛选一批前端工程师简历','补充 React 和 Vue 项目经验要求','生成候选人综合评估报告','整理最终面试名单'];

export function ChatPage() {
  const [steps, setSteps] = useState(['需求','设计','实现','测试','行动']);
  const [selected, setSelected] = useState('行动');
  const move = (from: number, to: number) => setSteps(list => { const next=[...list]; const [item]=next.splice(from,1); next.splice(to,0,item); return next; });
  return <div className="chat-page"><div className="messages">
    <Message time="18:48">帮我筛选一批前端工程师简历</Message><Message bot name="Ava" time="18:42">收到！开始分析简历，已扫描到 12 份，预计 5 分钟完成筛选。</Message><Message bot name="Emma" time="18:46">关注一下 React 和 Vue 的实际项目经验。</Message>
  </div><nav className="history-dots" aria-label="对话历史">{history.map((title,index) => <button key={title} className={index === 0 ? 'active' : ''}><i/><span>{title.length > 20 ? `${title.slice(0,20)}…` : title}</span></button>)}</nav><div className="chat-composer"><Composer compact/><div className="ui-tabs workflow-bar">{steps.map((x,index) => <button draggable key={x} className={selected === x ? 'active' : ''} onClick={() => setSelected(x)} onDragStart={e => e.dataTransfer.setData('text/plain',String(index))} onDragOver={e => e.preventDefault()} onDrop={e => move(Number(e.dataTransfer.getData('text/plain')),index)}>{x}<span>×</span></button>)}<button>＋ 添加</button></div></div></div>;
}
ChatPage.Sidebar = ChatSidebar;
