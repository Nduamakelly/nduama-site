/**
 * TEST 3 — modifier le coût d'une matière première ne doit pas changer
 * les opérations déjà enregistrées.
 */
import { describe, expect, it } from 'vitest';
import { calculerOperation, verifierSnapshot } from '../src/calcul.js';
import { resoudreTranche } from '../src/bareme.js';
import { dec } from '../src/decimal.js';
import { CUIVRE_BAREME, CUIVRE_PRIX_POURCENT, T0, T1, tranche } from './fixtures.js';

describe('TEST 3 — immuabilité des opérations après changement de tarif', () => {
  it('conserve le montant de la veille quand le coût unitaire change', () => {
    // Jour 1 : coût unitaire 120 USD.
    const baremeJour1 = [tranche({ id: 'v1', coutUnitaire: '120', versionBareme: 1 })];
    const operation = calculerOperation({
      qty: '12.5',
      teneur: '3.2',
      matiere: CUIVRE_BAREME,
      baremes: baremeJour1,
      calculeA: T0,
    });
    expect(operation.montant).toBe('1275.00');

    // Jour 2 : le tarif passe à 130 USD. La ligne v1 est FERMÉE, v2 est ouverte.
    const baremeJour2 = [
      tranche({ id: 'v1', coutUnitaire: '120', versionBareme: 1, valideAu: T1 }),
      tranche({ id: 'v2', coutUnitaire: '130', versionBareme: 2, valideDu: T1 }),
    ];

    // L'opération d'hier est INCHANGÉE : son snapshot porte son propre tarif.
    expect(operation.montant).toBe('1275.00');
    expect(operation.snapshot.tarif.coutUnitaire).toBe('120');
    expect(operation.snapshot.tarif.baremeVersion).toBe(1);

    // Et elle reste vérifiable par le serveur sans relire le barème courant.
    expect(verifierSnapshot(operation.snapshot)).toMatchObject({ conforme: true, montantAttendu: '1275.00' });

    // Une opération saisie aujourd'hui applique bien le nouveau tarif.
    const aujourdhui = calculerOperation({
      qty: '12.5',
      teneur: '3.2',
      matiere: CUIVRE_BAREME,
      baremes: baremeJour2,
      calculeA: T1,
    });
    expect(aujourdhui.montant).toBe('1381.25'); // 12,5 × 130 × 0,85
    expect(aujourdhui.snapshot.tarif.baremeVersion).toBe(2);
  });

  it('conserve le montant quand le prix par 1 % change', () => {
    const hier = calculerOperation({
      qty: '12.5',
      teneur: '3.2',
      matiere: CUIVRE_PRIX_POURCENT, // 140 USD le point
      calculeA: T0,
    });
    expect(hier.montant).toBe('5600.00');

    const aujourdhui = calculerOperation({
      qty: '12.5',
      teneur: '3.2',
      matiere: { ...CUIVRE_PRIX_POURCENT, prixParPourcent: '150' },
      calculeA: T1,
    });

    expect(hier.montant).toBe('5600.00'); // inchangé
    expect(hier.snapshot.tarif.prixParPourcent).toBe('140');
    expect(aujourdhui.montant).toBe('6000.00');
  });

  it("l'historisation garde l'ancien tarif consultable", () => {
    const historise = [
      tranche({ id: 'v1', coutUnitaire: '120', versionBareme: 1, valideAu: T1 }),
      tranche({ id: 'v2', coutUnitaire: '130', versionBareme: 2, valideDu: T1 }),
    ];
    expect(resoudreTranche(historise, 'mat-cu-b', dec('3.2'), T0)?.coutUnitaire).toBe('120');
    expect(resoudreTranche(historise, 'mat-cu-b', dec('3.2'), T1)?.coutUnitaire).toBe('130');
  });
});

describe('TEST 4 — nouvelle matière première avec son barème', () => {
  it('calcule correctement dès la création du barème', () => {
    const cobalt = {
      id: 'mat-co',
      code: 'CO',
      nom: 'Cobalt',
      methode: 'BAREME_TRANCHES' as const,
      devise: 'USD',
      uniteCode: 'T',
    };
    const bareme = [
      tranche({ id: 'co-1', matiereId: 'mat-co', teneurMin: '0', teneurMax: '1', coutUnitaire: '200', pctCout: '0.9' }),
      tranche({ id: 'co-2', matiereId: 'mat-co', teneurMin: '1', teneurMax: '2', coutUnitaire: '350', pctCout: '0.9' }),
    ];

    const r = calculerOperation({ qty: '4', teneur: '1.4', matiere: cobalt, baremes: bareme, calculeA: T0 });
    expect(r.statut).toBe('CALCULE');
    expect(r.snapshot.tarif.baremeId).toBe('co-2');
    expect(r.montant).toBe('1260.00'); // 4 × 350 × 0,9
  });
});
