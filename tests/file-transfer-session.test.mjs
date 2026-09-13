import test from 'node:test';
import assert from 'node:assert/strict';
import { clearFileTransferSessionRefs } from '../src/pages/share/fileTransferSessionPolicy.js';
import {
  createConnectionAttemptTimer,
  reconcileConnectionAttempt,
  replaceConnectionAttempt,
  settleConnectionAttempt,
} from '../src/pages/share/connectionAttemptPolicy.js';

test('leaving one room clears file references before another room can advertise them', () => {
  let connectionClosed = 0;
  const revoked = [];
  const channel = {
    onclose: () => {},
    onerror: () => {},
    onmessage: () => {},
    onopen: () => {},
  };
  const refs = {
    channelsRef: { current: { 'device-b': channel } },
    connectionsRef: { current: { 'device-b': { close: () => { connectionClosed += 1; } } } },
    objectUrlsRef: { current: new Set(['blob:room-a-file']) },
    pendingCandidatesRef: { current: { 'device-b': [{ candidate: 'old' }] } },
    receiveBufferRef: { current: { old: { chunks: [new Uint8Array([1])] } } },
    stagedFilesMetaRef: { current: [{ type: 'file_offered', id: 'room-a-file' }] },
    stagedFilesRef: { current: { 'room-a-file': { name: 'private-a.txt' } } },
  };

  clearFileTransferSessionRefs({
    ...refs,
    revokeObjectUrl: (url) => revoked.push(url),
  });

  assert.equal(connectionClosed, 1);
  assert.deepEqual(revoked, ['blob:room-a-file']);
  assert.deepEqual(refs.channelsRef.current, {});
  assert.deepEqual(refs.connectionsRef.current, {});
  assert.deepEqual(refs.pendingCandidatesRef.current, {});
  assert.deepEqual(refs.receiveBufferRef.current, {});
  assert.deepEqual(refs.stagedFilesMetaRef.current, []);
  assert.deepEqual(refs.stagedFilesRef.current, {});
  assert.equal(refs.objectUrlsRef.current.size, 0);
  assert.equal(channel.onmessage, null);
});

test('a successful file connection cancels its timeout before the deadline', () => {
  let scheduledCallback;
  let cleared = 0;
  const expired = [];
  const timer = createConnectionAttemptTimer({
    setTimeoutFn: (callback) => {
      scheduledCallback = callback;
      return 7;
    },
    clearTimeoutFn: (timerId) => {
      assert.equal(timerId, 7);
      cleared += 1;
    },
  });

  timer.start('device-b', (deviceId) => expired.push(deviceId));
  assert.equal(settleConnectionAttempt(timer, {
    deviceId: 'device-b',
    devicePresent: true,
    peer: { connected: true },
  }), 'connected');
  scheduledCallback();

  assert.equal(cleared, 1);
  assert.deepEqual(expired, []);
  assert.equal(timer.getTarget(), null);
});

test('starting a new connection cancels only an unfinished previous attempt', () => {
  const callbacks = [];
  const cancelled = [];
  const timer = createConnectionAttemptTimer({
    setTimeoutFn: (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    },
    clearTimeoutFn: () => {},
  });
  const begin = (nextTarget) => replaceConnectionAttempt(timer, {
    nextTarget,
    cancelPrevious: (deviceId) => cancelled.push(deviceId),
    onTimeout: () => {},
  });

  begin('device-a');
  settleConnectionAttempt(timer, {
    deviceId: 'device-a',
    devicePresent: true,
    peer: { connected: true },
  });
  begin('device-b');
  assert.deepEqual(cancelled, []);

  begin('device-c');
  assert.deepEqual(cancelled, ['device-b']);
  assert.equal(timer.getTarget(), 'device-c');
});

test('a stale timeout cannot expire a newer attempt for the same device', () => {
  const callbacks = [];
  const expired = [];
  const timer = createConnectionAttemptTimer({
    setTimeoutFn: (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    },
    clearTimeoutFn: () => {},
  });

  timer.start('device-a', (deviceId) => expired.push(deviceId));
  settleConnectionAttempt(timer, {
    deviceId: 'device-a',
    devicePresent: true,
    peer: { connected: true },
  });
  timer.start('device-a', (deviceId) => expired.push(deviceId));

  callbacks[0]();
  assert.equal(timer.getTarget(), 'device-a');
  assert.deepEqual(expired, []);

  callbacks[1]();
  assert.equal(timer.getTarget(), null);
  assert.deepEqual(expired, ['device-a']);
});

test('a device disappearing during connection is cancelled and can be retried', () => {
  const cancelled = [];
  const settled = [];
  const timer = createConnectionAttemptTimer({
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {},
  });

  timer.start('device-a', () => {});
  assert.equal(reconcileConnectionAttempt(timer, {
    cancelAttempt: (deviceId, status) => cancelled.push([deviceId, status]),
    deviceId: 'device-a',
    devicePresent: false,
    onSettled: (deviceId, outcome) => settled.push([deviceId, outcome]),
    peer: { connected: false, status: 'connecting' },
  }), 'failed');
  assert.equal(timer.getTarget(), null);
  assert.deepEqual(cancelled, [['device-a', 'failed']]);
  assert.deepEqual(settled, [['device-a', 'failed']]);

  timer.start('device-a', () => {});
  assert.equal(timer.getTarget(), 'device-a');
});
