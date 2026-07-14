import { useEffect, useState } from 'react';
import { AppLayout } from './components/Layout';
import type { PageId } from './types';
import { HomePage } from './pages/HomePage';
import { ChatPage } from './pages/ChatPage';
import { TeamPage } from './pages/TeamPage';
import { MarketPage, PluginSidebar, SkillSidebar } from './pages/MarketPage';
import { DocsPage } from './pages/DocsPage';
import { AgentProvider } from './agent/AgentContext';

const validPages: PageId[] = ['home', 'chat', 'team', 'skills', 'plugins', 'docs'];

function readPage(): PageId {
  const value = location.hash.replace('#/', '') as PageId;
  return validPages.includes(value) ? value : 'home';
}

export function App() {
  const [page, setPage] = useState<PageId>(readPage);
  const [selectedSkillId, setSelectedSkillId] = useState('word-processing');
  const [selectedPluginId, setSelectedPluginId] = useState('notion');
  useEffect(() => {
    const sync = () => setPage(readPage());
    addEventListener('hashchange', sync);
    return () => removeEventListener('hashchange', sync);
  }, []);
  const navigate = (next: PageId) => { location.hash = `/${next}`; setPage(next); };
  const content = page === 'home' ? <HomePage onNavigate={navigate} />
    : page === 'chat' ? <ChatPage />
    : page === 'team' ? <TeamPage />
    : page === 'docs' ? <DocsPage />
    : <MarketPage type={page} selectedSkillId={selectedSkillId} onSelectSkill={setSelectedSkillId} selectedPluginId={selectedPluginId} onSelectPlugin={setSelectedPluginId} />;
  const layout = <AppLayout page={page} onNavigate={navigate} right={page === 'chat' ? <ChatPage.Sidebar /> : page === 'team' ? <TeamPage.Sidebar /> : page === 'skills' ? <SkillSidebar skillId={selectedSkillId}/> : page === 'plugins' ? <PluginSidebar pluginId={selectedPluginId}/> : undefined}>{content}</AppLayout>;
  return <AgentProvider>{layout}</AgentProvider>;
}
