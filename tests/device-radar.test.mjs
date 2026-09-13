import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRadarController,
  RADAR_INTERVAL_MS,
  RADAR_MAX_DURATION_MS,
} from '../src/pages/share/deviceRadarPolicy.js';

function createFakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();

  const schedule = (callback, delay, repeat) => {
    const id = nextId++;
    timers.set(id, { callback, delay, repeat, time: now + delay });
    return id;
  };

  const advance = (duration) => {
    const target = now + duration;
    while (true) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.time <= target)
        .sort((a, b) => a[1].time - b[1].time)[0];
      if (!due) break;
      const [id, timer] = due;
      now = timer.time;
      if (timer.repeat) timer.time += timer.delay;
      else timers.delete(id);
      timer.callback();
    }
    now = target;
  };

  return {
    advance,
    clearInterval: (id) => timers.delete(id),
    clearTimeout: (id) => timers.delete(id),
    countRepeating: () => [...timers.values()].filter((timer) => timer.repeat).length,
    setInterval: (callback, delay) => schedule(callback, delay, true),
    setTimeout: (callback, delay) => schedule(callback, delay, false),
  };
}

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test('one radar activation stays within the existing 60s / 4s request ceiling', async () => {
  const clock = createFakeClock();
  let requests = 0;
  const radar = createRadarController({
    poll: () => { requests += 1; },
    setIntervalFn: clock.setInterval,
    clearIntervalFn: clock.clearInterval,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
  });

  radar.start();
  await flushPromises();
  assert.equal(requests, 1);
  for (let elapsed = RADAR_INTERVAL_MS; elapsed < RADAR_MAX_DURATION_MS; elapsed += RADAR_INTERVAL_MS) {
    clock.advance(RADAR_INTERVAL_MS);
    await flushPromises();
  }
  assert.equal(requests, 15);
  clock.advance(RADAR_INTERVAL_MS);
  await flushPromises();
  assert.equal(radar.isActive(), false);
  assert.equal(clock.countRepeating(), 0);
});

test('a late repeated start preserves the original deadline and request ceiling', async () => {
  const clock = createFakeClock();
  let requests = 0;
  const radar = createRadarController({
    poll: () => { requests += 1; },
    setIntervalFn: clock.setInterval,
    clearIntervalFn: clock.clearInterval,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
  });

  radar.start();
  await flushPromises();
  assert.equal(requests, 1);
  assert.equal(clock.countRepeating(), 1);

  for (let elapsed = RADAR_INTERVAL_MS; elapsed < RADAR_MAX_DURATION_MS; elapsed += RADAR_INTERVAL_MS) {
    clock.advance(RADAR_INTERVAL_MS);
    await flushPromises();
  }
  radar.start();
  radar.start();
  clock.advance(RADAR_INTERVAL_MS);
  await flushPromises();

  assert.equal(requests, 15);
  assert.equal(radar.isActive(), false);
  assert.equal(clock.countRepeating(), 0);
});

test('radar ticks and manual refreshes share one in-flight request', async () => {
  const clock = createFakeClock();
  let requests = 0;
  let resolveRequest;
  const radar = createRadarController({
    poll: () => {
      requests += 1;
      return new Promise((resolve) => { resolveRequest = resolve; });
    },
    setIntervalFn: clock.setInterval,
    clearIntervalFn: clock.clearInterval,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
  });

  const initialRequest = radar.start();
  const refreshOne = radar.refresh();
  const refreshTwo = radar.refresh();
  await flushPromises();
  clock.advance(RADAR_INTERVAL_MS * 2);
  await flushPromises();

  assert.equal(requests, 1);
  assert.equal(initialRequest, refreshOne);
  assert.equal(refreshOne, refreshTwo);

  resolveRequest();
  await initialRequest;
  await flushPromises();
  const nextRequest = radar.refresh();
  await flushPromises();
  assert.equal(requests, 2);
  resolveRequest();
  await nextRequest;
  radar.stop();
});
