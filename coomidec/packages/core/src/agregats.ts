/**
 * Agrégats de journée : rapport journalier, clôture, tableau de bord.
 *
 * Décision D1 — la teneur moyenne du site est la moyenne PONDÉRÉE par la QTY.
 * La moyenne arithmétique du classeur reste calculée et affichée à côté,
 * explicitement libellée, pour la continuité avec le fichier Excel.
 */
import { Decimal, dec, decOuNull, txt, txtFixe, arrondiCommercial } from './decimal.js';

export type StatutOperation = 'BROUILLON' | 'VALIDEE' | 'ANNULEE' | 'CLOTUREE' | 'CORRIGEE';

export interface OperationAgregable {
  id: string;
  matiereId: string;
  matiereNom: string;
  uniteCode: string;
  qty: string | number;
  teneur: string | number;
  montant: string | number | null;
  devise: string;
  statut: StatutOperation;
  syncStatus?: string;
}

export interface TotauxMatiere {
  matiereId: string;
  matiereNom: string;
  uniteCode: string;
  nbOperations: number;
  qtyTotale: string;
  teneurMoyennePonderee: string | null;
  teneurMoyenneArithmetique: string | null;
  teneurMin: string | null;
  teneurMax: string | null;
  montantTotal: string;
}

export interface TotauxJournee {
  nbOperations: number;
  nbAnnulees: number;
  nbNonSynchronisees: number;
  qtyTotale: string;
  /** Décision D1 — indicateur principal. */
  teneurMoyennePonderee: string | null;
  /** Reproduit `SUMIF/COUNTIF` du classeur. */
  teneurMoyenneArithmetique: string | null;
  teneurMin: string | null;
  teneurMax: string | null;
  montantTotal: string;
  devise: string | null;
  parMatiere: TotauxMatiere[];
}

/** Les opérations annulées sont exclues des totaux mais restent comptées. */
const RETENUE = (o: OperationAgregable): boolean => o.statut !== 'ANNULEE';

const DEC_TENEUR = 3;
const DEC_QTY = 3;
const DEC_MONTANT = 2;

function agregerLot(ops: OperationAgregable[]): {
  qty: Decimal;
  montant: Decimal;
  ponderee: Decimal | null;
  arithmetique: Decimal | null;
  min: Decimal | null;
  max: Decimal | null;
} {
  let qty = new Decimal(0);
  let montant = new Decimal(0);
  let sommeProduits = new Decimal(0);
  let sommeTeneurs = new Decimal(0);
  let nbTeneurs = 0;
  let min: Decimal | null = null;
  let max: Decimal | null = null;

  for (const o of ops) {
    const q = decOuNull(o.qty) ?? new Decimal(0);
    const t = decOuNull(o.teneur);
    const m = decOuNull(o.montant ?? null);

    qty = qty.plus(q);
    if (m !== null) montant = montant.plus(m);
    if (t !== null) {
      sommeProduits = sommeProduits.plus(q.times(t));
      sommeTeneurs = sommeTeneurs.plus(t);
      nbTeneurs++;
      if (min === null || t.lessThan(min)) min = t;
      if (max === null || t.greaterThan(max)) max = t;
    }
  }

  return {
    qty,
    montant,
    // Σ(qty × teneur) / Σ qty — indéfinie si la quantité totale est nulle.
    ponderee: qty.isZero() ? null : sommeProduits.dividedBy(qty),
    arithmetique: nbTeneurs === 0 ? null : sommeTeneurs.dividedBy(nbTeneurs),
    min,
    max,
  };
}

export function agregerJournee(operations: OperationAgregable[]): TotauxJournee {
  const retenues = operations.filter(RETENUE);
  const g = agregerLot(retenues);

  const matieres = new Map<string, OperationAgregable[]>();
  for (const o of retenues) {
    const lot = matieres.get(o.matiereId);
    if (lot) lot.push(o);
    else matieres.set(o.matiereId, [o]);
  }

  const parMatiere: TotauxMatiere[] = [...matieres.values()]
    .map((lot) => {
      const a = agregerLot(lot);
      const ref = lot[0]!;
      return {
        matiereId: ref.matiereId,
        matiereNom: ref.matiereNom,
        uniteCode: ref.uniteCode,
        nbOperations: lot.length,
        qtyTotale: txt(arrondiCommercial(a.qty, DEC_QTY))!,
        teneurMoyennePonderee: a.ponderee && txt(arrondiCommercial(a.ponderee, DEC_TENEUR)),
        teneurMoyenneArithmetique: a.arithmetique && txt(arrondiCommercial(a.arithmetique, DEC_TENEUR)),
        teneurMin: txt(a.min),
        teneurMax: txt(a.max),
        montantTotal: txtFixe(a.montant, DEC_MONTANT),
      };
    })
    .sort((x, y) => x.matiereNom.localeCompare(y.matiereNom, 'fr'));

  const devises = new Set(retenues.map((o) => o.devise));

  return {
    nbOperations: retenues.length,
    nbAnnulees: operations.length - retenues.length,
    nbNonSynchronisees: operations.filter((o) => o.syncStatus && o.syncStatus !== 'SYNCHRONISE').length,
    qtyTotale: txt(arrondiCommercial(g.qty, DEC_QTY))!,
    teneurMoyennePonderee: g.ponderee && txt(arrondiCommercial(g.ponderee, DEC_TENEUR)),
    teneurMoyenneArithmetique: g.arithmetique && txt(arrondiCommercial(g.arithmetique, DEC_TENEUR)),
    teneurMin: txt(g.min),
    teneurMax: txt(g.max),
    montantTotal: txtFixe(g.montant, DEC_MONTANT),
    devise: devises.size === 1 ? [...devises][0]! : null,
    parMatiere,
  };
}

/** Somme d'un total de journée en repartant des montants ARRONDIS (ce que voit l'agent). */
export function totalDepuisMontants(montants: (string | number | null)[]): string {
  return txtFixe(
    montants.reduce<Decimal>((acc, m) => acc.plus(decOuNull(m) ?? 0), new Decimal(0)),
    DEC_MONTANT,
  );
}

export { dec };
