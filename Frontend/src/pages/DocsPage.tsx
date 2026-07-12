import { Filter, Grid2X2, List } from 'lucide-react';
import { SearchInput } from '../components/ui';
import pdfIcon from '../assets/icon/pdf.png';
import markdownIcon from '../assets/icon/markdown.png';
import txtIcon from '../assets/icon/txt.png';

const documents = [{name:'Full Text PDF',icon:pdfIcon},{name:'How the Humanization of Pets Is Changing Shopper Habits',icon:markdownIcon},{name:'Canis Modernis: Human/Dog Coevolution in Modernist Literature',icon:txtIcon}];

export function DocsPage() {
  return <div className="docs-page"><div className="docs-header"><h2>全部文档</h2><div><SearchInput className="docs-search"/><button title="筛选"><Filter size={17}/></button><button title="表格显示"><Grid2X2 size={16}/></button><button title="列表显示"><List size={17}/></button></div></div><table className="doc-table"><thead><tr><th></th><th>名称</th><th>位置</th><th>大小</th><th>更新时间</th></tr></thead><tbody>{documents.map(doc=><tr key={doc.name}><td><input type="checkbox" aria-label={`选择 ${doc.name}`}/></td><td><strong><img src={doc.icon} alt=""/>{doc.name}</strong></td><td>D:\App\Daily\RK Keyboard Software\Cartoon</td><td>141.58KB</td><td>2026-04-07 00:36:16</td></tr>)}</tbody></table></div>;
}
