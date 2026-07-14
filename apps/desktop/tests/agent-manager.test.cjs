const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { AgentManager } = require('../electron/agent-manager.cjs');

const fakeAgentSource = String.raw`
const readline = require('node:readline');
const fs = require('node:fs');
fs.appendFileSync(process.argv[1], process.pid + '\n');
const lines = readline.createInterface({ input: process.stdin });
lines.on('line', line => {
  const request = JSON.parse(line);
  const response = {
    protocolVersion: 1, id: request.id + '-response', kind: 'response',
    type: request.type, timestamp: new Date().toISOString(), requestId: request.id,
    payload: request.type === 'runtime.health' ? { status: 'ready' } : { accepted: true },
  };
  setTimeout(() => {
    process.stdout.write(JSON.stringify(response) + '\n');
    if (request.type === 'runtime.shutdown') setImmediate(() => process.exit(0));
  }, request.type === 'runtime.hello' ? 40 : 0);
});
`;

async function temporaryManager(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aivra-agent-manager-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const launches = path.join(directory, 'launches.txt');
  const app = { isPackaged: false, isQuitting: false, getPath: () => directory, getVersion: () => 'test' };
  const manager = new AgentManager({ app, getProviderConfigs: async () => ({}) });
  manager._resolveCommand = () => ({ command: process.execPath, args: ['-e', fakeAgentSource, launches], cwd: directory });
  t.after(() => manager.stop());
  return { manager, directory, launches };
}

test('concurrent readiness checks share one Agent startup and verify health', async t => {
  const { manager, directory, launches } = await temporaryManager(t);
  const statuses = await Promise.all([manager.start(), manager.start(), manager.ensureReady()]);

  assert.ok(statuses.every(status => status.ready));
  assert.equal((await fs.readFile(launches, 'utf8')).trim().split('\n').length, 1);
  assert.equal((await manager.ensureReady()).status, 'ready');

  await manager.stop();
  await assert.rejects(fs.access(path.join(directory, 'aivra-agent.pid.json')));
});

test('startup cleanup terminates an Agent whose recorded owner no longer exists', async t => {
  const { manager, directory } = await temporaryManager(t);
  const stale = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  t.after(() => { if (stale.exitCode === null) stale.kill('SIGKILL'); });
  await fs.writeFile(path.join(directory, 'aivra-agent.pid.json'), JSON.stringify({ pid: stale.pid, ownerPid: 2147483647, command: process.execPath, args: ['setInterval'] }));

  const exited = new Promise(resolve => stale.once('exit', resolve));
  await manager._cleanupStaleProcess();
  await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error('stale process did not exit')), 2000))]);
  await assert.rejects(fs.access(path.join(directory, 'aivra-agent.pid.json')));
});
