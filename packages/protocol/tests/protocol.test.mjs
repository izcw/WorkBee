import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../schemas/', import.meta.url);

test('protocol schemas are valid JSON and keep version one', async () => {
  const envelope = JSON.parse(await readFile(new URL('envelope.v1.json', root), 'utf8'));
  const messages = JSON.parse(await readFile(new URL('messages.v1.json', root), 'utf8'));
  assert.equal(envelope.properties.protocolVersion.const, 1);
  assert.ok(messages.properties.type.enum.includes('approval.resolve'));
  assert.equal(envelope.additionalProperties, false);
});
