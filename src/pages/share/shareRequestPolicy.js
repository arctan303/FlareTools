import { CONNECTION_RETRY_BASE_MS, CONNECTION_RETRY_MAX_MS } from './shareLimits.js';

export function createLatestSaveQueue({
  initialContent = '',
  onError = () => {},
  onSaved = () => {},
  onSaving = () => {},
  canSave = () => true,
  requestSave,
}) {
  let desiredContent = initialContent;
  let lastSavedContent = initialContent;
  let activePromise = null;
  let destroyed = false;
  let draining = false;

  const drain = async () => {
    draining = true;
    try {
      while (!destroyed && canSave() && desiredContent !== lastSavedContent) {
        const contentToSave = desiredContent;
        onSaving(contentToSave);

        try {
          const response = await requestSave(contentToSave);
          if (destroyed) return;
          lastSavedContent = contentToSave;
          onSaved(response, contentToSave);
        } catch (error) {
          if (destroyed) return;
          onError(error, contentToSave);

          // If the editor changed during the failed request, still give the latest
          // version one chance. Retrying the same value automatically could burn
          // quota indefinitely, so an unchanged failed value waits for user input.
          if (!canSave() || desiredContent === contentToSave) return;
        }
      }
    } finally {
      draining = false;
    }
  };

  const flush = () => {
    if (destroyed || !canSave() || desiredContent === lastSavedContent) {
      return activePromise || Promise.resolve();
    }

    // A new enqueue can run between drain settling and its finally callback.
    // Wait for that callback to release the queue, then flush the new draft.
    if (activePromise && !draining) return activePromise.then(flush);

    if (!activePromise) {
      activePromise = drain().finally(() => {
        activePromise = null;
      });
    }

    return activePromise;
  };

  return {
    destroy() {
      destroyed = true;
    },
    enqueue(content) {
      desiredContent = content;
      return flush();
    },
    flush,
    getSnapshot() {
      return {
        desiredContent,
        inFlight: Boolean(activePromise),
        lastSavedContent,
      };
    },
    markSaved(content) {
      desiredContent = content;
      lastSavedContent = content;
    },
    setDesired(content) {
      desiredContent = content;
    },
  };
}

export function buildRoomStatusUrl(roomCode, deviceId) {
  const params = new URLSearchParams({
    room_code: roomCode,
    device_id: deviceId,
  });
  return `/api/text-share/get_room_status?${params.toString()}`;
}

export function buildRoomConnectUrl(roomCode, deviceId, pageUrl) {
  const url = new URL('/api/text-share/connect', pageUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.search = new URLSearchParams({ room_code: roomCode, device_id: deviceId }).toString();
  return url.toString();
}

export function formatRoomTimestamp(timestamp, lang) {
  if (!timestamp) return '';
  const locale = lang === 'zh-CN' ? 'zh-CN' : 'en-US';
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp * 1000));
}

export async function readJsonResponse(response) {
  const data = await response.json();
  if (!response.ok || !data.success) {
    const error = new Error(data.message || `HTTP ${response.status}`);
    error.response = data;
    throw error;
  }
  return data;
}

/**
 * Fetch the room's authoritative text exactly once.
 *
 * Pulling never touches the clipboard: copying is a separate, explicit action so
 * a glance at the remote text can never clobber what the user had copied.
 */
export async function pullLatest({ isCurrent = () => true, onContent, requestStatus }) {
  const data = await requestStatus();
  const content = data.text_content || '';
  const applied = isCurrent();
  if (applied) onContent(content, data);
  return { applied, content, data };
}

/**
 * Receives revision metadata through one hibernating WebSocket per member.
 *
 * The baseline is whatever revision the caller last observed itself (join, pull
 * or its own successful save), so an edit made by this device never reports
 * itself as a remote update. Reconnecting gets an initial version message from
 * the server, recovering missed notifications without fetching text or polling.
 */
export function createContentWatcher({
  clearTimeoutFn = clearTimeout,
  createSocket = (url) => new WebSocket(url),
  onConnectionState = () => {},
  onDevices = () => {},
  onMetadata = () => {},
  onRoomClosed = () => {},
  onVersionChange = () => {},
  randomFn = Math.random,
  setTimeoutFn = setTimeout,
  url,
}) {
  let active = false;
  let ended = false;
  let lastVersion = 0;
  let retryAttempt = 0;
  let retryTimer = null;
  let socket = null;
  let removeListeners = () => {};
  let state = 'closed';

  const setState = (next) => {
    if (state === next) return;
    state = next;
    onConnectionState(next);
  };

  const disconnect = () => {
    removeListeners();
    removeListeners = () => {};
    const previousSocket = socket;
    socket = null;
    try { previousSocket?.close(); } catch { /* Closing a failed connection is best-effort. */ }
  };

  const stop = () => {
    active = false;
    if (retryTimer !== null) clearTimeoutFn(retryTimer);
    retryTimer = null;
    disconnect();
    setState('closed');
  };

  const connect = () => {
    if (!active || ended) return;
    retryTimer = null;
    setState(retryAttempt === 0 ? 'connecting' : 'reconnecting');

    const scheduleRetry = () => {
      if (!active || ended || retryTimer !== null) return;
      disconnect();
      setState('reconnecting');
      const delay = Math.round(Math.min(CONNECTION_RETRY_MAX_MS,
        CONNECTION_RETRY_BASE_MS * (2 ** Math.min(retryAttempt, 6)) * (0.8 + randomFn() * 0.4)));
      retryAttempt += 1;
      retryTimer = setTimeoutFn(connect, delay);
    };

    let current;
    try {
      current = createSocket(url);
      socket = current;
    } catch {
      scheduleRetry();
      return;
    }

    const onOpen = () => {
      if (!active || current !== socket) return;
      retryAttempt = 0;
      setState('live');
    };
    const onMessage = (event) => {
      if (!active || current !== socket) return;
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (!data || typeof data !== 'object') return;
      if (data.type === 'room_closed' && ['expired', 'destroyed', 'left'].includes(data.reason)) {
        ended = true;
        stop();
        onRoomClosed(data);
        return;
      }
      if (data.type === 'devices') {
        if (data.devices && typeof data.devices === 'object') onDevices(data.devices);
        return;
      }
      if (data.type !== 'version' || !Number.isInteger(data.version) || data.version < 0) return;
      if (data.version < lastVersion) return;
      onMetadata(data);
      if (data.devices && typeof data.devices === 'object') onDevices(data.devices);
      if (data.version <= lastVersion) return;
      const previous = lastVersion;
      lastVersion = data.version;
      onVersionChange(data, previous);
    };
    const onDisconnect = (event) => {
      if (current !== socket) return;
      if (event.code === 4001) {
        ended = true;
        stop();
        onRoomClosed({ type: 'room_closed', reason: ['expired', 'destroyed', 'left'].includes(event.reason) ? event.reason : 'expired' });
        return;
      }
      if (event.code === 4000) {
        // A newer tab claimed the same membership. Do not fight over the socket.
        stop();
        return;
      }
      if (current === socket) scheduleRetry();
    };
    current.addEventListener('open', onOpen);
    current.addEventListener('message', onMessage);
    current.addEventListener('error', onDisconnect);
    current.addEventListener('close', onDisconnect);
    removeListeners = () => {
      current.removeEventListener('open', onOpen);
      current.removeEventListener('message', onMessage);
      current.removeEventListener('error', onDisconnect);
      current.removeEventListener('close', onDisconnect);
    };
  };

  return {
    getState: () => state,
    isRunning: () => active,
    setBaseline: (version) => {
      if (Number.isInteger(version)) lastVersion = Math.max(lastVersion, version);
    },
    start: () => {
      if (active || ended) return;
      active = true;
      retryAttempt = 0;
      connect();
    },
    stop,
  };
}
