// Room limits shared by the text-share UI.
//
// MAX_TEXT_LENGTH mirrors the Worker-side constant in
// worker/api/text-share.js. The Worker owns enforcement; this copy
// exists so the editor can warn before a save is rejected.
// tests/share-policy.test.mjs asserts the two values stay equal.
export const MAX_TEXT_LENGTH = 10000;

// Only failed WebSocket connections use a timer. Healthy rooms do not poll.
export const CONNECTION_RETRY_BASE_MS = 1000;
export const CONNECTION_RETRY_MAX_MS = 30000;
