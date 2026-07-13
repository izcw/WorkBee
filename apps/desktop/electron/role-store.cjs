const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_ROLES = [
  { id: 'aivra', name: 'Aivra', role: '默认 Agent', modelId: 'deepseek-default', description: '项目管理与编程助手，负责理解目标、协调团队并完成工作区任务。', skills: ['Document generation'], knowledge: [] },
  { id: 'ava', name: 'Ava', role: '招聘分析', modelId: 'deepseek-default', description: '负责候选人筛选、技能匹配和招聘流程协调。', skills: ['数据分析'], knowledge: [] },
  { id: 'emma', name: 'Emma', role: '资料研究', modelId: 'deepseek-default', description: '负责资料收集、信息归纳和重点提炼。', skills: ['Document generation'], knowledge: ['full-text-pdf'] },
];

class RoleStore {
  constructor(app, modelStore) {
    this.path = path.join(app.getPath('userData'), 'roles.json');
    this.modelStore = modelStore;
  }

  async _read() {
    try {
      const value = JSON.parse(await fs.readFile(this.path, 'utf8'));
      if (Array.isArray(value)) return DEFAULT_ROLES.map(fallback => {
        const saved = value.find(item => item?.id === fallback.id) || {};
        return { ...fallback, ...saved, modelId: saved.modelId || fallback.modelId };
      });
    } catch {}
    return DEFAULT_ROLES.map(role => ({ ...role }));
  }

  async list() {
    const roles = await this._read();
    const models = await this.modelStore.list();
    return roles.map(role => {
      const model = models.find(item => item.id === role.modelId) || models[0];
      return { ...role, modelId: model.id, modelName: model.name, baseUrl: model.baseUrl, model: model.model, keyAvailable: model.keyAvailable };
    });
  }

  async save(input) {
    if (!input || typeof input !== 'object') throw new Error('角色配置无效');
    const id = String(input.id || '');
    const roles = await this._read();
    const index = roles.findIndex(role => role.id === id);
    if (index < 0) throw new Error('角色不存在');
    const modelId = String(input.modelId || roles[index].modelId || '');
    if (!await this.modelStore.get(modelId)) throw new Error('请选择已添加的模型');
    const description = input.description === undefined ? roles[index].description : String(input.description).trim().slice(0, 2000);
    const skills = input.skills === undefined ? roles[index].skills : Array.from(new Set((Array.isArray(input.skills) ? input.skills : []).map(String).map(item => item.trim()).filter(Boolean))).slice(0, 30);
    const knowledge = input.knowledge === undefined ? roles[index].knowledge : Array.from(new Set((Array.isArray(input.knowledge) ? input.knowledge : []).map(String).map(item => item.trim()).filter(Boolean))).slice(0, 30);
    roles[index] = { ...roles[index], modelId, description, skills, knowledge };
    await fs.mkdir(path.dirname(this.path), { recursive: true });
    await fs.writeFile(this.path, JSON.stringify(roles, null, 2), { encoding: 'utf8', mode: 0o600 });
    return (await this.list()).find(role => role.id === id);
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
