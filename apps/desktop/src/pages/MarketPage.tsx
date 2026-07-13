import { Plus } from 'lucide-react';
import { Card, Pill, SearchInput } from '../components/ui';
import notionIcon from '../assets/icon/notion.png';
import figmaIcon from '../assets/icon/Figma.png';
import feishuIcon from '../assets/icon/feishu.png';
import { SKILL_CATALOG } from '../data/catalog';

const pluginItems = [{ title: 'Notion', desc: 'Notion workflows for specs, research...', count: '4.5万次使用', icon: notionIcon }, { title: 'Figma', desc: 'Design-to-code workflows powered by...', count: '7.3万次使用', icon: figmaIcon }, { title: '飞书', desc: '连接你的飞书账号，让 TRAE 操作云文档...', count: '6.4万次使用', icon: feishuIcon }];

export function MarketPage({ type }: { type: 'skills' | 'plugins' }) {
  const items = type === 'skills' ? SKILL_CATALOG : pluginItems;
  return <div className="market-page"><div className="market-filter-row"><div className="categories">{['全部','办公学习','内容创作','开发工具'].map((x,i)=><Pill key={x} active={i===0}>{x}</Pill>)}</div><SearchInput className="market-search"/></div><div className="market-grid">{items.map(item=><Card className="market-card" key={item.title}><img className="market-icon" src={item.icon} alt=""/><div><strong>{item.title}</strong><p className="two-line">{item.desc}</p><small>@Aivra　 {item.count}</small></div><button aria-label="添加"><Plus size={18}/></button></Card>)}</div></div>;
}
