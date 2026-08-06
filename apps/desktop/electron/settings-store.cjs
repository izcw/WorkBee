const fs = require('node:fs/promises');
const path = require('node:path');

class SettingsStore {
  constructor(app) {
    this.app = app;
    this.path = path.join(app.getPath('userData'), 'settings.json');
  }

  async get() {
    try {
      const value = JSON.parse(await fs.readFile(this.path, 'utf8'));
      if (value && typeof value === 'object') {
        return {
          workspaceDir: typeof value.workspaceDir === 'string' ? value.workspaceDir.trim() : '',
        };
      }
    } catch {}
    return { workspaceDir: '' };
  }

  async set(patch) {
    const current = await this.get();
    const next = { ...current };
    if (patch && typeof patch.workspaceDir === 'string') next.workspaceDir = patch.workspaceDir.trim();
    await fs.mkdir(path.dirname(this.path), { recursive: true });
    await fs.writeFile(this.path, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
    return next;
  }

  async clear() {
    await fs.rm(this.path, { force: true });
  }
}

module.exports = { SettingsStore };
