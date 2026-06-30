import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { connectSocket } from './lib/socket';
import type { JwtProfile } from './lib/types';
import { LoginScreen } from './screens/LoginScreen';
import { OperateScreen } from './screens/OperateScreen';

const TOKEN_KEY = 'volta.token';
const PROFILE_KEY = 'volta.profile';

export function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [profile, setProfile] = useState<JwtProfile | null>(() => {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as JwtProfile) : null;
  });
  const [socket, setSocket] = useState<Socket | null>(null);

  // Link mágico / QR: ?token=... loga automaticamente e limpa a URL.
  useEffect(() => {
    const url = new URL(window.location.href);
    const t = url.searchParams.get('token');
    if (!t) return;
    const p = decodeJwt(t);
    if (p && p.role) {
      onLogin(t, {
        sub: p.sub,
        name: p.name,
        role: p.role,
        teamId: p.teamId ?? null,
        teamName: p.teamName ?? null,
        vehicleId: p.vehicleId ?? null,
        vehicleRole: p.vehicleRole ?? null,
      });
    }
    url.searchParams.delete('token');
    window.history.replaceState({}, '', url.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!token) {
      setSocket(null);
      return;
    }
    const s = connectSocket(token);
    s.on('auth:error', logout);
    setSocket(s);
    return () => {
      s.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function onLogin(t: string, p: JwtProfile) {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    setToken(t);
    setProfile(p);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
    setToken(null);
    setProfile(null);
  }

  if (!token || !profile) return <LoginScreen onLogin={onLogin} />;
  return <OperateScreen socket={socket} profile={profile} onLogout={logout} />;
}

function decodeJwt(token: string): (JwtProfile & { exp?: number }) | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}
