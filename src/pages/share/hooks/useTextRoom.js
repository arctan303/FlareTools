import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getApiErrorMessage } from '../../../locales/errorCodes';
import {
  buildRoomStatusUrl,
  createLatestSaveQueue,
  formatRoomTimestamp,
  pullLatestOnce,
  readJsonResponse,
} from '../shareRequestPolicy';

const SAVE_DELAY_MS = 1500;

function roomRequest(action, body) {
  return fetch(`/api/text-share/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export default function useTextRoom({ lang, onCaptchaRequired, t }) {
  const [content, setContent] = useState('');
  const [deviceId, setDeviceId] = useState(() => localStorage.getItem('share_device_id') || '');
  const [devices, setDevices] = useState({});
  const [error, setError] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [lastUpdateTimestamp, setLastUpdateTimestamp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  const autoJoinStartedRef = useRef(false);
  const contentRef = useRef('');
  const editRevisionRef = useRef(0);
  const enterPromiseRef = useRef(null);
  const leavePromiseRef = useRef(null);
  const mountedRef = useRef(true);
  const pullPromiseRef = useRef(null);
  const saveQueueRef = useRef(null);
  const statusTimerRef = useRef(null);
  const typingTimerRef = useRef(null);
  const tRef = useRef(t);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const showStatus = useCallback((message, tone = 'info', temporary = false) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatus({ message, tone });
    if (temporary) {
      statusTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setStatus(null);
      }, 2400);
    }
  }, []);

  const lastUpdate = useMemo(() => {
    return formatRoomTimestamp(lastUpdateTimestamp, lang);
  }, [lang, lastUpdateTimestamp]);

  const configureSaveQueue = useCallback((nextRoomCode, nextDeviceId, initialContent) => {
    saveQueueRef.current?.destroy();
    saveQueueRef.current = createLatestSaveQueue({
      initialContent,
      requestSave: async (textContent) => {
        const response = await roomRequest('update_text', {
          room_code: nextRoomCode,
          device_id: nextDeviceId,
          text_content: textContent,
        });
        return readJsonResponse(response);
      },
      onSaving: () => {
        if (!mountedRef.current) return;
        setSaveFailed(false);
        setSaving(true);
        showStatus(tRef.current('share_saving'));
      },
      onSaved: (data) => {
        if (!mountedRef.current) return;
        setDevices(data.devices || {});
        setLastUpdateTimestamp(data.last_update || data.timestamp || null);
        setSaveFailed(false);
        setSaving(false);
        showStatus(tRef.current('share_saved'), 'success', true);
      },
      onError: (requestError) => {
        if (!mountedRef.current) return;
        const message = requestError.response
          ? getApiErrorMessage(requestError.response, tRef.current)
          : tRef.current('share_network_error');
        setSaveFailed(true);
        setSaving(false);
        showStatus(message, 'error');
      },
    });
  }, [showStatus]);

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
            if (joinData.code === 'ROOM_NOT_FOUND') {
              // Preserve the old invite-link behavior without a second status GET.
              shouldCreate = true;
              captchaToken = null;
              continue;
            }
            throw Object.assign(new Error(joinData.message), { response: joinData });
          }

          if (!mountedRef.current) return;
          const joinedText = joinData.text_content || '';
          contentRef.current = joinedText;
          setContent(joinedText);
          setDeviceId(joinData.device_id);
          setDevices(joinData.devices || {});
          setRoomCode(joinData.room_code);
          setInRoom(true);
          setLastUpdateTimestamp(joinData.last_update || joinData.timestamp || null);
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
  }, [configureSaveQueue, deviceId, onCaptchaRequired, showStatus, t]);

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
      if (!inRoom || !roomCode || !deviceId) return;
      fetch('/api/text-share/leave_room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_code: roomCode, device_id: deviceId }),
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [deviceId, inRoom, roomCode]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      saveQueueRef.current?.destroy();
    };
  }, []);

  const changeContent = useCallback((nextContent) => {
    editRevisionRef.current += 1;
    contentRef.current = nextContent;
    setContent(nextContent);
    setSaveFailed(false);
    saveQueueRef.current?.setDesired(nextContent);
    showStatus(t('share_typing'));

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      saveQueueRef.current?.enqueue(contentRef.current);
    }, SAVE_DELAY_MS);
  }, [showStatus, t]);

  const saveContentNow = useCallback((nextContent) => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    editRevisionRef.current += 1;
    contentRef.current = nextContent;
    setContent(nextContent);
    setSaveFailed(false);
    saveQueueRef.current?.setDesired(nextContent);
    return saveQueueRef.current?.enqueue(nextContent) || Promise.resolve();
  }, []);

  const pasteAndSave = useCallback(async () => {
    try {
      const pastedText = await navigator.clipboard.readText();
      await saveContentNow(pastedText);
    } catch {
      showStatus(t('share_paste_failed'), 'error');
    }
  }, [saveContentNow, showStatus, t]);

  const pullAndCopy = useCallback(() => {
    if (pullPromiseRef.current || !roomCode || !deviceId) return pullPromiseRef.current;

    pullPromiseRef.current = (async () => {
      setPulling(true);
      showStatus(t('share_syncing'));
      try {
        // Commit the current editor version before reading the room. This avoids
        // racing a pending or in-flight save against an older pull response.
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        let stableRevision;
        do {
          stableRevision = editRevisionRef.current;
          saveQueueRef.current?.setDesired(contentRef.current);
          await saveQueueRef.current?.flush();
        } while (stableRevision !== editRevisionRef.current);

        const saveSnapshot = saveQueueRef.current?.getSnapshot();
        if (saveSnapshot && saveSnapshot.desiredContent !== saveSnapshot.lastSavedContent) {
          showStatus(t('share_save_before_pull_failed'), 'error');
          return;
        }

        const revisionAtRequest = editRevisionRef.current;
        const contentAtRequest = contentRef.current;
        let localEditPreserved = false;
        const result = await pullLatestOnce({
          requestStatus: async () => {
            const response = await fetch(buildRoomStatusUrl(roomCode, deviceId));
            return readJsonResponse(response);
          },
          writeClipboard: (pulledText) => navigator.clipboard.writeText(pulledText),
          onContent: (pulledText, data) => {
            if (editRevisionRef.current !== revisionAtRequest) {
              localEditPreserved = true;
              return;
            }
            contentRef.current = pulledText;
            setContent(pulledText);
            saveQueueRef.current?.markSaved(pulledText);
            setDevices(data.devices || {});
            setLastUpdateTimestamp(data.last_update || null);
          },
        });

        if (localEditPreserved && result.copied) {
          showStatus(t('share_pull_conflict_copied'), 'warning');
        } else if (localEditPreserved) {
          showStatus(t('share_pull_conflict_manual'), 'warning');
        } else if (!result.copied) {
          showStatus(t('share_pulled_manual_copy'), 'warning');
        } else if (result.content === contentAtRequest) {
          showStatus(t('share_already_latest_copied'), 'success', true);
        } else {
          showStatus(t('share_pulled_and_copied'), 'success', true);
        }
      } catch (requestError) {
        showStatus(requestError.response
          ? getApiErrorMessage(requestError.response, t)
          : t('share_network_error'), 'error');
      } finally {
        if (mountedRef.current) setPulling(false);
        pullPromiseRef.current = null;
      }
    })();

    return pullPromiseRef.current;
  }, [deviceId, roomCode, showStatus, t]);

  const retrySave = useCallback(() => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    saveQueueRef.current?.setDesired(contentRef.current);
    return saveQueueRef.current?.flush() || Promise.resolve();
  }, []);

  const leaveRoom = useCallback(() => {
    if (leavePromiseRef.current || !roomCode || !deviceId) return leavePromiseRef.current;

    leavePromiseRef.current = (async () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      await saveQueueRef.current?.enqueue(contentRef.current);

      try {
        await roomRequest('leave_room', { room_code: roomCode, device_id: deviceId });
      } catch {
        // Leaving is best-effort; local state must still be cleared.
      }

      if (!mountedRef.current) return;
      saveQueueRef.current?.destroy();
      saveQueueRef.current = null;
      localStorage.removeItem('last_room_code');
      contentRef.current = '';
      setContent('');
      setDevices({});
      setInRoom(false);
      setLastUpdateTimestamp(null);
      setRoomCode('');
      setSaveFailed(false);
      setSaving(false);
      setStatus(null);
      leavePromiseRef.current = null;
    })();

    return leavePromiseRef.current;
  }, [deviceId, roomCode]);

  return {
    changeContent,
    content,
    createRoom,
    deviceId,
    devices,
    error,
    inRoom,
    joinRoom,
    lastUpdate,
    leaveRoom,
    loading,
    pasteAndSave,
    pullAndCopy,
    pulling,
    retrySave,
    roomCode,
    saveFailed,
    saveContentNow,
    saving,
    setDevices,
    setRoomCode,
    showStatus,
    status,
  };
}
