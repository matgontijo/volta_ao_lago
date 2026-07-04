import { useEffect, useMemo, useRef, useState } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { AlertSettings, type AlertPrefs } from './components/AlertSettings';
import { AlertsFeed } from './components/AlertsFeed';
import { CourseImport } from './components/CourseImport';
import { ExportModal } from './components/ExportModal';
import { FleetPanel, type ExpectedVehicle } from './components/FleetPanel';
import { ManagementPanel } from './components/ManagementPanel';
import { Leaderboard } from './components/Leaderboard';
import { MapView } from './components/MapView';
import { PointsPanel } from './components/PointsPanel';
import { TeamFocusBar } from './components/TeamFocusBar';
import { TelemetryPanel } from './components/TelemetryPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { useFleetWatch } from './hooks/useFleetWatch';
import { useIsMobile } from './hooks/useIsMobile';
import { useRaceSocket } from './hooks/useRaceSocket';
import { useReplay } from './hooks/useReplay';
import {
  fetchBootstrap,
  fetchDriveRoute,
  forceTroca,
  login,
  movePc,
  optimizeRoute,
  rebuildRoute,
  reorderPcs,
  resetRace,
  validateMagicToken,
  type DriveRoute,
} from './lib/api';
import type { Bootstrap } from './lib/types';

const TOKEN_KEY = 'volta.dash.token';
const SPECTATOR_KEY = 'volta.spectator.token';

export function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [spectator, setSpectator] = useState<string | null>(() =>
    localStorage.getItem(SPECTATOR_KEY),
  );
  // Link público ?s=TOKEN: valida no servidor antes de aceitar.
  const [specState, setSpecState] = useState<'idle' | 'checking' | 'error'>(() =>
    new URL(window.location.href).searchParams.get('s') ? 'checking' : 'idle',
  );
  const [specError, setSpecError] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const s = url.searchParams.get('s');
    if (!s) return;
    url.searchParams.delete('s');
    window.history.replaceState({}, '', url.pathname);
    validateMagicToken(s)
      .then((me) => {
        if (me.role !== 'spectator') throw new Error('Este link não é de espectador.');
        localStorage.setItem(SPECTATOR_KEY, s);
        setSpectator(s);
        setSpecState('idle');
      })
      .catch((e) => {
        setSpecError((e as Error).message);
        setSpecState('error');
      });
  }, []);

  if (specState === 'checking') {
    return (
      <div className="gate">
        <div className="gate-card">
          <img src="/logo.png" className="logo big" alt="Logo" />
          <h1>Canelas do Planalto</h1>
          <p>Validando link do espectador…</p>
        </div>
      </div>
    );
  }
  if (specState === 'error') {
    return (
      <div className="gate">
        <div className="gate-card">
          <img src="/logo.png" className="logo big" alt="Logo" />
          <h1>Canelas do Planalto</h1>
          <p>Link do espectador</p>
          <div className="gate-error">⚠️ {specError} — peça um link novo à organização.</div>
          <button className="enter" onClick={() => setSpecState('idle')}>
            Entrar como organização
          </button>
        </div>
      </div>
    );
  }

  if (spectator) {
    return (
      <Tower
        token={spectator}
        readOnly
        onLogout={() => {
          localStorage.removeItem(SPECTATOR_KEY);
          setSpectator(null);
        }}
      />
    );
  }
  if (!token) {
    return <LoginGate onToken={(t) => { localStorage.setItem(TOKEN_KEY, t); setToken(t); }} />;
  }
  return <Tower token={token} onLogout={() => { localStorage.removeItem(TOKEN_KEY); setToken(null); }} />;
}

function Tower({
  token,
  onLogout,
  readOnly = false,
}: {
  token: string;
  onLogout: () => void;
  readOnly?: boolean;
}) {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [now, setNow] = useState(Date.now());
  const [showExport, setShowExport] = useState(false);

  // Editor de trajeto (arrastar PCs)
  const [editMode, setEditMode] = useState(false);
  const [savingRoute, setSavingRoute] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showMgmt, setShowMgmt] = useState(false);

  // Mobile (torre no celular)
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<MobileTab>('map');
  const [showActions, setShowActions] = useState(false);

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

  // WebSocket da torre (posições, estados, leaderboard, alertas, timeline)
  const { connected, positions, states, leaderboard, alerts, timeline, pushAlert } =
    useRaceSocket(token, {
      onAuthError: onLogout,
      onRouteUpdate: (points) =>
        setBootstrap((prev) => (prev ? { ...prev, routePath: points } : prev)),
      prefsRef,
    });

  // Vigia da frota: sem sinal / bateria fraca
  useFleetWatch(positions, prefsRef, pushAlert);

  // Replay pós-prova
  const replay = useReplay();

  // Foco por equipe: mapa e painéis mostram só a equipe escolhida.
  const [focusTeamId, setFocusTeamId] = useState<number | null>(null);
  const [followVan, setFollowVan] = useState(false);
  const [driveRoute, setDriveRoute] = useState<DriveRoute | null>(null);

  useEffect(() => {
    fetchBootstrap().then(setBootstrap).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Roteirização da equipe em foco: recalcula a rota van→PC a cada 20s.
  useEffect(() => {
    if (focusTeamId == null) {
      setDriveRoute(null);
      setFollowVan(false);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const r = await fetchDriveRoute(focusTeamId);
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
  }, [focusTeamId]);

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

  async function routeAction(fn: () => Promise<unknown>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setSavingRoute(true);
    try {
      await fn();
      setBootstrap(await fetchBootstrap()); // PCs + km + routePath autoritativos
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSavingRoute(false);
    }
  }

  const positionList = useMemo(() => Object.values(positions), [positions]);
  const stateList = useMemo(() => Object.values(states), [states]);

  // Foco: filtra o que aparece no mapa e nos painéis.
  const visiblePositions = useMemo(
    () => (focusTeamId == null ? positionList : positionList.filter((p) => p.teamId === focusTeamId)),
    [positionList, focusTeamId],
  );
  const visibleStates = useMemo(
    () => (focusTeamId == null ? stateList : stateList.filter((s) => s.teamId === focusTeamId)),
    [stateList, focusTeamId],
  );
  const mapPositions = replay.replayMode ? replay.replayPositions : visiblePositions;

  // "Seguir van": centraliza o mapa na van da equipe em foco (fallback: carro).
  const followPos = useMemo<[number, number] | null>(() => {
    if (!followVan || focusTeamId == null || replay.replayMode) return null;
    const van =
      visiblePositions.find((p) => p.role === 'van_pickup') ?? visiblePositions[0] ?? null;
    return van ? [van.lat, van.lng] : null;
  }, [followVan, focusTeamId, visiblePositions, replay.replayMode]);

  const expectedVehicles = useMemo<ExpectedVehicle[]>(() => {
    if (!bootstrap) return [];
    return bootstrap.vehicles
      .filter((v) => focusTeamId == null || v.team_id === focusTeamId)
      .map((v) => {
        const team = bootstrap.teams.find((t) => t.id === v.team_id);
        return {
          vehicleId: v.id,
          teamId: v.team_id,
          teamName: team?.name ?? `Equipe ${v.team_id}`,
          colorHex: team?.color_hex ?? '#64748b',
          role: v.role as ExpectedVehicle['role'],
        };
      });
  }, [bootstrap, focusTeamId]);

  function toggleFocus(teamId: number | null) {
    setFocusTeamId((cur) => (teamId != null && cur === teamId ? null : teamId));
  }

  const telemetryEl = (
    <TelemetryPanel
      states={visibleStates}
      now={now}
      onForceTroca={readOnly ? undefined : onForceTroca}
      selectedTeamId={focusTeamId}
      onSelectTeam={(teamId) => {
        toggleFocus(teamId);
        if (isMobile) setMobileTab('map');
      }}
    />
  );
  const timelineEl = <TimelinePanel events={timeline} />;
  const fleetEl = (
    <FleetPanel
      positions={visiblePositions}
      now={now}
      staleSeconds={alertPrefs.staleSeconds}
      expected={expectedVehicles}
    />
  );
  const boardEl = (
    <Leaderboard rows={leaderboard} focusTeamId={focusTeamId} onSelectTeam={toggleFocus} />
  );
  const alertsEl = (
    <AlertsFeed
      alerts={alerts}
      onOpenSettings={readOnly ? undefined : () => setShowAlertSettings(true)}
    />
  );
  const pointsEl = bootstrap ? (
    <PointsPanel
      pcs={bootstrap.exchangePoints}
      editMode={editMode}
      onReorder={(order) => routeAction(() => reorderPcs(token, order))}
    />
  ) : null;

  const actionButtons = readOnly ? (
    <>
      <button
        className="ctrl"
        onClick={() => {
          (replay.replayMode ? replay.exitReplay : replay.loadReplay)();
          setShowActions(false);
        }}
      >
        {replay.replayMode ? 'Sair do replay' : 'Replay'}
      </button>
      <button className="link" onClick={onLogout}>
        sair
      </button>
    </>
  ) : (
    <>
      {editMode && (
        <>
          <button className="ctrl primary" onClick={() => { setShowImport(true); setShowActions(false); }}>
            📌 Definir trajeto
          </button>
          <button
            className="ctrl"
            disabled={savingRoute}
            onClick={() =>
              routeAction(
                () => optimizeRoute(token),
                'Otimizar a ordem dos PCs automaticamente (loop a partir da Largada)?',
              )
            }
          >
            {savingRoute ? '…' : '✨ Otimizar ordem'}
          </button>
          <button className="ctrl" disabled={savingRoute} onClick={() => routeAction(() => rebuildRoute(token))}>
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
      <button className="ctrl" onClick={() => { setShowExport(true); setShowActions(false); }}>
        Exportar resultados
      </button>
      <button className="ctrl" onClick={() => { setShowAlertSettings(true); setShowActions(false); }}>
        Configurar alertas
      </button>
      <button
        className="ctrl"
        onClick={() => {
          (replay.replayMode ? replay.exitReplay : replay.loadReplay)();
          setShowActions(false);
        }}
      >
        {replay.replayMode ? 'Sair do replay' : 'Replay'}
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
    ['timeline', '📜', 'Prova'],
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
            <div className="brand-sub">{readOnly ? 'Acompanhamento ao vivo' : 'Torre de Comando'}</div>
          </div>
        </div>
        <div className="appbar-meta">
          {readOnly && <span className="pill spec">👀 Espectador</span>}
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
          {bootstrap && (
            <TeamFocusBar
              teams={bootstrap.teams}
              focusTeamId={focusTeamId}
              onFocus={toggleFocus}
              follow={followVan}
              onFollow={setFollowVan}
            />
          )}
          {bootstrap ? (
            <MapView
              pcs={bootstrap.exchangePoints}
              positions={mapPositions}
              routePath={bootstrap.routePath}
              editMode={editMode}
              onMovePc={onMovePc}
              driveRoute={driveRoute?.points ?? null}
              followPos={followPos}
            />
          ) : (
            <div className="loading">Carregando percurso…</div>
          )}
          {focusTeamId != null && (
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
              <button onClick={() => toggleFocus(null)} aria-label="Fechar rota">
                ✕
              </button>
            </div>
          )}
          {replay.replayMode && (
            <div className="replay-bar">
              <strong>REPLAY</strong>
              <button className="ctrl" onClick={() => replay.setPlaying((p) => !p)}>
                {replay.playing ? 'Pausar' : 'Play'}
              </button>
              <span>
                {Math.min(replay.idxRef.current, replay.frames.length)} / {replay.frames.length} pontos
              </span>
            </div>
          )}
        </main>
        {!isMobile && (
          <aside className="side">
            {telemetryEl}
            {fleetEl}
            {boardEl}
            {timelineEl}
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
          {mobileTab === 'timeline' && timelineEl}
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

      {showAdmin && !readOnly && <AdminPanel token={token} onClose={() => setShowAdmin(false)} />}
      {showExport && !readOnly && <ExportModal token={token} onClose={() => setShowExport(false)} />}
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
      {showAlertSettings && !readOnly && (
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
  const [username, setUsername] = useState('torre');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enter() {
    setBusy(true);
    setError(null);
    try {
      const { token } = await login(username.trim(), password);
      onToken(token);
    } catch (e) {
      setError((e as Error).message);
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
        <input
          className="gate-input"
          value={username}
          autoCapitalize="none"
          autoComplete="username"
          placeholder="Usuário"
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="gate-input"
          type="password"
          value={password}
          autoComplete="current-password"
          placeholder="Senha"
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && username.trim() && password && enter()}
        />
        {error && <div className="gate-error">{error}</div>}
        <button className="enter" disabled={busy || !username.trim() || !password} onClick={enter}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}

type MobileTab = 'map' | 'teams' | 'timeline' | 'fleet' | 'points' | 'alerts';
