import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getApiErrorMessage } from '../../../locales/errorCodes.js';
import { MAX_TEXT_LENGTH } from '../shareLimits.js';
import {
  buildRoomConnectUrl,
  buildRoomStatusUrl,
  createContentWatcher,
  createLatestSaveQueue,
  formatRoomTimestamp,
  pullLatest,
  readJsonResponse,
} from '../shareRequestPolicy.js';

const SAVE_DELAY_MS = 1500;

function roomRequest(action, body) {
  return fetch(`/api/text-share/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function asVersion(value, fallback = 0) {
  return Number.isInteger(value) ? value : fallback;
}

export default function useTextRoom({ lang, onCaptchaRequired, t }) {
  const [conflict, setConflict] = useState(null);
  const conflictRef = useRef(null);
  const setConflictState = useCallback((next) => {
    conflictRef.current = next;
    setConflict(next);
  }, []);
  const [content, setContent] = useState('');
  const [connectionState, setConnectionState] = useState('closed');
  const [deviceId, setDeviceId] = useState(() => localStorage.getItem('share_device_id') || '');
  const [devices, setDevices] = useState({});
  const [error, setError] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [inRoom, setInRoom] = useState(false);
  const [lastEditor, setLastEditor] = useState('');
  const [lastUpdateTimestamp, setLastUpdateTimestamp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [publicDeviceId, setPublicDeviceId] = useState('');
  const [remoteUpdated, setRemoteUpdated] = useState(null);
  const remoteUpdatedRef = useRef(null);
  const setRemoteUpdateState = useCallback((next) => {
    remoteUpdatedRef.current = next;
    setRemoteUpdated(next);
  }, []);
  const [roomCode, setRoomCode] = useState('');
  const [roomEnded, setRoomEnded] = useState(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  const autoJoinStartedRef = useRef(false);
  const baseVersionRef = useRef(0);
  const contentRef = useRef('');
  const destroyPromiseRef = useRef(null);
  const deviceIdRef = useRef(deviceId);
  const editRevisionRef = useRef(0);
  const enterPromiseRef = useRef(null);
  const leavePromiseRef = useRef(null);
  const mountedRef = useRef(true);
  const pullPromiseRef = useRef(null);
  const publicDeviceIdRef = useRef('');
  const roomCodeRef = useRef(roomCode);
  const roomEndedRef = useRef(null);
  const roomSessionRef = useRef(0);
  const saveQueueRef = useRef(null);
  const statusTimerRef = useRef(null);
  const tRef = useRef(t);
  const typingTimerRef = useRef(null);
  const watcherRef = useRef(null);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    deviceIdRef.current = deviceId;
    roomCodeRef.current = roomCode;
  }, [deviceId, roomCode]);

  const showStatus = useCallback((message, tone = 'info', temporary = false) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatus({ message, tone });
    if (temporary) {
      statusTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setStatus(null);
      }, 2400);
    }
  }, []);

  /**
   * The single entry point for implicit saves.
   *
   * After a VERSION_CONFLICT the queue baseline has already been advanced to the
   * other device's revision. Any save issued from that state looks "up to date"
   * to the server and would silently clobber the other device, so an unresolved
   * conflict has to block *every* implicit save path — the typing debounce,
   * clipboard paste, manual retry and leaving the room. Only the explicit
   * "keep mine" choice in the conflict banner is allowed to write.
   */
  const enqueueGuarded = useCallback((nextContent) => {
    if (conflictRef.current || roomEndedRef.current) return null;
    return saveQueueRef.current?.enqueue(nextContent) ?? null;
  }, []);

  const blockedByConflict = useCallback(() => {
    if (!conflictRef.current) return false;
    showStatus(tRef.current('share_conflict_title'), 'warning');
    return true;
  }, [showStatus]);

  const endRoom = useCallback((reason = 'expired') => {
    if (!mountedRef.current || roomEndedRef.current) return;
    const ended = { reason };
    roomEndedRef.current = ended;
    setRoomEnded(ended);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    watcherRef.current?.stop();
    saveQueueRef.current?.destroy();
    setDevices({});
    setSaving(false);
    setSaveFailed(false);
    setRemoteUpdateState(null);
    setConflictState(null);
    localStorage.removeItem('last_room_code');
    showStatus(tRef.current(reason === 'destroyed' ? 'share_room_destroyed'
      : reason === 'left' ? 'share_room_left' : 'share_room_expired'), 'warning');
  }, [setConflictState, setRemoteUpdateState, showStatus]);

  const blockedByEndedRoom = useCallback(() => {
    const ended = roomEndedRef.current;
    if (!ended) return false;
    showStatus(tRef.current(ended.reason === 'destroyed' ? 'share_room_destroyed'
      : ended.reason === 'left' ? 'share_room_left' : 'share_room_expired'), 'warning');
    return true;
  }, [showStatus]);

  const syncExpiry = useCallback((data) => {
    if (Number.isFinite(data?.expires_at)) setExpiresAt(data.expires_at);
  }, []);

  const lastUpdate = useMemo(() => {
    return formatRoomTimestamp(lastUpdateTimestamp, lang);
  }, [lang, lastUpdateTimestamp]);

  const overLimit = content.length > MAX_TEXT_LENGTH;

  const syncBaseline = useCallback((version) => {
    baseVersionRef.current = asVersion(version, baseVersionRef.current);
    watcherRef.current?.setBaseline(baseVersionRef.current);
  }, []);

  const configureSaveQueue = useCallback((nextRoomCode, nextDeviceId, initialContent) => {
    saveQueueRef.current?.destroy();
    saveQueueRef.current = createLatestSaveQueue({
      initialContent,
      canSave: () => !conflictRef.current && !roomEndedRef.current,
      requestSave: async (textContent) => {
        const response = await roomRequest('update_text', {
          room_code: nextRoomCode,
          device_id: nextDeviceId,
          text_content: textContent,
          base_version: baseVersionRef.current,
        });
        return readJsonResponse(response);
      },
      onSaving: () => {
        if (!mountedRef.current || roomEndedRef.current) return;
        setSaveFailed(false);
        setSaving(true);
        showStatus(tRef.current('share_saving'));
      },
      onSaved: (data) => {
        if (!mountedRef.current || roomEndedRef.current) return;
        syncBaseline(data.version);
        syncExpiry(data);
        setConflictState(null);
        if (!remoteUpdatedRef.current || remoteUpdatedRef.current.version <= asVersion(data.version)) {
          setRemoteUpdateState(null);
        }
        setDevices(data.devices || {});
        setLastEditor(data.content_updated_by || '');
        setLastUpdateTimestamp(data.last_update || data.timestamp || null);
        setSaveFailed(false);
        setSaving(false);
        showStatus(tRef.current('share_saved'), 'success', true);
      },
      onError: (requestError) => {
        if (!mountedRef.current || roomEndedRef.current) return;
        const payload = requestError.response;

        if (payload?.code === 'ROOM_NOT_FOUND') {
          endRoom('expired');
          return;
        }

        // Another device saved in between. Keep the local draft in the editor and
        // let the user choose which side wins instead of dropping the edit.
        if (payload?.code === 'VERSION_CONFLICT') {
          syncBaseline(payload.current_version);
          setConflictState({
            remoteContent: payload.text_content || '',
            remoteUpdatedAt: payload.content_updated_at || 0,
          });
          setSaveFailed(false);
          setSaving(false);
          showStatus(tRef.current('share_conflict_title'), 'warning');
          return;
        }

        const message = payload
          ? (payload.code === 'TEXT_TOO_LONG'
            ? tRef.current('share_over_limit')
            : getApiErrorMessage(payload, tRef.current))
          : tRef.current('share_network_error');
        setSaveFailed(true);
        setSaving(false);
        showStatus(message, 'error');
      },
    });
  }, [endRoom, setConflictState, setRemoteUpdateState, showStatus, syncBaseline, syncExpiry]);

  const enterRoom = useCallback((mode, requestedCode = '', captchaToken = null) => {
    if (enterPromiseRef.current) return enterPromiseRef.current;

    enterPromiseRef.current = (async () => {
      setLoading(true);
      setError('');
      let codeToJoin = requestedCode.trim();
      let shouldCreate = mode === 'create';

      try {
        while (true) {
          if (shouldCreate) {
            const createBody = {};
            if (captchaToken) createBody['cf-turnstile-response'] = captchaToken;
            if (codeToJoin) createBody.room_code = codeToJoin;

            const createResponse = await roomRequest('create_room', createBody);
            const createData = await createResponse.json();
            if (!createResponse.ok || !createData.success) {
              if (createData.require_captcha) {
                onCaptchaRequired({ action: 'create', roomCode: codeToJoin });
                return;
              }
              throw Object.assign(new Error(createData.message), { response: createData });
            }
            codeToJoin = createData.room_code;
            shouldCreate = false;
          }

          if (!/^\d{6}$/.test(codeToJoin)) {
            setError(t('share_enter_code'));
            return;
          }

          const joinBody = { room_code: codeToJoin, device_id: deviceId };
          if (captchaToken && mode === 'join') joinBody['cf-turnstile-response'] = captchaToken;

          const joinResponse = await roomRequest('join_room', joinBody);
          const joinData = await joinResponse.json();
          if (!joinResponse.ok || !joinData.success) {
            if (joinData.require_captcha) {
              onCaptchaRequired({ action: 'join', roomCode: codeToJoin });
              return;
            }
            if (joinData.code === 'ROOM_NOT_FOUND' && localStorage.getItem('last_room_code') === codeToJoin) {
              localStorage.removeItem('last_room_code');
            }
            throw Object.assign(new Error(joinData.message), { response: joinData });
          }

          if (!mountedRef.current) return;
          roomSessionRef.current += 1;
          const joinedText = joinData.text_content || '';
          contentRef.current = joinedText;
          setContent(joinedText);
          setConflictState(null);
          roomEndedRef.current = null;
          setRoomEnded(null);
          deviceIdRef.current = joinData.device_id;
          roomCodeRef.current = joinData.room_code;
          setDeviceId(joinData.device_id);
          publicDeviceIdRef.current = joinData.public_device_id || '';
          setPublicDeviceId(joinData.public_device_id || '');
          setDevices(joinData.devices || {});
          setInRoom(true);
          setLastEditor(joinData.content_updated_by || '');
          setLastUpdateTimestamp(joinData.last_update || joinData.timestamp || null);
          setRemoteUpdateState(null);
          setRoomCode(joinData.room_code);
          syncBaseline(joinData.version);
          syncExpiry(joinData);
          localStorage.setItem('share_device_id', joinData.device_id);
          localStorage.setItem('last_room_code', joinData.room_code);
          configureSaveQueue(joinData.room_code, joinData.device_id, joinedText);
          showStatus(t('share_joined'), 'success', true);
          return;
        }
      } catch (requestError) {
        if (!mountedRef.current) return;
        setError(requestError.response
          ? getApiErrorMessage(requestError.response, t)
          : t('share_network_error'));
      } finally {
        if (mountedRef.current) setLoading(false);
        enterPromiseRef.current = null;
      }
    })();

    return enterPromiseRef.current;
  }, [configureSaveQueue, deviceId, onCaptchaRequired, setConflictState, setRemoteUpdateState, showStatus, syncBaseline, syncExpiry, t]);

  const createRoom = useCallback((captchaToken = null, customRoomCode = '') => (
    enterRoom('create', customRoomCode, captchaToken)
  ), [enterRoom]);

  const joinRoom = useCallback((code = roomCode, captchaToken = null) => (
    enterRoom('join', code, captchaToken)
  ), [enterRoom, roomCode]);

  useEffect(() => {
    if (autoJoinStartedRef.current) return;
    autoJoinStartedRef.current = true;

    const url = new URL(window.location.href);
    const roomFromUrl = url.searchParams.get('room');
    const savedRoom = localStorage.getItem('last_room_code');
    const candidate = roomFromUrl || savedRoom;

    if (roomFromUrl) {
      url.searchParams.delete('room');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }

    if (candidate && /^\d{6}$/.test(candidate)) {
      joinRoom(candidate);
    }
  }, [joinRoom]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      // A refresh disconnects presence but retains membership for reconnecting.
      watcherRef.current?.stop();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // An idle room keeps a hibernating connection; it sends no HTTP heartbeats.
  useEffect(() => {
    if (!inRoom || !roomCode || !deviceId || roomEnded) {
      watcherRef.current?.stop();
      return undefined;
    }
    const watcher = createContentWatcher({
      url: buildRoomConnectUrl(roomCode, deviceId, window.location.href),
      onConnectionState: (next) => {
        if (mountedRef.current) setConnectionState(next);
      },
      onMetadata: (data) => {
        if (mountedRef.current) syncExpiry(data);
      },
      onDevices: (nextDevices) => {
        if (mountedRef.current) setDevices(nextDevices);
      },
      onRoomClosed: (data) => endRoom(data.reason),
      onVersionChange: (data) => {
        if (!mountedRef.current) return;
        if (data.content_updated_by && data.content_updated_by === publicDeviceIdRef.current
          && saveQueueRef.current?.getSnapshot().inFlight) return;
        setRemoteUpdateState({
          version: asVersion(data.version),
          at: data.content_updated_at || 0,
          by: data.content_updated_by || '',
        });
      },
    });
    watcherRef.current = watcher;
    watcher.setBaseline(baseVersionRef.current);
    watcher.start();
    return () => {
      watcher.stop();
      if (watcherRef.current === watcher) watcherRef.current = null;
    };
  }, [deviceId, endRoom, inRoom, roomCode, roomEnded, setRemoteUpdateState, syncExpiry]);

  useEffect(() => {
    if (!inRoom || roomEnded || !Number.isFinite(expiresAt)) return undefined;
    const timer = setTimeout(() => endRoom('expired'), Math.max(0, expiresAt * 1000 - Date.now()));
    return () => clearTimeout(timer);
  }, [endRoom, expiresAt, inRoom, roomEnded]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      watcherRef.current?.stop();
      saveQueueRef.current?.destroy();
    };
  }, []);

  const changeContent = useCallback((nextContent) => {
    editRevisionRef.current += 1;
    contentRef.current = nextContent;
    setContent(nextContent);
    setSaveFailed(false);
    saveQueueRef.current?.setDesired(nextContent);
    if (blockedByEndedRoom()) return;
    showStatus(t('share_typing'));

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      // An unresolved conflict must not be auto-resolved in our favour just
      // because the user kept typing. Wait for an explicit choice.
      enqueueGuarded(contentRef.current);
    }, SAVE_DELAY_MS);
  }, [blockedByEndedRoom, enqueueGuarded, showStatus, t]);

  const saveContentNow = useCallback((nextContent) => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    editRevisionRef.current += 1;
    contentRef.current = nextContent;
    setContent(nextContent);
    setSaveFailed(false);
    saveQueueRef.current?.setDesired(nextContent);
    // Pasting is an implicit save too: it must not resolve a pending conflict.
    if (blockedByEndedRoom() || blockedByConflict()) return Promise.resolve();
    return enqueueGuarded(nextContent) || Promise.resolve();
  }, [blockedByConflict, blockedByEndedRoom, enqueueGuarded]);

  const pasteAndSave = useCallback(async () => {
    try {
      const pastedText = await navigator.clipboard.readText();
      await saveContentNow(pastedText);
    } catch {
      showStatus(t('share_paste_failed'), 'error');
    }
  }, [saveContentNow, showStatus, t]);

  const copyContent = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(contentRef.current);
      showStatus(t('share_copied'), 'success', true);
    } catch {
      showStatus(t('share_copy_failed'), 'error');
    }
  }, [showStatus, t]);

  const pullContent = useCallback(() => {
    if (pullPromiseRef.current || !roomCode || !deviceId) return pullPromiseRef.current;
    if (blockedByEndedRoom()) return Promise.resolve();
    const sessionAtRequest = roomSessionRef.current;
    const stillCurrentRoom = () => mountedRef.current && !roomEndedRef.current
      && roomSessionRef.current === sessionAtRequest && roomCodeRef.current === roomCode;

    const request = (async () => {
      setPulling(true);
      showStatus(t('share_syncing'));
      try {
        // A pending conflict means the local draft was never accepted. Saving it
        // now would overwrite the other device, which is the opposite of what
        // pulling means, so skip the pre-flush and take the remote text instead.
        const resolvingConflict = Boolean(conflictRef.current);

        // Commit the current editor version before reading the room. This avoids
        // racing a pending or in-flight save against an older pull response.
        if (!resolvingConflict) {
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          let stableRevision;
          do {
            stableRevision = editRevisionRef.current;
            saveQueueRef.current?.setDesired(contentRef.current);
            await saveQueueRef.current?.flush();
          } while (!roomEndedRef.current && !conflictRef.current && stableRevision !== editRevisionRef.current);

          if (!stillCurrentRoom()) return;
          if (conflictRef.current) {
            showStatus(t('share_conflict_title'), 'warning');
            return;
          }

          const saveSnapshot = saveQueueRef.current?.getSnapshot();
          if (saveSnapshot && saveSnapshot.desiredContent !== saveSnapshot.lastSavedContent) {
            showStatus(t('share_save_before_pull_failed'), 'error');
            return;
          }
        }

        const revisionAtRequest = editRevisionRef.current;
        const contentAtRequest = contentRef.current;
        let localEditPreserved = false;

        const result = await pullLatest({
          isCurrent: stillCurrentRoom,
          requestStatus: async () => {
            const response = await fetch(buildRoomStatusUrl(roomCode, deviceId));
            return readJsonResponse(response);
          },
          onContent: (pulledText, data) => {
            if (!stillCurrentRoom()) return;
            syncExpiry(data);
            setDevices(data.devices || {});
            if (editRevisionRef.current !== revisionAtRequest) {
              localEditPreserved = true;
              return;
            }
            contentRef.current = pulledText;
            setContent(pulledText);
            saveQueueRef.current?.markSaved(pulledText);
            syncBaseline(data.version);
            setLastEditor(data.content_updated_by || '');
            setLastUpdateTimestamp(data.last_update || null);
            if (!remoteUpdatedRef.current || remoteUpdatedRef.current.version <= asVersion(data.version)) {
              setRemoteUpdateState(null);
            }
            setConflictState(null);
          },
        });

        if (!stillCurrentRoom()) return;
        if (localEditPreserved) {
          showStatus(t('share_pull_local_kept'), 'warning');
        } else if (result.content === contentAtRequest) {
          showStatus(t('share_pulled_unchanged'), 'success', true);
        } else {
          showStatus(t('share_pulled'), 'success', true);
        }
      } catch (requestError) {
        if (!stillCurrentRoom()) return;
        if (requestError.response?.code === 'ROOM_NOT_FOUND') {
          endRoom('expired');
          return;
        }
        showStatus(requestError.response
          ? getApiErrorMessage(requestError.response, t)
          : t('share_network_error'), 'error');
      } finally {
        if (mountedRef.current && roomSessionRef.current === sessionAtRequest) setPulling(false);
        if (pullPromiseRef.current === request) pullPromiseRef.current = null;
      }
    })();

    pullPromiseRef.current = request;
    return request;
  }, [blockedByEndedRoom, deviceId, endRoom, roomCode, setConflictState, setRemoteUpdateState, showStatus, syncBaseline, syncExpiry, t]);

  const resolveConflictByPulling = useCallback(() => {
    if (!conflict || blockedByEndedRoom()) return;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    editRevisionRef.current += 1;
    contentRef.current = conflict.remoteContent;
    setContent(conflict.remoteContent);
    saveQueueRef.current?.markSaved(conflict.remoteContent);
    setConflictState(null);
    if (!remoteUpdatedRef.current || remoteUpdatedRef.current.version <= baseVersionRef.current) {
      setRemoteUpdateState(null);
    }
    setSaveFailed(false);
    syncBaseline(undefined);
    showStatus(t('share_pulled'), 'success', true);
  }, [blockedByEndedRoom, conflict, setConflictState, setRemoteUpdateState, showStatus, syncBaseline, t]);

  const resolveConflictByOverwriting = useCallback(async () => {
    if (!conflict || blockedByEndedRoom()) return;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    setConflictState(null);
    saveQueueRef.current?.setDesired(contentRef.current);
    try {
      await saveQueueRef.current?.flush();
    } catch {
      // onError already surfaced the failure.
    }
  }, [blockedByEndedRoom, conflict, setConflictState]);

  const retrySave = useCallback(() => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (blockedByEndedRoom() || blockedByConflict()) return Promise.resolve();
    saveQueueRef.current?.setDesired(contentRef.current);
    return saveQueueRef.current?.flush() || Promise.resolve();
  }, [blockedByConflict, blockedByEndedRoom]);

  const destroyRoom = useCallback(() => {
    if (destroyPromiseRef.current || !roomCode || !deviceId) return destroyPromiseRef.current;
    if (blockedByEndedRoom()) return Promise.resolve();
    const sessionAtRequest = roomSessionRef.current;
    destroyPromiseRef.current = (async () => {
      try {
        const response = await roomRequest('destroy_room', { room_code: roomCode, device_id: deviceId });
        await readJsonResponse(response);
        if (mountedRef.current && roomSessionRef.current === sessionAtRequest) endRoom('destroyed');
      } catch (requestError) {
        if (!mountedRef.current || roomEndedRef.current || roomSessionRef.current !== sessionAtRequest) return;
        if (requestError.response?.code === 'ROOM_NOT_FOUND') endRoom('expired');
        else showStatus(requestError.response ? getApiErrorMessage(requestError.response, t) : t('share_network_error'), 'error');
      } finally {
        destroyPromiseRef.current = null;
      }
    })();
    return destroyPromiseRef.current;
  }, [blockedByEndedRoom, deviceId, endRoom, roomCode, showStatus, t]);

  const leaveRoom = useCallback(() => {
    if (leavePromiseRef.current || !roomCode || !deviceId) return leavePromiseRef.current;

    leavePromiseRef.current = (async () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      // Leaving with an unresolved conflict must not push the local draft: the
      // baseline already points at the other device's revision, so this write
      // would overwrite text the user never agreed to discard.
      if (!conflictRef.current && !roomEndedRef.current) await enqueueGuarded(contentRef.current);

      watcherRef.current?.stop();

      try {
        await roomRequest('leave_room', { room_code: roomCode, device_id: deviceId });
      } catch {
        // Leaving is best-effort; local state must still be cleared.
      }

      if (!mountedRef.current) return;
      roomSessionRef.current += 1;
      watcherRef.current?.stop();
      saveQueueRef.current?.destroy();
      saveQueueRef.current = null;
      pullPromiseRef.current = null;
      localStorage.removeItem('last_room_code');
      baseVersionRef.current = 0;
      roomCodeRef.current = '';
      publicDeviceIdRef.current = '';
      roomEndedRef.current = null;
      contentRef.current = '';
      setConflictState(null);
      setContent('');
      setDevices({});
      setInRoom(false);
      setPulling(false);
      setConnectionState('closed');
      setExpiresAt(null);
      setPublicDeviceId('');
      setRoomEnded(null);
      setLastEditor('');
      setLastUpdateTimestamp(null);
      setRemoteUpdateState(null);
      setRoomCode('');
      setSaveFailed(false);
      setSaving(false);
      setStatus(null);
      leavePromiseRef.current = null;
    })();

    return leavePromiseRef.current;
  }, [deviceId, enqueueGuarded, roomCode, setConflictState, setRemoteUpdateState]);

  return {
    changeContent,
    conflict,
    connectionState,
    content,
    copyContent,
    createRoom,
    destroyRoom,
    deviceId,
    devices,
    error,
    expiresAt,
    inRoom,
    joinRoom,
    lastEditor,
    lastUpdate,
    leaveRoom,
    loading,
    maxTextLength: MAX_TEXT_LENGTH,
    overLimit,
    pasteAndSave,
    pullContent,
    pulling,
    publicDeviceId,
    remoteUpdated,
    resolveConflictByOverwriting,
    resolveConflictByPulling,
    retrySave,
    roomCode,
    roomEnded,
    saveContentNow,
    saveFailed,
    saving,
    setDevices,
    setRoomCode,
    showStatus,
    status,
  };
}
