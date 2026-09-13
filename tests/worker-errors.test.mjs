import test from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_RESPONSE_CODES, RESPONSE_CODES } from '../functions/api/text-share/responseCodes.js';
import { onRequest } from '../functions/api/text-share/[[action]].js';

async function callWorker(action, { body, db = {}, method = 'GET' } = {}) {
  const request = new Request(`https://example.com/api/text-share/${action}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const response = await onRequest({
    request,
    env: { DB: db },
    params: { action: [action] },
  });

  return { response, payload: await response.json() };
}

function createRoomDatabase(room) {
  let deleted = false;
  return {
    get deleted() {
      return deleted;
    },
    prepare(statement) {
      return {
        bind() {
          return {
            all: async () => ({
              results: statement.startsWith('SELECT') && !deleted
                ? [{ data: JSON.stringify(room) }]
                : [],
            }),
            run: async () => {
              if (statement.startsWith('DELETE FROM rooms_kv WHERE key')) deleted = true;
              return { success: true };
            },
          };
        },
      };
    },
  };
}

test('Worker response codes are unique and error codes are declared', () => {
  const codes = Object.values(RESPONSE_CODES);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of ERROR_RESPONSE_CODES) assert.ok(codes.includes(code));
});

test('unknown actions return the compatible JSON error contract', async () => {
  const { response, payload } = await callWorker('future_action');
  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
  assert.equal(payload.code, RESPONSE_CODES.UNKNOWN_ACTION);
  assert.equal(typeof payload.message, 'string');
});

test('unsupported methods retain status, message, success and stable code', async () => {
  const { response, payload } = await callWorker('join_room');
  assert.equal(response.status, 405);
  assert.deepEqual(
    Object.keys(payload).sort(),
    ['code', 'message', 'success'],
  );
  assert.equal(payload.success, false);
  assert.equal(payload.code, RESPONSE_CODES.METHOD_NOT_ALLOWED);
});

test('signal validation does not echo SDP or ICE payloads in its response', async () => {
  const secretSignal = {
    type: 'offer',
    sdp: 'SECRET-SDP-PAYLOAD',
    candidate: 'SECRET-ICE-CANDIDATE',
  };
  const { response, payload } = await callWorker('signal', {
    method: 'POST',
    body: { signal_data: secretSignal },
  });

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
  assert.equal(payload.code, RESPONSE_CODES.MISSING_PARAMETERS);
  assert.equal(typeof payload.message, 'string');
  assert.doesNotMatch(JSON.stringify(payload), /SECRET-(?:SDP|ICE)/);
});

test('the system keeper cannot be used to destroy a room', async () => {
  const db = createRoomDatabase({
    devices: {
      SYSTEM_KEEPER: { id: 'SYSTEM_KEEPER' },
      'real-device': { id: 'real-device' },
    },
  });
  const { response, payload } = await callWorker('destroy_room', {
    db,
    method: 'POST',
    body: { room_code: '123456', device_id: 'SYSTEM_KEEPER' },
  });

  assert.equal(response.status, 403);
  assert.equal(payload.code, RESPONSE_CODES.FORBIDDEN);
  assert.equal(db.deleted, false);

  const memberDb = createRoomDatabase({
    devices: {
      SYSTEM_KEEPER: { id: 'SYSTEM_KEEPER' },
      'real-device': { id: 'real-device' },
    },
  });
  const memberResult = await callWorker('destroy_room', {
    db: memberDb,
    method: 'POST',
    body: { room_code: '123456', device_id: 'real-device' },
  });
  assert.equal(memberResult.response.status, 200);
  assert.equal(memberResult.payload.code, RESPONSE_CODES.ROOM_DESTROYED);
  assert.equal(memberDb.deleted, true);
});
