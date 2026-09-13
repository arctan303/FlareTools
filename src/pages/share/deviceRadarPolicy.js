export const RADAR_INTERVAL_MS = 4000;
export const RADAR_MAX_DURATION_MS = 60000;

export function createRadarController({
  clearIntervalFn = clearInterval,
  clearTimeoutFn = clearTimeout,
  intervalMs = RADAR_INTERVAL_MS,
  maxDurationMs = RADAR_MAX_DURATION_MS,
  onActiveChange = () => {},
  poll,
  setIntervalFn = setInterval,
  setTimeoutFn = setTimeout,
}) {
  let intervalId = null;
  let inFlight = null;
  let timeoutId = null;

  const runPoll = () => {
    if (inFlight) return inFlight;
    const request = Promise.resolve().then(poll);
    const trackedRequest = request.finally(() => {
      if (inFlight === trackedRequest) inFlight = null;
    });
    inFlight = trackedRequest;
    return trackedRequest;
  };

  const stop = (reason = 'manual') => {
    const wasActive = intervalId !== null;
    if (intervalId !== null) clearIntervalFn(intervalId);
    if (timeoutId !== null) clearTimeoutFn(timeoutId);
    intervalId = null;
    timeoutId = null;
    if (wasActive) onActiveChange(false, reason);
  };

  const start = (requestedDurationMs = maxDurationMs) => {
    const durationMs = Math.min(Math.max(requestedDurationMs, 0), maxDurationMs);

    if (intervalId !== null || durationMs === 0) return inFlight;

    onActiveChange(true, 'started');
    timeoutId = setTimeoutFn(() => stop('timeout'), durationMs);
    intervalId = setIntervalFn(() => {
      void runPoll().catch(() => {});
    }, intervalMs);
    const initialRequest = runPoll();
    void initialRequest.catch(() => {});
    return initialRequest;
  };

  return {
    isActive: () => intervalId !== null,
    refresh: runPoll,
    start,
    stop,
  };
}
