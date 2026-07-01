import { io, Socket } from 'socket.io-client';
import { API_URL } from './api';

export function connectSocket(token: string, driverName?: string, deviceId?: string): Socket {
  return io(API_URL || undefined, {
    auth: { token },
    query: { driverName, deviceId },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
}
