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
    const body = await res.json().catch(() => null);
    throw new Error(
      body?.message ??
        (res.status === 401 ? 'Usuário ou senha inválidos' : 'Falha no login'),
    );
  }
  return res.json();
}

/**
 * Valida um token no SERVIDOR (assinatura + expiração + revogação) e devolve
 * o perfil autoritativo. Usado no login por QR/link mágico — decodificar o
 * JWT localmente aceitaria QR vencido/revogado e falharia depois, sem explicação.
 */
export async function validateToken(token: string): Promise<JwtProfile> {
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? 'QR code vencido ou revogado — peça um novo à torre.');
  }
  if (!res.ok) throw new Error('Não foi possível validar o acesso. Verifique a internet.');
  return res.json();
}
