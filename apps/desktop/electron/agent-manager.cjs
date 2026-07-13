const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const readline = require('node:readline');
const crypto = require('node:crypto');

const PROTOCOL_VERSION = 1;
const REQUEST_TIMEOUT_MS = 30_000;

function now() { return new Date().toISOString(); }
function id() { return crypto.randomUUID(); }

class AgentManager extends EventEmitter {
  constructor({ app, getProviderConfigs }) {
    super();
    this.app = app;
    this.getProviderConfigs = getProviderConfigs;
    this.child = null;
    this.ready = false;
    this.stopping = false;
    this.pending = new Map();
    this.restartTimes = [];
  }

  getStatus() {
    return { status: this.ready ? 'ready' : this.child ? 'starting' : 'offline', ready: this.ready };
  }

  _resolveCommand() {
    if (this.app.isPackaged) {
      const executable = process.platform === 'win32' ? 'aivra-agent.exe' : 'aivra-agent';
      const target = path.join(process.resourcesPath, 'agent', 'aivra-agent', executable);
      return { command: target, args: [], cwd: path.dirname(target) };
    }
    const agentRoot = path.join(__dirname, '..', 'agent');
    const venvPython = process.platform === 'win32'
      ? path.join(agentRoot, '.venv', 'Scripts', 'python.exe')
      : path.join(agentRoot, '.venv', 'bin', 'python');
    const candidates = [process.env.AIVRA_PYTHON, venvPython, '/opt/homebrew/bin/python3.12', '/opt/homebrew/bin/python3.11', 'python3'].filter(Boolean);
    const command = candidates.find(candidate => !path.isAbsolute(candidate) || fs.existsSync(candidate)) || 'python3';
    return { command, args: ['-m', 'aivra_agent'], cwd: agentRoot };
  }

  async start() {
    if (this.child) return;
    this.stopping = false;
    const launch = this._resolveCommand();
    const providers = await this.getProviderConfigs();
    const env = {
      PATH: process.env.PATH || '', HOME: process.env.HOME || '', LANG: process.env.LANG || 'en_US.UTF-8',
      TMPDIR: process.env.TMPDIR || '', PYTHONUNBUFFERED: '1',
      AIVRA_DATA_DIR: this.app.getPath('userData'), AIVRA_MODEL: 'deepseek-v4-flash',
      AIVRA_BASE_URL: 'https://api.deepseek.com', AIVRA_ROLE_PROVIDERS: JSON.stringify(providers),
    };
    this.emit('status', { status: 'starting', ready: false });
    const child = spawn(launch.command, launch.args, {
      cwd: launch.cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    this.child = child;
    const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on('line', line => this._receive(line));
    child.stderr.on('data', chunk => {
      const message = chunk.toString('utf8').trim();
      if (message) this.emit('diagnostic', message.replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]'));
    });
    child.on('error', error => this.emit('diagnostic', `Agent launch failed: ${error.message}`));
    child.on('exit', (code, signal) => this._onExit(child, code, signal));
    try {
      const ready = await this.request('runtime.hello', { clientVersion: this.app.getVersion(), protocolVersion: 1 });
      this.ready = true;
      this.emit('status', { status: 'ready', ready: true, ...ready.payload });
    } catch (error) {
      this.emit('status', { status: 'error', ready: false, message: error.message });
    }
  }

  _receive(line) {
    if (Buffer.byteLength(line, 'utf8') > 1024 * 1024) return;
    let message;
    try { message = JSON.parse(line); } catch { this.emit('diagnostic', 'Agent emitted invalid JSON'); return; }
    if (!message || message.protocolVersion !== PROTOCOL_VERSION || typeof message.type !== 'string' || typeof message.payload !== 'object') {
      this.emit('diagnostic', 'Agent emitted an invalid protocol envelope');
      return;
    }
    if (message.kind === 'response' && message.requestId) {
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.requestId);
      if (message.error) pending.reject(new Error(message.error.message || message.error.code));
      else pending.resolve(message);
      return;
    }
    if (message.kind === 'event') this.emit('event', message);
  }

  request(type, payload = {}) {
    if (!this.child?.stdin?.writable) return Promise.reject(new Error('Agent 尚未启动'));
    const requestId = id();
    const message = { protocolVersion: 1, id: requestId, kind: 'request', type, timestamp: now(), payload };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Agent 请求超时：${type}`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify(message)}\n`, error => {
        if (error) {
          clearTimeout(timer);
          this.pending.delete(requestId);
          reject(error);
        }
      });
    });
  }

  async restart() {
    await this.stop();
    await this.start();
  }

  async stop() {
    const child = this.child;
    if (!child) return;
    this.stopping = true;
    try { await Promise.race([this.request('runtime.shutdown', {}), new Promise(resolve => setTimeout(resolve, 1500))]); } catch {}
    if (child.exitCode === null) {
      await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        new Promise(resolve => setTimeout(resolve, 1500)),
      ]);
    }
    if (child.exitCode === null) child.kill();
    this.child = null;
    this.ready = false;
  }

  _onExit(child, code, signal) {
    if (this.child !== child) return;
    this.child = null;
    this.ready = false;
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Agent 进程已退出'));
      this.pending.delete(requestId);
    }
    this.emit('status', { status: 'offline', ready: false, code, signal });
    if (this.stopping || this.app.isQuitting) return;
    const cutoff = Date.now() - 60_000;
    this.restartTimes = this.restartTimes.filter(time => time > cutoff);
    if (this.restartTimes.length >= 3) {
      this.emit('status', { status: 'error', ready: false, message: 'Agent 连续崩溃，已停止自动重启' });
      return;
    }
    this.restartTimes.push(Date.now());
    setTimeout(() => this.start(), 1000);
  }
}

module.exports = { AgentManager };
