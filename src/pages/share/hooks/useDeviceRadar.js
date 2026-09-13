import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRadarController, RADAR_MAX_DURATION_MS } from '../deviceRadarPolicy';

export default function useDeviceRadar({ enabled, poll }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [stopReason, setStopReason] = useState(null);
  const countdownRef = useRef(null);
  const controllerRef = useRef(null);
  const mountedRef = useRef(true);
  const pollRef = useRef(poll);

  useLayoutEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const controller = createRadarController({
      poll: () => pollRef.current(),
      onActiveChange: (nextActive, reason) => {
        if (!active) return;
        setIsScanning(nextActive);
        setStopReason(nextActive ? null : reason);
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = null;
        if (nextActive) {
          setRemainingSeconds(Math.ceil(RADAR_MAX_DURATION_MS / 1000));
          countdownRef.current = setInterval(() => {
            setRemainingSeconds((seconds) => Math.max(0, seconds - 1));
          }, 1000);
        } else {
          setRemainingSeconds(0);
        }
      },
    });
    controllerRef.current = controller;
    return () => {
      active = false;
      if (countdownRef.current) clearInterval(countdownRef.current);
      controller.stop('unmount');
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled) controllerRef.current?.stop('disabled');
  }, [enabled]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) controllerRef.current?.stop('hidden');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      controllerRef.current?.stop('unmount');
    };
  }, []);

  const start = useCallback(() => {
    if (enabled && !document.hidden) controllerRef.current?.start();
  }, [enabled]);
  const stop = useCallback(() => controllerRef.current?.stop('manual'), []);
  const refresh = useCallback(async () => {
    if (!enabled || document.hidden) return;
    setIsRefreshing(true);
    try {
      await controllerRef.current?.refresh();
    } finally {
      if (mountedRef.current) setIsRefreshing(false);
    }
  }, [enabled]);

  return { isRefreshing, isScanning, refresh, remainingSeconds, start, stop, stopReason };
}
