const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function normalizeId(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

class McpStore {
  constructor(app, secureStore) {
    this.path = path.join(app.getPath('userData'), 'mcp-servers.json');
    this.secureStore = secureStore;
  }

  async _read() {
    try {
      const value = JSON.parse(await fs.readFile(this.path, 'utf8'));
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  async _write(servers) {
    await fs.mkdir(path.dirname(this.path), { recursive: true });
    await fs.writeFile(this.path, JSON.stringify(servers, null, 2), { encoding: 'utf8', mode: 0o600 });
  }

  async list() {
    const servers = await this._read();
    return Promise.all(servers.map(async server => ({
      ...server,
      tokenAvailable: await this.secureStore.hasApiKey(`mcp:${server.id}`),
    })));
  }

  async save(input) {
    const name = String(input?.name || '').trim().slice(0, 80);
    if (!name) throw new Error('MCP 名称不能为空');
    let url;
    try { url = new URL(String(input?.url || '').trim()); }
    catch { throw new Error('MCP 服务地址无效'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('当前仅支持 Streamable HTTP MCP');
    const servers = await this._read();
    const requestedId = normalizeId(input?.id);
    const id = requestedId || normalizeId(name) || `mcp_${randomUUID().slice(0, 8)}`;
    const conflict = servers.find(server => server.id === id && server.id !== requestedId);
    if (conflict) throw new Error('MCP 标识已存在');
    const saved = { id, name, url: url.toString(), enabled: input?.enabled !== false };
    const next = servers.some(server => server.id === id)
      ? servers.map(server => server.id === id ? saved : server)
      : [...servers, saved];
    await this._write(next);
    if (typeof input?.token === 'string' && input.token.trim()) {
      await this.secureStore.setApiKey(`mcp:${id}`, input.token);
    }
    return { ...saved, tokenAvailable: await this.secureStore.hasApiKey(`mcp:${id}`) };
  }

  async delete(id) {
    const servers = await this._read();
    const next = servers.filter(server => server.id !== id);
    if (next.length === servers.length) return { deleted: false };
    await this._write(next);
    await this.secureStore.setApiKey(`mcp:${id}`, '');
    return { deleted: true };
  }

  async forAgent() {
    const servers = (await this._read()).filter(server => server.enabled !== false);
    return Promise.all(servers.map(async server => ({
      ...server,
      token: await this.secureStore.getApiKey(`mcp:${server.id}`),
    })));
  }
}

module.exports = { McpStore, normalizeId };
