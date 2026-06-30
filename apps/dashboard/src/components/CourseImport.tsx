import { useState } from 'react';
import { importCourse } from '../lib/api';
import { parseKml, parsePasted, type PointIn } from '../lib/parsePoints';

interface Props {
  token: string;
  onClose: () => void;
  onDone: () => void;
}

const EXAMPLE = `-15.81928, -47.83547\n-15.82412, -47.81626\n-15.81446, -47.80656`;

export function CourseImport({ token, onClose, onDone }: Props) {
  const [text, setText] = useState('');
  const [points, setPoints] = useState<PointIn[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function onText(t: string) {
    setText(t);
    setFileName(null);
    setPoints(parsePasted(t));
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then((txt) => {
      setFileName(f.name);
      setText('');
      setPoints(parseKml(txt));
    });
  }

  async function apply() {
    if (points.length < 3) {
      setErr('Preciso de pelo menos 3 pontos.');
      return;
    }
    if (!confirm(`Definir o trajeto com ${points.length} pontos? Isso substitui o atual e zera a prova.`))
      return;
    setBusy(true);
    setErr(null);
    try {
      await importCourse(token, points);
      onDone();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Definir trajeto</h2>
          <button className="link" onClick={onClose}>
            fechar
          </button>
        </div>
        <p className="muted">
          Cole os pontos (uma <b>lat, lng</b> por linha — copie do Google Maps) ou suba um
          <b> .kml</b> do Google My Maps (sem limite de pontos). O 1º ponto é a Largada/Chegada.
        </p>

        <div className="import-grid">
          <div>
            <textarea
              className="import-text"
              placeholder={EXAMPLE}
              value={text}
              onChange={(e) => onText(e.target.value)}
            />
            <label className="ctrl file-btn">
              📁 Subir KML do Google My Maps
              <input type="file" accept=".kml,.kmz,.gpx,.xml,.txt" onChange={onFile} hidden />
            </label>
            {fileName && <small className="muted"> {fileName}</small>}
          </div>

          <div className="import-preview">
            <div className="import-count">
              {points.length > 0 ? `${points.length} pontos detectados` : 'Nenhum ponto ainda'}
            </div>
            <ol className="points">
              {points.slice(0, 30).map((p, i) => (
                <li key={i} className={i === 0 ? 'start' : ''}>
                  <span className="pt-seq">{i === 0 ? '⚑' : i}</span>
                  <span className="pt-name">
                    {i === 0 ? 'Largada / Chegada' : p.name || `PC ${i}`}
                    <small>
                      {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                    </small>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {err && <div className="gate-error">{err}</div>}
        <div className="import-actions">
          <button className="ctrl primary" disabled={busy || points.length < 3} onClick={apply}>
            {busy ? 'Aplicando…' : `Aplicar trajeto (${points.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
