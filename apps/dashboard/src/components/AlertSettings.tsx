import { useEffect, useState } from 'react';
import { getSettings, updateSettings } from '../lib/api';

export interface AlertPrefs {
  sound: boolean;
  staleSeconds: number;
  showGeofence: boolean;
}

interface Props {
  token: string;
  prefs: AlertPrefs;
  onPrefs: (p: AlertPrefs) => void;
  onClose: () => void;
}

export function AlertSettings({ token, prefs, onPrefs, onClose }: Props) {
  const [radius, setRadius] = useState<number>(350);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    getSettings(token)
      .then((s) => setRadius(s.geofenceRadiusM))
      .catch(() => {});
  }, [token]);

  async function saveRadius() {
    setSaving(true);
    try {
      const s = await updateSettings(token, { geofenceRadiusM: radius });
      setRadius(s.geofenceRadiusM);
      setSavedMsg('Raio salvo ✓');
      setTimeout(() => setSavedMsg(null), 2000);
    } catch (e) {
      setSavedMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Configurar alertas</h2>
          <button className="link" onClick={onClose}>
            fechar
          </button>
        </div>

        <div className="set-row">
          <div>
            <strong>Raio de aproximação (geofence)</strong>
            <small>Distância do PC que dispara o alerta de chegada. Vale para todos.</small>
          </div>
          <div className="set-ctl">
            <input
              type="range"
              min={100}
              max={1500}
              step={50}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            />
            <span className="set-val">{radius} m</span>
            <button className="ctrl primary" disabled={saving} onClick={saveRadius}>
              {saving ? '…' : 'Salvar'}
            </button>
          </div>
        </div>

        <div className="set-row">
          <div>
            <strong>Alerta sonoro</strong>
            <small>Toca um bipe quando uma equipe se aproxima de um PC.</small>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={prefs.sound}
              onChange={(e) => onPrefs({ ...prefs, sound: e.target.checked })}
            />
            <span className="slider" />
          </label>
        </div>

        <div className="set-row">
          <div>
            <strong>Mostrar alertas de aproximação</strong>
            <small>Exibir o feed de aproximação de PCs.</small>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={prefs.showGeofence}
              onChange={(e) => onPrefs({ ...prefs, showGeofence: e.target.checked })}
            />
            <span className="slider" />
          </label>
        </div>

        <div className="set-row">
          <div>
            <strong>Veículo "caiu" após</strong>
            <small>Tempo sem GPS para marcar o veículo em vermelho na Frota.</small>
          </div>
          <div className="set-ctl">
            <input
              type="range"
              min={10}
              max={120}
              step={5}
              value={prefs.staleSeconds}
              onChange={(e) => onPrefs({ ...prefs, staleSeconds: Number(e.target.value) })}
            />
            <span className="set-val">{prefs.staleSeconds} s</span>
          </div>
        </div>

        {savedMsg && <div className="muted" style={{ marginTop: 10 }}>{savedMsg}</div>}
      </div>
    </div>
  );
}
