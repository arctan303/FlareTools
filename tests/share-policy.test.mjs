import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRoomStatusUrl,
  createLatestSaveQueue,
  formatRoomTimestamp,
} from '../src/pages/share/shareRequestPolicy.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

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

test('room timestamps follow the selected site language', () => {
  const timestamp = 1784470000;
  const english = formatRoomTimestamp(timestamp, 'en');
  const chinese = formatRoomTimestamp(timestamp, 'zh-CN');

  assert.match(english, /AM|PM/);
  assert.doesNotMatch(chinese, /AM|PM/);
});
