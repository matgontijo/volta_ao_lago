import { distanceLabel, paceLabel, secondsToClock } from '../lib/format';
import type { TeamState } from '../lib/types';

interface Props {
  states: TeamState[];
  now: number;
  onForceTroca?: (teamId: number) => void;
}

const CATEGORY_LABEL: Record<string, string> = {
  elite_masculino: 'Elite M',
  elite_feminino: 'Elite F',
  misto: 'Misto',
};

export function TelemetryPanel({ states, now, onForceTroca }: Props) {
  const ordered = [...states].sort((a, b) => a.teamId - b.teamId);
  return (
    <div className="panel">
      <h2><span className="h2-ico" aria-hidden>📡</span> Telemetria</h2>
      <div className="tele-table">
        <div className="tele-head">
          <span>Equipe</span>
          <span>Atleta / Trecho</span>
          <span>Tempo</span>
          <span>Pace</span>
          <span>Próx. PC</span>
          <span>{onForceTroca ? 'Ação' : 'ETA'}</span>
        </div>
        {ordered.map((s) => {
          const elapsed =
            s.startedAt && s.status === 'running'
              ? Math.floor((now - new Date(s.startedAt).getTime()) / 1000)
              : null;
          return (
            <div className="tele-row" key={s.teamId}>
              <span className="team-cell">
                <i className="swatch" style={{ background: s.colorHex }} />
                <span>
                  {s.teamName}
                  <small>{CATEGORY_LABEL[s.category] ?? s.category}</small>
                </span>
              </span>
              <span>
                <strong>{s.athleteName ?? '—'}</strong>
                <small>
                  {s.status === 'finished'
                    ? '🏁 concluída'
                    : s.legSeq
                      ? `Trecho ${s.legSeq} → ${s.nextPc?.name ?? ''}`
                      : 'aguardando'}
                </small>
              </span>
              <span className="num">{secondsToClock(elapsed)}</span>
              <span className="num">{paceLabel(s.avgPaceSecPerKm)}</span>
              <span className="num">{distanceLabel(s.distanceToNextPcM)}</span>
              {onForceTroca ? (
                <button
                  className="force-btn"
                  title="Failover: registrar troca desta equipe pela torre"
                  disabled={s.status === 'finished'}
                  onClick={() => onForceTroca(s.teamId)}
                >
                  forçar troca
                </button>
              ) : (
                <span className="num">{secondsToClock(s.etaSeconds)}</span>
              )}
            </div>
          );
        })}
        {ordered.length === 0 && <div className="empty">Sem dados de telemetria ainda.</div>}
      </div>
    </div>
  );
}
