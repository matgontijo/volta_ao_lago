interface TeamChip {
  id: number;
  name: string;
  color_hex: string;
}

interface Props {
  teams: TeamChip[];
  focusTeamId: number | null;
  onFocus: (teamId: number | null) => void;
  follow: boolean;
  onFollow: (v: boolean) => void;
}

/**
 * Barra de foco: escolhe UMA equipe para ver só ela no mapa/painéis (ou
 * "Todas"). Com uma equipe em foco, dá para seguir a van automaticamente.
 */
export function TeamFocusBar({ teams, focusTeamId, onFocus, follow, onFollow }: Props) {
  return (
    <div className="focus-bar">
      <button
        className={`chip ${focusTeamId == null ? 'active' : ''}`}
        onClick={() => onFocus(null)}
      >
        Todas
      </button>
      {teams.map((t) => (
        <button
          key={t.id}
          className={`chip ${focusTeamId === t.id ? 'active' : ''}`}
          style={focusTeamId === t.id ? { borderColor: t.color_hex } : undefined}
          onClick={() => onFocus(focusTeamId === t.id ? null : t.id)}
        >
          <i className="swatch" style={{ background: t.color_hex }} />
          {shortName(t.name)}
        </button>
      ))}
      {focusTeamId != null && (
        <button
          className={`chip follow ${follow ? 'active' : ''}`}
          title="Centralizar o mapa na van desta equipe automaticamente"
          onClick={() => onFollow(!follow)}
        >
          🎯 Seguir van
        </button>
      )}
    </div>
  );
}

function shortName(name: string): string {
  return name.replace('Canelas do Planalto — ', '');
}
