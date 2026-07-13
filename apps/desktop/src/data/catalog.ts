import wordIcon from '../assets/icon/word.png';
import pdfIcon from '../assets/icon/pdf.png';
import markdownIcon from '../assets/icon/markdown.png';
import txtIcon from '../assets/icon/txt.png';

export type KnowledgeDocument = { id: string; name: string; type: 'word' | 'pdf' | 'markdown'; icon: string; location: string; size: string; updatedAt: string };
export type SkillCatalogItem = { id: string; title: string; desc: string; count: string; icon: string; automatic?: boolean };

export const KNOWLEDGE_DOCUMENTS: KnowledgeDocument[] = [
  { id: 'full-text-pdf', name: 'Full Text PDF', type: 'pdf', icon: pdfIcon, location: '文档库 / 研究资料', size: '141.58 KB', updatedAt: '2026-04-07 00:36:16' },
  { id: 'shopper-habits', name: 'How the Humanization of Pets Is Changing Shopper Habits', type: 'markdown', icon: markdownIcon, location: '文档库 / 市场研究', size: '28.30 KB', updatedAt: '2026-04-06 18:20:11' },
  { id: 'canis-modernis', name: 'Canis Modernis: Human/Dog Coevolution in Modernist Literature', type: 'word', icon: wordIcon, location: '文档库 / 文献', size: '92.14 KB', updatedAt: '2026-04-05 09:12:03' },
];

export const SKILL_CATALOG: SkillCatalogItem[] = [
  { id: 'document-generation', title: 'Document generation', desc: '创建和整理专业文档，并输出结构清晰的内容。', count: '4.5万次使用', icon: wordIcon },
  { id: 'data-analysis', title: '数据分析', desc: '读取、分析并总结结构化数据，形成可执行洞察。', count: '1.7万次使用', icon: txtIcon },
  { id: 'pdf-processing', title: 'PDF 处理', desc: '读取并分析 PDF 文档内容。', count: '内置技能', icon: pdfIcon, automatic: true },
  { id: 'word-processing', title: 'Word 处理', desc: '读取并分析 Word 文档内容。', count: '内置技能', icon: wordIcon, automatic: true },
  { id: 'markdown-processing', title: 'Markdown 处理', desc: '读取并分析 Markdown 文档内容。', count: '内置技能', icon: markdownIcon, automatic: true },
];

export const FORMAT_SKILL_BY_TYPE: Record<KnowledgeDocument['type'], string> = {
  pdf: 'PDF 处理', word: 'Word 处理', markdown: 'Markdown 处理',
};
