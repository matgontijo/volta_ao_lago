import { secondsToClock } from '../lib/format';
import type { TimelineEvent } from '../lib/types';

/**
 * Linha do tempo da prova: cada troca com atleta que saiu/entrou, tempo do
 * trecho e QUEM registrou (trilha de auditoria visível — troca forçada pela
 * torre fica marcada).
 */
export function TimelinePanel({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="panel">
      <h2>
        <span className="h2-ico" aria-hidden>📜</span> Linha do tempo
      </h2>
      <ul className="timeline">
        {events.map((ev) => (
          <li key={ev.id}>
            <span className="tl-time">{clock(ev.ts)}</span>
            <i className="swatch" style={{ background: ev.colorHex }} />
            <div className="tl-body">
              <div className="tl-main">{describe(ev)}</div>
              <small className="tl-meta">
                {shortTeam(ev.teamName)}
                {ev.finishedSeconds != null && (
                  <> · trecho {ev.finishedLegSeq} em <b>{secondsToClock(ev.finishedSeconds)}</b></>
                )}
                {ev.createdByRole === 'org' ? (
                  <span className="tl-forced"> · ⚠ pela torre (failover)</span>
                ) : (
                  ev.createdByName && <> · por {ev.createdByName}</>
                )}
              </small>
            </div>
          </li>
        ))}
        {events.length === 0 && <div className="empty">Nenhuma troca registrada ainda.</div>}
      </ul>
    </div>
  );
}

function describe(ev: TimelineEvent): string {
  if (ev.action === 'started') return `🟢 ${ev.newAthlete ?? '—'} largou (trecho ${ev.newLegSeq ?? 1})`;
  if (ev.action === 'finished_race') return `🏁 ${shortTeam(ev.teamName)} concluiu a volta!`;
  return `🔁 ${ev.finishedAthlete ?? '—'} → ${ev.newAthlete ?? '—'} (trecho ${ev.newLegSeq ?? '—'})`;
}

function shortTeam(name: string): string {
  return name.replace('Canelas do Planalto — ', '');
}

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
