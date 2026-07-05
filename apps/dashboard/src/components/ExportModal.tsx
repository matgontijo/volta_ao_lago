import { useState } from 'react';
import { downloadExport, type ExportTipo } from '../lib/api';

const FILES: { tipo: ExportTipo; icon: string; title: string; desc: string; html?: boolean }[] = [
  {
    tipo: 'espelho',
    icon: '📄',
    title: 'Espelho da Prova (HTML)',
    desc: 'Relatório completo e bonito: pódio por categoria, destaques, classificação, gráfico de pace por trecho e o detalhe de cada equipe. Ideal para compartilhar e imprimir.',
    html: true,
  },
  {
    tipo: 'classificacao',
    icon: '🏆',
    title: 'Classificação',
    desc: 'Posição geral E por categoria, gap para o líder, tempo total, pace médio e trocas registradas pela torre.',
  },
  {
    tipo: 'trechos',
    icon: '🏃',
    title: 'Resultados por trecho',
    desc: 'Cada trecho: atleta, tempos reais, pace, velocidade, comparação com a média da equipe, posição no momento e GPS.',
  },
  {
    tipo: 'atletas',
    icon: '🎽',
    title: 'Por atleta',
    desc: 'Consolidado individual: trechos corridos, km somados, tempo, pace médio, melhor e pior trecho — ranking por pace.',
  },
  {
    tipo: 'auditoria',
    icon: '🧾',
    title: 'Auditoria de trocas',
    desc: 'Trilha completa dos cliques: quando, quem (van ou torre/failover) e de onde cada troca foi registrada.',
  },
  {
    tipo: 'operacional',
    icon: '🔧',
    title: 'Operacional (frota)',
    desc: 'Pós-mortem da logística: quedas de sinal por veículo, distância real rodada, velocidade máxima e bateria mínima.',
  },
];

/**
 * Exportação da prova: Espelho em HTML + 5 CSVs prontos para Excel pt-BR.
 * Pode ser gerada DURANTE a prova (dados parciais) ou depois.
 */
export function ExportModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(tipo: ExportTipo, view = false) {
    setBusy(`${tipo}${view ? ':view' : ''}`);
    setError(null);
    try {
      await downloadExport(token, tipo, { view });
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
          Pode exportar <b>durante a prova</b> (sai o parcial). Os CSVs abrem
          direto no Excel; o Espelho é a versão apresentável para o grupo.
        </p>
        {error && <div className="gate-error">{error}</div>}
        <div className="export-list">
          {FILES.map((f) => (
            <div className={`export-card ${f.tipo === 'espelho' ? 'featured' : ''}`} key={f.tipo}>
              <span className="export-ico" aria-hidden>{f.icon}</span>
              <div className="export-info">
                <strong>{f.title}</strong>
                <small>{f.desc}</small>
              </div>
              {f.html && (
                <button
                  className="ctrl"
                  disabled={busy != null}
                  onClick={() => run(f.tipo, true)}
                >
                  {busy === `${f.tipo}:view` ? '…' : 'Visualizar'}
                </button>
              )}
              <button
                className="ctrl primary"
                disabled={busy != null}
                onClick={() => run(f.tipo)}
              >
                {busy === f.tipo ? 'Gerando…' : 'Baixar'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
