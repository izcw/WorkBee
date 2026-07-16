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
  const [marketView, setMarketView] = useState<'market' | 'mine'>('market');
  const [githubConnected, setGithubConnected] = useState(false);
  useEffect(() => {
    const sync = () => setPage(readPage());
    addEventListener('hashchange', sync);
    return () => removeEventListener('hashchange', sync);
  }, []);
  useEffect(() => {
    window.aivraDesktop?.plugins.githubStatus().then(status => setGithubConnected(status.connected)).catch(() => undefined);
  }, []);
  const navigate = (next: PageId) => { location.hash = `/${next}`; setPage(next); };
  const content = page === 'home' ? <HomePage onNavigate={navigate} />
    : page === 'chat' ? <ChatPage />
    : page === 'team' ? <TeamPage />
    : page === 'docs' ? <DocsPage />
    : <MarketPage type={page} view={marketView} selectedSkillId={selectedSkillId} onSelectSkill={setSelectedSkillId} selectedPluginId={selectedPluginId} onSelectPlugin={setSelectedPluginId} githubConnected={githubConnected} onGithubChanged={setGithubConnected} onOpenMarket={() => setMarketView('market')} />;
  const layout = <AppLayout page={page} onNavigate={navigate} marketView={marketView} onMarketViewChange={setMarketView} right={page === 'chat' ? <ChatPage.Sidebar /> : page === 'team' ? <TeamPage.Sidebar /> : page === 'skills' ? <SkillSidebar skillId={selectedSkillId}/> : page === 'plugins' ? <PluginSidebar pluginId={selectedPluginId} githubConnected={githubConnected} onGithubChanged={setGithubConnected}/> : undefined}>{content}</AppLayout>;
  return <AgentProvider>{layout}</AgentProvider>;
}
