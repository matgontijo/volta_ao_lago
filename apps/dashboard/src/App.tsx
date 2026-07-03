import { useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { AdminPanel } from './components/AdminPanel';
import { AlertSettings, type AlertPrefs } from './components/AlertSettings';
import { AlertsFeed } from './components/AlertsFeed';
import { CourseImport } from './components/CourseImport';
import { FleetPanel, type ExpectedVehicle } from './components/FleetPanel';
import { ManagementPanel } from './components/ManagementPanel';
import { Leaderboard } from './components/Leaderboard';
import { MapView } from './components/MapView';
import { PointsPanel } from './components/PointsPanel';
import { TelemetryPanel } from './components/TelemetryPanel';
import {
  fetchBootstrap,
  fetchDriveRoute,
  fetchReplay,
  forceTroca,
  login,
  movePc,
  optimizeRoute,
  rebuildRoute,
  reorderPcs,
  resetRace,
  type DriveRoute,
} from './lib/api';
import { connectSocket } from './lib/socket';
import { beep } from './lib/sound';
import type {
  Bootstrap,
  GeofenceAlert,
  LeaderboardRow,
  ReplayFrame,
  Snapshot,
  TeamState,
  VehiclePosition,
} from './lib/types';

const TOKEN_KEY = 'volta.dash.token';

export function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  if (!token) {
    return <LoginGate onToken={(t) => { localStorage.setItem(TOKEN_KEY, t); setToken(t); }} />;
  }
  return <Tower token={token} onLogout={() => { localStorage.removeItem(TOKEN_KEY); setToken(null); }} />;
}

function Tower({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [positions, setPositions] = useState<Record<number, VehiclePosition>>({});
  const [states, setStates] = useState<Record<number, TeamState>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [alerts, setAlerts] = useState<GeofenceAlert[]>([]);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Editor de trajeto (arrastar PCs)
  const [editMode, setEditMode] = useState(false);
  const [savingRoute, setSavingRoute] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Mobile (torre no celular)
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<MobileTab>('map');
  const [showActions, setShowActions] = useState(false);

  // Gestão + roteirização
  const [showMgmt, setShowMgmt] = useState(false);
  const [routeTeamId, setRouteTeamId] = useState<number | null>(null);
  const [driveRoute, setDriveRoute] = useState<DriveRoute | null>(null);
  const staleAlerted = useRef<Record<number, boolean>>({});

  // Preferências de alerta (persistidas no navegador)
  const [showAlertSettings, setShowAlertSettings] = useState(false);
  const [alertPrefs, setAlertPrefs] = useState<AlertPrefs>(() => {
    const raw = localStorage.getItem('volta.alertPrefs');
    return raw
      ? (JSON.parse(raw) as AlertPrefs)
      : { sound: true, staleSeconds: 30, showGeofence: true };
  });
  const prefsRef = useRef(alertPrefs);
  useEffect(() => {
    prefsRef.current = alertPrefs;
    localStorage.setItem('volta.alertPrefs', JSON.stringify(alertPrefs));
  }, [alertPrefs]);

  // Replay
  const [replayMode, setReplayMode] = useState(false);
  const [frames, setFrames] = useState<ReplayFrame[]>([]);
  const [playing, setPlaying] = useState(false);
  const [replayPositions, setReplayPositions] = useState<VehiclePosition[]>([]);
  const idxRef = useRef(0);
  const accRef = useRef<Record<number, VehiclePosition>>({});

  useEffect(() => {
    fetchBootstrap().then(setBootstrap).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const s: Socket = connectSocket(token);
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('auth:error', onLogout);
    s.on('state:snapshot', (snap: Snapshot) => {
      setStates(indexBy(snap.states, 'teamId'));
      setLeaderboard(snap.leaderboard);
      setPositions(indexBy(snap.positions, 'vehicleId'));
    });
    s.on('vehicle:position', (p: VehiclePosition) =>
      setPositions((prev) => ({ ...prev, [p.vehicleId]: p })),
    );
    s.on('team:update', (st: TeamState) =>
      setStates((prev) => ({ ...prev, [st.teamId]: st })),
    );
    s.on('leaderboard:update', setLeaderboard);
    s.on('geofence:alert', (a: GeofenceAlert) => {
      if (!prefsRef.current.showGeofence) return;
      if (prefsRef.current.sound) beep();
      setAlerts((prev) => [a, ...prev].slice(0, 12));
    });
    s.on('route:update', (points: [number, number][]) =>
      setBootstrap((prev) => (prev ? { ...prev, routePath: points } : prev)),
    );
    return () => {
      s.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Animação do replay: acumula a última posição de cada veículo ao longo dos frames.
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const f = frames;
      if (idxRef.current >= f.length) {
        setPlaying(false);
        return;
      }
      const batch = Math.max(1, Math.ceil(f.length / 300));
      for (let k = 0; k < batch && idxRef.current < f.length; k++) {
        const fr = f[idxRef.current++];
        accRef.current[fr.vehicleId] = {
          vehicleId: fr.vehicleId,
          teamId: fr.teamId,
          teamName: fr.teamName,
          colorHex: fr.colorHex,
          role: fr.role,
          lat: fr.lat,
          lng: fr.lng,
          speedMps: null,
          headingDeg: null,
          batteryPct: null,
          ts: fr.ts,
        };
      }
      setReplayPositions(Object.values(accRef.current));
    }, 120);
    return () => clearInterval(t);
  }, [playing, frames]);

  async function loadReplay() {
    try {
      const f = await fetchReplay();
      if (f.length === 0) {
        alert('Sem rastro registrado ainda. Rode a prova (ou o simulador) primeiro.');
        return;
      }
      idxRef.current = 0;
      accRef.current = {};
      setReplayPositions([]);
      setFrames(f);
      setReplayMode(true);
      setPlaying(true);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function exitReplay() {
    setReplayMode(false);
    setPlaying(false);
  }

  async function doReset() {
    if (!confirm('Reiniciar a prova? Isso apaga execuções, auditoria e rastro.')) return;
    try {
      await resetRace(token);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function onForceTroca(teamId: number) {
    if (!confirm('Forçar a troca desta equipe pela torre (failover)?')) return;
    try {
      await forceTroca(token, teamId);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  // Editor de trajeto: persiste a nova posição do PC e atualiza local.
  async function onMovePc(id: number, lat: number, lng: number) {
    setBootstrap((prev) =>
      prev
        ? { ...prev, exchangePoints: prev.exchangePoints.map((pc) => (pc.id === id ? { ...pc, lat, lng } : pc)) }
        : prev,
    );
    try {
      await movePc(token, id, lat, lng);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function doRebuildRoute() {
    setSavingRoute(true);
    try {
      await rebuildRoute(token);
      setBootstrap(await fetchBootstrap()); // PCs + km + routePath autoritativos
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSavingRoute(false);
    }
  }

  async function doOptimize() {
    if (!confirm('Otimizar a ordem dos PCs automaticamente (loop a partir da Largada)?')) return;
    setSavingRoute(true);
    try {
      await optimizeRoute(token);
      setBootstrap(await fetchBootstrap());
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSavingRoute(false);
    }
  }

  async function onReorderPcs(order: number[]) {
    setSavingRoute(true);
    try {
      await reorderPcs(token, order);
      setBootstrap(await fetchBootstrap());
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSavingRoute(false);
    }
  }

  // Roteirização: recalcula a rota da van→PC a cada 20s enquanto ativa.
  useEffect(() => {
    if (routeTeamId == null) {
      setDriveRoute(null);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const r = await fetchDriveRoute(routeTeamId);
        if (alive) setDriveRoute(r);
      } catch {
        if (alive) setDriveRoute(null);
      }
    };
    load();
    const t = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [routeTeamId]);

  // Vigia da frota: alerta (feed + bipe) quando um veículo para de transmitir
  // além do limite configurado — e avisa quando volta.
  useEffect(() => {
    const t = setInterval(() => {
      const limitMs = prefsRef.current.staleSeconds * 1000;
      const nowMs = Date.now();
      for (const p of Object.values(positions)) {
        const label = `${p.teamName} — ${p.role === 'van_pickup' ? 'Van' : 'Carro'}`;
        const stale = nowMs - p.ts > limitMs;
        const was = staleAlerted.current[p.vehicleId] ?? false;
        if (stale === was) continue;
        staleAlerted.current[p.vehicleId] = stale;
        const alert: GeofenceAlert = {
          teamId: p.teamId,
          teamName: p.teamName,
          pcName: '',
          distanceM: 0,
          message: stale
            ? `⚠️ ${label} SEM SINAL há ${Math.round((nowMs - p.ts) / 1000)}s`
            : `✅ ${label} voltou a transmitir`,
          ts: nowMs,
        };
        if (stale && prefsRef.current.sound) beep(3);
        setAlerts((prev) => [alert, ...prev].slice(0, 12));
      }
    }, 5000);
    return () => clearInterval(t);
  }, [positions]);

  const positionList = useMemo(() => Object.values(positions), [positions]);
  const stateList = useMemo(() => Object.values(states), [states]);
  const mapPositions = replayMode ? replayPositions : positionList;

  const expectedVehicles = useMemo<ExpectedVehicle[]>(() => {
    if (!bootstrap) return [];
    return bootstrap.vehicles.map((v) => {
      const team = bootstrap.teams.find((t) => t.id === v.team_id);
      return {
        vehicleId: v.id,
        teamId: v.team_id,
        teamName: team?.name ?? `Equipe ${v.team_id}`,
        colorHex: team?.color_hex ?? '#64748b',
        role: v.role as ExpectedVehicle['role'],
      };
    });
  }, [bootstrap]);

  const telemetryEl = (
    <TelemetryPanel
      states={stateList}
      now={now}
      onForceTroca={onForceTroca}
      selectedTeamId={routeTeamId}
      onSelectTeam={(teamId) => {
        setRouteTeamId((cur) => (cur === teamId ? null : teamId));
        if (isMobile) setMobileTab('map');
      }}
    />
  );
  const fleetEl = (
    <FleetPanel
      positions={positionList}
      now={now}
      staleSeconds={alertPrefs.staleSeconds}
      expected={expectedVehicles}
    />
  );
  const boardEl = <Leaderboard rows={leaderboard} />;
  const alertsEl = <AlertsFeed alerts={alerts} onOpenSettings={() => setShowAlertSettings(true)} />;
  const pointsEl = bootstrap ? (
    <PointsPanel pcs={bootstrap.exchangePoints} editMode={editMode} onReorder={onReorderPcs} />
  ) : null;

  const actionButtons = (
    <>
      {editMode && (
        <>
          <button className="ctrl primary" onClick={() => { setShowImport(true); setShowActions(false); }}>
            📌 Definir trajeto
          </button>
          <button className="ctrl" disabled={savingRoute} onClick={doOptimize}>
            {savingRoute ? '…' : '✨ Otimizar ordem'}
          </button>
          <button className="ctrl" disabled={savingRoute} onClick={doRebuildRoute}>
            Recalcular rota
          </button>
        </>
      )}
      <button className={`ctrl ${editMode ? 'active' : ''}`} onClick={() => setEditMode((v) => !v)}>
        {editMode ? 'Concluir edição' : 'Editar trajeto'}
      </button>
      <button className="ctrl" onClick={() => { setShowAdmin(true); setShowActions(false); }}>
        Acessos / QR
      </button>
      <button className="ctrl" onClick={() => { setShowMgmt(true); setShowActions(false); }}>
        Gestão de equipes
      </button>
      <button className="ctrl" onClick={() => { setShowAlertSettings(true); setShowActions(false); }}>
        Configurar alertas
      </button>
      <button className="ctrl" onClick={() => { (replayMode ? exitReplay : loadReplay)(); setShowActions(false); }}>
        {replayMode ? 'Sair do replay' : 'Replay'}
      </button>
      <button className="ctrl danger" onClick={doReset}>
        Reiniciar prova
      </button>
      <button className="link" onClick={onLogout}>
        sair
      </button>
    </>
  );

  const tabs: [MobileTab, string, string][] = [
    ['map', '🗺️', 'Mapa'],
    ['teams', '🏃', 'Equipes'],
    ['fleet', '🚐', 'Frota'],
    ['points', '📍', 'Pontos'],
    ['alerts', '🔔', 'Alertas'],
  ];

  return (
    <div className={`app ${isMobile ? 'is-mobile' : ''}`}>
      <header className="appbar">
        <div className="title">
          <img src="/logo.png" className="logo" alt="Logo" />
          <div>
            <div className="brand-name">Canelas do Planalto</div>
            <div className="brand-sub">Torre de Comando</div>
          </div>
        </div>
        <div className="appbar-meta">
          <span className={`pill ${connected ? 'ok' : 'bad'}`}>
            <span className="live-dot" />
            {connected ? 'Ao vivo' : 'Reconectando…'}
          </span>
          {!isMobile && <span className="pill">🚐 {positionList.length} veículos</span>}
          {isMobile ? (
            <button className="ctrl menu-btn" onClick={() => setShowActions(true)}>
              ☰
            </button>
          ) : (
            actionButtons
          )}
        </div>
      </header>

      <div className="layout">
        <main className="map-wrap">
          {bootstrap ? (
            <MapView
              pcs={bootstrap.exchangePoints}
              positions={mapPositions}
              routePath={bootstrap.routePath}
              editMode={editMode}
              onMovePc={onMovePc}
              driveRoute={driveRoute?.points ?? null}
            />
          ) : (
            <div className="loading">Carregando percurso…</div>
          )}
          {routeTeamId != null && (
            <div className="route-chip">
              <span aria-hidden>🧭</span>
              {driveRoute ? (
                <span>
                  {driveRoute.pcName} · <b>{(driveRoute.distanceM / 1000).toFixed(1)} km</b> ·{' '}
                  <b>{Math.max(1, Math.round(driveRoute.durationSec / 60))} min</b> de carro
                </span>
              ) : (
                <span>calculando melhor caminho…</span>
              )}
              <button onClick={() => setRouteTeamId(null)} aria-label="Fechar rota">
                ✕
              </button>
            </div>
          )}
          {replayMode && (
            <div className="replay-bar">
              <strong>REPLAY</strong>
              <button className="ctrl" onClick={() => setPlaying((p) => !p)}>
                {playing ? 'Pausar' : 'Play'}
              </button>
              <span>
                {Math.min(idxRef.current, frames.length)} / {frames.length} pontos
              </span>
            </div>
          )}
        </main>
        {!isMobile && (
          <aside className="side">
            {telemetryEl}
            {fleetEl}
            {boardEl}
            {alertsEl}
            {pointsEl}
          </aside>
        )}
      </div>

      {isMobile && mobileTab !== 'map' && (
        <div className="mobile-sheet">
          {mobileTab === 'teams' && (
            <>
              {telemetryEl}
              {boardEl}
            </>
          )}
          {mobileTab === 'fleet' && fleetEl}
          {mobileTab === 'points' && pointsEl}
          {mobileTab === 'alerts' && alertsEl}
        </div>
      )}

      {isMobile && (
        <nav className="bottom-nav">
          {tabs.map(([key, ico, label]) => (
            <button
              key={key}
              className={mobileTab === key ? 'active' : ''}
              onClick={() => setMobileTab(key)}
            >
              <span className="bn-ico">{ico}</span>
              <span className="bn-label">{label}</span>
            </button>
          ))}
        </nav>
      )}

      {isMobile && showActions && (
        <div className="modal-overlay" onClick={() => setShowActions(false)}>
          <div className="actions-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Ações da torre</h2>
              <button className="link" onClick={() => setShowActions(false)}>
                fechar
              </button>
            </div>
            <div className="actions-list">{actionButtons}</div>
          </div>
        </div>
      )}

      {showAdmin && <AdminPanel token={token} onClose={() => setShowAdmin(false)} />}
      {showMgmt && (
        <ManagementPanel
          token={token}
          onClose={() => setShowMgmt(false)}
          onChanged={async () => setBootstrap(await fetchBootstrap())}
        />
      )}
      {showImport && (
        <CourseImport
          token={token}
          onClose={() => setShowImport(false)}
          onDone={async () => setBootstrap(await fetchBootstrap())}
        />
      )}
      {showAlertSettings && (
        <AlertSettings
          token={token}
          prefs={alertPrefs}
          onPrefs={setAlertPrefs}
          onClose={() => setShowAlertSettings(false)}
        />
      )}
    </div>
  );
}

function LoginGate({ onToken }: { onToken: (t: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enter() {
    setBusy(true);
    setError(null);
    try {
      const { token } = await login('torre', 'volta2026');
      onToken(token);
    } catch (e) {
      setError((e as Error).message + ' — o backend está rodando?');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <img src="/logo.png" className="logo big" alt="Logo" />
        <h1>Canelas do Planalto</h1>
        <p>Torre de Comando</p>
        {error && <div className="gate-error">{error}</div>}
        <button className="enter" disabled={busy} onClick={enter}>
          {busy ? 'Entrando…' : 'Entrar (torre / volta2026)'}
        </button>
      </div>
    </div>
  );
}

function indexBy<T, K extends keyof T>(arr: T[], key: K): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of arr) out[String(item[key])] = item;
  return out;
}

type MobileTab = 'map' | 'teams' | 'fleet' | 'points' | 'alerts';

function useIsMobile(breakpoint = 820): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint,
  );
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth <= breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return mobile;
}
