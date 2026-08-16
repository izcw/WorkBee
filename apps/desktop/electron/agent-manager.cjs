const { EventEmitter } = require('node:events');
const { execFile, spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const readline = require('node:readline');
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const PROTOCOL_VERSION = 1;
const REQUEST_TIMEOUT_MS = 30_000;
const STARTUP_TIMEOUT_MS = 15_000;
const HEALTH_TIMEOUT_MS = 3_000;
const execFileAsync = promisify(execFile);

function now() { return new Date().toISOString(); }
function id() { return crypto.randomUUID(); }

class AgentManager extends EventEmitter {
  constructor({ app, getProviderConfigs, getGithubMcpToken, getEmbeddingProvider, getMcpServers }) {
    super();
    this.app = app;
    this.getProviderConfigs = getProviderConfigs;
    this.getGithubMcpToken = typeof getGithubMcpToken === 'function' ? getGithubMcpToken : async () => '';
    this.getEmbeddingProvider = typeof getEmbeddingProvider === 'function' ? getEmbeddingProvider : async () => null;
    this.getMcpServers = typeof getMcpServers === 'function' ? getMcpServers : async () => [];
    this.child = null;
    this.ready = false;
    this.stopping = false;
    this.pending = new Map();
    this.restartTimes = [];
    this.startPromise = null;
    this.restartPromise = null;
    this.lastMessage = undefined;
    this.pidFile = path.join(this.app.getPath('userData'), 'workbee-agent.pid.json');
  }

  getStatus() {
    return {
      status: this.ready ? 'ready' : this.child ? 'starting' : this.lastMessage ? 'error' : 'offline',
      ready: this.ready,
      ...(this.lastMessage ? { message: this.lastMessage } : {}),
    };
  }

  _resolveCommand() {
    if (this.app.isPackaged) {
      const executable = process.platform === 'win32' ? 'workbee-agent.exe' : 'workbee-agent';
      const target = path.join(process.resourcesPath, 'agent', 'workbee-agent', executable);
      return { command: target, args: [], cwd: path.dirname(target) };
    }
    const agentRoot = path.join(__dirname, '..', 'agent');
    const venvPython = process.platform === 'win32'
      ? path.join(agentRoot, '.venv', 'Scripts', 'python.exe')
      : path.join(agentRoot, '.venv', 'bin', 'python');
    const candidates = [process.env.WORKBEE_PYTHON, venvPython, '/opt/homebrew/bin/python3.12', '/opt/homebrew/bin/python3.11', 'python3'].filter(Boolean);
    const command = candidates.find(candidate => !path.isAbsolute(candidate) || fs.existsSync(candidate)) || 'python3';
    return { command, args: ['-m', 'workbee_agent'], cwd: agentRoot };
  }

  async start() {
    if (this.ready) return this.getStatus();
    if (this.startPromise) return this.startPromise;
    const starting = this._start();
    this.startPromise = starting;
    try { return await starting; }
    finally { if (this.startPromise === starting) this.startPromise = null; }
  }

  async _start() {
    if (this.child) await this._terminateChild(this.child);
    this.stopping = false;
    this.lastMessage = undefined;
    await this._cleanupStaleProcess();
    const launch = this._resolveCommand();
    const providers = await this.getProviderConfigs();
    const githubMcpToken = await this.getGithubMcpToken();
    const embeddingProvider = await this.getEmbeddingProvider();
    const mcpServers = await this.getMcpServers();
    const env = {
      PATH: process.env.PATH || '', HOME: process.env.HOME || '', LANG: process.env.LANG || 'en_US.UTF-8',
      TMPDIR: process.env.TMPDIR || '', PYTHONUNBUFFERED: '1', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8',
      WORKBEE_DATA_DIR: this.app.getPath('userData'), WORKBEE_MODEL: 'deepseek-v4-flash',
      WORKBEE_BASE_URL: 'https://api.deepseek.com', WORKBEE_ROLE_PROVIDERS: JSON.stringify(providers),
      ...(githubMcpToken ? { WORKBEE_GITHUB_MCP_TOKEN: githubMcpToken } : {}),
      ...(embeddingProvider?.apiKey ? { WORKBEE_EMBEDDING_PROVIDER: JSON.stringify(embeddingProvider) } : {}),
      ...(process.env.WORKBEE_MAX_TOOL_STEPS ? { WORKBEE_MAX_TOOL_STEPS: process.env.WORKBEE_MAX_TOOL_STEPS } : {}),
      ...((mcpServers.length || process.env.WORKBEE_MCP_SERVERS) ? {
        WORKBEE_MCP_SERVERS: mcpServers.length ? JSON.stringify(mcpServers) : process.env.WORKBEE_MCP_SERVERS,
      } : {}),
    };
    this.emit('status', { status: 'starting', ready: false });
    const child = spawn(launch.command, launch.args, {
      cwd: launch.cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    this.child = child;
    await this._rememberChild(child.pid, launch);
    const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on('line', line => this._receive(line));
    child.stderr.on('data', chunk => {
      const message = chunk.toString('utf8').trim();
      if (message) this.emit('diagnostic', message.replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]'));
    });
    let rejectLaunch;
    const launchFailed = new Promise((_, reject) => { rejectLaunch = reject; });
    child.on('error', error => {
      this.emit('diagnostic', `Agent launch failed: ${error.message}`);
      rejectLaunch(error);
    });
    child.on('exit', (code, signal) => this._onExit(child, code, signal));
    try {
      const ready = await Promise.race([
        this.request('runtime.hello', { clientVersion: this.app.getVersion(), protocolVersion: 1 }, STARTUP_TIMEOUT_MS),
        launchFailed,
      ]);
      if (this.child !== child) throw new Error('Agent 启动期间意外退出');
      this.ready = true;
      this.lastMessage = undefined;
      this.emit('status', { status: 'ready', ready: true, ...ready.payload });
      return this.getStatus();
    } catch (error) {
      const message = `Agent 启动失败：${error.message}`;
      this.lastMessage = message;
      this.emit('status', { status: 'error', ready: false, message });
      if (this.child === child) await this._terminateChild(child);
      throw new Error(message);
    }
  }

  async ensureReady() {
    if (!this.ready) return this.start();
    try {
      await this.request('runtime.health', {}, HEALTH_TIMEOUT_MS);
      return this.getStatus();
    } catch (error) {
      this.emit('diagnostic', `Agent health check failed: ${error.message}`);
      return this.restart();
    }
  }

  async requestReady(type, payload = {}) {
    await this.ensureReady();
    return this.request(type, payload);
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

  request(type, payload = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    if (!this.child?.stdin?.writable) return Promise.reject(new Error('Agent 尚未启动'));
    const requestId = id();
    const message = { protocolVersion: 1, id: requestId, kind: 'request', type, timestamp: now(), payload };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Agent 请求超时：${type}`));
      }, timeoutMs);
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
    if (this.restartPromise) return this.restartPromise;
    const restarting = (async () => {
      await this.stop();
      return this.start();
    })();
    this.restartPromise = restarting;
    try { return await restarting; }
    finally { if (this.restartPromise === restarting) this.restartPromise = null; }
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
    if (this.child === child) this.child = null;
    this.ready = false;
    await this._forgetChild(child.pid);
  }

  async _terminateChild(child) {
    if (!child || child.exitCode !== null) return;
    child.kill();
    await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 1500)),
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }

  async _rememberChild(pid, launch) {
    if (!pid) return;
    try {
      await fs.promises.mkdir(path.dirname(this.pidFile), { recursive: true });
      await fs.promises.writeFile(this.pidFile, JSON.stringify({ pid, ownerPid: process.pid, command: launch.command, args: launch.args }));
    } catch (error) {
      this.emit('diagnostic', `Unable to record Agent process: ${error.message}`);
    }
  }

  async _forgetChild(pid) {
    try {
      const saved = JSON.parse(await fs.promises.readFile(this.pidFile, 'utf8'));
      if (saved.pid === pid) await fs.promises.rm(this.pidFile, { force: true });
    } catch (error) {
      if (error.code !== 'ENOENT' && error.name !== 'SyntaxError') this.emit('diagnostic', `Unable to clear Agent process record: ${error.message}`);
    }
  }

  async _cleanupStaleProcess() {
    let saved;
    try { saved = JSON.parse(await fs.promises.readFile(this.pidFile, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') await fs.promises.rm(this.pidFile, { force: true }).catch(() => undefined);
      return;
    }
    if (!Number.isInteger(saved.pid) || saved.pid <= 0 || saved.ownerPid === process.pid) return;
    try {
      process.kill(saved.ownerPid, 0);
      return;
    } catch {}
    if (!await this._isRecordedAgentProcess(saved)) {
      await fs.promises.rm(this.pidFile, { force: true }).catch(() => undefined);
      return;
    }
    try {
      process.kill(saved.pid, 'SIGTERM');
      this.emit('diagnostic', `Stopped stale Agent process ${saved.pid}`);
    } catch (error) {
      if (error.code !== 'ESRCH') this.emit('diagnostic', `Unable to stop stale Agent process: ${error.message}`);
    }
    await fs.promises.rm(this.pidFile, { force: true }).catch(() => undefined);
  }

  async _isRecordedAgentProcess(saved) {
    if (typeof saved.command !== 'string' || !saved.command) return false;
    try {
      let commandLine = '';
      if (process.platform === 'linux') {
        commandLine = (await fs.promises.readFile(`/proc/${saved.pid}/cmdline`, 'utf8')).replaceAll('\0', ' ');
      } else if (process.platform === 'win32') {
        const script = `(Get-CimInstance Win32_Process -Filter \"ProcessId = ${saved.pid}\").CommandLine`;
        commandLine = (await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], { timeout: 2000 })).stdout;
      } else {
        commandLine = (await execFileAsync('ps', ['-p', String(saved.pid), '-o', 'command='], { timeout: 2000 })).stdout;
      }
      const markers = [saved.command, ...(Array.isArray(saved.args) ? saved.args : [])].filter(value => typeof value === 'string' && value.length > 2);
      return markers.length > 0 && markers.every(marker => commandLine.includes(marker));
    } catch {
      return false;
    }
  }

  _onExit(child, code, signal) {
    if (this.child !== child) return;
    this.child = null;
    this.ready = false;
    this._forgetChild(child.pid);
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
    setTimeout(() => this.start().catch(error => this.emit('diagnostic', error.message)), 1000);
  }
}

module.exports = { AgentManager };
