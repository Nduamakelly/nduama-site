import Decimal from 'decimal.js';
import type { Numerique } from './types.js';

// Précision large en interne ; l'arrondi n'a lieu qu'au montant final.
Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -21, toExpPos: 34 });

export { Decimal };

export function dec(v: Numerique): Decimal {
  return new Decimal(typeof v === 'number' ? v.toString() : v.trim().replace(',', '.'));
}

/** Convertit si possible, sinon `null` — n'échoue jamais sur une saisie libre. */
export function decOuNull(v: Numerique | null | undefined): Decimal | null {
  if (v === null || v === undefined || v === '') return null;
  try {
    const d = dec(v);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

/** Représentation stable en base de données et en JSON. */
export function txt(d: Decimal | null): string | null {
  return d === null ? null : d.toFixed();
}

/** Arrondi commercial (half-up) à `n` décimales. */
export function arrondiCommercial(d: Decimal, n: number): Decimal {
  return d.toDecimalPlaces(n, Decimal.ROUND_HALF_UP);
}

/**
 * Représentation monétaire : décimales fixes, comme la colonne `NUMERIC(18,2)`.
 * `txt` supprime les zéros de fin — acceptable pour une QTY ou une teneur,
 * jamais pour un montant qui doit s'écrire « 1275.00 ».
 */
export function txtFixe(d: Decimal, n: number): string {
  return d.toFixed(n);
}
