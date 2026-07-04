// Geração de CSV "à prova de Excel brasileiro": BOM UTF-8 (acentos corretos
// ao dar duplo-clique) + separador ';' (padrão pt-BR) + CRLF + escaping RFC 4180.

const BOM = String.fromCharCode(0xfeff);
const SEP = ';';

export type CsvCell = string | number | null | undefined;

export function toCsv(header: string[], rows: CsvCell[][]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCell).join(SEP));
  return BOM + lines.join('\r\n') + '\r\n';
}

function escapeCell(v: CsvCell): string {
  if (v == null) return '';
  let s = String(v);
  // Anti "CSV formula injection": texto começando com = + - @ ou TAB viraria
  // fórmula no Excel. Só se aplica a STRINGS (números como -47.83 ficam intactos)
  // — importante num arquivo que serve de auditoria.
  if (typeof v === 'string' && /^[=+\-@\t]/.test(s)) {
    s = "'" + s;
  }
  // Aspas, separador, quebras de linha → célula precisa ser citada.
  if (s.includes('"') || s.includes(SEP) || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** 3725 → "01:02:05" (para durações de trecho e tempo total). */
export function secondsToHms(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(Number(s))) return '';
  const total = Math.max(0, Math.round(Number(s)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Pace em s/km → "5:12" (min/km); vazio sem dado. */
export function paceMinPerKm(secPerKm: number | null): string {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return '';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Metros → km com vírgula decimal (Excel pt-BR): 12345 → "12,3". */
export function kmPtBr(meters: number | null | undefined, digits = 2): string {
  if (meters == null || !Number.isFinite(Number(meters))) return '';
  return (Number(meters) / 1000).toFixed(digits).replace('.', ',');
}
