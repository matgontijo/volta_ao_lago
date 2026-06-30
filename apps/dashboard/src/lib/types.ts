export interface JwtProfile {
  sub: number;
  name: string;
  role: 'org' | 'operator' | 'driver';
  teamId: number | null;
  teamName: string | null;
}

export interface ExchangePoint {
  id: number;
  sequence: number;
  name: string;
  km_marker: number;
  lat: number;
  lng: number;
}

export interface Bootstrap {
  teams: { id: number; name: string; category: string; color_hex: string }[];
  vehicles: { id: number; team_id: number; role: string; device_id: string }[];
  athletes: { id: number; team_id: number; name: string; bib_number: number }[];
  exchangePoints: ExchangePoint[];
  legs: { id: number; sequence: number; from_pc_id: number; to_pc_id: number; distance_m: number }[];
  routePath: [number, number][] | null;
}

export interface VehiclePosition {
  vehicleId: number;
  teamId: number;
  teamName: string;
  colorHex: string;
  role: 'carro_dropoff' | 'van_pickup' | null;
  lat: number;
  lng: number;
  speedMps: number | null;
  headingDeg: number | null;
  batteryPct: number | null;
  ts: number;
}

export interface TeamState {
  teamId: number;
  teamName: string;
  category: string;
  colorHex: string;
  status: 'idle' | 'running' | 'finished';
  legSeq: number | null;
  athleteName: string | null;
  nextPc: { id: number; name: string; lat: number; lng: number } | null;
  startedAt: string | null;
  elapsedSec: number;
  legsCompleted: number;
  avgPaceSecPerKm: number | null;
  distanceToNextPcM: number | null;
  etaSeconds: number | null;
}

export interface LeaderboardRow {
  rank: number;
  teamId: number;
  teamName: string;
  colorHex: string;
  legsCompleted: number;
  distanceToNextPcM: number | null;
  status: TeamState['status'];
}

export interface GeofenceAlert {
  teamId: number;
  teamName: string;
  pcName: string;
  distanceM: number;
  message: string;
  ts: number;
}

export interface Snapshot {
  states: TeamState[];
  leaderboard: LeaderboardRow[];
  positions: VehiclePosition[];
}

export interface ReplayFrame {
  vehicleId: number;
  teamId: number;
  teamName: string;
  colorHex: string;
  role: 'carro_dropoff' | 'van_pickup' | null;
  lat: number;
  lng: number;
  ts: number;
}
