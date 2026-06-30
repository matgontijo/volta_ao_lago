export interface JwtProfile {
  sub: number;
  name: string;
  role: 'org' | 'operator' | 'driver';
  teamId: number | null;
  teamName: string | null;
  vehicleId: number | null;
  vehicleRole: 'carro_dropoff' | 'van_pickup' | null;
}

export interface PositionUpdate {
  lat: number;
  lng: number;
  speedMps?: number;
  headingDeg?: number;
  accuracyM?: number;
  batteryPct?: number;
  ts?: number;
}

export interface NextPc {
  id: number;
  name: string;
  lat: number;
  lng: number;
}

export interface TeamState {
  teamId: number;
  teamName: string;
  category: string;
  colorHex: string;
  status: 'idle' | 'running' | 'finished';
  legSeq: number | null;
  athleteId: number | null;
  athleteName: string | null;
  fromPcName: string | null;
  nextPc: NextPc | null;
  startedAt: string | null;
  elapsedSec: number;
  legsCompleted: number;
  avgPaceSecPerKm: number | null;
  distanceToNextPcM: number | null;
  etaSeconds: number | null;
  etaAt: string | null;
}

export interface GeofenceAlert {
  teamId: number;
  teamName: string;
  pcName: string;
  distanceM: number;
  message: string;
  ts: number;
}

export interface TrocaAck {
  ok: boolean;
  action?: 'started' | 'advanced' | 'finished_race' | 'noop';
  error?: string;
  state?: TeamState;
}
