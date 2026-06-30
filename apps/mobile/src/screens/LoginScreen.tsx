import { useState } from 'react';
import { login } from '../lib/api';
import type { JwtProfile } from '../lib/types';

interface Props {
  onLogin: (token: string, profile: JwtProfile) => void;
}

const QUICK = [
  { label: 'Co-piloto — Elite M', user: 'op-falcoes' },
  { label: 'Co-piloto — Elite F', user: 'op-aguias' },
  { label: 'Co-piloto — Misto', user: 'op-lobos' },
];

export function LoginScreen({ onLogin }: Props) {
  const [username, setUsername] = useState('op-falcoes');
  const [password, setPassword] = useState('volta2026');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(user = username) {
    setBusy(true);
    setError(null);
    try {
      const { token, profile } = await login(user, password);
      onLogin(token, profile);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen login">
      <div className="brand">
        <img src="/icon.svg" width={64} height={64} alt="" />
        <h1>Volta do Lago</h1>
        <p>Painel do Co-piloto</p>
      </div>

      <div className="card">
        <label>Usuário</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" />
        <label>Senha</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="error">{error}</div>}
        <button className="btn btn-primary big" disabled={busy} onClick={() => submit()}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </div>

      <div className="quick">
        <span>Acesso rápido (demo)</span>
        {QUICK.map((q) => (
          <button key={q.user} className="btn btn-ghost" disabled={busy} onClick={() => submit(q.user)}>
            {q.label}
          </button>
        ))}
        <small>Senha padrão: volta2026</small>
      </div>
    </div>
  );
}
