import { describe, expect, it } from 'vitest';
import { sanitizeDriverName } from '../src/common/sanitize';

describe('sanitizeDriverName', () => {
  it('aceita nome normal', () => {
    expect(sanitizeDriverName('João Silva')).toBe('João Silva');
  });

  it('recorta espaços e colapsa múltiplos', () => {
    expect(sanitizeDriverName('  João   Silva  ')).toBe('João Silva');
  });

  it('limita o tamanho', () => {
    const longo = 'a'.repeat(100);
    expect(sanitizeDriverName(longo)!.length).toBe(40);
  });

  it('remove caracteres de controle', () => {
    const comControle = 'Jo' + String.fromCharCode(0, 7, 27) + 'ão';
    expect(sanitizeDriverName(comControle)).toBe('João');
  });

  it('rejeita não-string e vazio', () => {
    expect(sanitizeDriverName(undefined)).toBeNull();
    expect(sanitizeDriverName(123)).toBeNull();
    expect(sanitizeDriverName('   ')).toBeNull();
    expect(sanitizeDriverName('')).toBeNull();
  });
});
