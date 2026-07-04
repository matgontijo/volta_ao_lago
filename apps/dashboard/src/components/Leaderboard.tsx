import { distanceLabel } from '../lib/format';
import type { LeaderboardRow } from '../lib/types';

interface Props {
  rows: LeaderboardRow[];
  focusTeamId?: number | null;
  onSelectTeam?: (teamId: number) => void;
}

export function Leaderboard({ rows, focusTeamId, onSelectTeam }: Props) {
  return (
    <div className="panel">
      <h2><span className="h2-ico" aria-hidden>🏆</span> Classificação</h2>
      <ol className="board">
        {rows.map((r) => (
          <li
            key={r.teamId}
            className={focusTeamId === r.teamId ? 'focused' : ''}
            onClick={() => onSelectTeam?.(r.teamId)}
            style={onSelectTeam ? { cursor: 'pointer' } : undefined}
          >
            <span className={`rank rank-${r.rank}`}>{r.rank}</span>
            <i className="swatch" style={{ background: r.colorHex }} />
            <span className="board-team">{r.teamName}</span>
            <span className="board-meta">
              {r.status === 'finished' ? '🏁' : `${r.legsCompleted} trechos`}
              {r.status !== 'finished' && r.distanceToNextPcM != null && (
                <small> · {distanceLabel(r.distanceToNextPcM)} p/ PC</small>
              )}
            </span>
          </li>
        ))}
        {rows.length === 0 && <div className="empty">Aguardando largada…</div>}
      </ol>
    </div>
  );
}
