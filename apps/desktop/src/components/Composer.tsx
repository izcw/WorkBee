import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { AtSign, BookOpen, Box, Check, Paperclip, Send, Sparkles, Users, X } from 'lucide-react';
import { Button, Dropdown, Tabs } from './ui';
import { roleAvatar } from '../data/roleAvatars';
import { SKILL_CATALOG, KNOWLEDGE_DOCUMENTS } from '../data/catalog';
import { PLUGIN_CATALOG } from '../pages/MarketPage';

const fallbackRoles: RoleConfig[] = [{ id: 'workbee', name: 'BeeYo', role: '全能统筹 Agent', modelId: 'deepseek-default', modelName: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', keyAvailable: false, description: '统筹并完成开发、工作、设计与文件处理。', skills: ['全局规划与执行', '文件读写与整理', '软件开发与测试'], knowledge: ['workbee-working-principles', 'planning-delivery-playbook'] }];
type MentionItem = { id: string; label: string; category: '插件' | '技能' | '文档'; description: string };
type MentionPosition = { left: number; top: number; width: number; maxHeight: number; placement: 'above' | 'below' };

function caretPosition(textarea: HTMLTextAreaElement) {
  const styles = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const marker = document.createElement('span');
  const copied = ['box-sizing', 'width', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'line-height', 'text-transform', 'text-indent', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'word-spacing', 'tab-size'];
  mirror.style.cssText = copied.map(property => `${property}:${styles.getPropertyValue(property)}`).join(';');
  mirror.style.position = 'absolute'; mirror.style.visibility = 'hidden'; mirror.style.overflow = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap'; mirror.style.overflowWrap = 'break-word'; mirror.style.left = '-9999px'; mirror.style.top = '0';
  const caret = textarea.selectionStart ?? textarea.value.length;
  mirror.textContent = textarea.value.slice(0, caret);
  marker.textContent = textarea.value.slice(caret, caret + 1) || '\u200b';
  mirror.append(marker); document.body.append(mirror);
  const position = { left: marker.offsetLeft - textarea.scrollLeft, top: marker.offsetTop - textarea.scrollTop, height: marker.offsetHeight || Number.parseFloat(styles.lineHeight) || 20 };
  mirror.remove();
  return position;
}
const mentionItems: MentionItem[] = [...PLUGIN_CATALOG.map(item => ({ id: item.id, label: item.title, category: '插件' as const, description: item.desc })), ...SKILL_CATALOG.map(item => ({ id: item.id, label: item.title, category: '技能' as const, description: item.desc })), ...KNOWLEDGE_DOCUMENTS.map(item => ({ id: item.id, label: item.name, category: '文档' as const, description: item.location }))];

function MentionIcon({ category, size = 14 }: { category: MentionItem['category']; size?: number }) {
  return category === '插件' ? <Box size={size}/> : category === '技能' ? <Sparkles size={size}/> : <BookOpen size={size}/>;
}

function SelectedRoleAvatar({ role }: { role: RoleConfig }) {
  const [tip, setTip] = useState<{ left: number; top: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (event: ReactMouseEvent<HTMLSpanElement>) => { if (closeTimer.current) clearTimeout(closeTimer.current); const rect = event.currentTarget.getBoundingClientRect(); setTip({ left: Math.max(12, Math.min(rect.left, window.innerWidth - 242)), top: Math.max(12, rect.top - 92) }); };
  const close = () => { closeTimer.current = setTimeout(() => setTip(null), 120); };
  return <span className="selected-role-avatar" onMouseEnter={show} onMouseLeave={close}><img src={roleAvatar(role)} alt={role.name}/>{tip && createPortal(<span className="role-avatar-tip" style={{ left: tip.left, top: tip.top }} onMouseEnter={() => { if (closeTimer.current) clearTimeout(closeTimer.current); }} onMouseLeave={close}><strong>{role.name}</strong><small>{(role.description || role.role).slice(0,56)}</small></span>, document.body)}</span>;
}

export function Composer({ compact = false, value: controlledValue, onChange, onSubmit, disabled = false, mode: controlledMode, onModeChange, roles: configuredRoles = fallbackRoles, selectedRoleId = 'workbee', selectedRoleIds: chosenRoleIds = [selectedRoleId], onRoleChange, approvalMode = 'request', onApprovalModeChange }: { compact?: boolean; value?: string; onChange?: (value: string) => void; onSubmit?: (value: string) => void; disabled?: boolean; mode?: 'chat' | 'task'; onModeChange?: (mode: 'chat' | 'task') => void; roles?: RoleConfig[]; selectedRoleId?: string; onRoleChange?: (id: string) => void; selectedRoleIds?: string[]; approvalMode?: 'request' | 'auto' | 'full'; onApprovalModeChange?: (mode: 'request' | 'auto' | 'full') => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionMenuRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [localValue, setLocalValue] = useState('');
  const [localMode, setLocalMode] = useState<'chat' | 'task'>('task');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentions, setMentions] = useState<MentionItem[]>([]);
  const [mentionPosition, setMentionPosition] = useState<MentionPosition | null>(null);
  const value = controlledValue ?? localValue;
  const mode = controlledMode ?? localMode;
  const selectedRoles = configuredRoles.filter(role => chosenRoleIds.includes(role.id));
  const filteredMentions = mentionItems.filter(item => !mentionQuery || item.id.toLowerCase().startsWith(mentionQuery.toLowerCase()) || item.label.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 8);
  useLayoutEffect(() => {
    if (!mentionOpen) { setMentionPosition(null); return; }
    const updatePosition = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const textareaRect = textarea.getBoundingClientRect();
      const caret = caretPosition(textarea);
      const anchor = { left: textareaRect.left + caret.left, top: textareaRect.top + caret.top, bottom: textareaRect.top + caret.top + caret.height };
      const safeMargin = 12;
      const gap = 8;
      const width = Math.min(430, Math.max(280, textareaRect.width));
      const left = Math.max(safeMargin, Math.min(anchor.left, window.innerWidth - width - safeMargin));
      const aboveSpace = anchor.top - safeMargin;
      const belowSpace = window.innerHeight - anchor.bottom - safeMargin;
      const menuHeight = Math.min(310, mentionMenuRef.current?.offsetHeight || 310);
      const placement = belowSpace >= menuHeight || belowSpace >= aboveSpace ? 'below' : 'above';
      const available = placement === 'below' ? belowSpace : aboveSpace;
      const maxHeight = Math.max(0, Math.min(310, available - gap));
      const displayedHeight = Math.min(menuHeight, maxHeight);
      const top = placement === 'below'
        ? Math.min(window.innerHeight - safeMargin - displayedHeight, anchor.bottom + gap)
        : Math.max(safeMargin, anchor.top - gap - displayedHeight);
      setMentionPosition({ left, top, width, maxHeight, placement });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(updatePosition);
    if (textareaRef.current) observer?.observe(textareaRef.current);
    if (mentionMenuRef.current) observer?.observe(mentionMenuRef.current);
    return () => { window.removeEventListener('resize', updatePosition); window.removeEventListener('scroll', updatePosition, true); observer?.disconnect(); };
  }, [mentionOpen, mentionQuery, value, filteredMentions.length]);
  const updateValue = (next: string, caret = next.length) => { setLocalValue(next); onChange?.(next); const match = next.slice(0, caret).match(/@([\w\u4e00-\u9fff-]*)$/); setMentionOpen(Boolean(match)); setMentionQuery(match?.[1] || ''); setMentionStart(match ? caret - match[0].length : -1); setMentionIndex(0); };
  const chooseMention = (item: MentionItem) => { const next = `${value.slice(0, mentionStart)}${value.slice(mentionStart + mentionQuery.length + 1)}`.replace(/^\s+/, ''); updateValue(next); setMentionOpen(false); setMentions(current => current.some(mention => mention.id === item.id && mention.category === item.category) ? current : [...current, item]); };
  const updateMode = (next: string) => { const typed = next === '对话' ? 'chat' : 'task'; setLocalMode(typed); onModeChange?.(typed); };
  const submit = () => { const prompt = [...mentions.map(item => `@${item.id}`), value.trim()].filter(Boolean).join(' '); if (!disabled && prompt) { onSubmit?.(prompt); setMentions([]); } };
  const scheduleRoleClose = () => { closeTimer.current = setTimeout(() => setRoleOpen(false), 180); };
  const keepRoleOpen = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const approvalLabel = approvalMode === 'auto' ? '替我审批' : approvalMode === 'full' ? '完全访问权限' : '请求批准';
  const changeApproval = (label: string) => onApprovalModeChange?.(label === '替我审批' ? 'auto' : label === '完全访问权限' ? 'full' : 'request');
  return <div className={`composer ${compact ? 'composer-compact' : ''}`}>
    {compact && <Tabs items={['对话','任务']} value={mode === 'chat' ? '对话' : '任务'} onChange={updateMode}/>}
    <div className="composer-input-wrap">
      {mentions.length > 0 && <div className="composer-mention-tags">{mentions.map(item => <span key={`${item.category}-${item.id}`}><i className={`mention-icon ${item.category}`}><MentionIcon category={item.category} size={13}/></i><strong>{item.label}</strong><button aria-label={`移除 ${item.label}`} onClick={() => setMentions(current => current.filter(mention => mention !== item))}><X size={12}/></button></span>)}</div>}
      <textarea ref={textareaRef} aria-label="任务描述" placeholder="输入问题，或让 WorkBee 读取和修改工作区；输入 @ 选择插件、技能或文档" value={value} disabled={disabled} onChange={event => updateValue(event.target.value, event.target.selectionStart)} onBlur={() => setTimeout(() => setMentionOpen(false), 120)} onKeyDown={event => { if (mentionOpen && filteredMentions.length) { if (event.key === 'ArrowDown') { event.preventDefault(); setMentionIndex(index => Math.min(index + 1, filteredMentions.length - 1)); return; } if (event.key === 'ArrowUp') { event.preventDefault(); setMentionIndex(index => Math.max(index - 1, 0)); return; } if (event.key === 'Escape') { setMentionOpen(false); return; } if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) { event.preventDefault(); chooseMention(filteredMentions[mentionIndex]); return; } } if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } }}/>
      {mentionOpen && createPortal(<div ref={mentionMenuRef} className="mention-menu" role="listbox" data-placement={mentionPosition?.placement} style={{ position: 'fixed', left: mentionPosition?.left ?? -9999, top: mentionPosition?.top ?? -9999, bottom: 'auto', right: 'auto', width: mentionPosition?.width, maxHeight: mentionPosition?.maxHeight, visibility: mentionPosition ? 'visible' : 'hidden' }} onMouseLeave={() => setMentionOpen(false)}><header><AtSign size={14}/><span>选择上下文</span><small>输入完整名称或使用 ↑↓ 选择</small></header>{(['插件', '技能', '文档'] as const).map(category => { const group = filteredMentions.filter(item => item.category === category); return group.length ? <section key={category}><h4>{category === '文档' ? '知识库' : category}</h4>{group.map(item => { const index = filteredMentions.indexOf(item); return <button key={`${item.category}-${item.id}`} className={index === mentionIndex ? 'active' : ''} onMouseDown={event => { event.preventDefault(); chooseMention(item); }} role="option" aria-selected={index === mentionIndex}><i className={`mention-icon ${item.category}`}><MentionIcon category={item.category}/></i><span><strong>@{item.id}</strong><small>{item.description}</small></span></button>; })}</section> : null; })}{!filteredMentions.length && <p>未找到以“{mentionQuery}”开头的插件、技能或文档。</p>}</div>, document.body)}
    </div>
    <div className="composer-footer"><div className="composer-actions"><input ref={fileRef} className="hidden-file" type="file" multiple/><Button className="composer-icon-button" title="选择文件" aria-label="选择文件" onClick={() => fileRef.current?.click()}><Paperclip size={16}/></Button><div className="role-picker" onMouseEnter={keepRoleOpen} onMouseLeave={scheduleRoleClose}><Button className="composer-icon-button" title="选择角色" aria-label="选择角色" onClick={() => setRoleOpen(v => !v)}><Users size={16}/></Button>{roleOpen && <div className="role-menu" onMouseEnter={keepRoleOpen}>{configuredRoles.map(role => <button key={role.id} className={chosenRoleIds.includes(role.id) ? 'active' : ''} onClick={() => onRoleChange?.(role.id)}><img src={roleAvatar(role)} alt=""/><span><strong>{role.name}</strong><small>{role.role} · {role.model}</small></span>{chosenRoleIds.includes(role.id) && <Check size={14}/>}</button>)}</div>}</div><span className="selected-roles">{selectedRoles.slice(0,3).map(role => <SelectedRoleAvatar role={role} key={role.id}/>)}{selectedRoles.length > 3 && <strong title={selectedRoles.slice(3).map(role => role.name).join('、')}>+{selectedRoles.length - 3}</strong>}</span></div><div className="composer-settings"><Dropdown label={approvalLabel} value={approvalLabel} onChange={changeApproval} options={['请求批准','替我审批','完全访问权限']}/><button className="send" aria-label="发送" disabled={disabled || (!value.trim() && mentions.length === 0)} onClick={submit}><Send size={17}/></button></div></div>
  </div>;
}
