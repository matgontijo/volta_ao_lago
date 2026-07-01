import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';
import { RaceService } from '../race/race.service';
import { RedisService } from '../redis/redis.service';
import { RelayService } from '../relay/relay.service';
import { SettingsService } from '../settings/settings.service';
import { haversineMeters } from '../common/geo';
import {
  GeofenceAlert,
  JwtProfile,
  PositionUpdate,
  TeamState,
  VehiclePosition,
} from '../common/types';

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger('WS');
  private readonly lastFlush = new Map<number, number>();
  private readonly vehicleSockets = new Map<number, Socket>();

  constructor(
    private readonly auth: AuthService,
    private readonly race: RaceService,
    private readonly relay: RelayService,
    private readonly redis: RedisService,
    private readonly db: DatabaseService,
    private readonly settings: SettingsService,
  ) {}

  // -------------------------------------------------------------------------
  // Conexão: autentica no handshake e coloca o socket na room certa.
  // -------------------------------------------------------------------------
  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query?.token as string);
      const profile = this.auth.verify(token);
      client.data.profile = profile;
      
      const driverName = client.handshake.query?.driverName as string;
      if (driverName) {
        client.data.driverName = driverName;
      }

      if (profile.role === 'org') {
        client.join('dashboard');
        const states = await this.race.getTeamStates();
        client.emit('state:snapshot', {
          states,
          leaderboard: this.race.buildLeaderboard(states),
          positions: await this.race.getSnapshotPositions(),
        });
      } else if (profile.teamId) {
        client.join(`team:${profile.teamId}`);
        client.emit('team:update', await this.race.getTeamState(profile.teamId));
        
        if (profile.vehicleId) {
          const existingSocket = this.vehicleSockets.get(profile.vehicleId);
          if (existingSocket && existingSocket.id !== client.id) {
            existingSocket.emit('auth:error', { message: 'Outro celular assumiu a transmissão deste veículo.' });
            existingSocket.disconnect(true);
          }
          this.vehicleSockets.set(profile.vehicleId, client);
        }
      }
      this.logger.log(`+ conectado: ${profile.name} (${profile.role}) ${driverName ? `[motorista: ${driverName}]` : ''}`);
    } catch {
      client.emit('auth:error', { message: 'Token inválido ou ausente' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const p = client.data.profile as JwtProfile | undefined;
    if (p) {
      this.logger.log(`- desconectado: ${p.name}`);
      if (p.vehicleId && this.vehicleSockets.get(p.vehicleId)?.id === client.id) {
        this.vehicleSockets.delete(p.vehicleId);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Caminho quente: posição GPS a cada ~5s -> Redis -> fan-out p/ dashboard.
  // -------------------------------------------------------------------------
  @SubscribeMessage('position:update')
  async onPosition(
    @MessageBody() data: PositionUpdate,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const p = client.data.profile as JwtProfile | undefined;
    if (!p || (p.role !== 'operator' && p.role !== 'driver') || !p.vehicleId) return;

    const lat = Number(data?.lat);
    const lng = Number(data?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const meta = this.race.getVehicleMeta(p.vehicleId);
    const baseTeamName = meta?.teamName ?? p.teamName ?? '';
    const driverSuffix = client.data.driverName ? ` (${client.data.driverName})` : '';

    const payload: VehiclePosition = {
      vehicleId: p.vehicleId,
      teamId: p.teamId!,
      teamName: baseTeamName + driverSuffix,
      colorHex: meta?.colorHex ?? '#2563EB',
      role: meta?.role ?? p.vehicleRole,
      lat,
      lng,
      speedMps: num(data.speedMps),
      headingDeg: num(data.headingDeg),
      batteryPct: num(data.batteryPct),
      ts: data.ts ?? Date.now(),
    };

    await this.redis.setJson(`pos:${p.vehicleId}`, payload, 30);
    await this.redis.geoAdd('geo:vehicles', lng, lat, String(p.vehicleId));
    this.server.to('dashboard').emit('vehicle:position', payload);

    void this.maybeFlush(p.vehicleId, payload);
    if (meta?.role === 'van_pickup') void this.checkGeofence(p, payload);
  }

  // -------------------------------------------------------------------------
  // Caminho frio: "Troca Realizada" — operação atômica + broadcast de estado.
  // O retorno é entregue ao cliente como ACK do socket.io.
  // -------------------------------------------------------------------------
  @SubscribeMessage('troca:execute')
  async onTroca(
    @MessageBody() data: { lat?: number; lng?: number },
    @ConnectedSocket() client: Socket,
  ) {
    const p = client.data.profile as JwtProfile | undefined;
    if (!p || p.role !== 'operator' || !p.teamId) {
      return { ok: false, error: 'Apenas o operador da van pode registrar a troca' };
    }

    const lat = Number(data?.lat);
    const lng = Number(data?.lng);
    const res = await this.relay.executarTroca(
      p.teamId,
      Number.isFinite(lat) ? lat : 0,
      Number.isFinite(lng) ? lng : 0,
      p.sub,
    );

    if (res.action === 'noop') return { ok: true, action: 'noop' };

    const state = await this.pushTeamUpdate(p.teamId);
    this.logger.log(
      `TROCA ${state?.teamName}: ${res.action} (trecho ${res.currentLegSeq ?? '-'} / ${res.currentAthleteName ?? '-'})`,
    );
    return { ok: true, action: res.action, state };
  }

  // -------------------------------------------------------------------------
  // Métodos públicos de broadcast (reutilizados pelo AdminController).
  // -------------------------------------------------------------------------
  async pushTeamUpdate(teamId: number): Promise<TeamState | null> {
    await this.race.refreshNextPc(teamId);
    const state = await this.race.getTeamState(teamId);
    this.server.to('dashboard').emit('team:update', state);
    this.server.to(`team:${teamId}`).emit('team:update', state);
    this.server.to('dashboard').emit('leaderboard:update', await this.race.getLeaderboard());
    return state;
  }

  /** Avisa os dashboards que o trajeto mudou (editor de rota). */
  pushRoute(points: [number, number][]): void {
    this.server.to('dashboard').emit('route:update', points);
  }

  async pushFullReset(): Promise<void> {
    const states = await this.race.getTeamStates();
    this.server.to('dashboard').emit('state:snapshot', {
      states,
      leaderboard: this.race.buildLeaderboard(states),
      positions: await this.race.getSnapshotPositions(),
    });
  }

  // -------------------------------------------------------------------------
  // Geofence: alerta quando a van entra no raio do próximo PC (debounce Redis).
  // -------------------------------------------------------------------------
  private async checkGeofence(p: JwtProfile, pos: VehiclePosition): Promise<void> {
    const nextPc = this.race.getNextPc(p.teamId!);
    if (!nextPc) return;
    const d = haversineMeters(pos, nextPc);
    if (d > this.settings.get().geofenceRadiusM) return;

    const locked = await this.redis.acquireLock(`alert:${p.teamId}:${nextPc.id}`, 120);
    if (!locked) return;

    const alert: GeofenceAlert = {
      teamId: p.teamId!,
      teamName: pos.teamName,
      vehicleId: pos.vehicleId,
      pcId: nextPc.id,
      pcName: nextPc.name,
      distanceM: Math.round(d),
      message: `${pos.teamName} a ${Math.round(d)} m de ${nextPc.name}`,
      ts: Date.now(),
    };
    this.server.to('dashboard').emit('geofence:alert', alert);
    this.server.to(`team:${p.teamId}`).emit('geofence:alert', alert);
  }

  // Amostra o rastro no Postgres a cada 15s/veículo (para replay pós-prova).
  private async maybeFlush(vehicleId: number, pos: VehiclePosition): Promise<void> {
    const now = Date.now();
    if (now - (this.lastFlush.get(vehicleId) ?? 0) < 15000) return;
    this.lastFlush.set(vehicleId, now);
    try {
      await this.db.query(
        `INSERT INTO position_logs (vehicle_id, location, speed_mps, heading_deg)
         VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, $5)`,
        [vehicleId, pos.lng, pos.lat, pos.speedMps, pos.headingDeg],
      );
    } catch {
      /* persistência de rastro é best-effort; não bloqueia o caminho quente */
    }
  }
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
