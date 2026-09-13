import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Clipboard,
  Copy,
  Download,
  Folder,
  Info,
  KeyRound,
  QrCode,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import SEO from '../../components/SEO';
import ToolLayout from '../../components/layout/ToolLayout';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import StatusNotice from '../../components/ui/StatusNotice';
import ToolPageHeader from '../../components/ui/ToolPageHeader';
import ToolPanel from '../../components/ui/ToolPanel';
import { useI18n } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getApiErrorMessage } from '../../locales/errorCodes';
import FileTransferPanel from './components/FileTransferPanel';
import useDeviceRadar from './hooks/useDeviceRadar';
import useTextRoom from './hooks/useTextRoom';
import useWebRTCFileTransfer from './hooks/useWebRTCFileTransfer';
import { buildRoomStatusUrl, readJsonResponse } from './shareRequestPolicy';

export default function TextShare() {
  const { lang, t } = useI18n();
  const { isDark } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const isFileTransfer = location.pathname.includes('/share/file');

  const [captchaRequest, setCaptchaRequest] = useState(null);
  const [showQr, setShowQr] = useState(false);
  const onCaptchaRequired = useCallback((request) => setCaptchaRequest(request), []);
  const room = useTextRoom({ lang, onCaptchaRequired, t });
  const {
    createRoom,
    deviceId,
    inRoom,
    joinRoom,
    roomCode,
    setDevices,
    showStatus,
  } = room;

  const {
    peers,
    closePeerConnection,
    stagedFiles,
    availableFiles,
    transfers,
    stageFile,
    requestFile,
    removeTransfer,
    processSignal,
    syncDevices,
    initiateConnection,
  } = useWebRTCFileTransfer(room.roomCode, room.deviceId);

  const processedSignalsRef = useRef(new Set());
  const fileRequestAbortRef = useRef(null);
  const fileRequestGenerationRef = useRef(0);
  const turnstileWidgetRef = useRef(null);

  const invalidateFileRequests = useCallback(() => {
    fileRequestGenerationRef.current += 1;
    fileRequestAbortRef.current?.abort();
    fileRequestAbortRef.current = null;
    processedSignalsRef.current = new Set();
  }, []);

  useLayoutEffect(() => {
    invalidateFileRequests();
    return invalidateFileRequests;
  }, [deviceId, invalidateFileRequests, isFileTransfer, roomCode]);

  const refreshFileState = useCallback(async () => {
    if (!inRoom || !roomCode || !deviceId) return;
    const generation = fileRequestGenerationRef.current;
    const abortController = new AbortController();
    fileRequestAbortRef.current = abortController;
    try {
      const response = await fetch(buildRoomStatusUrl(roomCode, deviceId), {
        signal: abortController.signal,
      });
      const data = await readJsonResponse(response);
      if (abortController.signal.aborted || generation !== fileRequestGenerationRef.current) return;
      setDevices(data.devices || {});
      syncDevices(Object.keys(data.devices || {}));

      for (const signal of data.signals || []) {
        if (abortController.signal.aborted || generation !== fileRequestGenerationRef.current) return;
        if (processedSignalsRef.current.has(signal.id)) continue;
        processedSignalsRef.current.add(signal.id);
        await processSignal(signal);
      }
    } catch (requestError) {
      if (requestError.name === 'AbortError' || abortController.signal.aborted) return;
      showStatus(requestError.response
        ? getApiErrorMessage(requestError.response, t)
        : t('share_network_error'), 'error');
    } finally {
      if (fileRequestAbortRef.current === abortController) {
        fileRequestAbortRef.current = null;
      }
    }
  }, [deviceId, inRoom, processSignal, roomCode, setDevices, showStatus, syncDevices, t]);

  const radar = useDeviceRadar({
    enabled: isFileTransfer && inRoom,
    poll: refreshFileState,
  });

  useEffect(() => {
    if (!captchaRequest) return;
    let cancelled = false;

    const renderWidget = () => {
      if (cancelled || !window.turnstile) return;
      if (turnstileWidgetRef.current !== null) {
        window.turnstile.remove(turnstileWidgetRef.current);
      }
      turnstileWidgetRef.current = window.turnstile.render('#turnstile-container', {
        sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
        theme: isDark ? 'dark' : 'light',
        callback: (token) => {
          const request = captchaRequest;
          setCaptchaRequest(null);
          if (request.action === 'create') createRoom(token, request.roomCode);
          else joinRoom(request.roomCode, token);
        },
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      let script = document.querySelector('script[data-arc-turnstile]');
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.arcTurnstile = 'true';
        document.head.appendChild(script);
      }
      script.addEventListener('load', renderWidget, { once: true });
    }

    return () => {
      cancelled = true;
      if (turnstileWidgetRef.current !== null && window.turnstile) {
        window.turnstile.remove(turnstileWidgetRef.current);
        turnstileWidgetRef.current = null;
      }
    };
  }, [captchaRequest, createRoom, isDark, joinRoom]);

  const handleLeave = async () => {
    if (!window.confirm(t('share_leave_confirm'))) return;
    radar.stop();
    invalidateFileRequests();
    await room.leaveRoom();
  };

  const copyText = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      room.showStatus(t('share_copied'), 'success', true);
    } catch {
      room.showStatus(t('share_copy_failed'), 'error');
    }
  };

  const downloadText = () => {
    const blob = new Blob([room.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shared_text_${room.roomCode}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    room.showStatus(t('share_file_saved'), 'success', true);
  };

  const clearText = () => {
    if (window.confirm(t('share_clear_confirm'))) room.saveContentNow('');
  };

  const inviteUrl = (() => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', room.roomCode);
    return url.toString();
  })();

  return (
    <ToolLayout>
      <SEO
        titleKey={isFileTransfer ? 'tool_file_transfer' : 'tool_text_share'}
        descriptionKey={isFileTransfer ? 'tool_file_transfer_desc' : 'tool_text_share_desc'}
      />

      <ToolPageHeader
        eyebrow={t('share_cross_device_eyebrow')}
        icon={isFileTransfer ? Folder : Share2}
        title={t(isFileTransfer ? 'tool_file_transfer' : 'tool_text_share')}
        description={t(isFileTransfer ? 'tool_file_transfer_desc' : 'tool_text_share_desc')}
      />

      {!room.inRoom ? (
        <RoomEntry room={room} t={t} />
      ) : (
        <div className="mt-6 space-y-5 sm:mt-8">
          <RoomBar
            deviceId={room.deviceId}
            isFileTransfer={isFileTransfer}
            navigate={navigate}
            onCopyCode={() => copyText(room.roomCode)}
            onLeave={handleLeave}
            onShowQr={() => setShowQr(true)}
            roomCode={room.roomCode}
            t={t}
          />

          {room.status && (
            <StatusNotice tone={room.status.tone}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{room.status.message}</span>
                {room.saveFailed && (
                  <Button variant="secondary" loading={room.saving} onClick={room.retrySave}>
                    {t('share_retry_save')}
                  </Button>
                )}
              </div>
            </StatusNotice>
          )}

          {!isFileTransfer ? (
            <TextWorkspace
              room={room}
              t={t}
              onClear={clearText}
              onDownload={downloadText}
            />
          ) : (
            <ToolPanel>
              <FileTransferPanel
                peers={peers}
                stagedFiles={stagedFiles}
                availableFiles={availableFiles}
                cancelConnection={closePeerConnection}
                transfers={transfers}
                stageFile={stageFile}
                requestFile={requestFile}
                removeTransfer={removeTransfer}
                devices={room.devices}
                myDeviceId={room.deviceId}
                isRefreshing={radar.isRefreshing}
                isScanning={radar.isScanning}
                radarStopReason={radar.stopReason}
                radarRemainingSeconds={radar.remainingSeconds}
                startRadar={radar.start}
                stopRadar={radar.stop}
                refreshDevices={radar.refresh}
                initiateConnection={initiateConnection}
              />
            </ToolPanel>
          )}
        </div>
      )}

      {captchaRequest && createPortal(
        <ModalShell onDismiss={() => setCaptchaRequest(null)} title={t('share_verify_title')}>
          <p className="text-sm leading-6 text-[var(--muted)]">{t('share_verify_desc')}</p>
          <div id="turnstile-container" className="mt-5 flex min-h-[65px] justify-center" />
          <Button className="mt-5 w-full" variant="secondary" onClick={() => setCaptchaRequest(null)}>
            {t('share_cancel')}
          </Button>
        </ModalShell>,
        document.body,
      )}

      {showQr && createPortal(
        <ModalShell onDismiss={() => setShowQr(false)} title={t('share_invite_title')}>
          <div className="mx-auto w-fit rounded-[10px] border border-[var(--line)] bg-white p-4">
            <QRCodeSVG value={inviteUrl} size={200} level="M" />
          </div>
          <p className="mt-4 break-all text-center font-mono text-xs leading-5 text-[var(--muted)]">
            {inviteUrl}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" onClick={() => copyText(room.roomCode)}>
              {t('share_copy_code_only')}
            </Button>
            <Button onClick={() => copyText(inviteUrl)}>{t('share_copy_full_link')}</Button>
          </div>
        </ModalShell>,
        document.body,
      )}
    </ToolLayout>
  );
}

function RoomEntry({ room, t }) {
  return (
    <div className="mt-6 grid max-w-4xl gap-4 sm:mt-8 lg:grid-cols-2">
      <ToolPanel title={t('share_create')} description={t('share_create_desc')} className="flex flex-col">
        <p className="mb-6 text-sm leading-6 text-[var(--muted)]">{t('share_room_lifetime_hint')}</p>
        <Button className="mt-auto w-full" loading={room.loading} onClick={() => room.createRoom()}>
          <Share2 className="size-4" aria-hidden="true" />
          {t('share_create_btn')}
        </Button>
      </ToolPanel>

      <ToolPanel title={t('share_join')} description={t('share_join_desc')} className="flex flex-col">
        <label htmlFor="room-code" className="mb-2 text-sm font-medium text-[var(--text-strong)]">
          {t('share_room_code_label')}
        </label>
        <input
          id="room-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength="6"
          value={room.roomCode}
          onChange={(event) => room.setRoomCode(event.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          className="min-h-14 w-full rounded-[10px] border border-[var(--line-strong)] bg-[var(--page-soft)] px-4 text-center font-mono text-2xl tracking-[0.24em] text-[var(--text-strong)]"
        />
        <Button
          className="mt-4 w-full"
          variant="secondary"
          disabled={room.roomCode.length !== 6}
          loading={room.loading}
          onClick={() => room.joinRoom()}
        >
          {t('share_join_btn')}
        </Button>
        {room.error && <StatusNotice className="mt-4" tone="error">{room.error}</StatusNotice>}
      </ToolPanel>
    </div>
  );
}

function RoomBar({
  deviceId,
  isFileTransfer,
  navigate,
  onCopyCode,
  onLeave,
  onShowQr,
  roomCode,
  t,
}) {
  return (
    <ToolPanel className="!p-3 sm:!p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
          <div>
            <p className="text-xs text-[var(--faint)]">{t('share_room_info')}</p>
            <div className="mt-0.5 flex items-center gap-1 font-mono text-lg font-semibold text-[var(--accent)]">
              <KeyRound className="size-4" aria-hidden="true" />
              {roomCode}
              <IconButton label={t('share_copy_code_label')} size="sm" onClick={onCopyCode}>
                <Copy aria-hidden="true" />
              </IconButton>
              <IconButton label={t('share_show_qr_label')} size="sm" onClick={onShowQr}>
                <QrCode aria-hidden="true" />
              </IconButton>
            </div>
          </div>
          <div>
            <p className="text-xs text-[var(--faint)]">{t('share_device_id')}</p>
            <p className="mt-1 flex items-center gap-1 font-mono text-sm text-[var(--muted)]">
              <Info className="size-3.5" aria-hidden="true" /> {deviceId.slice(0, 8)}…
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-[10px] border border-[var(--line)] bg-[var(--page-soft)] p-1">
            <button
              type="button"
              aria-current={!isFileTransfer ? 'page' : undefined}
              onClick={() => navigate('/share/text')}
              className={`min-h-11 rounded-[7px] px-3 text-sm font-medium ${!isFileTransfer ? 'bg-[var(--surface)] text-[var(--accent)] shadow-sm' : 'text-[var(--muted)]'}`}
            >
              {t('share_text_tab')}
            </button>
            <button
              type="button"
              aria-current={isFileTransfer ? 'page' : undefined}
              onClick={() => navigate('/share/file')}
              className={`min-h-11 rounded-[7px] px-3 text-sm font-medium ${isFileTransfer ? 'bg-[var(--surface)] text-[var(--accent)] shadow-sm' : 'text-[var(--muted)]'}`}
            >
              {t('share_files')}
            </button>
          </div>
          <Button variant="ghost" onClick={onLeave}>{t('share_leave')}</Button>
        </div>
      </div>
    </ToolPanel>
  );
}

function TextWorkspace({ onClear, onDownload, room, t }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
      <ToolPanel title={t('share_editor_title')} description={t('share_text_workflow_hint')}>
        <div className="mb-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={room.pasteAndSave}>
            <Clipboard className="size-4" aria-hidden="true" /> {t('share_paste')}
          </Button>
          <Button loading={room.pulling} onClick={room.pullAndCopy}>
            <Copy className="size-4" aria-hidden="true" /> {t('share_pull_copy')}
          </Button>
          <Button variant="secondary" onClick={onDownload}>
            <Download className="size-4" aria-hidden="true" /> {t('share_download_text')}
          </Button>
          <Button variant="ghost" onClick={onClear}>
            <Trash2 className="size-4" aria-hidden="true" /> {t('share_clear')}
          </Button>
        </div>

        <label htmlFor="shared-text" className="sr-only">{t('share_editor_title')}</label>
        <textarea
          id="shared-text"
          value={room.content}
          onChange={(event) => room.changeContent(event.target.value)}
          placeholder={t('share_placeholder')}
          spellCheck="false"
          className="min-h-[320px] w-full resize-y rounded-[10px] border border-[var(--line-strong)] bg-[var(--page-soft)] p-4 font-mono text-sm leading-7 text-[var(--text-strong)] sm:min-h-[440px]"
        />
        <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-[var(--faint)]">
          <span>{t('share_chars')} {room.content.length}</span>
          <span>{t('share_last_update')} {room.lastUpdate || t('share_no_update')}</span>
        </div>
      </ToolPanel>

      <div className="space-y-5">
        <StatusNotice title={t('share_on_demand_title')}>
          {t('share_idle_policy')}
        </StatusNotice>
        <ToolPanel title={t('share_devices_snapshot')}>
          <ul className="space-y-2">
            {Object.keys(room.devices).length === 0 && (
              <li className="text-sm text-[var(--muted)]">{t('share_no_devices')}</li>
            )}
            {Object.keys(room.devices).map((id) => (
              <li key={id} className="flex items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--page-soft)] px-3 py-2 text-xs">
                <span className="size-2 shrink-0 rounded-full bg-[var(--success)]" aria-hidden="true" />
                <span className="min-w-0 truncate font-mono text-[var(--muted)]">
                  {id} {id === room.deviceId ? t('share_you') : ''}
                </span>
              </li>
            ))}
          </ul>
        </ToolPanel>
      </div>
    </div>
  );
}

function ModalShell({ children, onDismiss, title }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onMouseDown={onDismiss}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-float)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-brand text-xl font-semibold text-[var(--text-strong)]">{title}</h2>
          <IconButton label={title} onClick={onDismiss}><X className="size-5" aria-hidden="true" /></IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}
