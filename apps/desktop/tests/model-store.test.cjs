const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { ModelStore } = require('../electron/model-store.cjs');
const { RoleStore } = require('../electron/role-store.cjs');
const { testOpenAIConnection, testEmbeddingConnection } = require('../electron/provider-test.cjs');
const { McpStore } = require('../electron/mcp-store.cjs');

test('models support CRUD and roles reference a configured model', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbee-models-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const keys = new Map([['workbee', 'legacy-key']]);
  const secureStore = {
    getApiKey: async id => keys.get(id) || '',
    setApiKey: async (id, value) => value ? keys.set(id, value) : keys.delete(id),
  };
  const app = { getPath: () => directory };
  const models = new ModelStore(app, secureStore);
  const roles = new RoleStore(app, models);

  const created = await models.create({ name: 'Test', baseUrl: 'https://example.com/v1', model: 'test-model', apiKey: 'test-key' });
  assert.equal(created.keyAvailable, true);
  assert.match(created.maskedKey, /^te\*+ey$/);
  const updated = await models.update({ id: created.id, name: 'Updated', model: 'test-model-v2' });
  assert.equal(updated.name, 'Updated');
  await roles.save({ id: 'workbee', modelId: created.id, description: '全能执行角色', skills: ['文件读写与整理'], knowledge: ['workbee-working-principles'] });
  const providers = await roles.providersForAgent();
  assert.equal(providers.workbee.model, 'test-model-v2');
  assert.equal(providers.workbee.apiKey, 'test-key');
  assert.equal(providers.workbee.description, '全能执行角色');
  assert.deepEqual(providers.workbee.skills, ['文件读写与整理']);
  assert.deepEqual(providers.workbee.knowledge, ['workbee-working-principles']);
  assert.equal(await roles.usesModel(created.id), true);
  const embedding = await models.create({ name: 'Embedding', baseUrl: 'https://example.com/v1', model: 'embed-small', purpose: 'embedding', apiKey: 'embed-key' });
  assert.equal((await models.embeddingProvider()).id, embedding.id);
  await assert.rejects(roles.save({ name: 'Invalid', role: 'Invalid', modelId: embedding.id }), /对话模型/);

  const added = await roles.save({ name: 'Noah', role: '内容编辑', avatar: 'default:4', modelId: created.id, description: '负责内容编辑。' });
  assert.ok(added.id);
  assert.equal(added.name, 'Noah');
  assert.equal(added.avatar, 'default:4');
  const reloadedRoles = new RoleStore(app, models);
  const persisted = (await reloadedRoles.list()).find(role => role.id === added.id);
  assert.equal(persisted?.role, '内容编辑');
  assert.equal((await reloadedRoles.providersForAgent())[added.id].description, '负责内容编辑。');
});

test('legacy team data is reset once to the five default roles', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbee-role-migration-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'roles.json'), JSON.stringify([
    { id: 'workbee', name: '旧 WorkBee', role: '旧角色', modelId: 'deepseek-default', avatar: 'default:3' },
    { id: 'ava', name: 'Ava', role: '招聘分析', modelId: 'deepseek-default' },
    { id: 'custom-old', name: '旧自定义', role: '旧角色', modelId: 'deepseek-default' },
  ]));
  const secureStore = { getApiKey: async () => '', setApiKey: async () => undefined };
  const app = { getPath: () => directory };
  const roles = new RoleStore(app, new ModelStore(app, secureStore));

  const migrated = await roles.list();
  assert.deepEqual(migrated.map(role => role.id), ['workbee', 'nova', 'mira', 'sage', 'lyra']);
  assert.equal(migrated[0].name, 'BeeYo');
  assert.equal(migrated[0].role, '全能统筹 Agent');
  assert.ok(migrated[0].skills.includes('软件开发与测试'));
  assert.equal(migrated[0].avatar, 'default:3');
  assert.equal(migrated[1].role, '软件工程 Agent');
  assert.equal(migrated[2].role, '产品设计 Agent');
  assert.equal(migrated[3].role, '研究文档 Agent');
  assert.equal(migrated[4].role, '运营内容 Agent');

  await roles.save({ name: '后续新增', role: '扩展角色', modelId: 'deepseek-default' });
  assert.equal((await new RoleStore(app, new ModelStore(app, secureStore)).list()).length, 6);
});

test('version two single-role data upgrades to five defaults and keeps later custom roles', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbee-role-v2-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'roles.json'), JSON.stringify({ version: 2, roles: [
    { id: 'workbee', name: 'WorkBee', role: '全能工作 Agent', modelId: 'deepseek-default', avatar: 'default:5', skills: ['旧技能'] },
    { id: 'custom-kept', name: '用户角色', role: '自定义', modelId: 'deepseek-default' },
  ] }));
  const secureStore = { getApiKey: async () => '', setApiKey: async () => undefined };
  const app = { getPath: () => directory };
  const migrated = await new RoleStore(app, new ModelStore(app, secureStore)).list();

  assert.deepEqual(migrated.map(role => role.id), ['workbee', 'nova', 'mira', 'sage', 'lyra', 'custom-kept']);
  assert.equal(migrated[0].role, '全能统筹 Agent');
  assert.equal(migrated[0].avatar, 'default:5');
  assert.ok(migrated[0].skills.includes('全局规划与执行'));
});

test('default roles cannot be deleted while custom roles can', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbee-role-delete-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const secureStore = { getApiKey: async () => '', setApiKey: async () => undefined };
  const app = { getPath: () => directory };
  const roles = new RoleStore(app, new ModelStore(app, secureStore));

  await assert.rejects(roles.delete('lyra'), /默认角色/);
  const custom = await roles.save({ name: 'Custom', role: 'Custom role', modelId: 'deepseek-default' });
  assert.deepEqual(await roles.delete(custom.id), { deleted: true });
  assert.equal((await roles.list()).some(role => role.id === custom.id), false);
});

test('connection test uses OpenAI-compatible chat completions without exposing the key', async () => {
  let request;
  const result = await testOpenAIConnection({
    baseUrl: 'https://api.example.com/v1', model: 'test-model', apiKey: 'secret-key',
    fetchImpl: async (url, options) => { request = { url, options }; return { ok: true, status: 200, text: async () => '' }; },
  });
  assert.equal(result.success, true);
  assert.equal(request.url, 'https://api.example.com/v1/chat/completions');
  assert.equal(request.options.headers.authorization, 'Bearer secret-key');
  assert.equal(JSON.parse(request.options.body).model, 'test-model');
  assert.equal(JSON.stringify(result).includes('secret-key'), false);
});

test('connection test redacts a key echoed by a provider error', async () => {
  await assert.rejects(
    testOpenAIConnection({
      baseUrl: 'https://api.example.com', model: 'test', apiKey: 'sk-secret-value',
      fetchImpl: async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: { message: 'bad sk-secret-value' } }) }),
    }),
    error => !error.message.includes('sk-secret-value') && error.message.includes('[REDACTED]'),
  );
});

test('embedding connection test validates the vector response', async () => {
  let request;
  const result = await testEmbeddingConnection({
    baseUrl: 'https://api.example.com/v1', model: 'embed-model', apiKey: 'embed-key',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }) };
    },
  });
  assert.equal(request.url, 'https://api.example.com/v1/embeddings');
  assert.equal(result.message, '连接成功 · 3 维');
});

test('MCP configs persist locally while tokens stay in secure storage', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbee-mcp-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const keys = new Map();
  const secureStore = {
    getApiKey: async id => keys.get(id) || '',
    hasApiKey: async id => keys.has(id),
    setApiKey: async (id, value) => value ? keys.set(id, value) : keys.delete(id),
  };
  const store = new McpStore({ getPath: () => directory }, secureStore);
  const saved = await store.save({ name: 'Local Docs', url: 'http://127.0.0.1:3333/mcp', token: 'secret' });
  assert.equal(saved.id, 'local_docs');
  assert.equal(saved.tokenAvailable, true);
  assert.equal((await fs.readFile(path.join(directory, 'mcp-servers.json'), 'utf8')).includes('secret'), false);
  assert.equal((await store.forAgent())[0].token, 'secret');
  assert.equal((await store.list())[0].token, undefined);
  assert.deepEqual(await store.delete(saved.id), { deleted: true });
  assert.equal(keys.size, 0);
});
