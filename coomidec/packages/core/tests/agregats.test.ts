import { describe, expect, it } from 'vitest';
import { agregerJournee, totalDepuisMontants, type OperationAgregable } from '../src/agregats.js';

const op = (p: Partial<OperationAgregable> & Pick<OperationAgregable, 'id'>): OperationAgregable => ({
  matiereId: 'mat-cu',
  matiereNom: 'Cuivre',
  uniteCode: 'T',
  qty: '10',
  teneur: '3',
  montant: '4200.00',
  devise: 'USD',
  statut: 'VALIDEE',
  syncStatus: 'SYNCHRONISE',
  ...p,
});

describe('agrégats de journée (décision D1)', () => {
  it('pondère la teneur moyenne par la QTY', () => {
    // Le classeur ferait (8 + 2) / 2 = 5 %. La pondérée vaut 2,074 %.
    const t = agregerJournee([
      op({ id: '1', qty: '0.5', teneur: '8', montant: '560' }),
      op({ id: '2', qty: '40', teneur: '2', montant: '11200' }),
    ]);
    expect(t.teneurMoyenneArithmetique).toBe('5');
    expect(t.teneurMoyennePonderee).toBe('2.074'); // (0,5×8 + 40×2) / 40,5
    expect(t.qtyTotale).toBe('40.5');
    expect(t.teneurMin).toBe('2');
    expect(t.teneurMax).toBe('8');
    expect(t.montantTotal).toBe('11760.00');
  });

  it('exclut les opérations annulées des totaux mais les compte', () => {
    const t = agregerJournee([
      op({ id: '1' }),
      op({ id: '2', statut: 'ANNULEE', montant: '4200.00' }),
    ]);
    expect(t.nbOperations).toBe(1);
    expect(t.nbAnnulees).toBe(1);
    expect(t.montantTotal).toBe('4200.00');
  });

  it('compte les opérations non synchronisées pour la pré-clôture', () => {
    const t = agregerJournee([
      op({ id: '1', syncStatus: 'SYNCHRONISE' }),
      op({ id: '2', syncStatus: 'EN_ATTENTE' }),
      op({ id: '3', syncStatus: 'EN_ATTENTE' }),
    ]);
    expect(t.nbNonSynchronisees).toBe(2);
  });

  it('ventile par matière première', () => {
    const t = agregerJournee([
      op({ id: '1', qty: '10', teneur: '3' }),
      op({ id: '2', matiereId: 'mat-co', matiereNom: 'Cobalt', qty: '4', teneur: '1.4', montant: '1260.00' }),
    ]);
    expect(t.parMatiere.map((m) => m.matiereNom)).toEqual(['Cobalt', 'Cuivre']);
    expect(t.parMatiere[0]?.qtyTotale).toBe('4');
    expect(t.parMatiere[1]?.montantTotal).toBe('4200.00');
  });

  it('ne suppose pas une devise unique', () => {
    expect(agregerJournee([op({ id: '1' }), op({ id: '2', devise: 'CDF' })]).devise).toBeNull();
    expect(agregerJournee([op({ id: '1' })]).devise).toBe('USD');
  });

  it('gère une journée vide', () => {
    const t = agregerJournee([]);
    expect(t.nbOperations).toBe(0);
    expect(t.teneurMoyennePonderee).toBeNull();
    expect(t.montantTotal).toBe('0.00');
  });

  it('totalise depuis les montants arrondis, ce que voit l agent', () => {
    expect(totalDepuisMontants(['0.01', '0.02', '0.03'])).toBe('0.06');
  });
});
