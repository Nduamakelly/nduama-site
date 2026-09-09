/**
 * Résolution d'une tranche de barème.
 *
 * Deux écarts délibérés avec le classeur (voir docs/05) :
 *   - bornes semi-ouvertes `[min, max)` au lieu de `>= min` ET `<= max` ;
 *   - le chevauchement est un défaut de paramétrage, pas un cas arbitré
 *     silencieusement à l'exécution comme le fait `LOOKUP(2, 1/…)`.
 */
import { Decimal, dec } from './decimal.js';
import type { BaremeTranche } from './types.js';

export interface ProblemeBareme {
  type: 'CHEVAUCHEMENT' | 'TROU' | 'BORNES_INVERSEES';
  message: string;
  trancheIds: string[];
}

/** Tranches actives à la date donnée (`null` ⇒ maintenant). */
export function tranchesActives(baremes: BaremeTranche[], a: string | null = null): BaremeTranche[] {
  if (a === null) return baremes.filter((b) => b.valideAu === null);
  const t = Date.parse(a);
  return baremes.filter(
    (b) => Date.parse(b.valideDu) <= t && (b.valideAu === null || Date.parse(b.valideAu) > t),
  );
}

/**
 * Tranche couvrant `teneur` pour `matiereId`, ou `null` (hors barème).
 * Lève si plusieurs tranches actives se disputent la valeur : un barème
 * ambigu doit être corrigé, pas contourné.
 */
export function resoudreTranche(
  baremes: BaremeTranche[],
  matiereId: string,
  teneur: Decimal,
  a: string | null = null,
): BaremeTranche | null {
  const candidates = tranchesActives(baremes, a).filter(
    (b) =>
      b.matiereId === matiereId &&
      teneur.greaterThanOrEqualTo(dec(b.teneurMin)) &&
      teneur.lessThan(dec(b.teneurMax)),
  );
  if (candidates.length === 0) return null;
  if (candidates.length > 1) {
    throw new Error(
      `Barème ambigu : ${candidates.length} tranches actives couvrent la teneur ${teneur.toFixed()} % ` +
        `(${candidates.map((c) => c.id).join(', ')}). Corrigez le paramétrage.`,
    );
  }
  return candidates[0]!;
}

/** Contrôles de l'écran PARAMÈTRES : chevauchements et trous. */
export function verifierBareme(baremes: BaremeTranche[], matiereId: string): ProblemeBareme[] {
  const problemes: ProblemeBareme[] = [];
  const t = tranchesActives(baremes)
    .filter((b) => b.matiereId === matiereId)
    .sort((a, b) => dec(a.teneurMin).comparedTo(dec(b.teneurMin)));

  for (const tr of t) {
    if (dec(tr.teneurMin).greaterThanOrEqualTo(dec(tr.teneurMax))) {
      problemes.push({
        type: 'BORNES_INVERSEES',
        message: `Tranche ${tr.teneurMin}–${tr.teneurMax} % : la borne basse doit être strictement inférieure à la borne haute.`,
        trancheIds: [tr.id],
      });
    }
  }

  for (let i = 1; i < t.length; i++) {
    const prec = t[i - 1]!;
    const cour = t[i]!;
    const finPrec = dec(prec.teneurMax);
    const debutCour = dec(cour.teneurMin);
    if (debutCour.lessThan(finPrec)) {
      problemes.push({
        type: 'CHEVAUCHEMENT',
        message: `Les tranches ${prec.teneurMin}–${prec.teneurMax} % et ${cour.teneurMin}–${cour.teneurMax} % se chevauchent.`,
        trancheIds: [prec.id, cour.id],
      });
    } else if (debutCour.greaterThan(finPrec)) {
      problemes.push({
        type: 'TROU',
        message: `Aucune tranche ne couvre les teneurs de ${finPrec.toFixed()} % à ${debutCour.toFixed()} %.`,
        trancheIds: [prec.id, cour.id],
      });
    }
  }
  return problemes;
}
