import type { Bootstrap, JwtProfile, ReplayFrame } from './types';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export async function login(username: string, password: string): Promise<{ token: string; profile: JwtProfile }> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error('Falha no login');
  return res.json();
}

export async function fetchBootstrap(): Promise<Bootstrap> {
  const res = await fetch(`${API_URL}/race/bootstrap`);
  if (!res.ok) throw new Error('Falha ao carregar percurso');
  return res.json();
}

export async function fetchReplay(): Promise<ReplayFrame[]> {
  const res = await fetch(`${API_URL}/race/replay`);
  if (!res.ok) throw new Error('Falha ao carregar replay');
  return res.json();
}

export async function resetRace(token: string): Promise<void> {
  const res = await fetch(`${API_URL}/admin/reset`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Falha ao reiniciar a prova');
}

export async function forceTroca(token: string, teamId: number): Promise<void> {
  const res = await fetch(`${API_URL}/admin/troca/${teamId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Falha ao forçar troca');
}

export async function movePc(token: string, id: number, lat: number, lng: number): Promise<void> {
  const res = await fetch(`${API_URL}/admin/pc/${id}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ lat, lng }),
  });
  if (!res.ok) throw new Error('Falha ao mover PC');
}

export interface RosterUser {
  id: number;
  username: string;
  display_name: string;
  role: string;
  team_name: string | null;
  color_hex: string | null;
  vehicle_role: 'van_pickup' | 'carro_dropoff' | null;
}

export async function fetchUsers(token: string): Promise<RosterUser[]> {
  const res = await fetch(`${API_URL}/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Falha ao listar usuários');
  return res.json();
}

export async function getMagicLink(token: string, userId: number): Promise<string> {
  const res = await fetch(`${API_URL}/admin/magic-link/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Falha ao gerar link');
  return (await res.json()).token;
}

export async function rebuildRoute(token: string): Promise<{ totalKm: number }> {
  const res = await fetch(`${API_URL}/admin/route/rebuild`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Falha ao recalcular rota');
  return res.json();
}

export async function getSettings(token: string): Promise<{ geofenceRadiusM: number }> {
  const res = await fetch(`${API_URL}/admin/settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Falha ao ler configurações');
  return res.json();
}

export async function updateSettings(
  token: string,
  patch: { geofenceRadiusM?: number },
): Promise<{ geofenceRadiusM: number }> {
  const res = await fetch(`${API_URL}/admin/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Falha ao salvar configurações');
  return res.json();
}

export async function optimizeRoute(token: string): Promise<{ totalKm: number }> {
  const res = await fetch(`${API_URL}/admin/route/optimize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Falha ao otimizar ordem');
  return res.json();
}

export async function importCourse(
  token: string,
  points: { lat: number; lng: number; name?: string }[],
): Promise<{ count: number; totalKm: number }> {
  const res = await fetch(`${API_URL}/admin/course/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ points }),
  });
  if (!res.ok) throw new Error('Falha ao importar trajeto');
  return res.json();
}

export async function reorderPcs(token: string, order: number[]): Promise<void> {
  const res = await fetch(`${API_URL}/admin/route/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ order }),
  });
  if (!res.ok) throw new Error('Falha ao reordenar');
}
