import { useState } from 'react';
import { downloadExport } from '../lib/api';

type Tipo = 'trechos' | 'classificacao' | 'auditoria';

const FILES: { tipo: Tipo; icon: string; title: string; desc: string }[] = [
  {
    tipo: 'classificacao',
    icon: '🏆',
    title: 'Classificação',
    desc: 'Posição final, trechos concluídos, tempo total e pace médio de cada equipe.',
  },
  {
    tipo: 'trechos',
    icon: '🏃',
    title: 'Resultados por trecho',
    desc: 'Cada trecho de cada equipe: atleta, início/fim reais, duração, pace, GPS e quem registrou.',
  },
  {
    tipo: 'auditoria',
    icon: '🧾',
    title: 'Auditoria de trocas',
    desc: 'Trilha completa dos cliques: quando, quem (van ou torre/failover) e de onde cada troca foi registrada.',
  },
];

/**
 * Exportação em CSV pronto para Excel pt-BR (acentos e separador corretos).
 * Pode ser gerada DURANTE a prova (dados parciais) ou depois.
 */
export function ExportModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [busy, setBusy] = useState<Tipo | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function baixar(tipo: Tipo) {
    setBusy(tipo);
    setError(null);
    try {
      await downloadExport(token, tipo);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Exportar resultados</h2>
          <button className="link" onClick={onClose}>
            fechar
          </button>
        </div>
        <p className="muted">
          Planilhas CSV prontas para o Excel. Pode exportar <b>durante a prova</b>{' '}
          (sai o parcial) — a auditoria serve como registro oficial das trocas.
        </p>
        {error && <div className="gate-error">{error}</div>}
        <div className="export-list">
          {FILES.map((f) => (
            <div className="export-card" key={f.tipo}>
              <span className="export-ico" aria-hidden>{f.icon}</span>
              <div className="export-info">
                <strong>{f.title}</strong>
                <small>{f.desc}</small>
              </div>
              <button className="ctrl primary" disabled={busy != null} onClick={() => baixar(f.tipo)}>
                {busy === f.tipo ? 'Gerando…' : 'Baixar CSV'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
