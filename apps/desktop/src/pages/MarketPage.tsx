import { Check, Plus } from 'lucide-react';
import { Card, Pill, SearchInput } from '../components/ui';
import notionIcon from '../assets/icon/notion.png';
import figmaIcon from '../assets/icon/Figma.png';
import feishuIcon from '../assets/icon/feishu.png';
import { SKILL_CATALOG } from '../data/catalog';

const pluginItems = [{ id: 'notion', title: 'Notion', desc: '连接 Notion 页面、数据库和团队知识库。', details: '读取和整理 Notion 中的产品文档、研究资料与项目数据库，让角色可以在授权范围内查找和更新内容。', count: '4.5万次使用', icon: notionIcon }, { id: 'figma', title: 'Figma', desc: '连接设计文件和设计系统工作流。', details: '读取 Figma 设计上下文、组件和变量，支持设计审查、设计转代码以及设计系统维护。', count: '7.3万次使用', icon: figmaIcon }, { id: 'feishu', title: '飞书', desc: '连接飞书云文档与团队协作内容。', details: '在授权后读取飞书文档、知识库与协作资料，为团队工作流提供统一的上下文。', count: '6.4万次使用', icon: feishuIcon }];

export function MarketPage({ type, selectedSkillId, onSelectSkill, selectedPluginId, onSelectPlugin }: { type: 'skills' | 'plugins'; selectedSkillId?: string; onSelectSkill?: (id: string) => void; selectedPluginId?: string; onSelectPlugin?: (id: string) => void }) {
  const items = type === 'skills' ? SKILL_CATALOG : pluginItems;
  const select = (id: string) => { if (type === 'skills') onSelectSkill?.(id); else onSelectPlugin?.(id); window.dispatchEvent(new Event('aivra:open-right-panel')); };
  return <div className="market-page"><div className="market-filter-row"><div className="categories">{['全部','办公学习','内容创作','开发工具'].map((x,i)=><Pill key={x} active={i===0}>{x}</Pill>)}</div><SearchInput className="market-search"/></div><div className="market-grid">{items.map(item=><Card className={`market-card ${(type === 'skills' ? selectedSkillId : selectedPluginId) === item.id ? 'selected' : ''}`} key={item.title}><button className="market-card-main" onClick={() => select(item.id)}><img className="market-icon" src={item.icon} alt=""/><div><strong>{item.title}</strong><p className="two-line">{item.desc}</p><small>@Aivra　 {item.count}</small></div></button><button aria-label="添加"><Plus size={18}/></button></Card>)}</div></div>;
}

export function SkillSidebar({ skillId }: { skillId: string }) {
  const skill = SKILL_CATALOG.find(item => item.id === skillId) || SKILL_CATALOG[0];
  return <div className="skill-detail"><header><img src={skill.icon} alt=""/><small>{skill.automatic ? 'Aivra 内置技能' : 'Aivra 技能'}</small><h2>{skill.title}</h2><p>{skill.desc}</p></header><section><h3>详细描述</h3><p>{skill.details}</p></section><section><h3>主要能力</h3><div className="skill-capabilities">{skill.capabilities.map(item => <span key={item}><Check size={13}/>{item}</span>)}</div></section><footer><span>{skill.count}</span><button><Plus size={15}/>添加技能</button></footer></div>;
}

export function PluginSidebar({ pluginId }: { pluginId: string }) {
  const plugin = pluginItems.find(item => item.id === pluginId) || pluginItems[0];
  return <div className="skill-detail plugin-detail"><header><img src={plugin.icon} alt=""/><small>Aivra 插件</small><h2>{plugin.title}</h2><p>{plugin.desc}</p></header><section><h3>详细描述</h3><p>{plugin.details}</p></section><footer><span>{plugin.count}</span><button><Plus size={15}/>连接插件</button></footer></div>;
}
