const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { ModelStore } = require('../electron/model-store.cjs');
const { RoleStore } = require('../electron/role-store.cjs');
const { testOpenAIConnection } = require('../electron/provider-test.cjs');

test('models support CRUD and roles reference a configured model', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aivra-models-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const keys = new Map([['aivra', 'legacy-key']]);
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
  await roles.save({ id: 'emma', modelId: created.id, description: '研究角色', skills: ['PDF 处理'], knowledge: ['full-text-pdf'] });
  const providers = await roles.providersForAgent();
  assert.equal(providers.emma.model, 'test-model-v2');
  assert.equal(providers.emma.apiKey, 'test-key');
  assert.equal(providers.emma.description, '研究角色');
  assert.deepEqual(providers.emma.skills, ['PDF 处理']);
  assert.deepEqual(providers.emma.knowledge, ['full-text-pdf']);
  assert.equal(await roles.usesModel(created.id), true);
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
