import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { connectSocket } from './lib/socket';
import type { JwtProfile } from './lib/types';
import { LoginScreen } from './screens/LoginScreen';
import { OperateScreen } from './screens/OperateScreen';

const TOKEN_KEY = 'volta.token';
const PROFILE_KEY = 'volta.profile';
const DRIVER_KEY = 'volta.driverName';
const DEVICE_KEY = 'volta.deviceId';

export function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [profile, setProfile] = useState<JwtProfile | null>(() => {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as JwtProfile) : null;
  });
  
  const [driverName, setDriverName] = useState<string | null>(() => localStorage.getItem(DRIVER_KEY));
  const [deviceId] = useState<string>(() => {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = Math.random().toString(36).substring(2, 15);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
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
    if (!token || !driverName) {
      setSocket(null);
      return;
    }
    const s = connectSocket(token, driverName, deviceId);
    s.on('auth:error', (err: any) => {
      alert(err.message || 'Desconectado');
      logout();
    });
    setSocket(s);
    return () => {
      s.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, driverName]);

  function onLogin(t: string, p: JwtProfile) {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    setToken(t);
    setProfile(p);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(DRIVER_KEY);
    setToken(null);
    setProfile(null);
    setDriverName(null);
  }

  if (!token || !profile) return <LoginScreen onLogin={onLogin} />;
  if (!driverName) return <IdentityScreen onSave={(name) => { localStorage.setItem(DRIVER_KEY, name); setDriverName(name); }} />;
  return <OperateScreen socket={socket} profile={profile} onLogout={logout} />;
}

function IdentityScreen({ onSave }: { onSave: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="screen login">
      <div className="card identity-card">
        <img src="/logo.png" width={100} alt="Logo" style={{ margin: '0 auto 10px', display: 'block' }} />
        <h2>Quem está operando?</h2>
        <p>Informe seu nome para iniciar o rastreio.</p>
        <input 
          autoFocus
          placeholder="Seu nome (ex: João)" 
          value={name} 
          onChange={e => setName(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && name.trim() && onSave(name.trim())}
        />
        <button 
          className="btn btn-primary big" 
          disabled={!name.trim()} 
          onClick={() => onSave(name.trim())}
        >
          Iniciar Rastreio
        </button>
      </div>
    </div>
  );
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
