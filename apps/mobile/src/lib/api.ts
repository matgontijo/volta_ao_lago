import type { JwtProfile } from './types';

export const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3001' : '');

export interface LoginResult {
  token: string;
  profile: JwtProfile;
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
