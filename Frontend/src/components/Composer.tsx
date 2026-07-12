import { useRef, useState } from 'react';
import { Plus, Send, Users } from 'lucide-react';
import { Button, Dropdown, Tabs } from './ui';
import avaAvatar from '../assets/images/Team/Ava.png';
import emmaAvatar from '../assets/images/Team/Emma.png';

const roles = [{name:'Ava',role:'团队负责人',image:avaAvatar},{name:'Emma',role:'资料研究',image:emmaAvatar}];

export function Composer({ compact = false }: { compact?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [mode, setMode] = useState('对话');
  const scheduleRoleClose = () => { closeTimer.current = setTimeout(() => setRoleOpen(false), 180); };
  const keepRoleOpen = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  return <div className={`composer ${compact ? 'composer-compact' : ''}`}>
    {compact && <Tabs items={['对话','任务']} value={mode} onChange={setMode}/>} 
    <textarea aria-label="任务描述" placeholder="请输入任务，交给我来帮你完成" />
    <div className="composer-footer">
      <div className="composer-actions"><input ref={fileRef} className="hidden-file" type="file" multiple/><Button onClick={() => fileRef.current?.click()}><Plus size={15}/>选择文件</Button><div className="role-picker" onMouseEnter={keepRoleOpen} onMouseLeave={scheduleRoleClose}><Button onClick={() => setRoleOpen(v => !v)}><Users size={15}/>选择角色</Button>{roleOpen && <div className="role-menu" onMouseEnter={keepRoleOpen}>{roles.map(role => <button key={role.name} onClick={() => setRoleOpen(false)}><img src={role.image} alt=""/><span><strong>{role.name}</strong><small>{role.role}</small></span></button>)}</div>}</div></div>
      <div className="composer-settings"><Dropdown label="请求批准" options={['请求批准','替我审批','完全访问权限']}/><Dropdown label="ChatGPT 5.6" options={['ChatGPT 5.6','ChatGPT 5','GPT Mini']}/><button className="send"><Send size={17}/></button></div>
    </div>
  </div>;
}
