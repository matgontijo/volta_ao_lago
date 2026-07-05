import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { validateToken } from './lib/api';
import { connectSocket } from './lib/socket';
import type { JwtProfile } from './lib/types';
import { GateShell } from './screens/GateShell';
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

  // Link mágico / QR: valida o token NO SERVIDOR antes de aceitar.
  // 'checking' bloqueia a tela até a resposta; erro mostra tela dedicada.
  const [magicState, setMagicState] = useState<'idle' | 'checking' | 'error'>(() =>
    new URL(window.location.href).searchParams.get('token') ? 'checking' : 'idle',
  );
  const [magicError, setMagicError] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const t = url.searchParams.get('token');
    if (!t) return;
    // Limpa a URL imediatamente (o token não deve ficar no histórico).
    url.searchParams.delete('token');
    window.history.replaceState({}, '', url.pathname);

    validateToken(t)
      .then((p) => {
        onLogin(t, p);
        setMagicState('idle');
      })
      .catch((e) => {
        setMagicError((e as Error).message);
        setMagicState('error');
      });
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

  if (magicState === 'checking') {
    return (
      <GateShell sub="QR Code">
        <div className="card identity-card">
          <div className="gate-spinner" aria-hidden />
          <h2>Validando acesso…</h2>
          <p>Conferindo seu QR code com a torre.</p>
        </div>
      </GateShell>
    );
  }

  if (magicState === 'error') {
    return (
      <GateShell sub="QR Code">
        <div className="card identity-card">
          <h2>⚠️ QR code não aceito</h2>
          <p>{magicError}</p>
          <button className="btn btn-primary big" onClick={() => setMagicState('idle')}>
            Entrar de outro jeito
          </button>
        </div>
      </GateShell>
    );
  }

  if (!token || !profile) return <LoginScreen onLogin={onLogin} />;
  if (!driverName) return <IdentityScreen onSave={(name) => { localStorage.setItem(DRIVER_KEY, name); setDriverName(name); }} />;
  return <OperateScreen socket={socket} profile={profile} driverName={driverName} onLogout={logout} />;
}

function IdentityScreen({ onSave }: { onSave: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <GateShell sub="Identificação">
      <div className="card identity-card">
        <h2>Quem está operando?</h2>
        <p>Informe seu nome para iniciar o rastreio.</p>
        <input
          autoFocus
          placeholder="Seu nome (ex: João)"
          value={name}
          maxLength={40}
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
    </GateShell>
  );
}
