import test from 'node:test';
import assert from 'node:assert/strict';
import { quickCopyValue, writeClipboard } from '../../src/services/clipboard.js';

test('quick copy chooses the credential instead of metadata and preserves its exact value', () => {
  assert.equal(
    quickCopyValue({
      secret_type: 'apikey',
      data: { provider: 'provider', apiUrl: 'https://example.com', key: ' key\n' }
    }),
    ' key\n'
  );
  assert.equal(
    quickCopyValue({ secret_type: 'password', data: { username: 'owner', password: 'private' } }),
    'private'
  );
  assert.equal(
    quickCopyValue({
      secret_type: 'database',
      data: { host: 'localhost', password: 'db-password' }
    }),
    'db-password'
  );
  assert.equal(
    quickCopyValue({
      secret_type: 'ssh',
      data: { privateKey: 'private-key', passphrase: 'phrase' }
    }),
    'private-key'
  );
  assert.equal(
    quickCopyValue({ secret_type: 'custom', data: { content: 'custom content' } }),
    'custom content'
  );
  assert.throws(
    () => quickCopyValue({ secret_type: 'apikey', data: { apiUrl: 'https://example.com' } }),
    /未填写/
  );
});
test('configuration quick copy decodes UTF-8 text and rejects binary content', () => {
  assert.equal(
    quickCopyValue({
      secret_type: 'config_file',
      data: { contentBase64: Buffer.from('你好\nKEY=value').toString('base64') }
    }),
    '你好\nKEY=value'
  );
  assert.throws(
    () =>
      quickCopyValue({
        secret_type: 'config_file',
        data: { contentBase64: Buffer.from([255, 254]).toString('base64') }
      }),
    /文本/
  );
});
test('clipboard write starts during the click and supports delayed authenticated text', async () => {
  let resolve;
  let called = false;
  const text = new Promise((r) => {
    resolve = r;
  });
  class Item {
    constructor(data) {
      this.data = data;
    }
  }
  const clipboard = {
    write: async (items) => {
      called = true;
      const blob = await items[0].data['text/plain'];
      assert.equal(await blob.text(), 'synthetic-private-value');
    }
  };
  const pending = writeClipboard(() => text, { clipboard, ClipboardItemClass: Item });
  assert.equal(called, true);
  resolve('synthetic-private-value');
  await pending;
  let written;
  await writeClipboard(async () => 'fallback-value', {
    clipboard: {
      writeText: async (value) => {
        written = value;
      }
    },
    ClipboardItemClass: null
  });
  assert.equal(written, 'fallback-value');
});
