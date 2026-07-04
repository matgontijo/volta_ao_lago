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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { token, profile } = await login(username.trim(), password);
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
        <img src="/logo.png" width={120} alt="Logo" />
        <h1>Canelas do Planalto</h1>
        <p>Painel do Co-piloto</p>
      </div>

      <div className="card">
        <label>Usuário</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
          autoComplete="username"
        />
        <label>Senha</label>
        <input
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && username.trim() && submit()}
        />
        {error && <div className="error">{error}</div>}
        <button
          className="btn btn-primary big"
          disabled={busy || !username.trim() || !password}
          onClick={submit}
        >
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </div>

      <div className="quick">
        <span>Preencher usuário</span>
        {QUICK.map((q) => (
          <button
            key={q.user}
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => setUsername(q.user)}
          >
            {q.label}
          </button>
        ))}
        <small>Prefira o QR code gerado pela torre — entra sem digitar.</small>
      </div>
    </div>
  );
}
