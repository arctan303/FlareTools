import { useCallback, useEffect, useState } from 'react';
import {
  CircleAlert,
  CheckCircle2,
  Clock3,
  Download,
  File as FileIcon,
  Radar,
  RefreshCw,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import Button from '../../../components/ui/Button';
import IconButton from '../../../components/ui/IconButton';
import StatusNotice from '../../../components/ui/StatusNotice';
import { useI18n } from '../../../contexts/I18nContext';
import {
  createConnectionAttemptTimer,
  reconcileConnectionAttempt,
  replaceConnectionAttempt,
} from '../connectionAttemptPolicy';

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** unitIndex);
  return `${Number(value.toFixed(2))} ${units[unitIndex]}`;
}

export default function FileTransferPanel({
  availableFiles,
  cancelConnection,
  devices,
  initiateConnection,
  isRefreshing,
  isScanning,
  myDeviceId,
  peers,
  radarRemainingSeconds,
  radarStopReason,
  refreshDevices,
  removeTransfer,
  requestFile,
  stagedFiles,
  stageFile,
  startRadar,
  stopRadar,
  transfers,
}) {
  const { t } = useI18n();
  const [connectingTo, setConnectingTo] = useState(null);
  const [timedOutTarget, setTimedOutTarget] = useState(null);
  const [connectionTimer] = useState(() => createConnectionAttemptTimer({}));
  const activePeersCount = Object.values(peers || {}).filter((peer) => peer.connected).length;
  const deviceIds = Object.keys(devices || {});

  useEffect(() => () => connectionTimer.dispose(), [connectionTimer]);

  useEffect(() => {
    if (!connectingTo) return;
    reconcileConnectionAttempt(connectionTimer, {
      cancelAttempt: cancelConnection,
      deviceId: connectingTo,
      devicePresent: Boolean(devices?.[connectingTo]),
      onSettled: (deviceId, outcome) => {
        setConnectingTo(null);
        setTimedOutTarget(outcome === 'failed' ? deviceId : null);
      },
      peer: peers?.[connectingTo],
    });
  }, [cancelConnection, connectingTo, connectionTimer, devices, peers]);

  const addFiles = useCallback((fileList) => {
    if (activePeersCount === 0) return;
    Array.from(fileList).forEach((file) => stageFile(file));
  }, [activePeersCount, stageFile]);

  const onDrop = useCallback((event) => {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  }, [addFiles]);

  const connectDevice = (deviceId) => {
    const shouldForce = timedOutTarget === deviceId
      || peers?.[deviceId]?.status === 'failed'
      || peers?.[deviceId]?.status === 'offline';
    setConnectingTo(deviceId);
    setTimedOutTarget(null);
    startRadar();
    void initiateConnection?.(deviceId, { force: shouldForce });
    replaceConnectionAttempt(connectionTimer, {
      nextTarget: deviceId,
      cancelPrevious: (previousDeviceId) => cancelConnection?.(previousDeviceId, 'failed'),
      onTimeout: (expiredDeviceId) => {
        cancelConnection?.(expiredDeviceId, 'failed');
        setConnectingTo(null);
        setTimedOutTarget(expiredDeviceId);
      },
    });
  };

  const radarStoppedMessage = radarStopReason === 'timeout'
    ? t('share_radar_timed_out')
    : radarStopReason === 'hidden'
      ? t('share_radar_stopped_hidden')
      : radarStopReason === 'manual'
        ? t('share_radar_stopped')
        : null;
  const connectingPeer = connectingTo ? peers?.[connectingTo] : null;
  const connectionFeedback = connectingTo
    ? connectingPeer?.connected
      ? null
      : connectingPeer?.status === 'offline' || !devices?.[connectingTo]
        ? { tone: 'error', message: t('share_device_offline') }
        : connectingPeer?.status === 'failed'
          ? { tone: 'error', message: t('share_connection_failed') }
          : { tone: 'info', message: t('share_connection_waiting') }
    : timedOutTarget && !peers?.[timedOutTarget]?.connected
      ? { tone: 'error', message: t('share_connection_failed') }
      : null;

  return (
    <div className="space-y-6">
      <section aria-labelledby="radar-heading" className="rounded-[10px] border border-[var(--line)] bg-[var(--page-soft)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Users className="size-4 text-[var(--accent)]" aria-hidden="true" />
              <h2 id="radar-heading" className="font-brand text-xl font-semibold text-[var(--text-strong)]">
                {t('share_room_devices')}
              </h2>
              <span className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-xs text-[var(--muted)]">
                {deviceIds.length}
              </span>
              <IconButton
                label={t('share_refresh_devices')}
                size="sm"
                disabled={isRefreshing}
                aria-busy={isRefreshing || undefined}
                onClick={refreshDevices}
              >
                <RefreshCw className={isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden="true" />
              </IconButton>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{t('share_radar_desc')}</p>
          </div>

          <Button
            variant={isScanning ? 'secondary' : 'primary'}
            onClick={isScanning ? stopRadar : startRadar}
          >
            <Radar className="size-4" aria-hidden="true" />
            {t(isScanning ? 'share_stop_radar' : 'share_enable_radar')}
          </Button>
        </div>

        {isScanning && (
          <StatusNotice className="mt-4" tone="success">
            <span>{t('share_radar_active_hint')}</span>{' '}
            <strong>{t('share_radar_remaining')} {radarRemainingSeconds}s</strong>
          </StatusNotice>
        )}
        {!isScanning && radarStoppedMessage && (
          <StatusNotice className="mt-4" tone="info">{radarStoppedMessage}</StatusNotice>
        )}
        {connectionFeedback && (
          <StatusNotice className="mt-4" tone={connectionFeedback.tone}>{connectionFeedback.message}</StatusNotice>
        )}

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {deviceIds.length === 0 && (
            <li className="text-sm text-[var(--muted)]">{t('share_no_devices')}</li>
          )}
          {deviceIds.map((deviceId) => {
            const isMe = deviceId === myDeviceId;
            const isConnected = Boolean(peers?.[deviceId]?.connected);
            const connectionStatus = peers?.[deviceId]?.status;
            const isConnecting = connectingTo === deviceId
              && connectionStatus !== 'failed'
              && connectionStatus !== 'offline';
            const canRetry = connectionStatus === 'failed' || connectionStatus === 'offline';

            return (
              <li key={deviceId} className="flex min-h-14 items-center justify-between gap-3 rounded-[9px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`size-2 shrink-0 rounded-full ${isConnected ? 'bg-[var(--success)]' : isMe ? 'bg-[var(--accent)]' : 'bg-[var(--line-strong)]'}`}
                    aria-hidden="true"
                  />
                  <span className="truncate font-mono text-xs text-[var(--text)]">
                    {deviceId} {isMe ? t('share_you') : ''}
                  </span>
                </div>
                {!isMe && (
                  isConnected ? (
                    <span className="shrink-0 text-xs font-medium text-[var(--success)]">{t('share_connected')}</span>
                  ) : (
                    <div className="flex shrink-0 items-center gap-2">
                      {canRetry && (
                        <span className="inline-flex items-center gap-1 text-xs text-[var(--danger)]">
                          <CircleAlert className="size-3.5" aria-hidden="true" />
                          {t(connectionStatus === 'offline' ? 'share_offline' : 'share_failed')}
                        </span>
                      )}
                      <Button
                        variant="secondary"
                        loading={isConnecting}
                        onClick={() => connectDevice(deviceId)}
                      >
                        {t(isConnecting ? 'share_connecting' : canRetry ? 'share_retry_connection' : 'share_connect_btn')}
                      </Button>
                    </div>
                  )
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <label
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        className={`flex min-h-56 w-full flex-col items-center justify-center rounded-[10px] border-2 border-dashed px-5 py-10 text-center transition-colors ${activePeersCount > 0 ? 'cursor-pointer border-[var(--line-strong)] bg-[var(--page-soft)] hover:border-[var(--accent)]' : 'cursor-not-allowed border-[var(--line)] bg-[var(--page-soft)] opacity-70'}`}
      >
        <UploadCloud className={`size-10 ${activePeersCount > 0 ? 'text-[var(--accent)]' : 'text-[var(--faint)]'}`} aria-hidden="true" />
        <span className="mt-4 font-medium text-[var(--text-strong)]">{t('share_click_to_upload')}</span>
        <span className="mt-1 text-sm text-[var(--muted)]">{t('share_or_drag')}</span>
        <span className="mt-3 text-xs leading-5 text-[var(--faint)]">
          {activePeersCount > 0 ? t('share_file_limit') : t('share_upload_needs_peer')}
        </span>
        <input
          type="file"
          className="sr-only"
          multiple
          onChange={(event) => addFiles(event.target.files)}
          disabled={activePeersCount === 0}
        />
      </label>

      <FileListSection title={t('share_staged_files')} files={stagedFiles} emptyText={t('share_no_staged_files')} />

      <FileListSection
        title={t('share_available_files')}
        files={availableFiles}
        emptyText={t('share_no_available_files')}
        renderAction={(file) => (
          <Button onClick={() => requestFile(file)}>{t('share_receive_btn')}</Button>
        )}
      />

      <section aria-labelledby="transfer-heading">
        <h2 id="transfer-heading" className="font-brand text-xl font-semibold text-[var(--text-strong)]">
          {t('share_transfers')}
        </h2>
        {transfers.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">{t('share_no_transfers')}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {transfers.map((transfer) => {
              const isComplete = transfer.status === 'completed';
              const isFailed = transfer.status === 'failed';
              const directionLabel = transfer.direction === 'receive' ? t('share_receiving') : t('share_sending');
              return (
                <li key={transfer.id} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="flex items-start gap-3">
                    <FileIcon className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-[var(--text-strong)]">{transfer.name}</span>
                        <span className="text-xs text-[var(--faint)]">{formatSize(transfer.size)}</span>
                      </div>
                      <div
                        role="progressbar"
                        aria-label={`${transfer.name}: ${directionLabel}`}
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow={transfer.progress}
                        className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--line)]"
                      >
                        <div
                          className={`h-full rounded-full ${isFailed ? 'bg-[var(--danger)]' : isComplete ? 'bg-[var(--success)]' : 'bg-[var(--accent)]'}`}
                          style={{ width: `${transfer.progress}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-[var(--muted)]">
                        <span className="flex items-center gap-1.5">
                          {isFailed
                            ? <CircleAlert className="size-3.5 text-[var(--danger)]" aria-hidden="true" />
                            : isComplete
                              ? <CheckCircle2 className="size-3.5 text-[var(--success)]" aria-hidden="true" />
                              : <Clock3 className="size-3.5" aria-hidden="true" />}
                          {isFailed ? t('share_transfer_failed') : isComplete ? t('share_transfer_completed') : directionLabel}
                        </span>
                        <span>{transfer.progress}%</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {isComplete && transfer.direction === 'receive' && transfer.url && (
                        <a
                          href={transfer.url}
                          download={transfer.name}
                          aria-label={t('share_download_transfer')}
                          className="inline-flex size-11 items-center justify-center rounded-[10px] text-[var(--accent)] hover:bg-[var(--page-soft)]"
                        >
                          <Download className="size-4" aria-hidden="true" />
                        </a>
                      )}
                      <IconButton label={t('share_remove_transfer')} onClick={() => removeTransfer(transfer.id)}>
                        <X className="size-4" aria-hidden="true" />
                      </IconButton>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function FileListSection({ emptyText, files, renderAction, title }) {
  return (
    <section>
      <h2 className="font-brand text-xl font-semibold text-[var(--text-strong)]">{title}</h2>
      {files.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">{emptyText}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {files.map((file) => (
            <li key={file.id} className="flex min-h-14 items-center gap-3 rounded-[9px] border border-[var(--line)] bg-[var(--page-soft)] px-3 py-2">
              <FileIcon className="size-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-strong)]">{file.name}</span>
              <span className="shrink-0 text-xs text-[var(--faint)]">{formatSize(file.size)}</span>
              {renderAction?.(file)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
