import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { AlertPrefs } from '../components/AlertSettings';
import { fetchTimeline } from '../lib/api';
import { connectSocket } from '../lib/socket';
import { beep } from '../lib/sound';
import type {
  FleetPresence,
  GeofenceAlert,
  LeaderboardRow,
  Snapshot,
  TeamState,
  TimelineEvent,
  VehiclePosition,
} from '../lib/types';

interface Handlers {
  onAuthError: () => void;
  onRouteUpdate: (points: [number, number][]) => void;
  prefsRef: React.MutableRefObject<AlertPrefs>;
}

/**
 * Toda a fiação do WebSocket da torre: snapshot inicial, posições ao vivo,
 * estados de equipe, leaderboard e feed de alertas (com bipe).
 */
export function useRaceSocket(token: string, { onAuthError, onRouteUpdate, prefsRef }: Handlers) {
  const [connected, setConnected] = useState(false);
  const [positions, setPositions] = useState<Record<number, VehiclePosition>>({});
  const [states, setStates] = useState<Record<number, TeamState>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [alerts, setAlerts] = useState<GeofenceAlert[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [presence, setPresence] = useState<Record<number, FleetPresence | null>>({});

  // Callbacks em refs: reconectar o socket a cada render seria um desastre.
  const authErrorRef = useRef(onAuthError);
  const routeRef = useRef(onRouteUpdate);
  useEffect(() => {
    authErrorRef.current = onAuthError;
    routeRef.current = onRouteUpdate;
  }, [onAuthError, onRouteUpdate]);

  const pushAlert = useCallback((a: GeofenceAlert) => {
    setAlerts((prev) => [a, ...prev].slice(0, 12));
  }, []);

  useEffect(() => {
    const s: Socket = connectSocket(token);
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('auth:error', () => authErrorRef.current());
    s.on('state:snapshot', (snap: Snapshot) => {
      setStates(indexBy(snap.states, 'teamId'));
      setLeaderboard(snap.leaderboard);
      setPositions(indexBy(snap.positions, 'vehicleId'));
      setPresence(indexBy(snap.presence ?? [], 'vehicleId'));
      // Snapshot chega na conexão E após reset de prova — recarrega o feed.
      fetchTimeline().then(setTimeline).catch(() => {});
    });
    s.on(
      'fleet:presence',
      (ev: { vehicleId: number; presence: FleetPresence | null }) =>
        setPresence((prev) => ({ ...prev, [ev.vehicleId]: ev.presence })),
    );
    s.on('timeline:event', (ev: TimelineEvent) =>
      setTimeline((prev) =>
        prev.some((e) => e.id === ev.id) ? prev : [ev, ...prev].slice(0, 200),
      ),
    );
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
      pushAlert(a);
    });
    s.on('route:update', (points: [number, number][]) => routeRef.current(points));
    return () => {
      s.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return { connected, positions, states, leaderboard, alerts, timeline, presence, pushAlert };
}

function indexBy<T, K extends keyof T>(arr: T[], key: K): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of arr) out[String(item[key])] = item;
  return out;
}
