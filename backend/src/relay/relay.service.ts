import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { TrocaResult } from '../common/types';

interface TrocaRow {
  action: TrocaResult['action'];
  finished_exec_id: number | null;
  new_exec_id: number | null;
  current_leg_seq: number | null;
  current_athlete_id: number | null;
  current_athlete_name: string | null;
  next_pc_id: number | null;
  next_pc_name: string | null;
  next_pc_lat: number | null;
  next_pc_lng: number | null;
}

@Injectable()
export class RelayService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Dispara a função atômica do banco. Um round-trip, uma transação:
   * fecha o trecho anterior + abre o do próximo atleta, à prova de duplo-clique.
   */
  async executarTroca(
    teamId: number,
    lat: number,
    lng: number,
    userId: number,
  ): Promise<TrocaResult> {
    const res = await this.db.query<TrocaRow>(
      'SELECT * FROM executar_troca($1, $2, $3, $4)',
      [teamId, lat, lng, userId],
    );
    const r = res.rows[0];
    return {
      action: r.action,
      finishedExecId: r.finished_exec_id,
      newExecId: r.new_exec_id,
      currentLegSeq: r.current_leg_seq,
      currentAthleteId: r.current_athlete_id,
      currentAthleteName: r.current_athlete_name,
      nextPc:
        r.next_pc_id != null
          ? {
              id: r.next_pc_id,
              name: r.next_pc_name!,
              lat: r.next_pc_lat!,
              lng: r.next_pc_lng!,
            }
          : null,
    };
  }
}
