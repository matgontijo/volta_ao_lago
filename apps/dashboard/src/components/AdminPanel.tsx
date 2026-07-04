import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { fetchUsers, getMagicLink, validateMagicToken, type RosterUser } from '../lib/api';

const MOBILE_URL = import.meta.env.VITE_MOBILE_URL ?? `${window.location.origin}/mobile`;

function roleLabel(u: RosterUser): string {
  if (u.vehicle_role === 'van_pickup') return 'Van — co-piloto';
  if (u.vehicle_role === 'carro_dropoff') return 'Carro — motorista';
  return u.role;
}

interface QrInfo {
  dataUrl: string;
  link: string;
  token: string;
  expiresAt: string;
  check: 'idle' | 'checking' | 'ok' | 'fail';
  checkMsg?: string;
}

export function AdminPanel({ token, onClose }: { token: string; onClose: () => void }) {
  const [users, setUsers] = useState<RosterUser[]>([]);
  const [qr, setQr] = useState<Record<number, QrInfo>>({});
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    fetchUsers(token).then(setUsers).catch((e) => setError((e as Error).message));
  }, [token]);

  async function gen(u: RosterUser) {
    try {
      const { token: mt, expiresAt } = await getMagicLink(token, u.id);
      const url = `${MOBILE_URL}/?token=${mt}`;
      const dataUrl = await QRCode.toDataURL(url, { width: 220, margin: 1 });
      setQr((p) => ({
        ...p,
        [u.id]: { dataUrl, link: url, token: mt, expiresAt, check: 'idle' },
      }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /** Sanidade: valida o token gerado contra o servidor, na hora. */
  async function testLink(userId: number) {
    const info = qr[userId];
    if (!info) return;
    setQr((p) => ({ ...p, [userId]: { ...info, check: 'checking' } }));
    try {
      const me = await validateMagicToken(info.token);
      setQr((p) => ({
        ...p,
        [userId]: { ...info, check: 'ok', checkMsg: `OK — entra como ${me.name}` },
      }));
    } catch (e) {
      setQr((p) => ({
        ...p,
        [userId]: { ...info, check: 'fail', checkMsg: (e as Error).message },
      }));
    }
  }

  function copy(userId: number) {
    const info = qr[userId];
    if (!info) return;
    navigator.clipboard?.writeText(info.link);
    setCopied(userId);
    setTimeout(() => setCopied((c) => (c === userId ? null : c)), 1600);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Acessos dos celulares</h2>
          <button className="link" onClick={onClose}>
            fechar
          </button>
        </div>
        <p className="muted">
          Cada motorista/co-piloto escaneia o QR e entra sem digitar. Se precisar
          de senha, use <b>Gestão de equipes → nova senha</b> (gera e revoga QRs
          antigos). Aponte cada celular para o seu veículo.
        </p>
        {error && <div className="gate-error">{error}</div>}
        <div className="acc-grid">
          {users.map((u) => {
            const info = qr[u.id];
            return (
              <div className="acc-card" key={u.id}>
                <div className="acc-info">
                  <i className="swatch" style={{ background: u.color_hex ?? '#888' }} />
                  <div>
                    <strong>{(u.team_name ?? '-').replace('Canelas do Planalto — ', '')}</strong>
                    <small>{roleLabel(u)}</small>
                    <small className="cred">{u.username}</small>
                  </div>
                </div>
                {info ? (
                  <div className="acc-qr">
                    <img className="qr" src={info.dataUrl} alt={`QR ${u.username}`} />
                    <small className="muted">
                      válido até{' '}
                      {new Date(info.expiresAt).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </small>
                    <div className="acc-qr-actions">
                      <button className="ctrl" onClick={() => copy(u.id)}>
                        {copied === u.id ? 'Copiado ✓' : 'Copiar link'}
                      </button>
                      <button
                        className="ctrl"
                        disabled={info.check === 'checking'}
                        onClick={() => testLink(u.id)}
                      >
                        {info.check === 'checking' ? 'Testando…' : 'Testar link'}
                      </button>
                    </div>
                    {info.check === 'ok' && <small className="qr-ok">✅ {info.checkMsg}</small>}
                    {info.check === 'fail' && <small className="qr-fail">⚠️ {info.checkMsg}</small>}
                  </div>
                ) : (
                  <button className="ctrl primary" onClick={() => gen(u)}>
                    Gerar QR
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
