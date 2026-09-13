export function createLatestSaveQueue({
  initialContent = '',
  onError = () => {},
  onSaved = () => {},
  onSaving = () => {},
  requestSave,
}) {
  let desiredContent = initialContent;
  let lastSavedContent = initialContent;
  let activePromise = null;
  let destroyed = false;

  const drain = async () => {
    while (!destroyed && desiredContent !== lastSavedContent) {
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
        if (desiredContent === contentToSave) return;
      }
    }
  };

  const flush = () => {
    if (destroyed || desiredContent === lastSavedContent) {
      return activePromise || Promise.resolve();
    }

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

export async function pullLatestOnce({ onContent, requestStatus, writeClipboard }) {
  const data = await requestStatus();
  const content = data.text_content || '';
  onContent(content, data);

  try {
    await writeClipboard(content);
    return { content, copied: true, data };
  } catch (clipboardError) {
    return { clipboardError, content, copied: false, data };
  }
}
