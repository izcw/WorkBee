import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../schemas/', import.meta.url);

test('protocol schemas are valid JSON and keep version one', async () => {
  const envelope = JSON.parse(await readFile(new URL('envelope.v1.json', root), 'utf8'));
  const messages = JSON.parse(await readFile(new URL('messages.v1.json', root), 'utf8'));
  assert.equal(envelope.properties.protocolVersion.const, 1);
  assert.ok(messages.properties.type.enum.includes('approval.resolve'));
  assert.ok(messages.properties.type.enum.includes('knowledge.indexed'));
  assert.ok(messages.properties.type.enum.includes('knowledge.indexing'));
  assert.ok(messages.properties.type.enum.includes('model.generating'));
  assert.ok(messages.properties.type.enum.includes('model.replace'));
  assert.ok(messages.properties.type.enum.includes('agent.failed'));
  assert.ok(messages.properties.type.enum.includes('run.recoverable'));
  assert.ok(messages.properties.type.enum.includes('run.resume'));
  assert.ok(messages.properties.type.enum.includes('thread.truncate'));
  assert.ok(messages.properties.type.enum.includes('quality.completed'));
  assert.equal(envelope.additionalProperties, false);
});
