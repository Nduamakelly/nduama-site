import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/dexie.ts';
import {
  annulerOperation, compterEnAttente, enregistrerOperation,
  operationsDuJour, SaisieRefusee, type ContexteSaisie,
} from '../src/db/operations.ts';
import type { BaremeLocal, CreuseurLocal, MatiereLocale } from '../src/db/dexie.ts';

const CTX: ContexteSaisie = {
  siteId: 'site-1', siteCode: 'KOL',
  responsableId: 'u-1', responsableNom: 'MUKENDI Joseph',
  deviceId: 'a7f3c1d2-0000-4000-8000-000000000001',
};

const CUIVRE: MatiereLocale = {
  id: 'mat-cu', code: 'CU', nom: 'Cuivre', methode: 'PRIX_PAR_POURCENT',
  prixParPourcent: '140', pctCoutDefaut: '1', formule: null,
  devise: 'USD', uniteCode: 'T', decimalesMontant: 2, actif: true,
};

const COBALT: MatiereLocale = {
  ...CUIVRE, id: 'mat-co', code: 'CO', nom: 'Cobalt',
  methode: 'BAREME_TRANCHES', prixParPourcent: null,
};

const BAREMES: BaremeLocal[] = [{
  id: 'b-1', matiereId: 'mat-co', teneurMin: '1', teneurMax: '2',
  coutUnitaire: '350', pctCout: '0.9', devise: 'USD',
  valideDu: '2026-01-01T00:00:00+02:00', valideAu: null, versionBareme: 1,
}];

const CREUSEUR: CreuseurLocal = {
  id: 'cr-1', code: 'CR-0001', nom: 'DEMO-A', postnom: 'Fictif', prenom: 'Un',
  telephone: null, numeroCarte: 'DEMO-CARTE-0001', dateExpirationCarte: null,
  equipe: 'Équipe 1', siteId: 'site-1', statut: 'ACTIF', recherche: 'cr-0001 demo-a fictif un',
};

const T = new Date('2026-09-09T06:14:03Z'); // 08:14 à Lubumbashi

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('enregistrement d une opération', () => {
  it('écrit l opération ET son entrée d outbox', async () => {
    const op = await enregistrerOperation(CTX, {
      matiere: CUIVRE, baremes: [], creuseur: CREUSEUR, qty: '12.5', teneur: '3.2',
    }, T);

    expect(op.montant).toBe('5600.00');
    expect(op.numero).toBe('COOMIDEC/KOL/20260909/A7F3-001');
    expect(op.syncStatus).toBe('EN_ATTENTE');
    expect(op.creuseurId).toBe('cr-1');

    expect(await db.operations.count()).toBe(1);
    const file = await db.outbox.toArray();
    expect(file).toHaveLength(1);
    expect(file[0]).toMatchObject({ entiteId: op.id, version: 1, statut: 'EN_ATTENTE' });
  });

  it('fige le tarif appliqué dans le snapshot', async () => {
    const op = await enregistrerOperation(CTX, {
      matiere: CUIVRE, baremes: [], creuseur: CREUSEUR, qty: '12.5', teneur: '3.2',
    }, T);
    expect(op.calcul.tarif.prixParPourcent).toBe('140');
    expect(op.calcul.intermediaires.valeurTeneur).toBe('448');
    expect(op.calcul.moteurVersion).toBe('1.0.0');
  });

  it('numérote sans trou ni doublon sur des saisies successives', async () => {
    for (let i = 0; i < 10; i++) {
      await enregistrerOperation(CTX, {
        matiere: CUIVRE, baremes: [], creuseur: CREUSEUR, qty: '1', teneur: '3',
      }, T);
    }
    const ops = await operationsDuJour('site-1', '2026-09-09');
    const suffixes = ops.map((o) => o.numero.split('-').pop());
    expect(suffixes).toEqual(['001','002','003','004','005','006','007','008','009','010']);
    expect(new Set(ops.map((o) => o.id)).size).toBe(10);
  });

  it('numérote sans doublon même sur des saisies concurrentes', async () => {
    await Promise.all(
      Array.from({ length: 8 }, () =>
        enregistrerOperation(CTX, {
          matiere: CUIVRE, baremes: [], creuseur: CREUSEUR, qty: '1', teneur: '3',
        }, T),
      ),
    );
    const ops = await operationsDuJour('site-1', '2026-09-09');
    expect(new Set(ops.map((o) => o.numero)).size).toBe(8);
  });

  it('applique le barème par tranches', async () => {
    const op = await enregistrerOperation(CTX, {
      matiere: COBALT, baremes: BAREMES, creuseur: CREUSEUR, qty: '4', teneur: '1.4',
    }, T);
    expect(op.montant).toBe('1260.00');
    expect(op.calcul.tarif.trancheMin).toBe('1');
  });

  it('range une teneur hors barème en A_VALIDER, sans montant inventé', async () => {
    const op = await enregistrerOperation(CTX, {
      matiere: COBALT, baremes: BAREMES, creuseur: CREUSEUR, qty: '4', teneur: '9',
    }, T);
    expect(op.statut).toBe('A_VALIDER');
    expect(op.montant).toBeNull();
    // Elle part quand même en synchronisation : rien ne se perd.
    expect(await compterEnAttente()).toBe(1);
  });

  it('refuse une saisie incomplète sans rien écrire', async () => {
    await expect(
      enregistrerOperation(CTX, {
        matiere: CUIVRE, baremes: [], creuseur: CREUSEUR, qty: '', teneur: '3',
      }, T),
    ).rejects.toBeInstanceOf(SaisieRefusee);
    expect(await db.operations.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('rattache la saisie à la journée locale du site', async () => {
    const tard = new Date('2026-09-09T21:30:00Z'); // 23:30 à Lubumbashi
    const op = await enregistrerOperation(CTX, {
      matiere: CUIVRE, baremes: [], creuseur: CREUSEUR, qty: '1', teneur: '3',
    }, tard);
    expect(op.dateOperation).toBe('2026-09-09');
    expect(op.heure).toBe('23:30:00');
  });
});

describe('annulation', () => {
  it('exige un motif et conserve l opération', async () => {
    const op = await enregistrerOperation(CTX, {
      matiere: CUIVRE, baremes: [], creuseur: CREUSEUR, qty: '12.5', teneur: '3.2',
    }, T);

    await expect(annulerOperation(op.id, '   ')).rejects.toBeInstanceOf(SaisieRefusee);

    await annulerOperation(op.id, 'Erreur de pesée');
    const apres = await db.operations.get(op.id);
    expect(apres?.statut).toBe('ANNULEE');
    expect(apres?.motifAnnulation).toBe('Erreur de pesée');
    expect(apres?.version).toBe(2);
    // L'opération existe toujours, et la modification part en synchronisation.
    expect(await db.operations.count()).toBe(1);
    expect(await db.outbox.count()).toBe(2);
  });

  it('refuse de modifier une opération verrouillée', async () => {
    const op = await enregistrerOperation(CTX, {
      matiere: CUIVRE, baremes: [], creuseur: CREUSEUR, qty: '1', teneur: '3',
    }, T);
    await db.operations.update(op.id, { verrouillee: true });
    await expect(annulerOperation(op.id, 'test')).rejects.toThrow(/procédure de correction/);
  });
});
