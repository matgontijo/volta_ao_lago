import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { fetchUsers, getMagicLink, type RosterUser } from '../lib/api';

const MOBILE_URL = import.meta.env.VITE_MOBILE_URL ?? `${window.location.origin}/mobile`;

function roleLabel(u: RosterUser): string {
  if (u.vehicle_role === 'van_pickup') return 'Van — co-piloto';
  if (u.vehicle_role === 'carro_dropoff') return 'Carro — motorista';
  return u.role;
}

export function AdminPanel({ token, onClose }: { token: string; onClose: () => void }) {
  const [users, setUsers] = useState<RosterUser[]>([]);
  const [qr, setQr] = useState<Record<number, string>>({});
  const [links, setLinks] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers(token).then(setUsers).catch((e) => setError((e as Error).message));
  }, [token]);

  async function gen(u: RosterUser) {
    try {
      const mt = await getMagicLink(token, u.id);
      const url = `${MOBILE_URL}/?token=${mt}`;
      const dataUrl = await QRCode.toDataURL(url, { width: 220, margin: 1 });
      setQr((p) => ({ ...p, [u.id]: dataUrl }));
      setLinks((p) => ({ ...p, [u.id]: url }));
    } catch (e) {
      setError((e as Error).message);
    }
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
          Cada motorista/co-piloto escaneia o QR (entra sem digitar) ou usa o
          login + senha <b>volta2026</b>. Aponte cada celular para o seu veículo.
        </p>
        {error && <div className="gate-error">{error}</div>}
        <div className="acc-grid">
          {users.map((u) => (
            <div className="acc-card" key={u.id}>
              <div className="acc-info">
                <i className="swatch" style={{ background: u.color_hex ?? '#888' }} />
                <div>
                  <strong>{(u.team_name ?? '-').replace('Canelas do Planalto — ', '')}</strong>
                  <small>{roleLabel(u)}</small>
                  <small className="cred">{u.username} / volta2026</small>
                </div>
              </div>
              {qr[u.id] ? (
                <div className="acc-qr">
                  <img className="qr" src={qr[u.id]} alt={`QR ${u.username}`} />
                  <button className="ctrl" onClick={() => navigator.clipboard?.writeText(links[u.id])}>
                    Copiar link
                  </button>
                </div>
              ) : (
                <button className="ctrl primary" onClick={() => gen(u)}>
                  Gerar QR
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
