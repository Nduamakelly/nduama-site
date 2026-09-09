import { describe, expect, it } from 'vitest';
import { calculerOperation, verifierSnapshot } from '../src/calcul.js';
import { CUIVRE_BAREME, CUIVRE_PRIX_POURCENT, T0, tranche } from './fixtures.js';

const baremes = [tranche({ id: 'c', teneurMin: '3', teneurMax: '4' })];

describe('moteur de calcul — méthode B (parité classeur)', () => {
  it('reproduit QTY × coût/unité × % coût', () => {
    const r = calculerOperation({
      qty: '12.5',
      teneur: '3.2',
      matiere: CUIVRE_BAREME,
      baremes,
      calculeA: T0,
    });
    expect(r.statut).toBe('CALCULE');
    expect(r.montant).toBe('1275.00');
    expect(r.snapshot.tarif.coutUnitaire).toBe('120');
    expect(r.snapshot.tarif.pctCout).toBe('0.85');
    expect(r.snapshot.formule).toBe('QTY * COUT_UNITAIRE * PCT_COUT');
  });

  it('signale HORS_BAREME sans montant silencieux', () => {
    const r = calculerOperation({
      qty: '10',
      teneur: '9',
      matiere: CUIVRE_BAREME,
      baremes,
      calculeA: T0,
    });
    expect(r.statut).toBe('HORS_BAREME');
    expect(r.montant).toBeNull();
    expect(r.avertissements[0]).toMatch(/Aucune tranche/);
  });
});

describe('moteur de calcul — méthode A (prix par 1 %)', () => {
  it('applique la décision D4 : cuivre 1 % = 140 USD', () => {
    const r = calculerOperation({
      qty: '12.5',
      teneur: '3.2',
      matiere: CUIVRE_PRIX_POURCENT,
      calculeA: T0,
    });
    expect(r.statut).toBe('CALCULE');
    // valeurTeneur = 3,2 × 140 = 448 USD ; montant = 12,5 × 448
    expect(r.snapshot.intermediaires.valeurTeneur).toBe('448');
    expect(r.montant).toBe('5600.00');
  });

  it('reproduit l exemple de la demande : teneur 3 % → 420 USD le point', () => {
    const r = calculerOperation({
      qty: '1',
      teneur: '3',
      matiere: { ...CUIVRE_PRIX_POURCENT, prixParPourcent: '120' },
      calculeA: T0,
    });
    expect(r.snapshot.intermediaires.valeurTeneur).toBe('360');
    expect(r.montant).toBe('360.00');
  });

  it('refuse de calculer sans prix par 1 % paramétré', () => {
    const r = calculerOperation({
      qty: '1',
      teneur: '3',
      matiere: { ...CUIVRE_PRIX_POURCENT, prixParPourcent: null },
      calculeA: T0,
    });
    expect(r.statut).toBe('TARIF_MANQUANT');
  });
});

describe('moteur de calcul — robustesse', () => {
  it('renvoie INCOMPLET sur QTY ou teneur absente', () => {
    expect(calculerOperation({ qty: null, teneur: '3', matiere: CUIVRE_PRIX_POURCENT, calculeA: T0 }).statut).toBe('INCOMPLET');
    expect(calculerOperation({ qty: '1', teneur: '', matiere: CUIVRE_PRIX_POURCENT, calculeA: T0 }).statut).toBe('INCOMPLET');
  });

  it('refuse les valeurs négatives', () => {
    expect(calculerOperation({ qty: '-1', teneur: '3', matiere: CUIVRE_PRIX_POURCENT, calculeA: T0 }).statut).toBe('INCOMPLET');
  });

  it('accepte QTY = 0 et produit un montant nul', () => {
    const r = calculerOperation({ qty: '0', teneur: '3', matiere: CUIVRE_PRIX_POURCENT, calculeA: T0 });
    expect(r.statut).toBe('CALCULE');
    expect(r.montant).toBe('0.00');
  });

  it('avertit sur une teneur supérieure à 100 %', () => {
    const r = calculerOperation({ qty: '1', teneur: '140', matiere: CUIVRE_PRIX_POURCENT, calculeA: T0 });
    expect(r.statut).toBe('CALCULE');
    expect(r.avertissements.join(' ')).toMatch(/inhabituelle/);
  });

  it('ne dérive pas comme un flottant IEEE-754', () => {
    // 12.5 * 120 * 0.85 en flottant ne vaut pas exactement 1275.
    const r = calculerOperation({ qty: '12.5', teneur: '3.2', matiere: CUIVRE_BAREME, baremes, calculeA: T0 });
    expect(r.snapshot.montantBrut).toBe('1275');
    const r2 = calculerOperation({ qty: '0.1', teneur: '3.2', matiere: { ...CUIVRE_PRIX_POURCENT, prixParPourcent: '0.2' }, calculeA: T0 });
    expect(r2.snapshot.intermediaires.valeurTeneur).toBe('0.64'); // 3.2 * 0.2, et non 0.6400000000000001
  });

  it('remonte une formule invalide sans planter', () => {
    const r = calculerOperation({
      qty: '1',
      teneur: '3',
      matiere: { ...CUIVRE_PRIX_POURCENT, formule: 'QTY * PRIX_SPOT' },
      calculeA: T0,
    });
    expect(r.statut).toBe('ERREUR_FORMULE');
    expect(r.avertissements[0]).toMatch(/Variable inconnue/);
  });

  it('accepte une formule personnalisée sans modifier le code', () => {
    const r = calculerOperation({
      qty: '10',
      teneur: '3',
      matiere: { ...CUIVRE_PRIX_POURCENT, formule: 'arrondi(QTY * VALEUR_TENEUR * 0.5, 0)' },
      calculeA: T0,
    });
    expect(r.montant).toBe('2100.00'); // 10 × 420 × 0,5
  });

  it('est déterministe : deux appels identiques donnent le même snapshot', () => {
    const e = { qty: '12.5', teneur: '3.2', matiere: CUIVRE_BAREME, baremes, calculeA: T0 };
    expect(JSON.stringify(calculerOperation(e))).toBe(JSON.stringify(calculerOperation(e)));
  });
});

describe('vérification serveur du snapshot', () => {
  it('rejoue le tarif transporté, pas le barème courant', () => {
    const r = calculerOperation({ qty: '12.5', teneur: '3.2', matiere: CUIVRE_BAREME, baremes, calculeA: T0 });
    expect(verifierSnapshot(r.snapshot)).toMatchObject({ conforme: true, montantAttendu: '1275.00' });
  });

  it('détecte un montant falsifié par le client', () => {
    const r = calculerOperation({ qty: '12.5', teneur: '3.2', matiere: CUIVRE_BAREME, baremes, calculeA: T0 });
    const falsifie = { ...r.snapshot, montantArrondi: '9999.00' };
    const v = verifierSnapshot(falsifie);
    expect(v.conforme).toBe(false);
    expect(v.motif).toMatch(/1275\.00/);
  });
});
