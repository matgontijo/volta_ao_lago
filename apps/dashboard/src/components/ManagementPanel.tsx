import { useEffect, useState } from 'react';
import {
  addAthlete,
  deleteAthlete,
  fetchManagement,
  patchAthlete,
  patchTeam,
  resetUserPassword,
  type ManagementTeam,
} from '../lib/api';

interface Props {
  token: string;
  onClose: () => void;
  onChanged: () => void; // recarrega bootstrap/estado no App
}

export function ManagementPanel({ token, onClose, onChanged }: Props) {
  const [teams, setTeams] = useState<ManagementTeam[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [newAthlete, setNewAthlete] = useState<Record<number, string>>({});
  const [pwd, setPwd] = useState<Record<number, string>>({});

  async function load() {
    try {
      setTeams(await fetchManagement(token));
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(fn: () => Promise<unknown>) {
    setErr(null);
    try {
      await fn();
      await load();
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal mgmt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Gestão de equipes</h2>
          <button className="link" onClick={onClose}>
            fechar
          </button>
        </div>
        {err && <div className="gate-error">{err}</div>}

        {teams.map((t) => (
          <div className="mgmt-team" key={t.id}>
            <div className="mgmt-team-head">
              <input
                type="color"
                defaultValue={t.color_hex}
                title="Cor no mapa"
                onChange={(e) => run(() => patchTeam(token, t.id, { colorHex: e.target.value }))}
              />
              <input
                className="mgmt-name"
                defaultValue={t.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== t.name) run(() => patchTeam(token, t.id, { name: v }));
                }}
              />
              <span className="mgmt-cat">{t.category.replace('elite_', 'elite ').replace('_', ' ')}</span>
            </div>

            <div className="mgmt-section">Atletas ({t.athletes.length})</div>
            <ul className="mgmt-list">
              {t.athletes.map((a) => (
                <li key={a.id}>
                  <input
                    className="mgmt-inline"
                    defaultValue={a.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== a.name) run(() => patchAthlete(token, a.id, { name: v }));
                    }}
                  />
                  <button
                    className="mgmt-del"
                    title="Remover atleta"
                    onClick={() => {
                      if (confirm(`Remover ${a.name}? O rodízio será refeito.`))
                        run(() => deleteAthlete(token, a.id));
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
              <li className="mgmt-add">
                <input
                  className="mgmt-inline"
                  placeholder="Novo atleta…"
                  value={newAthlete[t.id] ?? ''}
                  onChange={(e) => setNewAthlete((p) => ({ ...p, [t.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (newAthlete[t.id] ?? '').trim()) {
                      run(() => addAthlete(token, t.id, newAthlete[t.id].trim()));
                      setNewAthlete((p) => ({ ...p, [t.id]: '' }));
                    }
                  }}
                />
                <button
                  className="ctrl"
                  disabled={!(newAthlete[t.id] ?? '').trim()}
                  onClick={() => {
                    run(() => addAthlete(token, t.id, newAthlete[t.id].trim()));
                    setNewAthlete((p) => ({ ...p, [t.id]: '' }));
                  }}
                >
                  + adicionar
                </button>
              </li>
            </ul>

            <div className="mgmt-section">Logins</div>
            <ul className="mgmt-list">
              {t.users.map((u) => (
                <li key={u.id}>
                  <span className="mgmt-user">
                    <b>{u.username}</b>
                    <small>
                      {u.vehicle_role === 'van_pickup'
                        ? 'Van — co-piloto'
                        : u.vehicle_role === 'carro_dropoff'
                          ? 'Carro — motorista'
                          : u.role}
                    </small>
                  </span>
                  {pwd[u.id] ? (
                    <span className="mgmt-pwd">
                      nova senha: <b>{pwd[u.id]}</b>
                    </span>
                  ) : (
                    <button
                      className="ctrl"
                      onClick={() =>
                        run(async () => {
                          const r = await resetUserPassword(token, u.id);
                          setPwd((p) => ({ ...p, [u.id]: r.password }));
                        })
                      }
                    >
                      gerar nova senha
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="muted" style={{ marginTop: 10 }}>
          Alterar atletas refaz o rodízio dos trechos ainda não corridos. A senha gerada
          aparece <b>uma única vez</b> — anote e repasse ao motorista.
        </p>
      </div>
    </div>
  );
}
