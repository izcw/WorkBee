import type { LucideIcon } from 'lucide-react';

export type PageId = 'home' | 'chat' | 'team' | 'skills' | 'plugins' | 'docs';
export type NavItem = { id: PageId; label: string; icon: LucideIcon };
