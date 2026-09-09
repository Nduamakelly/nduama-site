import type { BaremeTranche, MatiereCalcul } from '../src/types.js';

export const T0 = '2026-09-09T08:14:03+02:00';
export const T1 = '2026-09-10T08:00:00+02:00';

/** Décision D4 : cuivre, 1 % de teneur = 140 USD. */
export const CUIVRE_PRIX_POURCENT: MatiereCalcul = {
  id: 'mat-cu',
  code: 'CU',
  nom: 'Cuivre',
  methode: 'PRIX_PAR_POURCENT',
  prixParPourcent: '140',
  devise: 'USD',
  uniteCode: 'T',
};

/** Comportement du classeur : tranches + % coût. */
export const CUIVRE_BAREME: MatiereCalcul = {
  id: 'mat-cu-b',
  code: 'CU',
  nom: 'Cuivre',
  methode: 'BAREME_TRANCHES',
  devise: 'USD',
  uniteCode: 'T',
};

export function tranche(p: Partial<BaremeTranche> & Pick<BaremeTranche, 'id'>): BaremeTranche {
  return {
    matiereId: 'mat-cu-b',
    teneurMin: '3',
    teneurMax: '4',
    coutUnitaire: '120',
    pctCout: '0.85',
    devise: 'USD',
    valideDu: '2026-01-01T00:00:00+02:00',
    valideAu: null,
    versionBareme: 1,
    ...p,
  };
}
