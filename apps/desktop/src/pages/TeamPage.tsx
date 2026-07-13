import { Check, LoaderCircle, Pencil, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAgent } from '../agent/AgentContext';
import { AddCard, Avatar, Card, StatusDot } from '../components/ui';
import aivraAvatar from '../assets/images/Team/Aivra.png';
import avaAvatar from '../assets/images/Team/Ava.png';
import emmaAvatar from '../assets/images/Team/Emma.png';
import { FORMAT_SKILL_BY_TYPE, KNOWLEDGE_DOCUMENTS, SKILL_CATALOG } from '../data/catalog';

const roleImages: Record<string, string> = { aivra: aivraAvatar, ava: avaAvatar, emma: emmaAvatar };

function TeamSidebar() {
  const { selectedTeamRoleId, roles, models, saveRole } = useAgent();
  const role = roles.find(item => item.id === selectedTeamRoleId) || roles[0];
  const [editing, setEditing] = useState(false);
  const [modelId, setModelId] = useState('');
  const [description, setDescription] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [knowledge, setKnowledge] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!role) return;
    setEditing(false); setModelId(role.modelId); setDescription(role.description || ''); setSkills(role.skills || []); setKnowledge(role.knowledge || []); setError('');
  }, [role?.id]);
  if (!role) return <div className="team-detail"><p>请选择角色。</p></div>;
  const save = async () => {
    setSaving(true); setError('');
    const automaticSkills = knowledge.flatMap(reference => { const document = KNOWLEDGE_DOCUMENTS.find(item => item.id === reference || item.name === reference); return document ? [FORMAT_SKILL_BY_TYPE[document.type]] : []; });
    try { await saveRole({ id: role.id, modelId, description, skills: Array.from(new Set([...skills, ...automaticSkills])), knowledge }); setEditing(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  };
  return <div className="team-detail">
    <header><Avatar image={roleImages[role.id] || aivraAvatar} size={72}/><h2>{role.name}</h2><p>{role.role}</p><StatusDot label={role.keyAvailable ? '模型已就绪' : '模型待配置'}/></header>
    <div className="team-detail-actions">{editing ? <button className="primary" disabled={saving} onClick={save}>{saving ? <LoaderCircle size={14}/> : <Save size={14}/>}保存</button> : <button onClick={() => setEditing(true)}><Pencil size={14}/>编辑</button>}</div>
    <section><h3>角色描述</h3>{editing ? <textarea value={description} onChange={event => setDescription(event.target.value)}/> : <p>{role.description || '暂无描述'}</p>}</section>
    <section><h3>模型</h3>{editing ? <select value={modelId} onChange={event => setModelId(event.target.value)}>{models.map(item => <option key={item.id} value={item.id}>{item.name} · {item.model}</option>)}</select> : <div className="role-model-summary"><span>{role.modelName}</span><small>{role.model}</small></div>}</section>
    <section><h3>技能引用</h3>{editing ? <div className="role-reference-list">{SKILL_CATALOG.filter(item => !item.automatic).map(item => <label key={item.id}><input type="checkbox" checked={skills.includes(item.title)} onChange={() => setSkills(values => values.includes(item.title) ? values.filter(value => value !== item.title) : [...values, item.title])}/><img src={item.icon} alt=""/><span><strong>{item.title}</strong><small>{item.desc}</small></span></label>)}</div> : <div className="detail-tags">{role.skills.length ? role.skills.map(item => <span key={item}><Check size={11}/>{item}</span>) : <p>暂无技能</p>}</div>}</section>
    <section><h3>知识库引用</h3>{editing ? <div className="role-reference-list">{KNOWLEDGE_DOCUMENTS.map(item => <label key={item.id}><input type="checkbox" checked={knowledge.includes(item.id) || knowledge.includes(item.name)} onChange={() => setKnowledge(values => values.includes(item.id) ? values.filter(value => value !== item.id) : [...values.filter(value => value !== item.name), item.id])}/><img src={item.icon} alt=""/><span><strong>{item.name}</strong><small>{item.type.toUpperCase()} · 自动增加 {FORMAT_SKILL_BY_TYPE[item.type]}</small></span></label>)}</div> : <div className="knowledge-list">{role.knowledge.length ? role.knowledge.map(reference => { const item = KNOWLEDGE_DOCUMENTS.find(document => document.id === reference || document.name === reference); return <span key={reference}>{item?.name || reference}</span>; }) : <p>暂无引用</p>}</div>}</section>
    {error && <p className="role-config-error">{error}</p>}
  </div>;
}

export function TeamPage() {
  const { roles, selectedTeamRoleId, setSelectedTeamRoleId } = useAgent();
  return <div className="team-page"><div className="team-grid">{roles.map(role => <Card className={`agent-card ${selectedTeamRoleId === role.id ? 'selected' : ''}`} key={role.id}><button className="agent-card-button" onClick={() => setSelectedTeamRoleId(role.id)}><div className="agent-head"><Avatar image={roleImages[role.id] || aivraAvatar} size={70}/><div><strong>{role.name}</strong><span>{role.role}</span><StatusDot label={role.keyAvailable ? '已配置' : '待配置'}/></div></div><hr/><h4>简介</h4><p className="two-line">{role.description}</p><h4>模型</h4><div className="role-model-summary"><span>{role.modelName}</span><small>{role.model}</small></div></button></Card>)}<AddCard label="添加智能体"/></div></div>;
}
TeamPage.Sidebar = TeamSidebar;
