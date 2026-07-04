/**
 * Nome do motorista vem da query string do handshake — entrada não confiável.
 * Limita tamanho e remove caracteres de controle antes de propagar ao painel.
 */
export function sanitizeDriverName(raw: unknown, maxLen = 40): string | null {
  if (typeof raw !== 'string') return null;
  const semControle = Array.from(raw)
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 32 && c !== 127; // descarta controle ASCII + DEL
    })
    .join('');
  const clean = semControle.replace(/\s+/g, ' ').trim().slice(0, maxLen).trim();
  return clean.length > 0 ? clean : null;
}
