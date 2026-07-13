import { Filter, Grid2X2, List } from 'lucide-react';
import { SearchInput } from '../components/ui';
import { KNOWLEDGE_DOCUMENTS } from '../data/catalog';

export function DocsPage() {
  return <div className="docs-page"><div className="docs-header"><h2>全部文档</h2><div><SearchInput className="docs-search"/><button title="筛选"><Filter size={17}/></button><button title="表格显示"><Grid2X2 size={16}/></button><button title="列表显示"><List size={17}/></button></div></div><table className="doc-table"><thead><tr><th></th><th>名称</th><th>类型</th><th>位置</th><th>大小</th><th>更新时间</th></tr></thead><tbody>{KNOWLEDGE_DOCUMENTS.map(doc=><tr key={doc.id}><td><input type="checkbox" aria-label={`选择 ${doc.name}`}/></td><td><strong><img src={doc.icon} alt=""/>{doc.name}</strong></td><td>{doc.type.toUpperCase()}</td><td>{doc.location}</td><td>{doc.size}</td><td>{doc.updatedAt}</td></tr>)}</tbody></table></div>;
}
