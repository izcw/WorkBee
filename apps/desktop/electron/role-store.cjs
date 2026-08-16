const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const ROLE_STORE_VERSION = 5;
const DEFAULT_ROLES = [
  {
    id: 'workbee', name: 'BeeYo', role: '全能统筹 Agent', modelId: 'deepseek-default', avatar: 'builtin:workbee',
    description: '负责全盘统筹、需求澄清、任务规划和落地交付。能够在授权工作区内主动读取、创建和修改文件，协调专业角色完成开发、设计、办公、研究和结果复核。',
    skills: ['全局规划与执行', '文件读写与整理', '软件开发与测试', '产品与设计协作', '文档与办公处理', '研究与数据分析'],
    knowledge: ['workbee-working-principles', 'planning-delivery-playbook'],
  },
  {
    id: 'nova', name: 'Codeo', role: '软件工程 Agent', modelId: 'deepseek-default', avatar: 'default:2',
    description: '负责理解代码库、设计技术方案、实现功能、修复缺陷并完成测试和构建验证，同时保护既有架构与用户改动。',
    skills: ['文件读写与整理', '软件开发与测试', '全局规划与执行'],
    knowledge: ['software-delivery-baseline', 'engineering-practice-guide'],
  },
  {
    id: 'mira', name: 'Viso', role: '产品设计 Agent', modelId: 'deepseek-default', avatar: 'default:3',
    description: '负责产品需求、用户流程、信息架构、交互状态、界面文案和设计评审，输出能够实现与验收的产品设计方案。',
    skills: ['产品与设计协作', '文档与办公处理', '全局规划与执行'],
    knowledge: ['product-design-guidelines', 'ux-design-system-guide'],
  },
  {
    id: 'sage', name: 'Lexo', role: '研究文档 Agent', modelId: 'deepseek-default', avatar: 'default:4',
    description: '负责读取和整理项目文件、资料研究、数据归纳、专业文档与报告撰写，核验证据边界并提炼可执行结论。',
    skills: ['文件读写与整理', '研究与数据分析', '文档与办公处理'],
    knowledge: ['research-evidence-playbook', 'document-quality-guide'],
  },
  {
    id: 'lyra', name: 'Buzzo', role: '运营内容 Agent', modelId: 'deepseek-default', avatar: 'default:5',
    description: '负责日常办公、内容策划、运营沟通与项目推进。能够把零散需求整理为计划、文案、清单和复盘，并结合用户、市场与项目资料给出清晰、可执行的建议。',
    skills: ['全局规划与执行', '文档与办公处理', '研究与数据分析', '产品与设计协作'],
    knowledge: ['operations-content-playbook', 'communication-campaign-guide'],
  },
];

const DEFAULT_ROLE_IDS = new Set(DEFAULT_ROLES.map(role => role.id));

class RoleStore {
  constructor(app, modelStore) {
    this.path = path.join(app.getPath('userData'), 'roles.json');
    this.modelStore = modelStore;
  }

  async _write(roles) {
    await fs.mkdir(path.dirname(this.path), { recursive: true });
    await fs.writeFile(this.path, JSON.stringify({ version: ROLE_STORE_VERSION, roles }, null, 2), { encoding: 'utf8', mode: 0o600 });
  }

  async _read() {
    try {
      const value = JSON.parse(await fs.readFile(this.path, 'utf8'));
      if (value?.version === ROLE_STORE_VERSION && Array.isArray(value.roles)) return this._mergeWithDefaults(value.roles);
      if (value?.version === 3 || value?.version === 4) {
        if (!Array.isArray(value.roles)) return DEFAULT_ROLES.map(role => ({ ...role }));
        const migrated = this._mergeWithDefaults(value.roles, true);
        await this._write(migrated);
        return migrated;
      }
      if (value?.version === 2 && Array.isArray(value.roles)) {
        const migrated = DEFAULT_ROLES.map(fallback => {
          const saved = value.roles.find(item => item?.id === fallback.id) || {};
          return {
            ...fallback, modelId: saved.modelId || fallback.modelId,
            ...(saved.avatar ? { avatar: saved.avatar } : {}),
          };
        }).concat(value.roles.filter(item => item?.id && !DEFAULT_ROLE_IDS.has(item.id)));
        await this._write(migrated);
        return migrated;
      }
      if (Array.isArray(value)) {
        const previousDefault = value.find(item => item?.id === 'workbee') || {};
        const migrated = DEFAULT_ROLES.map((role, index) => index === 0 ? {
          ...role, modelId: previousDefault.modelId || role.modelId,
          ...(previousDefault.avatar ? { avatar: previousDefault.avatar } : {}),
        } : { ...role });
        await this._write(migrated);
        return migrated;
      }
    } catch {}
    return DEFAULT_ROLES.map(role => ({ ...role }));
  }

  _mergeWithDefaults(roles, addDefaultKnowledge = false) {
    return DEFAULT_ROLES.map(fallback => {
      const saved = roles.find(item => item?.id === fallback.id) || {};
      const knowledge = addDefaultKnowledge && Array.isArray(saved.knowledge)
        ? Array.from(new Set([...fallback.knowledge, ...saved.knowledge])) : saved.knowledge;
      return { ...fallback, ...saved, ...(knowledge ? { knowledge } : {}), modelId: saved.modelId || fallback.modelId };
    }).concat(roles.filter(item => item?.id && !DEFAULT_ROLE_IDS.has(item.id)));
  }

  async list() {
    const roles = await this._read();
    const models = (await this.modelStore.list()).filter(model => model.purpose !== 'embedding');
    return roles.map(role => {
      const model = models.find(item => item.id === role.modelId) || models[0];
      if (!model) return { ...role, modelId: '', modelName: '未配置', baseUrl: '', model: '', keyAvailable: false };
      return { ...role, modelId: model.id, modelName: model.name, baseUrl: model.baseUrl, model: model.model, keyAvailable: model.keyAvailable };
    });
  }

  async save(input) {
    if (!input || typeof input !== 'object') throw new Error('角色配置无效');
    const id = String(input.id || randomUUID());
    const roles = await this._read();
    let index = roles.findIndex(role => role.id === id);
    const existing = index >= 0 ? roles[index] : null;
    const modelId = String(input.modelId || existing?.modelId || '');
    const selectedModel = await this.modelStore.get(modelId);
    if (!selectedModel || selectedModel.purpose === 'embedding') throw new Error('请选择已添加的对话模型');
    const name = String(input.name ?? existing?.name ?? '').trim().slice(0, 80);
    const role = String(input.role ?? existing?.role ?? '').trim().slice(0, 80);
    if (!name || !role) throw new Error('请填写角色名称和职责');
    const description = input.description === undefined ? existing?.description || '' : String(input.description).trim().slice(0, 2000);
    const skills = input.skills === undefined ? existing?.skills || [] : Array.from(new Set((Array.isArray(input.skills) ? input.skills : []).map(String).map(item => item.trim()).filter(Boolean))).slice(0, 30);
    const knowledge = input.knowledge === undefined ? existing?.knowledge || [] : Array.from(new Set((Array.isArray(input.knowledge) ? input.knowledge : []).map(String).map(item => item.trim()).filter(Boolean))).slice(0, 30);
    const avatar = input.avatar === undefined ? existing?.avatar : String(input.avatar).slice(0, 2_500_000);
    const savedRole = { ...(existing || {}), id, name, role, modelId, description, skills, knowledge, ...(avatar ? { avatar } : {}) };
    if (index < 0) { roles.push(savedRole); index = roles.length - 1; } else roles[index] = savedRole;
    await this._write(roles);
    return (await this.list()).find(role => role.id === id);
  }

  async delete(id) {
    const roleId = String(id || '');
    if (!roleId) throw new Error('角色 ID 无效');
    if (DEFAULT_ROLE_IDS.has(roleId)) throw new Error('默认角色可以编辑，但不能删除');
    const roles = await this._read();
    const next = roles.filter(role => role.id !== roleId);
    if (next.length === roles.length) return { deleted: false };
    await this._write(next);
    return { deleted: true };
  }

  async providersForAgent() {
    const roles = await this._read();
    const providers = {};
    for (const role of roles) {
      const model = await this.modelStore.provider(role.modelId);
      if (model) providers[role.id] = { name: role.name, description: role.description || '', skills: role.skills || [], knowledge: role.knowledge || [], modelId: model.id, baseUrl: model.baseUrl, model: model.model, apiKey: model.apiKey };
    }
    return providers;
  }

  async usesModel(modelId) { return (await this._read()).some(role => role.modelId === modelId); }
}

module.exports = { RoleStore };
