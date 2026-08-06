const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_MODEL = {
  id: 'deepseek-default',
  name: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  purpose: 'chat',
};

function validateModel(input, current = {}) {
  if (!input || typeof input !== 'object') throw new Error('模型配置无效');
  const name = String(input.name ?? current.name ?? '').trim();
  const baseUrl = String(input.baseUrl ?? current.baseUrl ?? '').trim().replace(/\/$/, '');
  const model = String(input.model ?? current.model ?? '').trim();
  const purpose = input.purpose === undefined
    ? (current.purpose === 'embedding' ? 'embedding' : 'chat')
    : input.purpose === 'embedding' ? 'embedding' : 'chat';
  let parsed;
  try { parsed = new URL(baseUrl); } catch { throw new Error('Base URL 必须是有效的 HTTP(S) 地址'); }
  if (!name || name.length > 80) throw new Error('模型名称无效');
  if (!['http:', 'https:'].includes(parsed.protocol) || baseUrl.length > 500) throw new Error('Base URL 必须是有效的 HTTP(S) 地址');
  if (!model || model.length > 200) throw new Error('Model 参数无效');
  return { name, baseUrl, model, purpose };
}

function maskKey(value) {
  if (!value) return '';
  if (value.length <= 8) return `${value.slice(0, 2)}${'*'.repeat(Math.max(4, value.length - 4))}${value.slice(-2)}`;
  const prefixLength = value.startsWith('sk-') ? Math.min(6, value.length - 4) : 4;
  return `${value.slice(0, prefixLength)}${'*'.repeat(8)}${value.slice(-4)}`;
}

class ModelStore {
  constructor(app, secureStore) {
    this.path = path.join(app.getPath('userData'), 'models.json');
    this.secureStore = secureStore;
  }

  _keyId(id) { return `model:${id}`; }

  async _read() {
    try {
      const value = JSON.parse(await fs.readFile(this.path, 'utf8'));
      if (Array.isArray(value)) return value;
    } catch {}
    return [{ ...DEFAULT_MODEL }];
  }

  async _write(models) {
    await fs.mkdir(path.dirname(this.path), { recursive: true });
    await fs.writeFile(this.path, JSON.stringify(models, null, 2), { encoding: 'utf8', mode: 0o600 });
  }

  // Reset to an empty model list (no default model). The file is written so it
  // stays empty on the next start instead of falling back to the built-in default.
  async clear() {
    await this._write([]);
  }

  async _key(id) {
    const value = await this.secureStore.getApiKey(this._keyId(id));
    if (value) return value;
    return id === DEFAULT_MODEL.id ? this.secureStore.getApiKey('aivra') : '';
  }

  async list() {
    const models = await this._read();
    return Promise.all(models.map(async model => {
      const key = await this._key(model.id);
      return { ...model, keyAvailable: Boolean(key), maskedKey: maskKey(key) };
    }));
  }

  async get(id) {
    return (await this._read()).find(model => model.id === id);
  }

  async create(input) {
    const config = validateModel(input);
    const models = await this._read();
    const item = { id: crypto.randomUUID(), ...config };
    models.push(item);
    await this._write(models);
    if (typeof input.apiKey === 'string' && input.apiKey.trim()) await this.secureStore.setApiKey(this._keyId(item.id), input.apiKey);
    const key = await this._key(item.id);
    return { ...item, keyAvailable: Boolean(key), maskedKey: maskKey(key) };
  }

  async update(input) {
    const id = String(input?.id || '');
    const models = await this._read();
    const index = models.findIndex(model => model.id === id);
    if (index < 0) throw new Error('模型不存在');
    models[index] = { ...models[index], ...validateModel(input, models[index]) };
    await this._write(models);
    if (input.clearApiKey === true) {
      await this.secureStore.setApiKey(this._keyId(id), '');
      if (id === DEFAULT_MODEL.id) await this.secureStore.setApiKey('aivra', '');
    }
    else if (typeof input.apiKey === 'string' && input.apiKey.trim()) await this.secureStore.setApiKey(this._keyId(id), input.apiKey);
    const key = await this._key(id);
    return { ...models[index], keyAvailable: Boolean(key), maskedKey: maskKey(key) };
  }

  async delete(id) {
    const models = await this._read();
    const target = models.find(model => model.id === id);
    if (target?.purpose !== 'embedding' && models.filter(model => model.purpose !== 'embedding' && model.id !== id).length === 0) {
      throw new Error('至少需要保留一个对话模型');
    }
    const next = models.filter(model => model.id !== id);
    if (next.length === models.length) throw new Error('模型不存在');
    await this._write(next);
    await this.secureStore.setApiKey(this._keyId(id), '');
    return { deleted: true };
  }

  async provider(id) {
    const model = await this.get(id);
    if (!model) return null;
    return { ...model, apiKey: await this._key(id) };
  }

  async embeddingProvider() {
    const model = (await this._read()).find(item => item.purpose === 'embedding');
    return model ? { ...model, apiKey: await this._key(model.id) } : null;
  }
}

module.exports = { ModelStore, DEFAULT_MODEL };
