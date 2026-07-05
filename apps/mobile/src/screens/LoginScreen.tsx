import { useEffect, useState } from 'react';
import { login, quickLogin, quickRoster, type QuickUser } from '../lib/api';
import type { JwtProfile } from '../lib/types';

interface Props {
  onLogin: (token: string, profile: JwtProfile) => void;
}

/**
 * Login sem senha: um botão por veículo (van/carro de cada equipe) — o
 * co-piloto toca no dele e pronto. Se o servidor estiver com OPEN_LOGIN=off,
 * cai no formulário de usuário/senha.
 */
export function LoginScreen({ onLogin }: Props) {
  const [roster, setRoster] = useState<QuickUser[] | null>(null);
  const [mode, setMode] = useState<'quick' | 'form'>('quick');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    quickRoster()
      .then(setRoster)
      .catch(() => setMode('form')); // OPEN_LOGIN=off ou servidor antigo
  }, []);

  async function quick(u: QuickUser) {
    setBusy(u.username);
    setError(null);
    try {
      const { token, profile } = await quickLogin(u.username);
      onLogin(token, profile);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setBusy('form');
    setError(null);
    try {
      const { token, profile } = await login(username.trim(), password);
      onLogin(token, profile);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="screen login">
      <div className="brand">
        <img src="/logo.png" width={120} alt="Logo" />
        <h1>Canelas do Planalto</h1>
        <p>Painel do Co-piloto</p>
      </div>

      {mode === 'quick' ? (
        <div className="card">
          <label>Toque no seu veículo</label>
          {error && <div className="error">{error}</div>}
          <div className="vehicle-list">
            {roster === null && <p className="muted-center">Carregando acessos…</p>}
            {roster?.map((u) => (
              <button
                key={u.username}
                className="btn vehicle-btn"
                style={{ borderLeftColor: u.color_hex ?? '#64748b' }}
                disabled={busy != null}
                onClick={() => quick(u)}
              >
                <span className="vehicle-ico" aria-hidden>
                  {u.vehicle_role === 'van_pickup' ? '🚐' : '🚗'}
                </span>
                <span className="vehicle-label">
                  <strong>{shortTeam(u.team_name)}</strong>
                  <small>
                    {u.vehicle_role === 'van_pickup' ? 'Van — co-piloto (faz a troca)' : 'Carro — motorista'}
                  </small>
                </span>
                {busy === u.username && <span className="muted">…</span>}
              </button>
            ))}
            {roster?.length === 0 && (
              <p className="muted-center">Nenhum acesso cadastrado — fale com a torre.</p>
            )}
          </div>
          <button className="link login-alt" onClick={() => setMode('form')}>
            entrar com usuário e senha
          </button>
        </div>
      ) : (
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
            disabled={busy != null || !username.trim() || !password}
            onClick={submit}
          >
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
          {roster != null && (
            <button className="link login-alt" onClick={() => { setMode('quick'); setError(null); }}>
              voltar para os botões
            </button>
          )}
        </div>
      )}

      <div className="quick">
        <small>Prefira o QR code gerado pela torre — entra direto no seu acesso.</small>
      </div>
    </div>
  );
}

function shortTeam(name: string | null): string {
  return (name ?? 'Equipe').replace('Canelas do Planalto — ', '');
}
