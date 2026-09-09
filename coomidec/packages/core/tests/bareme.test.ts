import { describe, expect, it } from 'vitest';
import { dec } from '../src/decimal.js';
import { resoudreTranche, tranchesActives, verifierBareme } from '../src/bareme.js';
import { tranche } from './fixtures.js';

const baremes = [
  tranche({ id: 'a', teneurMin: '0', teneurMax: '2', coutUnitaire: '80' }),
  tranche({ id: 'b', teneurMin: '2', teneurMax: '3', coutUnitaire: '100' }),
  tranche({ id: 'c', teneurMin: '3', teneurMax: '4', coutUnitaire: '120' }),
];

describe('résolution de tranche', () => {
  it('retient la tranche couvrant la teneur', () => {
    expect(resoudreTranche(baremes, 'mat-cu-b', dec('3.2'))?.id).toBe('c');
  });

  it('inclut la borne basse et exclut la borne haute', () => {
    // Le classeur, bornes inclusives des deux côtés, rendait « 2 » ambigu.
    expect(resoudreTranche(baremes, 'mat-cu-b', dec('2'))?.id).toBe('b');
    expect(resoudreTranche(baremes, 'mat-cu-b', dec('1.999'))?.id).toBe('a');
    expect(resoudreTranche(baremes, 'mat-cu-b', dec('4'))).toBeNull();
  });

  it('renvoie null hors de toute tranche', () => {
    expect(resoudreTranche(baremes, 'mat-cu-b', dec('9'))).toBeNull();
  });

  it('refuse un barème ambigu au lieu de retenir la dernière ligne', () => {
    const ambigu = [...baremes, tranche({ id: 'd', teneurMin: '3.1', teneurMax: '5' })];
    expect(() => resoudreTranche(ambigu, 'mat-cu-b', dec('3.2'))).toThrow(/Barème ambigu/);
  });

  it('ignore les tranches fermées', () => {
    const historise = [
      tranche({ id: 'v1', coutUnitaire: '120', valideAu: '2026-09-10T00:00:00+02:00' }),
      tranche({ id: 'v2', coutUnitaire: '130', valideDu: '2026-09-10T00:00:00+02:00', versionBareme: 2 }),
    ];
    expect(tranchesActives(historise).map((t) => t.id)).toEqual(['v2']);
    expect(resoudreTranche(historise, 'mat-cu-b', dec('3.2'))?.coutUnitaire).toBe('130');
  });

  it('détecte chevauchements, trous et bornes inversées', () => {
    expect(verifierBareme(baremes, 'mat-cu-b')).toEqual([]);
    const problemes = verifierBareme(
      [
        tranche({ id: 'a', teneurMin: '0', teneurMax: '3' }),
        tranche({ id: 'b', teneurMin: '2', teneurMax: '4' }),
        tranche({ id: 'c', teneurMin: '6', teneurMax: '8' }),
        tranche({ id: 'd', teneurMin: '9', teneurMax: '9' }),
      ],
      'mat-cu-b',
    );
    expect(problemes.map((p) => p.type)).toEqual(['BORNES_INVERSEES', 'CHEVAUCHEMENT', 'TROU', 'TROU']);
  });
});
