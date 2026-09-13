// CF Pages Function: Text Share API
// Route: /api/text-share/:action

import { RESPONSE_CODES as RC } from './responseCodes.js';

const SYSTEM_KEEPER_ID = 'SYSTEM_KEEPER';
const MAX_DEVICES_PER_ROOM = 10;
const ROOM_TTL = 86400; // 24 hours

// Global memory rate limiter to protect D1 from abuse
const ipBlocklist = new Map();

function jsonResponse(data, status = 200) {
  const payload = {
    code: data.success === false ? RC.INTERNAL_ERROR : RC.OK,
    ...data,
  };

  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}

function generateRoomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

class D1KVAdapter {
  constructor(db) {
    this.db = db;
  }

  async get(key) {
    const { results } = await this.db.prepare("SELECT data FROM rooms_kv WHERE key = ? AND expires_at > ?")
        .bind(key, Math.floor(Date.now() / 1000))
        .all();
    return results.length > 0 ? results[0].data : null;
  }

  async put(key, value, options = {}) {
    const expiresAt = options.expirationTtl ? Math.floor(Date.now() / 1000) + options.expirationTtl : Math.floor(Date.now() / 1000) + 86400 * 7;
    await this.db.prepare("INSERT INTO rooms_kv (key, data, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at")
        .bind(key, value, expiresAt)
        .run();
  }

  async delete(key) {
    await this.db.prepare("DELETE FROM rooms_kv WHERE key = ?").bind(key).run();
  }
  
  async cleanup() {
    await this.db.prepare("DELETE FROM rooms_kv WHERE expires_at <= ?").bind(Math.floor(Date.now() / 1000)).run();
  }
}

async function verifyTurnstile(token, secretKey) {
  if (!token) return false;
  if (!secretKey) {
    console.warn('TURNSTILE_SECRET_KEY not configured');
    return false;
  }

  try {
    const resp = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`,
    });
    const result = await resp.json();
    console.log('Turnstile verify result:', result);
    return result.success ?? false;
  } catch (e) {
    console.error('Turnstile fetch error:', e);
    return false; // fail-closed: 验证异常时拒绝
  }
}

async function checkCreateRateLimit(kv, ip) {
  const key = `ratelimit:${ip}`;
  const raw = await kv.get(key);
  const now = Math.floor(Date.now() / 1000);

  let records = raw ? JSON.parse(raw) : [];
  // filter to last 24 hours
  records = records.filter((r) => now - r < 86400);

  if (records.length >= 2) {
    return { allowed: false, records };
  }

  records.push(now);
  await kv.put(key, JSON.stringify(records), { expirationTtl: 86400 });
  return { allowed: true, records };
}

async function handleCreateRoom(request, env) {
  const body = await request.json();
  const turnstileToken = body['cf-turnstile-response'] || body.turnstile_token || '';
  const customRoomCode = (body.room_code || '').trim();
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';

  // rate limit and turnstile check (turnstile is optional for self-hosted deployments)
  const turnstileEnabled = env.ENABLE_TURNSTILE !== 'false' && Boolean(env.TURNSTILE_SECRET_KEY);
  if (turnstileEnabled) {
    const rateCheck = await checkCreateRateLimit(env.SHARE_TEXT, clientIp);
    if (!rateCheck.allowed) {
      if (!turnstileToken) {
        return jsonResponse({ success: false, code: RC.CAPTCHA_REQUIRED, require_captcha: true, message: '单个 IP 一天只能免费创建 2 个房间，继续创建请完成人机验证' });
      }
      const verified = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY);
      if (!verified) {
        return jsonResponse({ success: false, code: RC.CAPTCHA_FAILED, message: '验证失败，请重试' }, 400);
      }
    }
  }

  // generate unique room code
  let roomCode;

  if (customRoomCode && /^\d{6}$/.test(customRoomCode)) {
    const existing = await env.SHARE_TEXT.get(`room:${customRoomCode}`);
    if (!existing) {
      roomCode = customRoomCode;
    }
  }

  if (!roomCode) {
    let attempts = 0;
    do {
      roomCode = generateRoomCode();
      const existing = await env.SHARE_TEXT.get(`room:${roomCode}`);
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      return jsonResponse({ success: false, code: RC.ROOM_CODE_GENERATION_FAILED, message: '无法生成房间号，请重试' }, 500);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const room = {
    code: roomCode,
    created_at: now,
    last_activity: now,
    text_content: '',
    devices: {
      [SYSTEM_KEEPER_ID]: {
        id: SYSTEM_KEEPER_ID,
        ip: 'System',
        user_agent: 'Keeper',
        joined_at: now,
        last_seen: now,
      },
    },
    signals: [],
    creator_ip: clientIp,
  };

  // cleanup expired rooms
  env.SHARE_TEXT.cleanup().catch(() => {});

  await env.SHARE_TEXT.put(`room:${roomCode}`, JSON.stringify(room), { expirationTtl: ROOM_TTL });

  return jsonResponse({ success: true, code: RC.ROOM_CREATED, room_code: roomCode, message: '房间创建成功' });
}

async function handleJoinRoom(request, env) {
  const body = await request.json();
  const roomCode = (body.room_code || '').trim();
  const storedDeviceId = body.device_id || '';
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const userAgent = request.headers.get('User-Agent') || '';

  if (!roomCode || !/^\d{6}$/.test(roomCode)) {
    return jsonResponse({ success: false, code: RC.INVALID_ROOM_CODE, message: '房间号格式不正确' }, 400);
  }

  const raw = await env.SHARE_TEXT.get(`room:${roomCode}`);
  if (!raw) {
    return jsonResponse({ success: false, code: RC.ROOM_NOT_FOUND, message: '房间不存在' }, 400);
  }

  const room = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);

  // clean stale devices
  for (const [did, dev] of Object.entries(room.devices)) {
    if (did !== SYSTEM_KEEPER_ID && now - dev.last_seen > 60) {
      delete room.devices[did];
    }
  }

  // count non-keeper devices
  const deviceCount = Object.keys(room.devices).filter((d) => d !== SYSTEM_KEEPER_ID).length;
  if (deviceCount >= MAX_DEVICES_PER_ROOM) {
    return jsonResponse({ success: false, code: RC.ROOM_FULL, message: '房间设备已满（最多10个）' }, 400);
  }

  const deviceId = storedDeviceId || crypto.randomUUID().slice(0, 13);
  room.devices[deviceId] = {
    id: deviceId,
    ip: clientIp,
    user_agent: userAgent,
    joined_at: now,
    last_seen: now,
  };
  room.devices[SYSTEM_KEEPER_ID].last_seen = now;
  room.last_activity = now;

  await env.SHARE_TEXT.put(`room:${roomCode}`, JSON.stringify(room), { expirationTtl: ROOM_TTL });

  const devices = {};
  for (const [did, dev] of Object.entries(room.devices)) {
    if (did !== SYSTEM_KEEPER_ID) {
      devices[did] = {
        id: dev.id,
        last_seen: dev.last_seen
      };
    }
  }

  return jsonResponse({
    success: true,
    code: RC.ROOM_JOINED,
    device_id: deviceId,
    room_code: roomCode,
    text_content: room.text_content,
    devices,
    message: '成功加入房间',
  });
}

async function handleUpdateText(request, env) {
  const body = await request.json();
  const roomCode = body.room_code || '';
  const deviceId = body.device_id || '';
  const textContent = body.text_content || '';

  if (!roomCode || !deviceId) {
    return jsonResponse({ success: false, code: RC.MISSING_PARAMETERS, message: '缺少必要参数' }, 400);
  }

  if (textContent.length > 10000) {
    return jsonResponse({ success: false, code: RC.TEXT_TOO_LONG, message: '文本过长（最大 10,000 字符）' }, 400);
  }

  const raw = await env.SHARE_TEXT.get(`room:${roomCode}`);
  if (!raw) {
    return jsonResponse({ success: false, code: RC.ROOM_NOT_FOUND, message: '房间不存在' }, 400);
  }

  const room = JSON.parse(raw);

  if (deviceId === SYSTEM_KEEPER_ID || !room.devices[deviceId]) {
    return jsonResponse({ success: false, code: RC.DEVICE_NOT_IN_ROOM, message: '设备未加入房间' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  room.text_content = textContent;
  room.last_activity = now;
  room.devices[deviceId].last_seen = now;
  room.devices[SYSTEM_KEEPER_ID].last_seen = now;

  await env.SHARE_TEXT.put(`room:${roomCode}`, JSON.stringify(room), { expirationTtl: ROOM_TTL });

  const devices = {};
  for (const [did, dev] of Object.entries(room.devices)) {
    if (did !== SYSTEM_KEEPER_ID) {
      devices[did] = {
        id: dev.id,
        last_seen: dev.last_seen
      };
    }
  }

  return jsonResponse({ success: true, code: RC.TEXT_UPDATED, message: '文本更新成功', timestamp: now, devices, last_update: now });
}

async function handleGetRoomStatus(url, env) {
  const roomCode = url.searchParams.get('room_code') || '';
  const deviceId = url.searchParams.get('device_id') || '';

  if (!roomCode || !deviceId) {
    return jsonResponse({ success: false, code: RC.MISSING_PARAMETERS, message: '缺少必要参数' }, 400);
  }

  const raw = await env.SHARE_TEXT.get(`room:${roomCode}`);
  if (!raw) {
    return jsonResponse({ success: false, code: RC.ROOM_NOT_FOUND, message: '房间不存在' }, 400);
  }

  const room = JSON.parse(raw);

  if (deviceId === SYSTEM_KEEPER_ID || !room.devices[deviceId]) {
    return jsonResponse({ success: false, code: RC.DEVICE_NOT_IN_ROOM, message: '设备未加入房间' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  
  let needsUpdate = false;
  if (now - room.devices[deviceId].last_seen > 30) {
    room.devices[deviceId].last_seen = now;
    needsUpdate = true;
  }
  if (now - room.devices[SYSTEM_KEEPER_ID].last_seen > 30) {
    room.devices[SYSTEM_KEEPER_ID].last_seen = now;
    needsUpdate = true;
  }
  
  // Clean up old signals (older than 3 minutes)
  if (!room.signals) room.signals = [];
  const originalSignalsCount = room.signals.length;
  room.signals = room.signals.filter(s => now - s.timestamp < 180);
  
  if (room.signals.length !== originalSignalsCount) {
    needsUpdate = true;
  }

  if (needsUpdate) {
    room.last_activity = now;
    await env.SHARE_TEXT.put(`room:${roomCode}`, JSON.stringify(room), { expirationTtl: ROOM_TTL });
  }

  const devices = {};
  for (const [did, dev] of Object.entries(room.devices)) {
    if (did !== SYSTEM_KEEPER_ID) {
      devices[did] = {
        id: dev.id,
        last_seen: dev.last_seen
      };
    }
  }

  // Extract signals destined for this device
  const mySignals = room.signals.filter(s => s.to === deviceId);

  return jsonResponse({
    success: true,
    code: RC.ROOM_STATUS,
    text_content: room.text_content,
    devices,
    signals: mySignals,
    last_update: room.last_activity,
  });
}

async function handleSignal(request, env) {
  const body = await request.json();
  const roomCode = body.room_code || '';
  const deviceId = body.device_id || ''; // Sender
  const targetId = body.to_device_id || ''; // Receiver
  const signalData = body.signal_data || null;

  if (!roomCode || !deviceId || !targetId || !signalData) {
    console.warn('Signal request is missing required room or device fields');
    return jsonResponse({ success: false, code: RC.MISSING_PARAMETERS, message: '缺少必要参数' }, 400);
  }

  const raw = await env.SHARE_TEXT.get(`room:${roomCode}`);
  if (!raw) {
    return jsonResponse({ success: false, code: RC.ROOM_NOT_FOUND, message: '房间不存在' }, 400);
  }

  const room = JSON.parse(raw);
  if (!room.devices[deviceId] || !room.devices[targetId]) {
    return jsonResponse({ success: false, code: RC.DEVICE_NOT_IN_ROOM, message: '设备未加入房间' }, 400);
  }

  if (!room.signals) room.signals = [];
  
  const now = Math.floor(Date.now() / 1000);
  room.signals.push({
    id: crypto.randomUUID(),
    from: deviceId,
    to: targetId,
    data: signalData,
    timestamp: now
  });
  
  // Clean up old signals
  room.signals = room.signals.filter(s => now - s.timestamp < 180);
  
  // Cap max signals to prevent unbounded growth
  if (room.signals.length > 50) {
    room.signals = room.signals.slice(-50);
  }
  
  room.last_activity = now;

  await env.SHARE_TEXT.put(`room:${roomCode}`, JSON.stringify(room), { expirationTtl: ROOM_TTL });

  return jsonResponse({ success: true, code: RC.SIGNAL_SENT, message: '信令发送成功' });
}

async function handleLeaveRoom(request, env) {
  const body = await request.json();
  const roomCode = body.room_code || '';
  const deviceId = body.device_id || '';

  if (!roomCode || !deviceId) {
    return jsonResponse({ success: false, code: RC.MISSING_PARAMETERS, message: '缺少必要参数' }, 400);
  }

  const raw = await env.SHARE_TEXT.get(`room:${roomCode}`);
  if (raw) {
    const room = JSON.parse(raw);
    if (room.devices[deviceId] && deviceId !== SYSTEM_KEEPER_ID) {
      delete room.devices[deviceId];
      room.last_activity = Math.floor(Date.now() / 1000);
      await env.SHARE_TEXT.put(`room:${roomCode}`, JSON.stringify(room), { expirationTtl: ROOM_TTL });
    }
  }

  return jsonResponse({ success: true, code: RC.ROOM_LEFT, message: '已离开房间' });
}

async function handleDestroyRoom(request, env) {
  const body = await request.json();
  const roomCode = body.room_code || '';
  const deviceId = body.device_id || '';

  if (!roomCode || !deviceId) {
    return jsonResponse({ success: false, code: RC.MISSING_PARAMETERS, message: '缺少必要参数' }, 400);
  }

  const raw = await env.SHARE_TEXT.get(`room:${roomCode}`);
  if (!raw) {
    return jsonResponse({ success: false, code: RC.ROOM_NOT_FOUND, message: '房间不存在' }, 404);
  }

  const room = JSON.parse(raw);
  if (deviceId === SYSTEM_KEEPER_ID || !room.devices[deviceId]) {
    return jsonResponse({ success: false, code: RC.FORBIDDEN, message: '无权操作' }, 403);
  }

  await env.SHARE_TEXT.delete(`room:${roomCode}`);
  return jsonResponse({ success: true, code: RC.ROOM_DESTROYED, message: '房间已销毁' });
}

async function handleCheckRoom(url, env) {
  const roomCode = url.searchParams.get('room_code') || '';

  if (!roomCode || !/^\d{6}$/.test(roomCode)) {
    return jsonResponse({ success: false, code: RC.INVALID_ROOM_CODE, message: '房间号格式不正确' }, 400);
  }

  const raw = await env.SHARE_TEXT.get(`room:${roomCode}`);
  let deviceCount = 0;

  if (raw) {
    const room = JSON.parse(raw);
    deviceCount = Object.keys(room.devices).filter((d) => d !== SYSTEM_KEEPER_ID).length;
  }

  return jsonResponse({
    success: true,
    code: RC.ROOM_CHECKED,
    exists: !!raw,
    device_count: deviceCount,
  });
}

// Route handler map
export async function onRequest(context) {
  const { request, env, params } = context;
  const action = params.action?.[0] || '';

  const origin = request.headers.get('Origin');
  const allowed = env?.ALLOWED_ORIGIN || '*';
  const corsOrigin = (allowed === '*' || !allowed) ? (origin || '*') : (allowed === origin ? origin : allowed);

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();

  if (clientIp !== 'unknown') {
    // Memory cleanup
    if (Math.random() < 0.05) {
      for (const [ip, data] of ipBlocklist.entries()) {
        if (now > data.resetTime) ipBlocklist.delete(ip);
      }
    }

    const record = ipBlocklist.get(clientIp) || { count: 0, resetTime: now + 10000 };
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + 10000;
    } else {
      record.count++;
    }
    ipBlocklist.set(clientIp, record);

    // Block if > 30 requests per 10 seconds per isolate
    if (record.count > 30) {
      record.resetTime = now + 60000; // block for 60s
      return jsonResponse({ success: false, code: RC.RATE_LIMITED, message: '请求过于频繁，请稍后再试' }, 429);
    }
  }

  const url = new URL(request.url);
  env.SHARE_TEXT = new D1KVAdapter(env.DB);

  try {
    switch (action) {
      case 'create_room':
        if (request.method !== 'POST') return jsonResponse({ success: false, code: RC.METHOD_NOT_ALLOWED, message: 'Method not allowed' }, 405);
        return await handleCreateRoom(request, env);

      case 'join_room':
        if (request.method !== 'POST') return jsonResponse({ success: false, code: RC.METHOD_NOT_ALLOWED, message: 'Method not allowed' }, 405);
        return await handleJoinRoom(request, env);

      case 'update_text':
        if (request.method !== 'POST') return jsonResponse({ success: false, code: RC.METHOD_NOT_ALLOWED, message: 'Method not allowed' }, 405);
        return await handleUpdateText(request, env);

      case 'get_room_status':
        if (request.method !== 'GET') return jsonResponse({ success: false, code: RC.METHOD_NOT_ALLOWED, message: 'Method not allowed' }, 405);
        return await handleGetRoomStatus(url, env);

      case 'signal':
        if (request.method !== 'POST') return jsonResponse({ success: false, code: RC.METHOD_NOT_ALLOWED, message: 'Method not allowed' }, 405);
        return await handleSignal(request, env);

      case 'leave_room':
        if (request.method !== 'POST') return jsonResponse({ success: false, code: RC.METHOD_NOT_ALLOWED, message: 'Method not allowed' }, 405);
        return await handleLeaveRoom(request, env);

      case 'destroy_room':
        if (request.method !== 'POST') return jsonResponse({ success: false, code: RC.METHOD_NOT_ALLOWED, message: 'Method not allowed' }, 405);
        return await handleDestroyRoom(request, env);

      case 'check_room':
        if (request.method !== 'GET') return jsonResponse({ success: false, code: RC.METHOD_NOT_ALLOWED, message: 'Method not allowed' }, 405);
        return await handleCheckRoom(url, env);

      default:
        return jsonResponse({ success: false, code: RC.UNKNOWN_ACTION, message: '未知操作' }, 400);
    }
  } catch (e) {
    console.error('Text share request failed', e);
    return jsonResponse({ success: false, code: RC.INTERNAL_ERROR, message: '服务器内部错误' }, 500);
  }
}
