import { useEffect, useState } from 'react';
import type { ExchangePoint } from '../lib/types';
import { wazeUrl } from '../lib/waze';

interface Props {
  pcs: ExchangePoint[];
  editMode?: boolean;
  onReorder?: (orderedIds: number[]) => void;
}

export function PointsPanel({ pcs, editMode, onReorder }: Props) {
  const [items, setItems] = useState<ExchangePoint[]>([]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);

  // Mantém uma cópia local (ordenação otimista durante o arraste).
  useEffect(() => {
    setItems([...pcs].sort((a, b) => a.sequence - b.sequence));
  }, [pcs]);

  function apply(next: ExchangePoint[]) {
    setItems(next);
    onReorder?.(next.map((p) => p.id));
  }

  function handleDrop(targetIndex: number) {
    if (dragId == null) return cleanup();
    const from = items.findIndex((p) => p.id === dragId);
    let to = targetIndex;
    if (from < 0 || to < 1) return cleanup(); // posição 0 (Largada) é fixa
    const next = [...items];
    const [moved] = next.splice(from, 1);
    if (from < to) to -= 1;
    if (to < 1) to = 1;
    next.splice(to, 0, moved);
    apply(next);
    cleanup();
  }

  function cleanup() {
    setDragId(null);
    setOverId(null);
  }

  function moveBtn(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 1 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    apply(next);
  }

  return (
    <div className="panel">
      <h2>
        <span className="h2-ico" aria-hidden>📍</span> Pontos &amp; Navegação
        {editMode && <span className="h2-tag">arraste p/ ordenar</span>}
      </h2>
      <ol className="points">
        {items.map((pc, i) => {
          const isStart = i === 0;
          const draggable = !!editMode && !isStart;
          return (
            <li
              key={pc.id}
              className={`${isStart ? 'start' : ''} ${dragId === pc.id ? 'dragging' : ''} ${overId === pc.id ? 'over' : ''}`}
              draggable={draggable}
              onDragStart={() => setDragId(pc.id)}
              onDragOver={(e) => {
                if (!draggable && !editMode) return;
                e.preventDefault();
                setOverId(pc.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(i);
              }}
              onDragEnd={cleanup}
            >
              {editMode && !isStart && <span className="pt-grip" title="Arraste">⠿</span>}
              <span className="pt-seq">{isStart ? '⚑' : i}</span>
              <span className="pt-name">
                {pc.name}
                <small>
                  {pc.lat.toFixed(5)}, {pc.lng.toFixed(5)}
                  {pc.km_marker != null && <> · km {Number(pc.km_marker).toFixed(1)}</>}
                </small>
              </span>
              {editMode && !isStart ? (
                <span className="pt-reorder">
                  <button onClick={() => moveBtn(i, -1)} disabled={i <= 1} title="Subir">↑</button>
                  <button onClick={() => moveBtn(i, 1)} disabled={i >= items.length - 1} title="Descer">↓</button>
                </span>
              ) : (
                <a className="waze-link" href={wazeUrl(pc.lat, pc.lng)} target="_blank" rel="noopener">
                  Waze
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
