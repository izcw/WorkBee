import wordIcon from '../assets/icon/word.png';
import pdfIcon from '../assets/icon/pdf.png';
import markdownIcon from '../assets/icon/markdown.png';
import txtIcon from '../assets/icon/txt.png';

export type KnowledgeDocument = { id: string; name: string; type: 'word' | 'pdf' | 'markdown'; icon: string; location: string; size: string; updatedAt: string };
export type SkillCatalogItem = { id: string; title: string; desc: string; details: string; capabilities: string[]; count: string; icon: string; automatic?: boolean };

export const KNOWLEDGE_DOCUMENTS: KnowledgeDocument[] = [
  { id: 'aivra-working-principles', name: 'Aivra 通用工作准则', type: 'markdown', icon: markdownIcon, location: '内置知识库 / 工作方法', size: '内置', updatedAt: '2026-07-14' },
  { id: 'software-delivery-baseline', name: '软件开发与质量基线', type: 'markdown', icon: markdownIcon, location: '内置知识库 / 软件开发', size: '内置', updatedAt: '2026-07-14' },
  { id: 'product-design-guidelines', name: '产品与设计交付规范', type: 'markdown', icon: markdownIcon, location: '内置知识库 / 产品设计', size: '内置', updatedAt: '2026-07-14' },
];

export const SKILL_CATALOG: SkillCatalogItem[] = [
  { id: 'planning-execution', title: '全局规划与执行', desc: '统筹复杂目标，从澄清需求到验证交付形成完整闭环。', details: '识别目标、约束和风险，拆分可执行步骤，主动收集上下文并持续校验结果，适用于项目推进、日常工作和跨领域任务。', capabilities: ['需求澄清与任务拆解', '优先级与风险管理', '执行跟踪与结果复核'], count: '默认技能', icon: txtIcon, automatic: true },
  { id: 'file-operations', title: '文件读写与整理', desc: '在授权项目中安全读取、创建、修改和整理文件。', details: '先检查目录和现有内容，再对文本、代码和配置文件进行受控读写；所有路径限制在当前项目，高风险写入遵循审批设置。', capabilities: ['目录与文件检索', 'UTF-8 文件读写', '结构整理与变更核验'], count: '默认技能', icon: markdownIcon, automatic: true },
  { id: 'software-engineering', title: '软件开发与测试', desc: '理解代码库、实现功能、排查问题并运行验证。', details: '覆盖需求分析、代码阅读、方案设计、实现、测试、构建和 Git 状态检查，优先遵循项目现有约定并保护用户改动。', capabilities: ['多语言代码实现', '调试与缺陷修复', '测试构建与代码审查'], count: '默认技能', icon: txtIcon, automatic: true },
  { id: 'product-design', title: '产品与设计协作', desc: '完成产品方案、信息架构、交互说明和设计交付。', details: '从用户目标出发整理使用流程、页面结构、组件状态和验收标准，使设计方案能够被实现和验证。', capabilities: ['产品方案与用户流程', '信息架构与交互设计', '设计评审与实现说明'], count: '默认技能', icon: pdfIcon, automatic: true },
  { id: 'document-office', title: '文档与办公处理', desc: '撰写、改写和整理结构清晰的专业内容。', details: '处理需求文档、报告、方案、会议纪要、README 和一般办公材料，关注受众、结构、准确性与可执行结论。', capabilities: ['专业文档撰写', '摘要与内容重组', '规范化与质量检查'], count: '默认技能', icon: wordIcon, automatic: true },
  { id: 'research-analysis', title: '研究与数据分析', desc: '收集项目内信息、比较证据并形成可靠结论。', details: '基于可访问的文件和数据识别事实、假设、趋势与异常，说明证据边界并输出决策建议。', capabilities: ['资料检索与归纳', '结构化数据分析', '证据核验与建议输出'], count: '默认技能', icon: txtIcon, automatic: true },
];

export const FORMAT_SKILL_BY_TYPE: Record<KnowledgeDocument['type'], string> = {
  pdf: '文件读写与整理', word: '文件读写与整理', markdown: '文件读写与整理',
};
