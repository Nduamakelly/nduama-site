import { describe, expect, it } from 'vitest';
import { composerNumero, heureLocale, journeeMetier, prefixeAppareil } from '../src/db/numero.ts';

const DEVICE = 'a7f3c1d2-0000-4000-8000-000000000001';

describe('numérotation locale', () => {
  it('compose un numéro lisible et stable', () => {
    expect(composerNumero('KOL', '2026-09-09', DEVICE, 14))
      .toBe('COOMIDEC/KOL/20260909/A7F3-014');
  });

  it('dérive un préfixe stable de l identifiant d appareil', () => {
    expect(prefixeAppareil(DEVICE)).toBe('A7F3');
    expect(prefixeAppareil(DEVICE)).toBe(prefixeAppareil(DEVICE));
  });

  it('distingue deux tablettes du même site le même jour', () => {
    const autre = 'b1e9c1d2-0000-4000-8000-000000000002';
    expect(composerNumero('KOL', '2026-09-09', DEVICE, 1))
      .not.toBe(composerNumero('KOL', '2026-09-09', autre, 1));
  });

  it('rattache une saisie de 23 h à la journée locale, pas à la journée UTC', () => {
    // 2026-09-09 23:30 à Lubumbashi (UTC+2) = 21:30 UTC le même jour.
    const tard = new Date('2026-09-09T21:30:00Z');
    expect(journeeMetier(tard)).toBe('2026-09-09');
    expect(heureLocale(tard)).toBe('23:30:00');

    // 2026-09-09 23:30 UTC = 2026-09-10 01:30 à Lubumbashi : jour suivant.
    const apresMinuit = new Date('2026-09-09T23:30:00Z');
    expect(journeeMetier(apresMinuit)).toBe('2026-09-10');
  });
});
