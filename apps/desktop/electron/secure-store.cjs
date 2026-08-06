const { safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

class SecureStore {
  constructor(app) {
    this.path = path.join(app.getPath('userData'), 'provider-key.enc');
  }

  async _readKeys() {
    try {
      const encoded = await fs.readFile(this.path, 'utf8');
      const decrypted = safeStorage.decryptString(Buffer.from(encoded, 'base64'));
      try {
        const parsed = JSON.parse(decrypted);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return { aivra: decrypted };
      }
    } catch { return {}; }
  }

  async getApiKey(roleId = 'aivra') {
    if (roleId === 'aivra' && process.env.AIVRA_DEEPSEEK_API_KEY) return process.env.AIVRA_DEEPSEEK_API_KEY;
    const keys = await this._readKeys();
    return typeof keys[roleId] === 'string' ? keys[roleId] : '';
  }

  async hasApiKey(roleId = 'aivra') { return Boolean(await this.getApiKey(roleId)); }

  async setApiKey(roleId, value) {
    const key = typeof value === 'string' ? value.trim() : '';
    const keys = await this._readKeys();
    if (key) keys[roleId] = key;
    else delete keys[roleId];
    if (Object.keys(keys).length === 0) {
      await fs.rm(this.path, { force: true });
      return;
    }
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储暂不可用');
    await fs.mkdir(path.dirname(this.path), { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify(keys)).toString('base64');
    await fs.writeFile(this.path, encrypted, { encoding: 'utf8', mode: 0o600 });
  }

  // Remove keys that match the predicate (key id => boolean), keeping everything else.
  async removeApiKeys(predicate) {
    const keys = await this._readKeys();
    let changed = false;
    for (const roleId of Object.keys(keys)) {
      if (predicate(roleId)) { delete keys[roleId]; changed = true; }
    }
    if (!changed) return;
    if (Object.keys(keys).length === 0) {
      await fs.rm(this.path, { force: true });
      return;
    }
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储暂不可用');
    await fs.mkdir(path.dirname(this.path), { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify(keys)).toString('base64');
    await fs.writeFile(this.path, encrypted, { encoding: 'utf8', mode: 0o600 });
  }
}

module.exports = { SecureStore };
