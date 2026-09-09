import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/dexie.ts';
import { enregistrerOperation, type ContexteSaisie } from '../src/db/operations.ts';
import type { MatiereLocale, CreuseurLocal } from '../src/db/dexie.ts';
import {
  delaiAvantNouvelEssai, exporterFile, fileAEnvoyer, MAX_TENTATIVES,
  reessayer, synchroniser, type ReponsePush, type Transport,
} from '../src/sync/moteur.ts';

const CTX: ContexteSaisie = {
  siteId: 'site-1', siteCode: 'KOL',
  responsableId: 'u-1', responsableNom: 'Responsable',
  deviceId: 'a7f3c1d2-0000-4000-8000-000000000001',
};

const CUIVRE: MatiereLocale = {
  id: 'mat-cu', code: 'CU', nom: 'Cuivre', methode: 'PRIX_PAR_POURCENT',
  prixParPourcent: '140', pctCoutDefaut: '1', formule: null,
  devise: 'USD', uniteId: 'unite-t', uniteCode: 'T', decimalesMontant: 2, actif: true,
};

const CREUSEUR: CreuseurLocal = {
  id: 'cr-1', code: 'CR-0001', nom: 'DEMO-A', postnom: null, prenom: null,
  telephone: null, numeroCarte: null, dateExpirationCarte: null,
  equipe: null, siteId: 'site-1', statut: 'ACTIF', recherche: 'cr-0001 demo-a',
};

const T = new Date('2026-09-09T06:14:03Z');

async function creer(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await enregistrerOperation(CTX, {
      matiere: CUIVRE, baremes: [], creuseur: CREUSEUR, qty: '5', teneur: '3',
    }, T);
  }
}

/** Transport factice qui note tout ce qu'il reçoit. */
function transportFactice(reponse: (ops: unknown[]) => Awaited<ReturnType<Transport['push']>>) {
  const recus: string[][] = [];
  const transport: Transport = {
    push: async ({ operations }) => {
      recus.push(operations.map((o) => (o as { id: string }).id));
      return reponse(operations);
    },
  };
  return { transport, recus };
}

const succes = (ops: unknown[]): { ok: true; reponse: ReponsePush } => ({
  ok: true,
  reponse: {
    heureServeur: T.toISOString(),
    resultats: ops.map((o) => ({ id: (o as { id: string }).id, etat: 'APPLIQUEE' as const })),
  },
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('TEST 2 — côté tablette : chaque opération est envoyée une seule fois', () => {
  it('vide la file et n envoie rien de plus au second passage', async () => {
    await creer(10);
    const { transport, recus } = transportFactice(succes);

    const premier = await synchroniser(transport, CTX.deviceId);
    expect(premier).toMatchObject({ envoyees: 10, confirmees: 10, rejetees: 0 });
    expect(recus[0]).toHaveLength(10);
    expect(new Set(recus[0]).size).toBe(10);       // aucun doublon dans le lot
    expect(await db.outbox.count()).toBe(0);       // file vidée

    // Deuxième passage : plus rien à envoyer, le serveur n'est pas rappelé.
    const second = await synchroniser(transport, CTX.deviceId);
    expect(second).toMatchObject({ envoyees: 0, confirmees: 0 });
    expect(recus).toHaveLength(1);

    const ops = await db.operations.toArray();
    expect(ops).toHaveLength(10);
    expect(ops.every((o) => o.syncStatus === 'SYNCHRONISE')).toBe(true);
  });

  it('préserve l ordre d insertion (causalité)', async () => {
    await creer(5);
    const { transport, recus } = transportFactice(succes);
    await synchroniser(transport, CTX.deviceId);
    const attendus = (await db.operations.toArray())
      .sort((a, b) => a.numero.localeCompare(b.numero)).map((o) => o.id);
    expect(recus[0]).toEqual(attendus);
  });
});

describe('reprise après échec', () => {
  it('replace en attente et temporise sur une panne réseau', async () => {
    await creer(3);
    const { transport } = transportFactice(() => ({ ok: false, statut: null, message: 'Réseau indisponible' }));

    const r = await synchroniser(transport, CTX.deviceId, T.getTime(), () => 0.5);
    expect(r.confirmees).toBe(0);
    expect(r.reportees).toBe(3);
    expect(r.message).toMatch(/Nouvel essai automatique/);

    const file = await db.outbox.toArray();
    expect(file.every((e) => e.statut === 'EN_ATTENTE')).toBe(true);
    expect(file.every((e) => e.tentatives === 1)).toBe(true);
    // Reportée dans le futur : pas de martèlement du serveur.
    expect(file.every((e) => e.prochainEssaiLe > T.getTime())).toBe(true);
    // Rien n'est perdu.
    expect(await db.operations.count()).toBe(3);
  });

  it('n envoie pas un élément dont l heure de réessai n est pas venue', async () => {
    await creer(2);
    const { transport } = transportFactice(() => ({ ok: false, statut: null, message: 'coupure' }));
    await synchroniser(transport, CTX.deviceId, T.getTime(), () => 0.5);

    expect(await fileAEnvoyer(T.getTime())).toHaveLength(0);
    expect(await fileAEnvoyer(T.getTime() + 10 * 60_000)).toHaveLength(2);
  });

  it('abandonne la boucle automatique après 7 échecs, sans jeter la donnée', async () => {
    await creer(1);
    const { transport } = transportFactice(() => ({ ok: false, statut: null, message: 'coupure' }));

    let t = T.getTime();
    for (let i = 0; i < MAX_TENTATIVES; i++) {
      await synchroniser(transport, CTX.deviceId, t, () => 0.5);
      t += 10 * 60_000;
    }
    const file = await db.outbox.toArray();
    expect(file[0]?.statut).toBe('ERREUR');
    expect(file[0]?.tentatives).toBe(MAX_TENTATIVES);
    expect(await db.operations.count()).toBe(1);   // jamais abandonnée

    // L'agent peut la remettre en file à la main.
    await reessayer(file[0]!.seq!, t);
    const apres = await db.outbox.toArray();
    expect(apres[0]?.statut).toBe('EN_ATTENTE');
    expect(apres[0]?.tentatives).toBe(0);
  });

  it('ne réessaie pas indéfiniment une erreur de fond (4xx)', async () => {
    await creer(2);
    const { transport } = transportFactice(() => ({ ok: false, statut: 403, message: 'Appareil révoqué.' }));

    const r = await synchroniser(transport, CTX.deviceId, T.getTime(), () => 0.5);
    expect(r.rejetees).toBe(2);
    expect(r.reportees).toBe(0);
    expect(r.message).toMatch(/Appareil révoqué/);
    expect((await db.outbox.toArray()).every((e) => e.statut === 'ERREUR')).toBe(true);
    expect(await db.operations.count()).toBe(2);
  });

  it('garde en file une opération que le serveur n a pas accusée', async () => {
    await creer(3);
    // Le serveur n'accuse que la première : les deux autres doivent rester.
    const { transport } = transportFactice((ops) => ({
      ok: true,
      reponse: {
        heureServeur: T.toISOString(),
        resultats: [{ id: (ops[0] as { id: string }).id, etat: 'APPLIQUEE' as const }],
      },
    }));

    const r = await synchroniser(transport, CTX.deviceId, T.getTime(), () => 0.5);
    expect(r.confirmees).toBe(1);
    expect(r.reportees).toBe(2);
    expect(await db.outbox.count()).toBe(2);
  });

  it('marque en erreur une opération rejetée, avec le motif du serveur', async () => {
    await creer(1);
    const { transport } = transportFactice((ops) => ({
      ok: true,
      reponse: {
        heureServeur: T.toISOString(),
        resultats: [{
          id: (ops[0] as { id: string }).id, etat: 'REJETEE' as const,
          motif: 'Creuseur inconnu du serveur.',
        }],
      },
    }));

    const r = await synchroniser(transport, CTX.deviceId);
    expect(r.rejetees).toBe(1);
    const file = await db.outbox.toArray();
    expect(file[0]?.statut).toBe('ERREUR');
    expect(file[0]?.derniereErreur).toBe('Creuseur inconnu du serveur.');
  });
});

describe('temporisation', () => {
  it('croît puis plafonne à 5 minutes', () => {
    const sansGigue = (n: number) => delaiAvantNouvelEssai(n, 0.5);
    expect(sansGigue(0)).toBe(1_000);
    expect(sansGigue(1)).toBe(2_000);
    expect(sansGigue(3)).toBe(8_000);
    expect(sansGigue(6)).toBe(300_000);
    expect(sansGigue(20)).toBe(300_000);
  });

  it('applique une gigue de ±20 %', () => {
    expect(delaiAvantNouvelEssai(1, 0)).toBe(1_600);
    expect(delaiAvantNouvelEssai(1, 1)).toBe(2_400);
  });
});

describe('export de secours', () => {
  it('exporte la file et les opérations concernées', async () => {
    await creer(2);
    const contenu = JSON.parse(await exporterFile()) as {
      entrees: unknown[]; operations: { montant: string }[];
    };
    expect(contenu.entrees).toHaveLength(2);
    expect(contenu.operations).toHaveLength(2);
    expect(contenu.operations[0]?.montant).toBe('2100.00');
  });
});
