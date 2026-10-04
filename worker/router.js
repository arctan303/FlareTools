import { onRequest as textShare } from './api/text-share.js';
import { onRequest as network } from './api/network.js';
import { onRequest as mock } from './api/mock.js';

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    const common = { request, env, waitUntil: ctx.waitUntil.bind(ctx) };
    const textMatch = path.match(/^\/api\/text-share\/([^/]+)$/);
    if (textMatch) return textShare({ ...common, params: { action: [textMatch[1]] } });
    if (path === '/api/network') return network(common);
    const mockMatch = path.match(/^\/api\/mock\/([^/]+)$/);
    if (mockMatch) return mock({ ...common, params: { action: [mockMatch[1]] } });
    if (path === '/api' || path.startsWith('/api/')) return Response.json({ success: false, code: 'UNKNOWN_ACTION' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env) {
    if (!env.DB) return;
    // Indexed, bounded physical cleanup; expiry is enforced on reads immediately.
    await env.DB.prepare('DELETE FROM rooms_kv WHERE key IN (SELECT key FROM rooms_kv WHERE expires_at <= ? ORDER BY expires_at LIMIT 1000)')
      .bind(Math.floor(Date.now() / 1000)).run();
  },
};
