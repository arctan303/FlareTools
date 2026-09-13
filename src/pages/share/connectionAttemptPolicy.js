export function createConnectionAttemptTimer({
  clearTimeoutFn = clearTimeout,
  durationMs = 15000,
  setTimeoutFn = setTimeout,
}) {
  let target = null;
  let timerId = null;
  let generation = 0;

  const finish = (expectedTarget) => {
    if (expectedTarget && target !== expectedTarget) return false;
    if (timerId !== null) clearTimeoutFn(timerId);
    const hadAttempt = target !== null;
    generation += 1;
    target = null;
    timerId = null;
    return hadAttempt;
  };

  return {
    dispose: () => finish(),
    finish,
    getTarget: () => target,
    start(nextTarget, onTimeout) {
      finish();
      const attemptGeneration = ++generation;
      target = nextTarget;
      timerId = setTimeoutFn(() => {
        if (generation !== attemptGeneration || target !== nextTarget) return;
        const expiredTarget = target;
        generation += 1;
        target = null;
        timerId = null;
        onTimeout?.(expiredTarget);
      }, durationMs);
    },
  };
}

export function settleConnectionAttempt(timer, { deviceId, devicePresent, peer }) {
  if (!deviceId) return null;
  const outcome = peer?.connected
    ? 'connected'
    : peer?.status === 'failed' || peer?.status === 'offline' || !devicePresent
      ? 'failed'
      : null;
  if (!outcome) return null;
  return timer.finish(deviceId) ? outcome : null;
}

export function reconcileConnectionAttempt(timer, {
  cancelAttempt,
  deviceId,
  devicePresent,
  onSettled,
  peer,
}) {
  const outcome = settleConnectionAttempt(timer, { deviceId, devicePresent, peer });
  if (!outcome) return null;
  if (outcome === 'failed') cancelAttempt?.(deviceId, 'failed');
  onSettled?.(deviceId, outcome);
  return outcome;
}

export function replaceConnectionAttempt(timer, {
  cancelPrevious,
  nextTarget,
  onTimeout,
}) {
  const previousTarget = timer.getTarget();
  if (previousTarget && previousTarget !== nextTarget) cancelPrevious?.(previousTarget);
  timer.start(nextTarget, onTimeout);
  return previousTarget;
}
