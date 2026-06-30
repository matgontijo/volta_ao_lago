import { io, Socket } from 'socket.io-client';
import { API_URL } from './api';

export function connectSocket(token: string): Socket {
  return io(API_URL || undefined, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
}
