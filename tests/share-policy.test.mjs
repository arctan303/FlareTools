import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRoomConnectUrl,
  buildRoomStatusUrl,
  createLatestSaveQueue,
  formatRoomTimestamp,
  pullLatest,
} from '../src/pages/share/shareRequestPolicy.js';
import { MAX_TEXT_LENGTH } from '../src/pages/share/shareLimits.js';
import { MAX_TEXT_LENGTH as WORKER_MAX_TEXT_LENGTH } from '../worker/api/text-share.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

test('the editor character limit stays in sync with the Worker', () => {
  assert.equal(MAX_TEXT_LENGTH, WORKER_MAX_TEXT_LENGTH);
});

test('latest-save queue deduplicates content and preserves edits made in flight', async () => {
  const firstSave = deferred();
  const calls = [];
  const queue = createLatestSaveQueue({
    initialContent: 'joined text',
    requestSave: async (content) => {
      calls.push(content);
      if (calls.length === 1) return firstSave.promise;
      return { success: true };
    },
  });

  await queue.enqueue('joined text');
  assert.deepEqual(calls, []);

  const saving = queue.enqueue('first edit');
  await Promise.resolve();
  assert.deepEqual(calls, ['first edit']);

  queue.enqueue('latest edit');
  firstSave.resolve({ success: true });
  await saving;
  assert.deepEqual(calls, ['first edit', 'latest edit']);
  assert.equal(queue.getSnapshot().lastSavedContent, 'latest edit');

  await queue.enqueue('latest edit');
  assert.equal(calls.length, 2);
});

test('a failed unchanged save is not retried in a quota-burning loop', async () => {
  let calls = 0;
  const queue = createLatestSaveQueue({
    requestSave: async () => {
      calls += 1;
      throw new Error('offline');
    },
  });

  await queue.enqueue('draft');
  assert.equal(calls, 1);
  assert.equal(queue.getSnapshot().lastSavedContent, '');
});

test('a draft enqueued in the save-settling microtask is drained rather than left unsaved', async () => {
  const firstSave = deferred();
  const calls = [];
  const queue = createLatestSaveQueue({
    requestSave: (content) => {
      calls.push(content);
      return calls.length === 1 ? firstSave.promise : Promise.resolve({ success: true });
    },
  });
  const first = queue.enqueue('first');
  const afterResponse = firstSave.promise.then(() => queue.enqueue('newer'));
  firstSave.resolve({ success: true });
  await Promise.all([first, afterResponse]);
  assert.deepEqual(calls, ['first', 'newer']);
  assert.equal(queue.getSnapshot().lastSavedContent, 'newer');
});

test('a manual retry of the same failed value makes at most one concurrent request', async () => {
  const retryGate = deferred();
  let calls = 0;
  const queue = createLatestSaveQueue({
    requestSave: async () => {
      calls += 1;
      if (calls === 1) throw new Error('offline');
      return retryGate.promise;
    },
  });

  await queue.enqueue('draft');
  const firstRetry = queue.enqueue('draft');
  const duplicateRetry = queue.enqueue('draft');
  assert.strictEqual(firstRetry, duplicateRetry);
  assert.equal(calls, 2);
  retryGate.resolve({ success: true });
  await firstRetry;
  assert.equal(queue.getSnapshot().lastSavedContent, 'draft');
});

test('room status URL carries only the room and device identifiers', () => {
  assert.equal(
    buildRoomStatusUrl('123456', 'device/a'),
    '/api/text-share/get_room_status?room_code=123456&device_id=device%2Fa',
  );
});

test('room connection URL uses WebSocket for the current origin and encodes the member token', () => {
  assert.equal(buildRoomConnectUrl('123456', 'private/a', 'https://tools.example/share?lang=en'),
    'wss://tools.example/api/text-share/connect?room_code=123456&device_id=private%2Fa');
  assert.equal(buildRoomConnectUrl('123456', 'token', 'http://localhost:5173/share'),
    'ws://localhost:5173/api/text-share/connect?room_code=123456&device_id=token');
});

test('a version conflict pauses newer drafts queued during the failed save', async () => {
  const firstSave = deferred();
  const calls = [];
  let conflict = false;
  const queue = createLatestSaveQueue({
    canSave: () => !conflict,
    requestSave: async (content) => {
      calls.push(content);
      if (calls.length === 1) return firstSave.promise;
      return { success: true };
    },
    onError: () => { conflict = true; },
  });
  const saving = queue.enqueue('first edit');
  queue.setDesired('newer draft');
  firstSave.reject(Object.assign(new Error('conflict'), { response: { code: 'VERSION_CONFLICT' } }));
  await saving;
  assert.deepEqual(calls, ['first edit']);
  assert.equal(queue.getSnapshot().desiredContent, 'newer draft');
  await queue.flush();
  await queue.enqueue('latest blocked edit');
  assert.deepEqual(calls, ['first edit']);
  // Only the user's explicit keep-mine action releases this guard.
  conflict = false;
  await queue.flush();
  assert.deepEqual(calls, ['first edit', 'latest blocked edit']);
});

test('ending a room stops an in-flight save from chasing a newer local draft', async () => {
  const firstSave = deferred();
  const calls = [];
  const saved = [];
  const queue = createLatestSaveQueue({
    requestSave: async (content) => { calls.push(content); return firstSave.promise; },
    onSaved: (response, content) => saved.push(content),
  });
  const saving = queue.enqueue('submitted draft');
  queue.setDesired('preserved local draft');
  queue.destroy();
  firstSave.resolve({ success: true });
  await saving;
  await queue.flush();
  assert.deepEqual(calls, ['submitted draft']);
  assert.deepEqual(saved, []);
  assert.equal(queue.getSnapshot().desiredContent, 'preserved local draft');
});

test('pulling performs exactly one status request and never touches the clipboard', async () => {
  let requests = 0;
  let editorText = '';

  const result = await pullLatest({
    requestStatus: async () => {
      requests += 1;
      return { success: true, text_content: 'latest server text', version: 4 };
    },
    onContent: (content) => { editorText = content; },
  });

  assert.equal(requests, 1);
  assert.equal(editorText, 'latest server text');
  assert.equal(result.content, 'latest server text');
  assert.equal(result.data.version, 4);
});

test('pulling an empty room yields an empty string rather than undefined', async () => {
  let editorText = null;

  const result = await pullLatest({
    requestStatus: async () => ({ success: true, version: 0 }),
    onContent: (content) => { editorText = content; },
  });

  assert.equal(editorText, '');
  assert.equal(result.content, '');
});

test('a late pull from a previous membership cannot replace text after rejoining the same room', async () => {
  const oldStatus = deferred();
  let session = 1;
  const requestedSession = session;
  let editorText = 'text before leaving';
  const request = pullLatest({
    requestStatus: () => oldStatus.promise,
    isCurrent: () => session === requestedSession,
    onContent: (content) => { editorText = content; },
  });
  assert.equal(editorText, 'text before leaving');
  session += 1; // Leaving and rejoining can keep the same six-digit room code.
  editorText = 'newer text obtained when rejoining';
  oldStatus.resolve({ success: true, text_content: 'old in-flight snapshot', version: 3 });
  const result = await request;
  assert.equal(result.applied, false);
  assert.equal(editorText, 'newer text obtained when rejoining');
});

test('room timestamps follow the selected site language', () => {
  const timestamp = 1784470000;
  const english = formatRoomTimestamp(timestamp, 'en');
  const chinese = formatRoomTimestamp(timestamp, 'zh-CN');

  assert.match(english, /AM|PM/);
  assert.doesNotMatch(chinese, /AM|PM/);
});
