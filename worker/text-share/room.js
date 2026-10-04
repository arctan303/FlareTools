import { RESPONSE_CODES as RC } from './responseCodes.js';

export const MAX_TEXT_LENGTH = 10000;
export const ROOM_TTL_SECONDS = 86400;
const MAX_DEVICES = 10;

export function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

function failure(code, status = 400) {
  return json({ success: false, code }, status);
}

function closeSocket(socket, code, reason) {
  try { socket.close(code, reason); } catch { /* Continue cleaning up other peers. */ }
}

function hasTable(sql, name) {
  return sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", name).toArray().length > 0;
}

/** Synchronous SQLite operations keep room revisions atomic within one DO. */
export class TextRoomHandler {
  constructor(ctx) {
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
  }

  read() {
    // A failed lookup must not allocate a persistent SQLite database.
    if (!hasTable(this.sql, 'room')) return null;
    const row = this.sql.exec('SELECT data, expires_at FROM room WHERE id = 1').toArray()[0];
    if (!row || row.expires_at <= Date.now()) return null;
    const room = JSON.parse(row.data);
    // Membership credentials must never become public device labels. Also
    // upgrade any room created before public IDs were introduced.
    let changed = false;
    for (const device of Object.values(room.devices)) {
      if (!device.public_id) { device.public_id = crypto.randomUUID(); changed = true; }
    }
    if (Object.hasOwn(room.devices, room.content_updated_by)) {
      room.content_updated_by = room.devices[room.content_updated_by].public_id;
      changed = true;
    }
    if (changed) this.write(room);
    return room;
  }

  write(room) {
    // expires_at is fixed at creation; reads, joins and saves never extend it.
    this.sql.exec('INSERT INTO room (id, data, expires_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at', JSON.stringify(room), room.expires_at);
  }

  metadata(room) {
    const connected = new Set(this.ctx.getWebSockets().map((socket) => socket.deserializeAttachment()?.deviceId));
    return {
      version: room.version,
      content_updated_at: room.content_updated_at,
      content_updated_by: room.content_updated_by,
      expires_at: Math.floor(room.expires_at / 1000),
      devices: Object.fromEntries(Object.entries(room.devices).map(([id, device]) => [device.public_id, { id: device.public_id, last_seen: device.joined_at, connected: connected.has(id) }])),
    };
  }

  broadcast(data) {
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(JSON.stringify(data)); } catch { /* A disconnected peer cannot block other devices. */ }
    }
  }

  closePeers(reason) {
    this.broadcast({ type: 'room_closed', reason });
    for (const socket of this.ctx.getWebSockets()) closeSocket(socket, 4001, reason);
  }

  async end(reason) {
    this.closePeers(reason);
    // DELETE rows leaves SQLite pages and internal metadata allocated. With our
    // compatibility date, deleteAll also removes the alarm and releases storage.
    await this.ctx.storage.deleteAll();
  }

  async alarm() {
    if (!hasTable(this.sql, 'room')) return;
    const row = this.sql.exec('SELECT expires_at FROM room WHERE id = 1').toArray()[0];
    if (!row || row.expires_at <= Date.now()) await this.end('expired');
    else await this.ctx.storage.setAlarm(row.expires_at);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const action = url.pathname.split('/').pop();
    const body = request.method === 'POST' ? await request.json() : Object.fromEntries(url.searchParams);
    if (action === 'create_room') {
      if (this.read()) return failure(RC.ROOM_BUSY, 409);
      // Reusing an expired code overwrites its row synchronously. Avoid yielding
      // before the insert so competing creates cannot both claim the same code.
      this.closePeers('expired');
      this.sql.exec('CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, expires_at INTEGER NOT NULL)');
      const now = Math.floor(Date.now() / 1000);
      const room = { code: body.room_code, created_at: now, expires_at: Date.now() + ROOM_TTL_SECONDS * 1000, text_content: '', version: 0, content_updated_at: 0, content_updated_by: '', devices: {} };
      this.write(room);
      await this.ctx.storage.setAlarm(room.expires_at);
      return json({ success: true, code: RC.ROOM_CREATED, room_code: room.code, ...this.metadata(room) });
    }

    const room = this.read();
    if (!room) {
      // Also reclaim old empty databases and expired rooms accessed before the
      // alarm runs; a never-created room remains entirely read-only.
      if (hasTable(this.sql, 'room')) await this.end('expired');
      return failure(RC.ROOM_NOT_FOUND, 404);
    }
    if (action === 'join_room') {
      // Only a token already registered in this room may resume a membership.
      const deviceId = Object.hasOwn(room.devices, body.device_id || '') ? body.device_id : crypto.randomUUID();
      if (!Object.hasOwn(room.devices, deviceId) && Object.keys(room.devices).length >= MAX_DEVICES) return failure(RC.ROOM_FULL);
      room.devices[deviceId] ??= { joined_at: Math.floor(Date.now() / 1000), public_id: crypto.randomUUID() };
      this.write(room);
      this.broadcast({ type: 'devices', ...this.metadata(room) });
      return json({ success: true, code: RC.ROOM_JOINED, room_code: room.code, device_id: deviceId, public_device_id: room.devices[deviceId].public_id, text_content: room.text_content, last_update: room.content_updated_at, ...this.metadata(room) });
    }

    const deviceId = body.device_id || '';
    if (!Object.hasOwn(room.devices, deviceId)) return failure(RC.DEVICE_NOT_IN_ROOM, 403);
    if (action === 'connect') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return failure(RC.METHOD_NOT_ALLOWED, 426);
      // Bound reconnections so one member cannot hold unlimited sockets open.
      for (const socket of this.ctx.getWebSockets()) {
        if (socket.deserializeAttachment()?.deviceId === deviceId) closeSocket(socket, 4000, 'replaced');
      }
      const [client, server] = Object.values(new globalThis.WebSocketPair());
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ deviceId });
      this.broadcast({ type: 'devices', ...this.metadata(room) });
      // Initial metadata catches changes made while the device was disconnected.
      server.send(JSON.stringify({ type: 'version', ...this.metadata(room) }));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (action === 'get_room_status') return json({ success: true, code: RC.ROOM_STATUS, text_content: room.text_content, last_update: room.content_updated_at, ...this.metadata(room) });
    if (action === 'update_text') {
      if (typeof body.text_content !== 'string') return failure(RC.MISSING_PARAMETERS);
      if (body.text_content.length > MAX_TEXT_LENGTH) return failure(RC.TEXT_TOO_LONG);
      if (!Number.isInteger(body.base_version)) return failure(RC.MISSING_PARAMETERS);
      if (body.base_version !== room.version) return json({ success: false, code: RC.VERSION_CONFLICT, current_version: room.version, text_content: room.text_content, content_updated_at: room.content_updated_at }, 409);
      room.text_content = body.text_content;
      room.version += 1;
      room.content_updated_at = Math.floor(Date.now() / 1000);
      room.content_updated_by = room.devices[deviceId].public_id;
      this.write(room);
      const metadata = this.metadata(room);
      this.broadcast({ type: 'version', ...metadata });
      return json({ success: true, code: RC.TEXT_UPDATED, last_update: room.content_updated_at, ...metadata });
    }
    if (action === 'leave_room') {
      delete room.devices[deviceId];
      this.write(room);
      for (const socket of this.ctx.getWebSockets()) {
        if (socket.deserializeAttachment()?.deviceId === deviceId) closeSocket(socket, 4001, 'left');
      }
      this.broadcast({ type: 'devices', ...this.metadata(room) });
      return json({ success: true, code: RC.ROOM_LEFT });
    }
    if (action === 'destroy_room') {
      await this.end('destroyed');
      return json({ success: true, code: RC.ROOM_DESTROYED });
    }
    return failure(RC.UNKNOWN_ACTION);
  }

  webSocketMessage(socket) {
    // Text is sent only via the versioned HTTP API; sockets carry notifications.
    closeSocket(socket, 1008, 'notifications only');
  }

  webSocketClose(socket, code, reason) {
    closeSocket(socket, code, reason);
    const room = this.read();
    if (room) this.broadcast({ type: 'devices', ...this.metadata(room) });
  }

  webSocketError(socket) {
    closeSocket(socket, 1011, 'connection error');
  }
}

/** Per-IP quota is durable and shared across isolates, separate from room state. */
export class TextQuotaHandler {
  constructor(ctx) {
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
  }

  async fetch(request) {
    const { verified, turnstile_enabled } = await request.json();
    const day = new Date().toISOString().slice(0, 10);
    const exists = hasTable(this.sql, 'quota');
    const row = exists ? this.sql.exec('SELECT day, count FROM quota WHERE id = 1').toArray()[0] : undefined;
    const count = row?.day === day ? row.count : 0;
    if (count >= 20) return failure(RC.RATE_LIMITED, 429);
    if (count >= 2 && turnstile_enabled && !verified) return json({ success: false, code: RC.CAPTCHA_REQUIRED, require_captcha: true }, 403);
    if (!exists) this.sql.exec('CREATE TABLE quota (id INTEGER PRIMARY KEY CHECK (id = 1), day TEXT NOT NULL, count INTEGER NOT NULL)');
    this.sql.exec('INSERT INTO quota (id, day, count) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET day = excluded.day, count = excluded.count', day, count + 1);
    await this.ctx.storage.setAlarm(Date.parse(`${day}T00:00:00Z`) + 86400000);
    return json({ success: true, code: RC.OK });
  }

  async alarm() {
    if (!hasTable(this.sql, 'quota')) return;
    const row = this.sql.exec('SELECT day FROM quota WHERE id = 1').toArray()[0];
    if (!row || row.day < new Date().toISOString().slice(0, 10)) await this.ctx.storage.deleteAll();
  }
}
