import { describe, expect, it } from 'vitest';
import { kmPtBr, paceMinPerKm, secondsToHms, toCsv } from '../src/common/csv';

describe('toCsv', () => {
  it('gera BOM + separador ; + CRLF', () => {
    const csv = toCsv(['a', 'b'], [['1', '2']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('a;b\r\n1;2\r\n');
  });

  it('escapa células com ; aspas e quebras de linha', () => {
    const csv = toCsv(['x'], [['tem;separador'], ['tem "aspas"'], ['tem\nlinha']]);
    expect(csv).toContain('"tem;separador"');
    expect(csv).toContain('"tem ""aspas"""');
    expect(csv).toContain('"tem\nlinha"');
  });

  it('null/undefined viram célula vazia', () => {
    const csv = toCsv(['a', 'b', 'c'], [[null, undefined, 'x']]);
    expect(csv).toContain(';;x');
  });

  it('neutraliza injeção de fórmula do Excel só em strings', () => {
    const csv = toCsv(['x', 'y'], [['=1+1', -47.8354671]]);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain('-47.8354671'); // número negativo fica intacto
    expect(csv).not.toContain("'-47.8354671");
  });
});

describe('formatadores', () => {
  it('secondsToHms', () => {
    expect(secondsToHms(3725)).toBe('01:02:05');
    expect(secondsToHms(0)).toBe('00:00:00');
    expect(secondsToHms(null)).toBe('');
  });

  it('paceMinPerKm', () => {
    expect(paceMinPerKm(312)).toBe('5:12');
    expect(paceMinPerKm(300)).toBe('5:00');
    expect(paceMinPerKm(null)).toBe('');
    expect(paceMinPerKm(0)).toBe('');
  });

  it('kmPtBr usa vírgula decimal', () => {
    expect(kmPtBr(12345)).toBe('12,35');
    expect(kmPtBr(12345, 1)).toBe('12,3');
    expect(kmPtBr(null)).toBe('');
  });
});
