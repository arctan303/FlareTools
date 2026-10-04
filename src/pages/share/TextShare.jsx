import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Clipboard,
  Copy,
  Download,
  Info,
  KeyRound,
  QrCode,
  RefreshCw,
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
import useTextRoom from './hooks/useTextRoom';

export default function TextShare() {
  const { lang, t } = useI18n();
  const { isDark } = useTheme();

  const [captchaRequest, setCaptchaRequest] = useState(null);
  const [showQr, setShowQr] = useState(false);
  const onCaptchaRequired = useCallback((request) => setCaptchaRequest(request), []);
  const room = useTextRoom({ lang, onCaptchaRequired, t });
  const { createRoom, joinRoom } = room;
  const turnstileWidgetRef = useRef(null);

  useEffect(() => {
    if (!captchaRequest) return undefined;
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
    room.showStatus(t('share_downloaded'), 'success', true);
  };

  const clearText = () => {
    if (window.confirm(t('share_clear_confirm'))) {
      if (room.roomEnded) room.changeContent('');
      else room.saveContentNow('');
    }
  };

  const handleDestroy = async () => {
    if (window.confirm(t('share_destroy_confirm'))) await room.destroyRoom();
  };

  const inviteUrl = (() => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', room.roomCode);
    return url.toString();
  })();

  return (
    <ToolLayout>
      <SEO titleKey="tool_text_share" descriptionKey="tool_text_share_desc" />

      <ToolPageHeader
        eyebrow={t('share_cross_device_eyebrow')}
        icon={Share2}
        title={t('tool_text_share')}
        description={t('tool_text_share_desc')}
      />

      {!room.inRoom ? (
        <RoomEntry room={room} t={t} />
      ) : (
        <div className="mt-6 space-y-5 sm:mt-8">
          <RoomBar
            deviceId={room.publicDeviceId}
            expiresAt={room.expiresAt}
            roomEnded={room.roomEnded}
            onDestroy={handleDestroy}
            onCopyCode={() => copyText(room.roomCode)}
            onLeave={handleLeave}
            onShowQr={() => setShowQr(true)}
            roomCode={room.roomCode}
            t={t}
          />

          <StatusNotice tone={room.roomEnded ? 'warning' : 'info'}>
            {room.roomEnded
              ? t(room.roomEnded.reason === 'expired' ? 'share_room_expired' : room.roomEnded.reason === 'destroyed' ? 'share_room_destroyed' : 'share_room_ended')
              : t(room.connectionState === 'live' ? 'share_connection_live' : room.connectionState === 'connecting' ? 'share_connection_connecting' : room.connectionState === 'closed' ? 'share_connection_closed' : 'share_connection_offline')}
          </StatusNotice>

          {room.status && !room.roomEnded && (
            <StatusNotice tone={room.status.tone}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{room.status.message}</span>
                {room.saveFailed && (
                  <Button variant="secondary" size="sm" loading={room.saving} onClick={room.retrySave}>
                    {t('share_retry_save')}
                  </Button>
                )}
              </div>
            </StatusNotice>
          )}

          <TextWorkspace
            room={room}
            t={t}
            onClear={clearText}
            onDownload={downloadText}
          />
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

function RoomBar({ deviceId, expiresAt, onCopyCode, onDestroy, onLeave, onShowQr, roomCode, roomEnded, t }) {
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
              <Info className="size-3.5" aria-hidden="true" /> {deviceId?.slice(0, 8)}…
            </p>
          </div>
          {expiresAt && <p className="text-xs text-[var(--muted)]">{t('share_expires_at')} · {new Date(expiresAt * 1000).toLocaleString()}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onLeave}>{t('share_leave')}</Button>
          <Button variant="danger" disabled={Boolean(roomEnded)} onClick={onDestroy}>{t('share_destroy')}</Button>
        </div>
      </div>
    </ToolPanel>
  );
}

function TextWorkspace({ onClear, onDownload, room, t }) {
  const editorAuthor = room.lastEditor
    ? (room.lastEditor === room.publicDeviceId ? t('share_updated_by_you') : `${room.lastEditor.slice(0, 8)}…`)
    : t('share_no_update');

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
      <ToolPanel title={t('share_editor_title')} description={t('share_text_workflow_hint')}>
        <div className="mb-4 flex flex-wrap gap-2">
          <Button variant="secondary" disabled={Boolean(room.roomEnded)} onClick={room.pasteAndSave}>
            <Clipboard className="size-4" aria-hidden="true" /> {t('share_paste')}
          </Button>
          <Button loading={room.pulling} disabled={Boolean(room.roomEnded)} onClick={room.pullContent}>
            <RefreshCw className="size-4" aria-hidden="true" /> {t('share_pull_latest')}
          </Button>
          <Button variant="secondary" onClick={room.copyContent}>
            <Copy className="size-4" aria-hidden="true" /> {t('share_copy_text')}
          </Button>
          <Button variant="secondary" onClick={onDownload}>
            <Download className="size-4" aria-hidden="true" /> {t('share_download_text')}
          </Button>
          <Button variant="ghost" onClick={onClear}>
            <Trash2 className="size-4" aria-hidden="true" /> {t('share_clear')}
          </Button>
        </div>

        {room.conflict && (
          <StatusNotice className="mb-4" tone="warning" title={t('share_conflict_title')}>
            <p>{t('share_conflict_desc')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={room.resolveConflictByPulling}>
                {t('share_conflict_pull')}
              </Button>
              <Button size="sm" variant="danger" onClick={room.resolveConflictByOverwriting}>
                {t('share_conflict_overwrite')}
              </Button>
            </div>
          </StatusNotice>
        )}

        {!room.conflict && room.remoteUpdated && (
          <StatusNotice className="mb-4" tone="info" title={t('share_remote_updated')}>
            <p>{t('share_remote_updated_hint')}</p>
            <div className="mt-3">
              <Button size="sm" variant="secondary" loading={room.pulling} onClick={room.pullContent}>
                <RefreshCw className="size-4" aria-hidden="true" /> {t('share_pull_latest')}
              </Button>
            </div>
          </StatusNotice>
        )}

        <label htmlFor="shared-text" className="sr-only">{t('share_editor_title')}</label>
        <textarea
          id="shared-text"
          value={room.content}
          onChange={(event) => room.changeContent(event.target.value)}
          placeholder={t('share_placeholder')}
          spellCheck="false"
          className="min-h-[320px] w-full resize-y rounded-[10px] border border-[var(--line-strong)] bg-[var(--page-soft)] p-4 font-mono text-sm leading-7 text-[var(--text-strong)] sm:min-h-[440px]"
        />

        <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs">
          <span className={room.overLimit ? 'text-[var(--danger)]' : 'text-[var(--faint)]'}>
            {t('share_chars')} {room.content.length} / {room.maxTextLength}
          </span>
          <span className="text-[var(--faint)]">
            {t('share_last_update')} {room.lastUpdate || t('share_no_update')}
            {' · '}
            {t('share_updated_by')} {editorAuthor}
          </span>
        </div>

        {room.overLimit && (
          <StatusNotice className="mt-3" tone="error">{t('share_over_limit')}</StatusNotice>
        )}
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
                <span className={`size-2 shrink-0 rounded-full ${room.devices[id].connected ? 'bg-[var(--success)]' : 'bg-[var(--faint)]'}`} aria-hidden="true" />
                <span className="min-w-0 truncate font-mono text-[var(--muted)]">
                  {id.slice(0, 8)}… {id === room.publicDeviceId ? t('share_you') : ''}
                  {' · '}{t(room.devices[id].connected ? 'share_member_online' : 'share_member_offline')}
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
