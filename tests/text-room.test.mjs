import test from 'node:test';
import assert from 'node:assert/strict';
import { createContentWatcher } from '../src/pages/share/shareRequestPolicy.js';

class FakeSocket {
  handlers = new Map();
  closed = false;

  addEventListener(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.handlers.get(type)?.delete(handler); }
  emit(type, event = {}) { for (const handler of this.handlers.get(type) || []) handler(event); }
  message(data) { this.emit('message', { data: JSON.stringify(data) }); }
  close() { this.closed = true; this.emit('close', { code: 1000 }); }
}

function connection(overrides = {}) {
  const sockets = [];
  const timers = new Map();
  const delays = [];
  const states = [];
  let nextTimer = 0;
  const watcher = createContentWatcher({
    url: 'wss://tools.example/api/text-share/connect?room_code=123456&device_id=private',
    createSocket: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; },
    randomFn: () => 0.5,
    setTimeoutFn: (callback, delay) => {
      const timer = ++nextTimer;
      timers.set(timer, callback);
      delays.push(delay);
      return timer;
    },
    clearTimeoutFn: (timer) => timers.delete(timer),
    onConnectionState: (state) => states.push(state),
    ...overrides,
  });
  return {
    watcher, sockets, timers, delays, states,
    nextRetry: () => {
      const [timer, callback] = timers.entries().next().value;
      timers.delete(timer);
      callback();
    },
  };
}

test('a healthy WebSocket uses no timer and deduplicates repeated or stale revisions', () => {
  const seen = [];
  const metadata = [];
  const room = connection({
    onVersionChange: (data, previous) => seen.push({ previous, version: data.version }),
    onMetadata: (data) => metadata.push(data.version),
  });
  room.watcher.setBaseline(3);
  room.watcher.start();
  room.watcher.start();
  assert.equal(room.sockets.length, 1);
  room.sockets[0].emit('open');
  assert.equal(room.watcher.getState(), 'live');
  room.sockets[0].message({ type: 'version', version: 3 });
  room.sockets[0].message({ type: 'version', version: 4 });
  room.sockets[0].message({ type: 'version', version: 4 });
  room.sockets[0].message({ type: 'version', version: 2 });
  assert.deepEqual(seen, [{ previous: 3, version: 4 }]);
  assert.deepEqual(metadata, [3, 4, 4]);
  assert.equal(room.timers.size, 0);
});

test('setting a local save baseline suppresses its echo without losing later remote revisions', () => {
  const seen = [];
  const room = connection({ onVersionChange: (data) => seen.push(data.version) });
  room.watcher.setBaseline(1);
  room.watcher.start();
  room.watcher.setBaseline(2);
  room.sockets[0].message({ type: 'version', version: 2 });
  room.sockets[0].message({ type: 'version', version: 3 });
  room.watcher.setBaseline(2);
  room.sockets[0].message({ type: 'version', version: 3 });
  assert.deepEqual(seen, [3]);
});

test('the connection ignores malformed frames and updates presence without transferring text', () => {
  const seen = [];
  const devices = [];
  const room = connection({ onVersionChange: (data) => seen.push(data), onDevices: (value) => devices.push(value) });
  room.watcher.start();
  room.sockets[0].emit('message', { data: '{bad' });
  room.sockets[0].message(null);
  room.sockets[0].message({ type: 'version', version: -1 });
  room.sockets[0].message({ type: 'version', version: '2' });
  room.sockets[0].message({ type: 'devices', devices: { public_id: { connected: true } } });
  assert.deepEqual(seen, []);
  assert.deepEqual(devices, [{ public_id: { connected: true } }]);
  assert.equal(room.timers.size, 0);
});

test('failed connections retry with exponential backoff and recover missed versions on reconnect', () => {
  const seen = [];
  const room = connection({ onVersionChange: (data) => seen.push(data.version) });
  room.watcher.setBaseline(3);
  room.watcher.start();
  room.sockets[0].emit('error');
  room.sockets[0].emit('close', { code: 1006 });
  assert.equal(room.timers.size, 1);
  assert.equal(room.delays[0], 1000);
  room.nextRetry();
  room.sockets[1].emit('close', { code: 1006 });
  assert.equal(room.delays[1], 2000);
  room.nextRetry();
  room.sockets[2].emit('open');
  room.sockets[2].message({ type: 'version', version: 5 });
  assert.deepEqual(seen, [5]);
  assert.equal(room.timers.size, 0);
  assert.deepEqual(room.states, ['connecting', 'reconnecting', 'live']);
});

test('retry delays include jitter and stay capped during a prolonged outage', () => {
  const room = connection({ randomFn: () => 1 });
  room.watcher.start();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    room.sockets.at(-1).emit('close', { code: 1006 });
    room.nextRetry();
  }
  assert.equal(room.delays[0], 1200);
  assert.equal(room.delays.at(-1), 30000);
  assert.ok(room.delays.every((delay) => delay <= 30000));
  room.watcher.stop();
});

test('expired, destroyed or revoked memberships stop reconnecting permanently', () => {
  for (const reason of ['expired', 'destroyed', 'left']) {
    const ended = [];
    const room = connection({ onRoomClosed: (data) => ended.push(data.reason) });
    room.watcher.start();
    room.sockets[0].message({ type: 'room_closed', reason });
    room.watcher.start();
    assert.deepEqual(ended, [reason]);
    assert.equal(room.watcher.getState(), 'closed');
    assert.equal(room.watcher.isRunning(), false);
    assert.equal(room.sockets.length, 1);
    assert.equal(room.timers.size, 0);
    assert.equal(room.sockets[0].closed, true);
  }
});

test('terminal close codes stop retries even when the closing notification was lost', () => {
  for (const code of [4000, 4001]) {
    const ended = [];
    const room = connection({ onRoomClosed: (data) => ended.push(data.reason) });
    room.watcher.start();
    room.sockets[0].emit('close', { code });
    assert.equal(room.watcher.getState(), 'closed');
    assert.equal(room.timers.size, 0);
    assert.deepEqual(ended, code === 4001 ? ['expired'] : []);
  }
});

test('revoked membership close reasons remain accurate without a separate closing frame', () => {
  const ended = [];
  const room = connection({ onRoomClosed: (data) => ended.push(data.reason) });
  room.watcher.start();
  room.sockets[0].emit('close', { code: 4001, reason: 'left' });
  assert.deepEqual(ended, ['left']);
  assert.equal(room.timers.size, 0);
});

test('effect-style stop and restart disposes the old socket and retains the room baseline', () => {
  const seen = [];
  const room = connection({ onVersionChange: (data) => seen.push(data.version) });
  room.watcher.setBaseline(5);
  room.watcher.start();
  room.watcher.stop();
  room.watcher.start();
  room.sockets[0].message({ type: 'version', version: 9 });
  room.sockets[1].message({ type: 'version', version: 5 });
  room.sockets[1].message({ type: 'version', version: 6 });
  assert.deepEqual(seen, [6]);
  assert.equal(room.sockets[0].closed, true);
  assert.equal(room.timers.size, 0);
});

test('a new room watcher starts from its own revision instead of retaining an older room baseline', () => {
  const first = connection();
  first.watcher.setBaseline(100);
  first.watcher.start();
  first.watcher.stop();
  const seen = [];
  const next = connection({ onVersionChange: (data) => seen.push(data.version) });
  next.watcher.setBaseline(0);
  next.watcher.start();
  next.sockets[0].message({ type: 'version', version: 1 });
  assert.deepEqual(seen, [1]);
});

test('stopping disposes socket listeners and cancels a pending reconnect', () => {
  const seen = [];
  const room = connection({ onVersionChange: (data) => seen.push(data.version) });
  room.watcher.start();
  room.sockets[0].emit('close', { code: 1006 });
  assert.equal(room.timers.size, 1);
  room.watcher.stop();
  room.watcher.stop();
  room.sockets[0].message({ type: 'version', version: 20 });
  assert.equal(room.timers.size, 0);
  assert.deepEqual(seen, []);
  assert.equal(room.sockets[0].closed, true);
  assert.ok([...room.sockets[0].handlers.values()].every((handlers) => handlers.size === 0));
});

test('a socket construction failure becomes a retry rather than a thrown UI error', () => {
  const room = connection({ createSocket: () => { throw new Error('offline'); } });
  assert.doesNotThrow(() => room.watcher.start());
  assert.equal(room.watcher.getState(), 'reconnecting');
  assert.equal(room.timers.size, 1);
  room.watcher.stop();
  assert.equal(room.timers.size, 0);
});
