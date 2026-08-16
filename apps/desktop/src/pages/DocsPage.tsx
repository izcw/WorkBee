import { useState } from 'react';
import { MDXEditor, headingsPlugin, listsPlugin, markdownShortcutPlugin, quotePlugin, thematicBreakPlugin, toolbarPlugin, BoldItalicUnderlineToggles, BlockTypeSelect, CreateLink, ListsToggle, UndoRedo } from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import { Check, Edit3, Filter, Grid2X2, List, X } from 'lucide-react';
import { SearchInput } from '../components/ui';
import { SettingsModal } from '../components/SettingsModal';
import { KNOWLEDGE_DOCUMENTS } from '../data/catalog';
import './DocsPage.css';

export function DocsPage() {
  const [documents, setDocuments] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('workbee.markdown-documents.v1') || '{}') as Record<string, string>;
      return KNOWLEDGE_DOCUMENTS.map(document => saved[document.id] !== undefined ? { ...document, content: saved[document.id] } : document);
    } catch { return KNOWLEDGE_DOCUMENTS; }
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const selected = documents.find(document => document.id === selectedId);
  const openDocument = (id: string) => {
    const document = documents.find(item => item.id === id);
    if (!document || document.type !== 'markdown') return;
    setSelectedId(id); setDraft(document.content || ''); setEditing(false);
  };
  const closeDocument = () => { setSelectedId(null); setEditing(false); };
  const saveDocument = () => {
    const content = draft;
    const nextDocuments = documents.map(item => item.id === selectedId ? { ...item, content, updatedAt: '刚刚' } : item);
    setDocuments(nextDocuments);
    localStorage.setItem('workbee.markdown-documents.v1', JSON.stringify(Object.fromEntries(nextDocuments.filter(item => item.type === 'markdown').map(item => [item.id, item.content || '']))));
    setDraft(content); setEditing(false);
  };
  const editorPlugins = [headingsPlugin(), listsPlugin(), quotePlugin(), thematicBreakPlugin(), markdownShortcutPlugin(), toolbarPlugin({ toolbarContents: () => <><UndoRedo/><BoldItalicUnderlineToggles/><BlockTypeSelect/><ListsToggle/><CreateLink/></> })];
  const viewerPlugins = [headingsPlugin(), listsPlugin(), quotePlugin(), thematicBreakPlugin()];
  return <div className="docs-page"><div className="docs-header"><h2>全部文档</h2><div><SearchInput className="docs-search"/><button title="筛选"><Filter size={17}/></button><button title="表格显示"><Grid2X2 size={16}/></button><button title="列表显示"><List size={17}/></button></div></div><table className="doc-table"><thead><tr><th></th><th>名称</th><th>类型</th><th>位置</th><th>大小</th><th>更新时间</th></tr></thead><tbody>{documents.map(doc=><tr key={doc.id}><td><input type="checkbox" aria-label={`选择 ${doc.name}`}/></td><td><strong className={doc.type === 'markdown' ? 'document-title-link' : undefined} onClick={() => openDocument(doc.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') openDocument(doc.id); }} role={doc.type === 'markdown' ? 'button' : undefined} tabIndex={doc.type === 'markdown' ? 0 : undefined}><img src={doc.icon} alt=""/>{doc.name}</strong></td><td>{doc.type.toUpperCase()}</td><td>{doc.location}</td><td>{doc.size}</td><td>{doc.updatedAt}</td></tr>)}</tbody></table>{selected && <SettingsModal title={selected.name} description={selected.location} close={closeDocument} className="document-preview-window"><div className="document-preview-body">{editing ? <MDXEditor markdown={draft} onChange={setDraft} plugins={editorPlugins}/> : <MDXEditor markdown={selected.content || '暂无内容'} readOnly plugins={viewerPlugins}/>}</div><footer className="document-preview-footer"><span>{editing ? '所见即所得编辑模式' : 'Markdown 文档预览'}</span><div>{editing && <button onClick={() => { setDraft(selected.content || ''); setEditing(false); }}><X size={14}/>取消</button>}<button className="primary" onClick={editing ? saveDocument : () => setEditing(true)}>{editing ? <><Check size={14}/>保存</> : <><Edit3 size={14}/>编辑</>}</button></div></footer></SettingsModal>}</div>;
}
