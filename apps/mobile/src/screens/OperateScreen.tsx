import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { useGeoTracking } from '../hooks/useGeoTracking';
import { useWakeLock } from '../hooks/useWakeLock';
import { distanceLabel, etaLabel, paceLabel, secondsToClock } from '../lib/format';
import type { GeofenceAlert, JwtProfile, TeamState, TrocaAck } from '../lib/types';
import { openWaze } from '../lib/waze';

interface Props {
  socket: Socket | null;
  profile: JwtProfile;
  onLogout: () => void;
}

export function OperateScreen({ socket, profile, onLogout }: Props) {
  const geo = useGeoTracking(socket, { autoStart: false, intervalMs: 3000 });
  useWakeLock(geo.tracking);

  const [state, setState] = useState<TeamState | null>(null);
  const [connected, setConnected] = useState(false);
  const [alerts, setAlerts] = useState<GeofenceAlert[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const isOperator = profile.role === 'operator';

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onState = (s: TeamState) => setState(s);
    const onConn = () => setConnected(true);
    const onDisc = () => setConnected(false);
    const onAlert = (a: GeofenceAlert) => setAlerts((prev) => [a, ...prev].slice(0, 4));
    socket.on('team:update', onState);
    socket.on('connect', onConn);
    socket.on('disconnect', onDisc);
    socket.on('geofence:alert', onAlert);
    setConnected(socket.connected);
    return () => {
      socket.off('team:update', onState);
      socket.off('connect', onConn);
      socket.off('disconnect', onDisc);
      socket.off('geofence:alert', onAlert);
    };
  }, [socket]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  function doTroca() {
    if (!socket?.connected) {
      flash('Sem conexão — aguarde reconectar');
      setConfirming(false);
      return;
    }
    setBusy(true);
    const fix = geo.lastFix;
    socket.emit('troca:execute', { lat: fix?.lat, lng: fix?.lng }, (ack: TrocaAck) => {
      setBusy(false);
      setConfirming(false);
      if (!ack?.ok) return flash(ack?.error ?? 'Falha na troca');
      if (ack.action === 'noop') return flash('Troca já registrada');
      if (ack.action === 'finished_race') return flash('🏁 Volta concluída!');
      flash('Troca registrada ✓');
    });
  }

  const elapsed = state?.startedAt
    ? Math.max(0, Math.floor((now - new Date(state.startedAt).getTime()) / 1000))
    : 0;
  const fixAgeSec = geo.lastFix ? Math.floor((now - geo.lastFix.ts) / 1000) : null;

  return (
    <div className="screen operate">
      {!geo.tracking && (
        <div className="gps-overlay">
          <div className="gps-card">
            <h2>📍 Permissão de GPS</h2>
            <p>A Torre precisa da sua localização para o rastreio da prova.</p>
            <button className="btn btn-primary huge" onClick={geo.start}>
              ATIVAR GPS AGORA
            </button>
            {geo.error && <p className="error" style={{ marginTop: '12px' }}>{geo.error}</p>}
          </div>
        </div>
      )}

      <header className="topbar" style={{ borderColor: state?.colorHex ?? '#1e293b' }}>
        <div>
          <strong>{profile.teamName ?? '—'}</strong>
          <span className="muted">{isOperator ? 'Van (pick-up)' : 'Carro (drop-off)'}</span>
        </div>
        <div className="status-dots">
          <span className={`dot ${connected ? 'ok' : 'bad'}`}>{connected ? 'online' : 'offline'}</span>
          <span className={`dot ${geo.tracking ? 'ok' : 'idle'}`}>GPS</span>
        </div>
      </header>

      <section className="hero">
        <div className="hero-label">Atleta em prova</div>
        <div className="hero-athlete">{state?.athleteName ?? '—'}</div>
        <div className="hero-leg">
          {state?.status === 'finished'
            ? 'Prova concluída'
            : state?.legSeq
              ? `Trecho ${state.legSeq} → ${state.nextPc?.name ?? ''}`
              : 'Aguardando largada'}
        </div>
        <div className="hero-timer">{secondsToClock(elapsed)}</div>
      </section>

      <section className="metrics">
        <Metric label="Próximo PC" value={state?.nextPc?.name ?? '—'} />
        <Metric label="Distância" value={distanceLabel(state?.distanceToNextPcM ?? null)} />
        <Metric label="ETA" value={etaLabel(state?.etaSeconds ?? null)} />
        <Metric label="Pace médio" value={paceLabel(state?.avgPaceSecPerKm ?? null)} />
      </section>

      {alerts[0] && <div className="alert">📍 {alerts[0].message}</div>}

      <div className="actions">
        {isOperator &&
          (confirming ? (
            <div className="confirm">
              <button className="btn btn-success huge" disabled={busy} onClick={doTroca}>
                {busy ? 'Registrando…' : 'CONFIRMAR TROCA'}
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
                Cancelar
              </button>
            </div>
          ) : (
            <button
              className="btn btn-primary huge"
              disabled={state?.status === 'finished'}
              onClick={() => setConfirming(true)}
            >
              TROCA REALIZADA
            </button>
          ))}

        <button
          className="btn btn-waze big"
          disabled={!state?.nextPc}
          onClick={() => state?.nextPc && openWaze(state.nextPc.lat, state.nextPc.lng)}
        >
          ➤ Navegar até o próximo PC (Waze)
        </button>
      </div>

      <footer className="gps-bar">
        <span>Precisão: {geo.lastFix ? `${Math.round(geo.lastFix.accuracy)} m` : '—'}</span>
        <span>Último fix: {fixAgeSec != null ? `${fixAgeSec}s` : '—'}</span>
        <span>Buffer: {geo.bufferedCount}</span>
        <span>Bateria: {geo.batteryPct != null ? `${geo.batteryPct}%` : '—'}</span>
        <button className="link" onClick={onLogout}>
          sair
        </button>
      </footer>

      {geo.error && geo.tracking && <div className="error floating">{geo.error}</div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
    </div>
  );
}
