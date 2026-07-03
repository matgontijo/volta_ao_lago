import type { JwtProfile } from './types';

export const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3001' : '');

export interface LoginResult {
  token: string;
  profile: JwtProfile;
}

/** Roteirização: melhor caminho de carro da van até o próximo PC. */
export interface DriveRoute {
  pcName: string;
  distanceM: number;
  durationSec: number;
}

export async function fetchDriveRoute(teamId: number): Promise<DriveRoute | null> {
  const res = await fetch(`${API_URL}/race/drive-route/${teamId}`);
  if (!res.ok) return null;
  const body = await res.text();
  return body ? (JSON.parse(body) as DriveRoute) : null;
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(res.status === 401 ? 'Usuário ou senha inválidos' : 'Falha no login');
  }
  return res.json();
}
