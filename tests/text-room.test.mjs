import test from 'node:test';
import assert from 'node:assert/strict';
import { pullLatestOnce } from '../src/pages/share/shareRequestPolicy.js';

test('pull and copy performs one status request and copies the returned text', async () => {
  let requests = 0;
  let editorText = '';
  let clipboardText = '';

  const result = await pullLatestOnce({
    requestStatus: async () => {
      requests += 1;
      return { success: true, text_content: 'latest server text' };
    },
    onContent: (content) => { editorText = content; },
    writeClipboard: async (content) => { clipboardText = content; },
  });

  assert.equal(requests, 1);
  assert.equal(editorText, 'latest server text');
  assert.equal(clipboardText, 'latest server text');
  assert.equal(result.copied, true);
});

test('clipboard denial keeps the single pulled result available for manual copy', async () => {
  let requests = 0;
  let editorText = '';

  const result = await pullLatestOnce({
    requestStatus: async () => {
      requests += 1;
      return { success: true, text_content: 'keep me' };
    },
    onContent: (content) => { editorText = content; },
    writeClipboard: async () => { throw new Error('denied'); },
  });

  assert.equal(requests, 1);
  assert.equal(editorText, 'keep me');
  assert.equal(result.copied, false);
});
