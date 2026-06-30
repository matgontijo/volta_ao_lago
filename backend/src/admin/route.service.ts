import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

const OSRM = process.env.OSRM_URL ?? 'https://router.project-osrm.org';

/**
 * Geração da rota fiel às ruas (road-snapping via OSRM). Mesma lógica do
 * tools/build-route.mjs, exposta como serviço para o editor de trajeto do admin
 * (arrastar PCs -> recalcular a rota ao vivo).
 */
@Injectable()
export class RouteService {
  private readonly logger = new Logger('Route');

  constructor(private readonly db: DatabaseService) {}

  /** Move um PC (drag no mapa). */
  async movePc(id: number, lat: number, lng: number): Promise<void> {
    await this.db.query(
      `UPDATE exchange_points
          SET location = ST_SetSRID(ST_MakePoint($2, $3), 4326)
        WHERE id = $1`,
      [id, lng, lat],
    );
  }

  /**
   * Recalcula a rota nas ruas a partir das posições atuais dos PCs e atualiza:
   * route_path (geometria), legs.distance_m (distância real) e km_marker.
   */
  /**
   * Otimiza automaticamente a ordem dos PCs (resolve o "caixeiro viajante" via
   * OSRM /trip), mantendo a Largada como início e fechando o loop. Em seguida
   * reordena e recalcula a rota.
   */
  async optimize(): Promise<{ points: [number, number][]; totalKm: number }> {
    const pcs = (
      await this.db.query<{ id: number; lng: number; lat: number }>(
        `SELECT id, ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat
           FROM exchange_points ORDER BY sequence`,
      )
    ).rows;
    if (pcs.length < 3) throw new Error('Poucos PCs para otimizar');

    const coordList = pcs.map((p) => `${p.lng},${p.lat}`).join(';');
    const url = `${OSRM}/trip/v1/driving/${coordList}?source=first&roundtrip=true&overview=false`;
    const res = await fetch(url);
    const j: any = await res.json();
    if (j.code !== 'Ok') throw new Error(`OSRM trip: ${j.code}`);

    // waypoints vêm na ordem do input; waypoint_index = posição no trajeto ótimo.
    const order = j.waypoints
      .map((w: any, i: number) => ({ id: pcs[i].id, pos: w.waypoint_index }))
      .sort((a: any, b: any) => a.pos - b.pos)
      .map((x: any) => x.id);

    this.logger.log(`Ordem otimizada (OSRM trip): ${order.join(',')}`);
    return this.reorder(order);
  }

  /**
   * Substitui TODO o trajeto por uma nova lista de pontos (na ordem). O ponto 0
   * é a Largada/Chegada; os demais viram PC 1..N. Recria trechos + escalas e
   * recalcula a rota nas ruas. Zera execuções/rastro (edição é pré-prova).
   */
  async importCourse(
    points: { lat: number; lng: number; name?: string }[],
  ): Promise<{ points: [number, number][]; totalKm: number; count: number }> {
    if (!points || points.length < 3) throw new Error('Mínimo de 3 pontos');
    for (const p of points) {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) {
        throw new Error('Coordenada inválida na lista');
      }
    }

    await this.db.withTransaction(async (run) => {
      await run('DELETE FROM troca_events');
      await run('DELETE FROM relay_assignments');
      await run('DELETE FROM leg_executions');
      await run('DELETE FROM position_logs');
      await run('DELETE FROM legs');
      await run('DELETE FROM exchange_points');

      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const name =
          p.name && p.name.trim() ? p.name.trim() : i === 0 ? 'Largada / Chegada' : `PC ${i}`;
        await run(
          `INSERT INTO exchange_points (sequence, name, location)
           VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326))`,
          [i + 1, name, p.lng, p.lat],
        );
      }

      const ids = (await run('SELECT id, sequence FROM exchange_points ORDER BY sequence')).rows;
      const n = ids.length;
      for (let g = 1; g <= n; g++) {
        await run(
          'INSERT INTO legs (sequence, from_pc_id, to_pc_id, distance_m) VALUES ($1, $2, $3, 0)',
          [g, ids[g - 1].id, ids[g % n].id],
        );
      }

      await run(
        `INSERT INTO relay_assignments (team_id, leg_id, athlete_id)
         SELECT t.id, l.id,
                (SELECT a.id FROM athletes a WHERE a.team_id = t.id ORDER BY a.id
                  OFFSET ((l.sequence - 1) % (SELECT count(*) FROM athletes a2 WHERE a2.team_id = t.id))
                  LIMIT 1)
         FROM teams t CROSS JOIN legs l`,
      );
    });

    const r = await this.rebuild();
    this.logger.log(`Trajeto importado: ${points.length} pontos`);
    return { ...r, count: points.length };
  }

  /** Reordena a sequência dos PCs (mantém o ponto 1 como largada). */
  async reorder(order: number[]): Promise<{ points: [number, number][]; totalKm: number }> {
    if (!order || order.length < 2) throw new Error('Ordem inválida');
    await this.db.withTransaction(async (run) => {
      // offset temporário evita violar UNIQUE(sequence) durante a renumeração
      await run('UPDATE exchange_points SET sequence = sequence + 1000');
      for (let i = 0; i < order.length; i++) {
        await run('UPDATE exchange_points SET sequence = $1 WHERE id = $2', [i + 1, order[i]]);
      }
    });
    return this.rebuild();
  }

  async rebuild(): Promise<{ points: [number, number][]; totalKm: number }> {
    const pcs = (
      await this.db.query<{ id: number; lng: number; lat: number }>(
        `SELECT id, ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat
           FROM exchange_points ORDER BY sequence`,
      )
    ).rows;
    if (pcs.length < 2) throw new Error('Poucos PCs para montar rota');

    // Sincroniza os trechos (legs) com a ordem atual dos PCs (loop).
    const n = pcs.length;
    for (let g = 1; g <= n; g++) {
      await this.db.query('UPDATE legs SET from_pc_id = $1, to_pc_id = $2 WHERE sequence = $3', [
        pcs[g - 1].id,
        pcs[g % n].id,
        g,
      ]);
    }

    const coordList = [...pcs.map((p) => `${p.lng},${p.lat}`), `${pcs[0].lng},${pcs[0].lat}`].join(';');
    const url = `${OSRM}/route/v1/driving/${coordList}?overview=full&geometries=geojson`;

    const res = await fetch(url);
    const j: any = await res.json();
    if (j.code !== 'Ok') throw new Error(`OSRM: ${j.code}`);

    const route = j.routes[0];
    const points: [number, number][] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng],
    );

    await this.db.query(
      `INSERT INTO route_path (id, points) VALUES (1, $1)
         ON CONFLICT (id) DO UPDATE SET points = EXCLUDED.points`,
      [JSON.stringify(points)],
    );

    for (let i = 0; i < route.legs.length; i++) {
      await this.db.query('UPDATE legs SET distance_m = $1 WHERE sequence = $2', [
        Math.round(route.legs[i].distance),
        i + 1,
      ]);
    }
    await this.db.query(
      `UPDATE exchange_points ep
          SET km_marker = ROUND(
            COALESCE((SELECT SUM(l.distance_m) FROM legs l WHERE l.sequence < ep.sequence), 0) / 1000.0, 2)`,
    );

    this.logger.log(`Rota recalculada: ${points.length} pontos, ${(route.distance / 1000).toFixed(1)} km`);
    return { points, totalKm: route.distance / 1000 };
  }
}
