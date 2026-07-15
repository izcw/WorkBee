import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Check, Paperclip, Send, Users } from 'lucide-react';
import { Button, Dropdown, Tabs } from './ui';
import { roleAvatar } from '../data/roleAvatars';
const fallbackRoles: RoleConfig[] = [{ id: 'aivra', name: 'Aivra', role: '全能统筹 Agent', modelId: 'deepseek-default', modelName: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', keyAvailable: false, description: '统筹并完成开发、工作、设计与文件处理。', skills: ['全局规划与执行', '文件读写与整理', '软件开发与测试'], knowledge: ['aivra-working-principles'] }];

function SelectedRoleAvatar({ role }: { role: RoleConfig }) {
  const [tip, setTip] = useState<{ left: number; top: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (event: ReactMouseEvent<HTMLSpanElement>) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const rect = event.currentTarget.getBoundingClientRect();
    setTip({ left: Math.max(12, Math.min(rect.left, window.innerWidth - 242)), top: Math.max(12, rect.top - 92) });
  };
  const close = () => { closeTimer.current = setTimeout(() => setTip(null), 120); };
  return <span className="selected-role-avatar" onMouseEnter={show} onMouseLeave={close}><img src={roleAvatar(role)} alt={role.name}/>{tip && createPortal(<span className="role-avatar-tip" style={{ left: tip.left, top: tip.top }} onMouseEnter={() => { if (closeTimer.current) clearTimeout(closeTimer.current); }} onMouseLeave={close}><strong>{role.name}</strong><small>{(role.description || role.role).slice(0,56)}</small></span>, document.body)}</span>;
}

export function Composer({ compact = false, value: controlledValue, onChange, onSubmit, disabled = false, mode: controlledMode, onModeChange,
  roles: configuredRoles = fallbackRoles, selectedRoleId = 'aivra', selectedRoleIds: chosenRoleIds = [selectedRoleId], onRoleChange,
  approvalMode = 'request', onApprovalModeChange }: {
  compact?: boolean; value?: string; onChange?: (value: string) => void; onSubmit?: (value: string) => void;
  disabled?: boolean; mode?: 'chat' | 'task'; onModeChange?: (mode: 'chat' | 'task') => void;
  roles?: RoleConfig[]; selectedRoleId?: string; onRoleChange?: (id: string) => void;
  selectedRoleIds?: string[]; approvalMode?: 'request' | 'auto' | 'full'; onApprovalModeChange?: (mode: 'request' | 'auto' | 'full') => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [localValue, setLocalValue] = useState('');
  const [localMode, setLocalMode] = useState<'chat' | 'task'>('task');
  const value = controlledValue ?? localValue;
  const mode = controlledMode ?? localMode;
  const selectedRoles = configuredRoles.filter(role => chosenRoleIds.includes(role.id));
  const updateValue = (next: string) => { setLocalValue(next); onChange?.(next); };
  const updateMode = (next: string) => { const typed = next === '对话' ? 'chat' : 'task'; setLocalMode(typed); onModeChange?.(typed); };
  const submit = () => { if (!disabled && value.trim()) onSubmit?.(value.trim()); };
  const scheduleRoleClose = () => { closeTimer.current = setTimeout(() => setRoleOpen(false), 180); };
  const keepRoleOpen = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const approvalLabel = approvalMode === 'auto' ? '替我审批' : approvalMode === 'full' ? '完全访问权限' : '请求批准';
  const changeApproval = (label: string) => onApprovalModeChange?.(label === '替我审批' ? 'auto' : label === '完全访问权限' ? 'full' : 'request');
  return <div className={`composer ${compact ? 'composer-compact' : ''}`}>
    {compact && <Tabs items={['对话','任务']} value={mode === 'chat' ? '对话' : '任务'} onChange={updateMode}/>}
    <textarea aria-label="任务描述" placeholder="输入问题，或让 Agent 读取和修改工作区" value={value} disabled={disabled}
      onChange={event => updateValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } }}/>
    <div className="composer-footer">
      <div className="composer-actions"><input ref={fileRef} className="hidden-file" type="file" multiple/><Button className="composer-icon-button" title="选择文件" aria-label="选择文件" onClick={() => fileRef.current?.click()}><Paperclip size={16}/></Button><div className="role-picker" onMouseEnter={keepRoleOpen} onMouseLeave={scheduleRoleClose}><Button className="composer-icon-button" title="选择角色" aria-label="选择角色" onClick={() => setRoleOpen(v => !v)}><Users size={16}/></Button>{roleOpen && <div className="role-menu" onMouseEnter={keepRoleOpen}>{configuredRoles.map(role => <button key={role.id} className={chosenRoleIds.includes(role.id) ? 'active' : ''} onClick={() => onRoleChange?.(role.id)}><img src={roleAvatar(role)} alt=""/><span><strong>{role.name}</strong><small>{role.role} · {role.model}</small></span>{chosenRoleIds.includes(role.id) && <Check size={14}/>}</button>)}</div>}</div><span className="selected-roles">{selectedRoles.slice(0,3).map(role => <SelectedRoleAvatar role={role} key={role.id}/>)}{selectedRoles.length > 3 && <strong title={selectedRoles.slice(3).map(role => role.name).join('、')}>+{selectedRoles.length - 3}</strong>}</span></div>
      <div className="composer-settings"><Dropdown label={approvalLabel} value={approvalLabel} onChange={changeApproval} options={['请求批准','替我审批','完全访问权限']}/><button className="send" aria-label="发送" disabled={disabled || !value.trim()} onClick={submit}><Send size={17}/></button></div>
    </div>
  </div>;
}
