// ============================================================================
// Workflow de revisão multi-agente do diff NÃO COMMITADO deste repositório.
//
// Como usar (dentro do Claude Code, neste repo):
//   "rode o workflow review-features"
//   — opcionalmente passando contexto:  args = "o diff implementa X e Y"
//
// ⚠️ Custo: cada agente é uma instância do Claude — rodar este workflow
// consome tokens do seu plano. O arquivo parado aqui não custa nada.
//
// Estrutura: 4 revisores com lentes diferentes (backend, segurança, React,
// contrato backend↔frontend) → cada achado é atacado por 3 céticos
// independentes; só sobrevive com 2 votos de "não consegui refutar".
// ============================================================================
export const meta = {
  name: 'review-features',
  description: 'Revisão adversarial do diff não commitado (4 lentes + 3 céticos por achado)',
  whenToUse: 'Antes de commitar um conjunto grande de mudanças neste repo',
  phases: [
    { title: 'Revisar', detail: '4 lentes em paralelo sobre o git diff' },
    { title: 'Verificar', detail: '3 céticos por achado, maioria decide' },
  ],
}

const CONTEXT = `
Você está no repositório volta_ao_lago (sistema de logística/cronometragem/GPS
para ultramaratona de revezamento: NestJS + Socket.io + Redis + PostGIS no
backend, duas PWAs React em apps/mobile e apps/dashboard, SQL em db/).
Revise o diff NÃO COMMITADO: comece com "git diff HEAD --stat" e
"git status --short", depois leia o diff dos arquivos da sua lente e o código
ao redor para entender o contexto.
${args ? `Contexto do autor sobre o diff: ${args}` : ''}
Reporte APENAS defeitos reais e acionáveis do código NOVO (o diff) — nada de
estilo ou melhoria hipotética. Para cada achado: arquivo, linha aproximada,
defeito em 1 frase e cenário concreto de falha (entrada/estado → erro).`

const FINDINGS = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'summary', 'failure_scenario'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          summary: { type: 'string' },
          failure_scenario: { type: 'string' },
        },
      },
    },
  },
}

const VERDICT = {
  type: 'object',
  required: ['refuted', 'reasoning'],
  properties: {
    refuted: { type: 'boolean', description: 'true se o achado NÃO é um bug real do código novo' },
    reasoning: { type: 'string' },
  },
}

const LENSES = [
  {
    key: 'backend',
    prompt: `${CONTEXT}
LENTE: correção do backend. SQL (joins, agregações, fusos, divisão por zero,
parametrização), lógica de negócio (troca atômica, ETA/pace, geofence),
concorrência (estado por instância vs Redis), tipos do driver pg
(bigint/numeric chegando como string), tratamento de erro nos handlers.`,
  },
  {
    key: 'security',
    prompt: `${CONTEXT}
LENTE: segurança. Escalação de privilégio entre papéis (org/operator/driver/
spectator), endpoints de escrita sem guard, SQL com interpolação alcançável
por entrada de usuário, injeção (CSV/HTML), tokens vazando em URL/log,
rate limit contornável.`,
  },
  {
    key: 'react',
    prompt: `${CONTEXT}
LENTE: React/frontends (apps/dashboard e apps/mobile). Hooks com deps erradas,
efeitos sem cleanup, estados de carregamento/erro que travam a tela, listas
sem key/dedupe, dados null renderizados, modo somente-leitura que ainda expõe
ação de escrita, memória (listas que crescem sem cap).`,
  },
  {
    key: 'contract',
    prompt: `${CONTEXT}
LENTE: contrato backend↔frontend. Compare campo a campo os tipos espelhados
(backend/src/common/types.ts vs apps/*/src/lib/types.ts), nomes de eventos de
socket emitidos vs ouvidos, rotas REST vs chamadas fetch, snake_case do SQL vs
mapeamento camelCase, URLs geradas (dev nas portas 5173/5174 vs deploy
unificado servido pelo backend).`,
  },
]

phase('Revisar')
const results = await pipeline(
  LENSES,
  (l) => agent(l.prompt, { label: `rev:${l.key}`, phase: 'Revisar', schema: FINDINGS }),
  (review, l) =>
    review && review.findings.length > 0
      ? parallel(
          review.findings.slice(0, 8).map((f) => () =>
            parallel(
              ['correção técnica', 'reprodutibilidade prática', 'é código novo ou pré-existente'].map(
                (lens) => () =>
                  agent(
                    `${CONTEXT}
Você é um cético tentando REFUTAR este achado (lente original: ${l.key}; sua lente: ${lens}):
ARQUIVO: ${f.file} (linha ~${f.line ?? '?'})
ACHADO: ${f.summary}
CENÁRIO ALEGADO: ${f.failure_scenario}
Leia o código real e decida: é um bug REAL do código NOVO que causa o cenário
alegado? Comportamento correto, cenário impossível, código pré-existente ou
mera preferência → refuted=true. Na dúvida, refuted=true.`,
                    { label: `verif:${f.file.split('/').pop()}`, phase: 'Verificar', schema: VERDICT },
                  ),
              ),
            ).then((votes) => ({
              ...f,
              lens: l.key,
              confirmed: votes.filter(Boolean).filter((v) => !v.refuted).length >= 2,
            })),
          ),
        )
      : [],
)

const all = results.filter(Boolean).flat().filter(Boolean)
const confirmed = all.filter((f) => f.confirmed)
log(`${all.length} achados brutos, ${confirmed.length} confirmados`)
return {
  confirmed,
  rejected: all.filter((f) => !f.confirmed).map((f) => ({ file: f.file, summary: f.summary })),
}
