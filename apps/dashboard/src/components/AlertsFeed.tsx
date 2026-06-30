import type { GeofenceAlert } from '../lib/types';

interface Props {
  alerts: GeofenceAlert[];
  onOpenSettings?: () => void;
}

export function AlertsFeed({ alerts, onOpenSettings }: Props) {
  return (
    <div className="panel">
      <h2>
        <span className="h2-ico" aria-hidden>🔔</span> Alertas de aproximação
        {onOpenSettings && (
          <button className="h2-gear" title="Configurar alertas" onClick={onOpenSettings}>
            ⚙
          </button>
        )}
      </h2>
      <ul className="alerts">
        {alerts.map((a, i) => (
          <li key={`${a.ts}-${i}`}>
            <span className="alert-time">{new Date(a.ts).toLocaleTimeString('pt-BR')}</span>
            <span>📍 {a.message}</span>
          </li>
        ))}
        {alerts.length === 0 && <div className="empty">Nenhum alerta no momento.</div>}
      </ul>
    </div>
  );
}
