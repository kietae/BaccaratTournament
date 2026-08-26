'use client';

import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ autoConnect: true, transports: ['websocket', 'polling'] });
    socket.on('connect', () => console.log('[socket] connected', socket!.id));
    socket.on('connect_error', (err) => console.log('[socket] connect_error', err.message));
    socket.on('disconnect', (reason) => console.log('[socket] disconnect', reason));
  }
  return socket;
}

export function ack<T = { ok: boolean; error?: string; [key: string]: unknown }>(
  event: string,
  payload: unknown
): Promise<T> {
  return new Promise((resolve) => {
    getSocket().emit(event, payload, (res: T) => resolve(res));
  });
}

export const PLAYER_TOKEN_KEY = 'baccarat.playerToken';
export const ADMIN_TOKEN_KEY = 'baccarat.adminToken';
