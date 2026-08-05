import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { KNOWLEDGE_DOCUMENTS } from '../data/catalog';
import { roleAvatar } from '../data/roleAvatars';
import { Avatar, Card, StatusDot } from './ui';

type RoleCardProps = {
  role: RoleConfig;
  compact?: boolean;
  onSelect?: () => void;
  action?: ReactNode;
  selected?: boolean;
};

function RoleDetails({ role }: { role: RoleConfig }) {
  return <div className="role-card-details">
    <div className="role-card-detail-section"><h4>模型</h4><div className="role-model-summary"><small>{role.model}</small></div></div>
    <div className="role-card-detail-section"><h4>技能引用</h4><div className="role-reference-text">{role.skills?.length ? <><span className="role-reference-items">{role.skills.slice(0, 2).map(item => <span key={item}>{item}</span>)}</span>{role.skills.length > 2 && <span className="role-reference-overflow">+{role.skills.length - 2}</span>}</> : <p>暂无技能</p>}</div></div>
    <div className="role-card-detail-section"><h4>知识库引用</h4><div className="role-reference-text">{role.knowledge?.length ? <><span className="role-reference-items">{role.knowledge.slice(0, 2).map(reference => { const item = KNOWLEDGE_DOCUMENTS.find(document => document.id === reference || document.name === reference); return <span key={reference}>{item?.name || reference}</span>; })}</span>{role.knowledge.length > 2 && <span className="role-reference-overflow">+{role.knowledge.length - 2}</span>}</> : <p>暂无引用</p>}</div></div>
  </div>;
}

export function RoleCard({ role, compact = false, onSelect, action, selected = false }: RoleCardProps) {
  const content = <>
    <div className="role-card-header"><Avatar image={roleAvatar(role)} size={compact ? 42 : 50}/><div><strong>{role.name}</strong><span>{role.role}</span></div></div>
    <div className="role-card-intro"><h4>简介</h4><p>{role.description || '暂无角色描述'}</p></div>
    {!compact && <RoleDetails role={role}/>} 
  </>;

  if (compact) return <CompactRoleCard role={role} action={action}/>;
  if (onSelect) return <Card className={`agent-card ${selected ? 'selected' : ''}`}><button className="agent-card-button" onClick={onSelect}>{content}</button></Card>;
  return <div className="role-card-full">{content}</div>;
}

function CompactRoleCard({ role, action }: { role: RoleConfig; action?: ReactNode }) {
  const [popover, setPopover] = useState<{ left: number; top: number } | null>(null);
  const toggle = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    if (popover) { setPopover(null); return; }
    window.dispatchEvent(new CustomEvent('aivra:role-card-open', { detail: { id: role.id } }));
    setPopover({ left: Math.max(12, rect.left - 260), top: Math.max(12, rect.top) });
  };
  useEffect(() => {
    const closeOther = (event: Event) => {
      const id = (event as CustomEvent<{ id: string }>).detail?.id;
      if (id && id !== role.id) setPopover(null);
    };
    window.addEventListener('aivra:role-card-open', closeOther);
    return () => window.removeEventListener('aivra:role-card-open', closeOther);
  }, [role.id]);
  useEffect(() => {
    if (!popover) return;
    const closeOutside = (event: Event) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.role-card-compact-grid-item') && !target.closest('.role-card-popover')) setPopover(null);
    };
    document.addEventListener('mousedown', closeOutside);
    return () => document.removeEventListener('mousedown', closeOutside);
  }, [popover]);
  return <>
    <Card className="selected role-card-compact role-card-compact-grid-item" role="button" tabIndex={0} aria-expanded={Boolean(popover)} onClick={event => { if ((event.target as HTMLElement).closest('button')) { setPopover(null); return; } toggle(event.currentTarget); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(event.currentTarget); } }}>
      <div className="role-card-compact-wrap">
        <div className="role-card-compact-main"><Avatar image={roleAvatar(role)} size={28}/><div><strong>{role.name}</strong><span>{role.role}</span></div></div>
        <div className="role-card-compact-intro"><p>{role.description || '暂无角色描述'}</p></div>
        {action}
      </div>
    </Card>
    {popover && createPortal(<div className="role-card-popover" role="dialog" aria-label={`${role.name}角色详情`} style={{ left: popover.left, top: popover.top }}><RoleCard role={role}/></div>, document.body)}
  </>;
}
