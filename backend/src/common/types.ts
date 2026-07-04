// Contrato de dados compartilhado entre gateway, serviços e (espelhado) frontends.

// 'spectator' não existe na tabela users: é um token assinado emitido pela
// organização para o link público somente-leitura do mapa ao vivo.
export type UserRole = 'org' | 'operator' | 'driver' | 'spectator';
export type VehicleRole = 'carro_dropoff' | 'van_pickup' | null;

export interface JwtProfile {
  sub: number;          // user id
  name: string;
  role: UserRole;
  teamId: number | null;
  teamName: string | null;
  vehicleId: number | null;
  vehicleRole: VehicleRole;
  /** Versão do token do usuário — reset de senha invalida tokens antigos. */
  ver?: number;
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
  /** Projeção da VOLTA COMPLETA (não confundir com o ETA do próximo PC). */
  remainingCourseM: number | null;
  finishEtaSeconds: number | null;
  finishEtaAt: string | null;   // ISO
}

/** Evento da linha do tempo da prova (feed ao vivo + auditoria). */
export interface TimelineEvent {
  id: number;
  ts: number;                       // epoch ms
  action: 'started' | 'advanced' | 'finished_race';
  teamId: number;
  teamName: string;
  colorHex: string;
  finishedLegSeq: number | null;    // trecho fechado neste clique
  finishedAthlete: string | null;
  finishedSeconds: number | null;   // duração do trecho fechado
  finishedDistanceM: number | null;
  newLegSeq: number | null;         // trecho aberto neste clique
  newAthlete: string | null;
  createdByName: string | null;     // quem clicou (auditoria)
  createdByRole: UserRole | null;   // 'org' = troca forçada pela torre
  lat: number | null;
  lng: number | null;
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

/** Melhor caminho DE CARRO da van até o próximo PC (roteirização OSRM). */
export interface DriveRoute {
  teamId: number;
  pcId: number;
  pcName: string;
  points: [number, number][]; // [lat, lng]
  distanceM: number;
  durationSec: number;
  computedAt: number;
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
