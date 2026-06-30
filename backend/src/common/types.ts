// Contrato de dados compartilhado entre gateway, serviços e (espelhado) frontends.

export type UserRole = 'org' | 'operator' | 'driver';
export type VehicleRole = 'carro_dropoff' | 'van_pickup' | null;

export interface JwtProfile {
  sub: number;          // user id
  name: string;
  role: UserRole;
  teamId: number | null;
  teamName: string | null;
  vehicleId: number | null;
  vehicleRole: VehicleRole;
}

export interface PositionUpdate {
  lat: number;
  lng: number;
  speedMps?: number;
  headingDeg?: number;
  accuracyM?: number;
  batteryPct?: number;
  ts?: number;          // epoch ms do cliente
}

export interface VehiclePosition {
  vehicleId: number;
  teamId: number;
  teamName: string;
  colorHex: string;
  role: VehicleRole;
  lat: number;
  lng: number;
  speedMps: number | null;
  headingDeg: number | null;
  batteryPct: number | null;
  ts: number;
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
  startedAt: string | null;     // ISO
  elapsedSec: number;           // tempo no trecho atual
  legsCompleted: number;
  avgPaceSecPerKm: number | null;
  distanceToNextPcM: number | null;
  etaSeconds: number | null;
  etaAt: string | null;         // ISO
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
  vehicleId: number;
  pcId: number;
  pcName: string;
  distanceM: number;
  message: string;
  ts: number;
}

export interface TrocaResult {
  action: 'started' | 'advanced' | 'finished_race' | 'noop';
  finishedExecId: number | null;
  newExecId: number | null;
  currentLegSeq: number | null;
  currentAthleteId: number | null;
  currentAthleteName: string | null;
  nextPc: NextPc | null;
}
