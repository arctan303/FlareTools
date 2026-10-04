import { DurableObject } from 'cloudflare:workers';
import { TextRoomHandler, TextQuotaHandler } from './room.js';

export class TextRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.handler = new TextRoomHandler(ctx);
  }
  fetch(request) { return this.handler.fetch(request); }
  alarm() { return this.handler.alarm(); }
  webSocketMessage(socket, message) { return this.handler.webSocketMessage(socket, message); }
  webSocketClose(socket, code, reason) { return this.handler.webSocketClose(socket, code, reason); }
  webSocketError(socket) { return this.handler.webSocketError(socket); }
}

export class TextQuota extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.handler = new TextQuotaHandler(ctx);
  }
  fetch(request) { return this.handler.fetch(request); }
  alarm() { return this.handler.alarm(); }
}
