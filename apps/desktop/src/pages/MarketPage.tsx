import { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, KeyRound, Link2, Plus, Server, ShieldCheck, Trash2 } from 'lucide-react';
import { AddCard, Card, Pill, SearchInput } from '../components/ui';
import { SettingsModal } from '../components/SettingsModal';
import notionIcon from '../assets/icon/notion.png';
import figmaIcon from '../assets/icon/Figma.png';
import feishuIcon from '../assets/icon/feishu.png';
import githubIcon from '../assets/icon/github.png';
import { SKILL_CATALOG, type MarketCategory, type SkillCatalogItem } from '../data/catalog';

export type PluginItem = { id: string; title: string; desc: string; details: string; count: string; icon: string; category: MarketCategory };
export const PLUGIN_CATALOG: PluginItem[] = [
  { id: 'notion', title: 'Notion', desc: '连接 Notion 页面、数据库和团队知识库。', details: '读取和整理 Notion 中的产品文档、研究资料与项目数据库，让角色可以在授权范围内查找和更新内容。', count: '4.5w', icon: notionIcon, category: '办公学习' },
  { id: 'figma', title: 'Figma', desc: '连接设计文件和设计系统工作流。', details: '读取 Figma 设计上下文、组件和变量，支持设计审查、设计转代码以及设计系统维护。', count: '7.3w', icon: figmaIcon, category: '内容创作' },
  { id: 'feishu', title: '飞书', desc: '连接飞书云文档与团队协作内容。', details: '在授权后读取飞书文档、知识库与协作资料，为团队工作流提供统一的上下文。', count: '6.4w', icon: feishuIcon, category: '办公学习' },
  { id: 'github', title: 'GitHub', desc: '通过官方远程 MCP 访问仓库、议题、拉取请求和工作流。', details: '使用 GitHub 官方 Streamable HTTP MCP 服务，凭 PAT 在授权范围内读取或操作 GitHub 资源。', count: '官方 MCP', icon: githubIcon, category: '开发工具' },
];

type Props = { type: 'skills' | 'plugins'; view: 'market' | 'mine'; selectedSkillId?: string; onSelectSkill?: (id: string) => void; selectedPluginId?: string; onSelectPlugin?: (id: string) => void; githubConnected: boolean; onGithubChanged: (connected: boolean) => void; onOpenMarket: () => void };
const categories: Array<'全部' | MarketCategory> = ['全部', '办公学习', '内容创作', '开发工具'];

function GithubConnectDialog({ close, connected, onConnected }: { close: () => void; connected: boolean; onConnected: (value: boolean) => void }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const openGithub = async () => {
    if (!window.aivraDesktop) { setError('请在 WorkBee 桌面应用中打开 GitHub。'); return; }
    try { await window.aivraDesktop.plugins.openGithubTokenPage(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  const connect = async () => {
    if (!token.trim()) { setError('请输入 GitHub Personal Access Token。'); return; }
    if (!window.aivraDesktop) { setError('请在 WorkBee 桌面应用中连接 GitHub MCP。'); return; }
    setSaving(true); setError('');
    try { await window.aivraDesktop.plugins.connectGithub({ token }); onConnected(true); close(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  };
  const disconnect = async () => {
    if (!window.aivraDesktop) return;
    setSaving(true); setError('');
    try { await window.aivraDesktop.plugins.disconnectGithub(); onConnected(false); close(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  };
  return <SettingsModal title="连接 GitHub MCP"  close={close} className="github-connect-dialog">
    <div className="plugin-connect-layout"><aside><img src={githubIcon} alt="GitHub"/><strong>GitHub</strong><small>开发工具</small><span className={connected ? 'ready' : ''}>{connected ? <><Check size={13}/>已连接</> : '未连接'}</span></aside><main>{connected ? <div className="github-connect-body"><p className="connection-success"><Check size={16}/>已连接至 GitHub MCP</p><code>https://api.githubcopilot.com/mcp/</code><p className="plugin-info">可在已授予的权限范围内访问仓库、议题、拉取请求和工作流。</p><footer><button onClick={close}>关闭</button><button className="danger" onClick={disconnect} disabled={saving}>{saving ? '断开中…' : '断开连接'}</button></footer></div> : <form className="github-connect-body" onSubmit={event => { event.preventDefault(); void connect(); }}><section className="plugin-summary"><header><ShieldCheck size={17}/><div><h3>GitHub 官方远程 MCP</h3><p>通过 Streamable HTTP 连接 GitHub 仓库、Issues、Pull Requests 与 Actions。</p></div></header><dl><div><dt>服务地址</dt><dd>https://api.githubcopilot.com/mcp/</dd></div><div><dt>授权方式</dt><dd>GitHub Fine-grained PAT</dd></div></dl></section><button className="open-github" type="button" onClick={() => void openGithub()}><ExternalLink size={15}/>打开 GitHub 登录并创建访问令牌</button><label><span><KeyRound size={14}/>GitHub Personal Access Token</span><input autoFocus type="password" value={token} onChange={event => setToken(event.target.value)} placeholder="github_pat_… 或 ghp_…" autoComplete="off"/></label><small>浏览器会打开 GitHub 的令牌页面；完成登录和授权后，将新令牌粘贴到这里。WorkBee 会立即使用标准 MCP initialize 请求验证令牌，且仅保存到系统安全存储。</small>{error && <p className="connection-error">{error}</p>}<footer><button type="button" onClick={close} disabled={saving}>取消</button><button className="primary" type="submit" disabled={saving}>{saving ? '连接中…' : '连接并验证'}</button></footer></form>}</main></div>
  </SettingsModal>;
}

function McpServersDialog({ close, onChanged }: { close: () => void; onChanged: () => void }) {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const refresh = () => window.aivraDesktop?.plugins.listMcpServers().then(setServers).catch(reason => setError(String(reason)));
  useEffect(() => { void refresh(); }, []);
  const save = async () => {
    if (!window.aivraDesktop) { setError('请在 WorkBee 桌面应用中配置 MCP。'); return; }
    setSaving(true); setError('');
    try {
      await window.aivraDesktop.plugins.saveMcpServer({ name, url, token });
      setName(''); setUrl(''); setToken(''); await refresh(); onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  };
  const remove = async (id: string) => {
    if (!window.aivraDesktop || !confirm('确定删除这个 MCP 连接吗？')) return;
    setSaving(true); setError('');
    try { await window.aivraDesktop.plugins.deleteMcpServer(id); await refresh(); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  };
  return <SettingsModal title="本地 MCP 连接" description="添加兼容 Streamable HTTP 的 MCP Server；配置保存在本机，令牌进入系统安全存储。" close={close} className="github-connect-dialog">
    <div className="mcp-server-dialog">
      {servers.length > 0 && <section className="mcp-server-list">{servers.map(server => <div key={server.id}><Server size={17}/><span><strong>{server.name}</strong><small>{server.url}</small></span><em>{server.tokenAvailable ? '已加密授权' : '无令牌'}</em><button aria-label={`删除 ${server.name}`} onClick={() => void remove(server.id)} disabled={saving}><Trash2 size={14}/></button></div>)}</section>}
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <label><span>名称</span><input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="例如：Local Docs"/></label>
        <label><span>服务地址</span><input value={url} onChange={event => setUrl(event.target.value)} placeholder="http://127.0.0.1:3333/mcp"/></label>
        <label><span>Bearer Token（可选）</span><input type="password" value={token} onChange={event => setToken(event.target.value)} autoComplete="off"/></label>
        <small>保存前会执行 MCP initialize 验证。工具会使用 mcp_服务标识_工具名 命名，并沿用 WorkBee 的副作用审批策略。</small>
        {error && <p className="connection-error">{error}</p>}
        <footer><button type="button" onClick={close}>关闭</button><button className="primary" disabled={saving}>{saving ? '验证并保存中…' : '验证并保存'}</button></footer>
      </form>
    </div>
  </SettingsModal>;
}

function SkillUseDialog({ skill, close }: { skill: SkillCatalogItem; close: () => void }) {
  return <SettingsModal title="使用技能" description="确认后，该技能将用于当前角色与任务。" close={close} className="github-connect-dialog">
    <div className="plugin-connect-layout"><aside><img src={skill.icon} alt=""/><strong>{skill.title}</strong><small>{skill.category}</small><span className="ready"><Check size={13}/>{skill.automatic ? '内置技能' : '市场技能'}</span></aside><main><div className="github-connect-body"><section className="plugin-summary"><header><img src={skill.icon} alt=""/><div><h3>{skill.title}</h3><p>{skill.desc}</p></div></header></section><p className="plugin-info">{skill.details}</p><div className="skill-capabilities">{skill.capabilities.map(item => <span key={item}><Check size={13}/>{item}</span>)}</div><footer><button type="button" onClick={close}>取消</button><button className="primary" onClick={close}><Check size={15}/>使用技能</button></footer></div></main></div>
  </SettingsModal>;
}

function PluginConnectDialog({ plugin, close }: { plugin: PluginItem; close: () => void }) {
  return <SettingsModal title={`连接${plugin.title}`} description={plugin.desc} close={close} className="github-connect-dialog">
    <div className="plugin-connect-layout"><aside><img src={plugin.icon} alt=""/><strong>{plugin.title}</strong><small>{plugin.category}</small><span>待连接</span></aside><main><div className="github-connect-body"><section className="plugin-summary"><header><img src={plugin.icon} alt=""/><div><h3>{plugin.title}</h3><p>{plugin.desc}</p></div></header></section><p className="plugin-info">{plugin.details}</p><footer><button type="button" onClick={close}>关闭</button></footer></div></main></div>
  </SettingsModal>;
}

export function MarketPage({ type, view, selectedSkillId, onSelectSkill, selectedPluginId, onSelectPlugin, githubConnected, onGithubChanged, onOpenMarket }: Props) {
  const [category, setCategory] = useState<'全部' | MarketCategory>('全部');
  const [query, setQuery] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [configuringMcp, setConfiguringMcp] = useState(false);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const refreshMcp = () => window.aivraDesktop?.plugins.listMcpServers().then(setMcpServers).catch(() => setMcpServers([]));
  useEffect(() => { if (type === 'plugins') void refreshMcp(); }, [type]);
  const source = type === 'skills' ? SKILL_CATALOG : PLUGIN_CATALOG;
  const items = useMemo(() => source.filter(item => (category === '全部' || item.category === category) && `${item.title} ${item.desc} ${item.category}`.toLowerCase().includes(query.trim().toLowerCase())), [source, category, query]);
  const mine = type === 'skills' ? SKILL_CATALOG : PLUGIN_CATALOG.filter(item => item.id === 'github' && githubConnected);
  const select = (id: string) => { if (type === 'skills') onSelectSkill?.(id); else onSelectPlugin?.(id); window.dispatchEvent(new Event('aivra:open-right-panel')); };
  const shown = view === 'mine' ? mine.filter(item => `${item.title} ${item.desc}`.toLowerCase().includes(query.trim().toLowerCase())) : items;
  return <div className="market-page"><div className="market-filter-row"><div className="categories">{categories.map(x => <Pill key={x} active={category === x} onClick={() => setCategory(x)}>{x}</Pill>)}</div><SearchInput className="market-search" value={query} onChange={setQuery}/></div><div className="market-grid">{shown.map(item => <Card className={`market-card ${(type === 'skills' ? selectedSkillId : selectedPluginId) === item.id ? 'selected' : ''}`} key={item.id}><button className="market-card-main" onClick={() => select(item.id)}><img className="market-icon" src={item.icon} alt=""/><div><strong>{item.title}</strong><p className="two-line">{item.desc}</p><small>{item.category}　{item.count}</small></div></button>{type === 'plugins' && <button className={`market-card-status ${item.id === 'github' && githubConnected ? 'connected' : ''}`} title={item.id === 'github' && githubConnected ? '已连接' : '添加插件'} onClick={() => item.id === 'github' ? setConnecting(true) : select(item.id)}>{item.id === 'github' && githubConnected ? <Check size={16}/> : <Plus size={16}/>}</button>}</Card>)}{type === 'plugins' && view === 'mine' && mcpServers.filter(server => `${server.name} ${server.url}`.toLowerCase().includes(query.trim().toLowerCase())).map(server => <Card className="market-card" key={`mcp-${server.id}`}><div className="market-card-main"><i className="market-server-icon"><Server size={22}/></i><div><strong>{server.name}</strong><p className="two-line">{server.url}</p><small>自定义 MCP　{server.tokenAvailable ? '安全授权' : '无令牌'}</small></div></div><button className="market-card-status connected" title="管理连接" onClick={() => setConfiguringMcp(true)}><Check size={16}/></button></Card>)}{view === 'mine' && <button className="market-add-plugin" onClick={type === 'plugins' ? () => setConfiguringMcp(true) : onOpenMarket}><AddCard label={type === 'plugins' ? '添加 MCP' : '添加技能'}/><span>添加{type === 'plugins' ? ' MCP' : '技能'}</span></button>}</div>{shown.length === 0 && !(type === 'plugins' && view === 'mine' && mcpServers.length) && <p className="market-empty">没有找到匹配的{view === 'mine' ? '已添加项目' : '技能或插件'}。</p>}{connecting && <GithubConnectDialog close={() => setConnecting(false)} connected={githubConnected} onConnected={onGithubChanged}/>} {configuringMcp && <McpServersDialog close={() => setConfiguringMcp(false)} onChanged={() => void refreshMcp()}/>}</div>;
}

export function SkillSidebar({ skillId }: { skillId: string }) {
  const skill = SKILL_CATALOG.find(item => item.id === skillId) || SKILL_CATALOG[0];
  const [using, setUsing] = useState(false);
  return <div className="skill-detail"><header><img src={skill.icon} alt=""/><small>{skill.automatic ? 'WorkBee 内置技能' : 'WorkBee 技能'} · {skill.category}</small><h2>{skill.title}</h2><p>{skill.desc}</p></header><section><h3>详细描述</h3><p>{skill.details}</p></section><section><h3>主要能力</h3><div className="skill-capabilities">{skill.capabilities.map(item => <span key={item}><Check size={13}/>{item}</span>)}</div></section><footer><span>{skill.count}</span><button onClick={() => setUsing(true)}><Plus size={15}/>使用技能</button></footer>{using && <SkillUseDialog skill={skill} close={() => setUsing(false)}/>}</div>;
}

export function PluginSidebar({ pluginId, githubConnected, onGithubChanged }: { pluginId: string; githubConnected: boolean; onGithubChanged: (connected: boolean) => void }) {
  const plugin = PLUGIN_CATALOG.find(item => item.id === pluginId) || PLUGIN_CATALOG[0];
  const [connecting, setConnecting] = useState(false);
  const [info, setInfo] = useState(false);
  return <div className="skill-detail plugin-detail"><header><img src={plugin.icon} alt=""/><small>WorkBee 插件 · {plugin.category}</small><h2>{plugin.title}</h2><p>{plugin.desc}</p></header><section><h3>详细描述</h3><p>{plugin.details}</p></section><footer><span>{plugin.count}</span><button onClick={() => plugin.id === 'github' ? setConnecting(true) : setInfo(true)}>{plugin.id === 'github' && githubConnected ? <Check size={15}/> : <Link2 size={15}/>} {plugin.id === 'github' && githubConnected ? '已连接' : '连接插件'}</button></footer>{connecting && <GithubConnectDialog close={() => setConnecting(false)} connected={githubConnected} onConnected={onGithubChanged}/>}{info && <PluginConnectDialog plugin={plugin} close={() => setInfo(false)}/>}</div>;
}
