import type { ReactNode } from 'react';

/**
 * Moldura das telas de entrada do co-piloto (login, identificação, QR):
 * circuito animado ao fundo — o "lago" com marcadores percorrendo, como no
 * mapa ao vivo — e a marca com o logo em anel dourado.
 */
export function GateShell({ sub, children }: { sub: string; children: ReactNode }) {
  const loop =
    'M 200,400 C 180,260 320,150 520,170 C 700,190 760,90 920,140 ' +
    'C 1080,190 1060,360 960,450 C 880,520 900,640 760,660 ' +
    'C 620,680 560,600 440,620 C 300,640 220,540 200,400 Z';
  return (
    <div className="screen login gate-screen">
      <div className="gate-scene" aria-hidden>
        <svg className="gate-route" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <path id="gate-loop" d={loop} fill="none" stroke="#38e0c8" strokeOpacity="0.13" strokeWidth="2.5" />
          <path d={loop} fill="none" stroke="#38e0c8" strokeOpacity="0.28" strokeWidth="7"
            strokeLinecap="round" strokeDasharray="0.5 132" />
          <g className="gate-mover">
            <circle r="11" fill="#f7c948" opacity="0.14" />
            <circle r="4" fill="#f7c948" opacity="0.85" />
            <animateMotion dur="26s" repeatCount="indefinite">
              <mpath href="#gate-loop" />
            </animateMotion>
          </g>
          <g className="gate-mover">
            <circle r="10" fill="#4f8aff" opacity="0.14" />
            <circle r="3.5" fill="#4f8aff" opacity="0.85" />
            <animateMotion dur="42s" repeatCount="indefinite" begin="-21s">
              <mpath href="#gate-loop" />
            </animateMotion>
          </g>
        </svg>
      </div>

      <div className="brand">
        <div className="gate-logo-wrap">
          <span className="gate-logo-ring" aria-hidden />
          {/* BASE_URL: a PWA vive em /mobile/ — '/logo.png' absoluto quebraria. */}
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            className="gate-logo"
            alt="Canelas do Planalto"
          />
        </div>
        <h1>Canelas do Planalto</h1>
        <p>{sub}</p>
      </div>

      {children}

      <div className="gate-foot">
        <span className="gate-live-dot" aria-hidden /> Volta do Lago · rastreamento ao vivo
      </div>
    </div>
  );
}
