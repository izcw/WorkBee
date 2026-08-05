import { Check, LoaderCircle, Pencil, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAgent } from '../agent/AgentContext';
import { AddCard, Avatar, StatusDot } from '../components/ui';
import { RoleCard } from '../components/RoleCard';
import { SettingsModal } from '../components/SettingsModal';
import { FORMAT_SKILL_BY_TYPE, KNOWLEDGE_DOCUMENTS, SKILL_CATALOG } from '../data/catalog';
import { DEFAULT_ROLE_AVATARS, roleAvatar, roleAvatarValue } from '../data/roleAvatars';

function TeamSidebar() {
  const { selectedTeamRoleId, roles, models, saveRole, deleteRole } = useAgent();
  const chatModels = models.filter(item => item.purpose !== 'embedding');
  const creating = selectedTeamRoleId === '__new__';
  const role = creating ? undefined : roles.find(item => item.id === selectedTeamRoleId) || roles[0];
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [avatar, setAvatar] = useState('default:1');
  const [modelId, setModelId] = useState('');
  const [description, setDescription] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [knowledge, setKnowledge] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [referencePicker, setReferencePicker] = useState<'skills' | 'knowledge' | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setEditing(creating);
    setName(role?.name || ''); setRoleTitle(role?.role || ''); setAvatar(roleAvatarValue(role)); setModelId(role?.modelId || chatModels[0]?.id || '');
    setDescription(role?.description || ''); setSkills(role?.skills || []); setKnowledge(role?.knowledge || []); setError(''); setReferencePicker(null);
  }, [creating, role?.id, models]);
  const save = async () => {
    setSaving(true); setError('');
    const automaticSkills = knowledge.flatMap(reference => { const document = KNOWLEDGE_DOCUMENTS.find(item => item.id === reference || item.name === reference); return document ? [FORMAT_SKILL_BY_TYPE[document.type]] : []; });
    try { await saveRole({ id: role?.id, name, role: roleTitle, avatar, modelId, description, skills: Array.from(new Set([...skills, ...automaticSkills])), knowledge }); setEditing(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!role || !confirm(`确定删除自定义角色“${role.name}”吗？`)) return;
    setSaving(true); setError('');
    try { await deleteRole(role.id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  };
  const uploadAvatar = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('请选择图片文件'); return; }
    if (file.size > 2_000_000) { setError('头像图片不能超过 2 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setAvatar(String(reader.result || ''));
    reader.onerror = () => setError('头像读取失败');
    reader.readAsDataURL(file);
  };
  return <div className="team-detail">
    <header><Avatar image={roleAvatar({ id: role?.id || '', avatar })} size={72}/><h2>{creating ? '添加智能体' : role?.name}</h2><p>{creating ? '配置团队中的新角色' : role?.role}</p><StatusDot label={(role?.keyAvailable || models.find(item => item.id === modelId)?.keyAvailable) ? '模型已就绪' : '模型待配置'}/></header>
    <div className="team-detail-actions">{editing ? <button className="primary" disabled={saving} onClick={save}>{saving ? <LoaderCircle size={14}/> : <Save size={14}/>}保存</button> : <button onClick={() => setEditing(true)}><Pencil size={14}/>编辑</button>}{role && !['aivra', 'nova', 'mira', 'sage', 'lyra'].includes(role.id) && <button className="danger" disabled={saving} onClick={remove}><Trash2 size={14}/>删除</button>}</div>
    {editing && <section className="role-identity-fields"><h3>基本信息</h3><input value={name} onChange={event => setName(event.target.value)} placeholder="角色名称"/><input value={roleTitle} onChange={event => setRoleTitle(event.target.value)} placeholder="角色职责，如：前端开发"/></section>}
    {editing && <section><h3>头像</h3><div className="avatar-picker">{DEFAULT_ROLE_AVATARS.map((image, index) => { const value = `default:${index + 1}`; return <button key={value} className={avatar === value ? 'active' : ''} onClick={() => setAvatar(value)}><img src={image} alt="默认头像"/></button>; })}<button className="avatar-upload" onClick={() => uploadRef.current?.click()}><Upload size={16}/><span>上传</span></button></div><input ref={uploadRef} className="hidden-file" type="file" accept="image/*" onChange={event => uploadAvatar(event.target.files?.[0])}/></section>}
    <section><h3>角色描述</h3>{editing ? <textarea value={description} onChange={event => setDescription(event.target.value)}/> : <p>{role?.description || '暂无描述'}</p>}</section>
    <section><h3>模型</h3>{editing ? <select value={modelId} onChange={event => setModelId(event.target.value)}>{chatModels.map(item => <option key={item.id} value={item.id}>{item.name} · {item.model}</option>)}</select> : <div className="role-model-summary"><span>{role?.modelName}</span><small>{role?.model}</small></div>}</section>
    <section><div className="reference-section-heading"><h3>技能引用</h3>{editing && <button onClick={() => setReferencePicker('skills')}><Plus size={13}/>选择技能</button>}</div><div className="detail-tags editable-tags">{skills.length ? skills.map(item => <span key={item}><Check size={11}/>{item}{editing && <button aria-label={`移除 ${item}`} onClick={() => setSkills(values => values.filter(value => value !== item))}><X size={11}/></button>}</span>) : <p>暂无技能</p>}</div></section>
    <section><div className="reference-section-heading"><h3>知识库引用</h3>{editing && <button onClick={() => setReferencePicker('knowledge')}><Plus size={13}/>选择文档</button>}</div><div className="knowledge-list editable-tags">{knowledge.length ? knowledge.map(reference => { const item = KNOWLEDGE_DOCUMENTS.find(document => document.id === reference || document.name === reference); return <span key={reference}>{item?.name || reference}{editing && <button aria-label={`移除 ${item?.name || reference}`} onClick={() => setKnowledge(values => values.filter(value => value !== reference))}><X size={11}/></button>}</span>; }) : <p>暂无引用</p>}</div></section>
    {referencePicker && <SettingsModal title={referencePicker === 'skills' ? '选择技能' : '选择知识库文档'} ariaLabel={referencePicker === 'skills' ? '选择技能' : '选择文档'} description="勾选需要提供给该角色的引用。" close={() => setReferencePicker(null)}><div className="settings-modal-list role-reference-list">{referencePicker === 'skills' ? SKILL_CATALOG.map(item => <label key={item.id}><input type="checkbox" checked={skills.includes(item.title)} onChange={() => setSkills(values => values.includes(item.title) ? values.filter(value => value !== item.title) : [...values, item.title])}/><img src={item.icon} alt=""/><span><strong>{item.title}</strong><small>{item.desc}</small></span></label>) : KNOWLEDGE_DOCUMENTS.map(item => <label key={item.id}><input type="checkbox" checked={knowledge.includes(item.id) || knowledge.includes(item.name)} onChange={() => setKnowledge(values => values.includes(item.id) ? values.filter(value => value !== item.id) : [...values.filter(value => value !== item.name), item.id])}/><img src={item.icon} alt=""/><span><strong>{item.name}</strong><small>{item.type.toUpperCase()} · 自动增加 {FORMAT_SKILL_BY_TYPE[item.type]}</small></span></label>)}</div><footer className="settings-modal-footer"><span>已选择 {referencePicker === 'skills' ? skills.length : knowledge.length} 项</span><button onClick={() => setReferencePicker(null)}>完成</button></footer></SettingsModal>}
    {error && <p className="role-config-error">{error}</p>}
  </div>;
}

export function TeamPage() {
  const { roles, selectedTeamRoleId, setSelectedTeamRoleId } = useAgent();
  const select = (id: string) => { setSelectedTeamRoleId(id); window.dispatchEvent(new Event('aivra:open-right-panel')); };
  return <div className="team-page"><div className="team-grid">{roles.map(role => <RoleCard key={role.id} role={role} selected={selectedTeamRoleId === role.id} onSelect={() => select(role.id)}/>)}<div onClick={() => select('__new__')}><AddCard label="添加智能体"/></div></div></div>;
}
TeamPage.Sidebar = TeamSidebar;
