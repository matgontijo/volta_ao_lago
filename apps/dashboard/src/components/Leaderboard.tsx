import { distanceLabel } from '../lib/format';
import type { LeaderboardRow } from '../lib/types';

export function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <div className="panel">
      <h2><span className="h2-ico" aria-hidden>🏆</span> Classificação</h2>
      <ol className="board">
        {rows.map((r) => (
          <li key={r.teamId}>
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
