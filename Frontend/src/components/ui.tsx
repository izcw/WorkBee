import { useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import avatarImage from '../assets/images/avatar.png';

export function Button({ className = '', children, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return <button className={`button ${className}`} {...props}>{children}</button>;
}

export function Pill({ children, active = false, onClick }: { children: ReactNode; active?: boolean; onClick?: () => void }) {
  return <button className={`pill ${active ? 'pill-active' : ''}`} onClick={onClick}>{children}</button>;
}

export function Card({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function SearchInput({ placeholder = '搜索', className = '' }: { placeholder?: string; className?: string }) {
  return <label className={`ui-search ${className}`}><Search size={16}/><input aria-label={placeholder} placeholder={placeholder}/></label>;
}

export function Tabs({ items, value, onChange }: { items: string[]; value: string; onChange: (value: string) => void }) {
  return <div className="ui-tabs">{items.map(item => <button key={item} className={value === item ? 'active' : ''} onClick={() => onChange(item)}>{item}</button>)}</div>;
}

export function Dropdown({ label, options }: { label: string; options: string[] }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(label);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false); addEventListener('mousedown', close); return () => removeEventListener('mousedown', close); }, []);
  return <div className="ui-dropdown" ref={ref}><button onClick={() => setOpen(v => !v)}>{value}<ChevronDown size={14}/></button>{open && <div className="dropdown-menu">{options.map(option => <button key={option} onClick={() => {setValue(option);setOpen(false)}}>{option}{value === option && <Check size={14}/>}</button>)}</div>}</div>;
}

export function StatusDot({ label = '工作中' }: { label?: string }) {
  return <span className="status"><i />{label}</span>;
}

export function AddCard({ label = '添加' }: { label?: string }) {
  return <button className="add-card" aria-label={label}><Plus size={46} strokeWidth={1} /></button>;
}

export function Avatar({ kind = 'cat', size = 42, image }: { kind?: 'cat' | 'bot' | 'yellow'; size?: number; image?: string }) {
  if (image) return <span className="avatar avatar-image" style={{ width: size, height: size }}><img src={image} alt="" /></span>;
  if (kind === 'yellow') return <span className="avatar avatar-yellow" style={{ width: size, height: size }}><img src={avatarImage} alt="Yoko" /></span>;
  return <span className={`avatar avatar-${kind}`} style={{ width: size, height: size }}>{kind === 'bot' ? '♟' : '◕‿◕'}</span>;
}
