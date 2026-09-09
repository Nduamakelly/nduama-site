import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { calculerOperation, type MatiereCalcul } from '@coomidec/core';
import { bearer, creerUtilisateur, jetonPour, nettoyer, preparer } from './aide.js';

let ctx: Awaited<ReturnType<typeof preparer>>;
let jeton: string;
let ids: {
  site: string; unite: string; matiere: string; creuseur: string;
  device: string; utilisateur: string;
};

const CUIVRE: MatiereCalcul = {
  id: '', code: 'CU', nom: 'Cuivre', methode: 'PRIX_PAR_POURCENT',
  prixParPourcent: '140', pctCoutDefaut: '1', formule: null,
  devise: 'USD', uniteCode: 'T', decimalesMontant: 2,
};

const T = '2026-09-09T06:14:03.000Z';

/** Construit une opération telle que la tablette l'enverrait. */
function operation(n: number, sur = ids, version = 1) {
  const calc = calculerOperation({
    qty: '5', teneur: '3',
    matiere: { ...CUIVRE, id: sur.matiere },
    calculeA: T,
  });
  return {
    id: randomUUID(),
    numero: `COOMIDEC/KOL/20260909/A7F3-${String(n).padStart(3, '0')}`,
    siteId: sur.site,
    dateOperation: '2026-09-09',
    heure: '08:14:03',
    responsableId: sur.utilisateur,
    creuseurId: sur.creuseur,
    equipe: 'Équipe 1',
    matiereId: sur.matiere,
    qty: '5',
    uniteId: sur.unite,
    teneur: '3',
    observation: null,
    montant: calc.montant,
    devise: calc.devise,
    calcul: calc.snapshot as unknown as Record<string, unknown>,
    statut: 'VALIDEE' as const,
    motifAnnulation: null,
    heureAppareil: T,
    version,
  };
}

async function pousser(operations: unknown[]) {
  return ctx.app.inject({
    method: 'POST', url: '/api/sync/push', headers: bearer(jeton),
    payload: { deviceId: ids.device, operations },
  });
}

beforeAll(async () => { ctx = await preparer(); });
afterAll(async () => { await ctx.app.close(); await ctx.db.destroy(); });

beforeEach(async () => {
  await nettoyer(ctx.db);
  const u = await creerUtilisateur(ctx.db, 'AGENT');
  jeton = await jetonPour(ctx.app, u.identifiant, u.motDePasse);

  const site = randomUUID(), unite = randomUUID(), matiere = randomUUID();
  const creuseur = randomUUID(), device = randomUUID();
  await ctx.db.insertInto('sites').values({ id: site, code: 'KOL', nom: 'Kolwezi' }).execute();
  await ctx.db.insertInto('unites').values({ id: unite, code: 'T', libelle: 'Tonne' }).execute();
  await ctx.db.insertInto('matieres_premieres').values({
    id: matiere, code: 'CU', nom: 'Cuivre', unite_id: unite,
    methode_calcul: 'PRIX_PAR_POURCENT', prix_par_pourcent: 140,
  }).execute();
  await ctx.db.insertInto('creuseurs').values({
    id: creuseur, code: 'CR-0001', nom: 'DEMO-A', site_id: site,
  }).execute();
  await ctx.db.insertInto('devices').values({
    id: device, libelle: 'Tablette 01', site_id: site,
  }).execute();

  ids = { site, unite, matiere, creuseur, device, utilisateur: u.id };
});

describe('TEST 2 — les opérations sont synchronisées une seule fois', () => {
  it('10 opérations envoyées deux fois donnent 10 lignes', async () => {
    const lot = Array.from({ length: 10 }, (_, i) => operation(i + 1));

    const premier = await pousser(lot);
    expect(premier.statusCode).toBe(200);
    expect(premier.json().resultats.every((r: { etat: string }) => r.etat === 'APPLIQUEE')).toBe(true);
    expect(await ctx.db.selectFrom('operations').selectAll().execute()).toHaveLength(10);

    // Rejeu exact du même lot — la connexion avait coupé avant l'accusé.
    const second = await pousser(lot);
    expect(second.statusCode).toBe(200);
    expect(second.json().resultats.every((r: { etat: string }) => r.etat === 'APPLIQUEE')).toBe(true);

    // Toujours 10 lignes : aucun doublon.
    expect(await ctx.db.selectFrom('operations').selectAll().execute()).toHaveLength(10);
  });

  it('mémorise la réponse plutôt que de réécrire (clé d idempotence)', async () => {
    const lot = [operation(1)];
    await pousser(lot);
    const avant = await ctx.db.selectFrom('operations').select('updated_at')
      .where('id', '=', lot[0]!.id).executeTakeFirstOrThrow();

    await new Promise((r) => setTimeout(r, 30));
    await pousser(lot);

    const apres = await ctx.db.selectFrom('operations').select('updated_at')
      .where('id', '=', lot[0]!.id).executeTakeFirstOrThrow();
    expect(apres.updated_at.getTime()).toBe(avant.updated_at.getTime());

    const cles = await ctx.db.selectFrom('idempotency_keys').selectAll().execute();
    expect(cles).toHaveLength(1);
    expect(cles[0]?.cle).toBe(`${lot[0]!.id}:1`);
  });

  it('applique une modification (version supérieure) sans créer de doublon', async () => {
    const op = operation(1);
    await pousser([op]);

    const modifiee = { ...op, statut: 'ANNULEE' as const, motifAnnulation: 'Erreur de pesée', version: 2 };
    const r = await pousser([modifiee]);
    expect(r.json().resultats[0]).toMatchObject({ etat: 'APPLIQUEE', version: 2 });

    const lignes = await ctx.db.selectFrom('operations').selectAll().execute();
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.statut).toBe('ANNULEE');
    expect(lignes[0]?.version).toBe(2);
  });

  it('rejoue sans réécrire quand la clé d idempotence existe encore', async () => {
    const op = operation(1);
    await pousser([op]);
    await pousser([{ ...op, statut: 'ANNULEE' as const, motifAnnulation: 'x', version: 2 }]);

    // Une vieille version arrive en retard (réseau capricieux). Sa clé
    // `{id}:1` est encore mémorisée : la réponse d'origine est renvoyée
    // telle quelle, et surtout rien n'est réécrit.
    const r = await pousser([{ ...op, statut: 'VALIDEE' as const, version: 1 }]);
    expect(r.json().resultats[0].etat).toBe('APPLIQUEE');

    const ligne = await ctx.db.selectFrom('operations').selectAll().executeTakeFirstOrThrow();
    expect(ligne.statut).toBe('ANNULEE');   // la donnée récente a survécu
    expect(ligne.version).toBe(2);
  });

  it('la garde de version protège même sans clé d idempotence', async () => {
    const op = operation(1);
    await pousser([op]);
    await pousser([{ ...op, statut: 'ANNULEE' as const, motifAnnulation: 'x', version: 2 }]);

    // Les clés sont purgées au bout de 30 jours : la garde SQL doit alors
    // suffire, seule, à protéger la donnée.
    await ctx.db.deleteFrom('idempotency_keys').execute();

    const r = await pousser([{ ...op, statut: 'VALIDEE' as const, version: 1 }]);
    expect(r.json().resultats[0]).toMatchObject({ etat: 'DEJA_APPLIQUEE', version: 2 });

    const ligne = await ctx.db.selectFrom('operations').selectAll().executeTakeFirstOrThrow();
    expect(ligne.statut).toBe('ANNULEE');
    expect(ligne.version).toBe(2);
    expect(await ctx.db.selectFrom('operations').selectAll().execute()).toHaveLength(1);
  });
});

describe('sécurité de la synchronisation', () => {
  it('rejette un montant falsifié par le client', async () => {
    const op = { ...operation(1), montant: '99999.00' };
    const r = await pousser([op]);
    expect(r.json().resultats[0]).toMatchObject({ etat: 'REJETEE' });
    expect(r.json().resultats[0].motif).toMatch(/incohérent/);
    expect(await ctx.db.selectFrom('operations').selectAll().execute()).toHaveLength(0);
  });

  it('rejette un snapshot dont le calcul ne se reproduit pas', async () => {
    const op = operation(1);
    const calcul = { ...op.calcul, montantArrondi: '4200.00' } as Record<string, unknown>;
    const r = await pousser([{ ...op, montant: '4200.00', calcul }]);
    expect(r.json().resultats[0]).toMatchObject({ etat: 'REJETEE' });
  });

  it('refuse un appareil révoqué sans perdre les données', async () => {
    await ctx.db.updateTable('devices').set({ actif: false }).where('id', '=', ids.device).execute();
    const r = await pousser([operation(1)]);
    expect(r.statusCode).toBe(403);
    expect(r.json().erreur).toMatch(/révoqué/);
    expect(r.json().erreur).toMatch(/file de secours/);
  });

  it('refuse d écraser une opération clôturée', async () => {
    const op = operation(1);
    await pousser([op]);
    await ctx.db.updateTable('operations').set({ verrouillee: true })
      .where('id', '=', op.id).execute();

    const r = await pousser([{ ...op, statut: 'ANNULEE' as const, motifAnnulation: 'x', version: 2 }]);
    expect(r.json().resultats[0]).toMatchObject({ etat: 'REJETEE' });
    expect(r.json().resultats[0].motif).toMatch(/procédure de correction/);
  });

  it('signale un creuseur inconnu en clair, sans détail interne', async () => {
    const r = await pousser([{ ...operation(1), creuseurId: randomUUID() }]);
    expect(r.json().resultats[0]).toMatchObject({
      etat: 'REJETEE', motif: 'Creuseur inconnu du serveur.',
    });
  });

  it('trace un décalage d horloge important', async () => {
    const vieux = new Date(Date.now() - 45 * 60_000).toISOString();
    await pousser([{ ...operation(1), heureAppareil: vieux }]);
    const traces = await ctx.db.selectFrom('audit_logs').selectAll()
      .where('entite', '=', 'devices').execute();
    expect(traces).toHaveLength(1);
    expect(traces[0]?.motif).toMatch(/Horloge de l'appareil décalée/);
  });

  it('journalise chaque lot reçu', async () => {
    await pousser(Array.from({ length: 3 }, (_, i) => operation(i + 1)));
    const lots = await ctx.db.selectFrom('lots_synchronisation').selectAll().execute();
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ nb_recus: 3, nb_appliques: 3, nb_rejetes: 0 });
  });
});

describe('descente incrémentale', () => {
  it('ne renvoie que ce qui a changé depuis le curseur', async () => {
    const premier = await ctx.app.inject({
      method: 'GET', url: '/api/sync/pull?depuis=0', headers: bearer(jeton),
    });
    expect(premier.statusCode).toBe(200);
    const curseur = premier.json().curseur as number;
    expect(premier.json().changements.matieres).toHaveLength(1);
    expect(curseur).toBeGreaterThan(0);

    // Rien n'a bougé : le deuxième tirage est vide.
    const second = await ctx.app.inject({
      method: 'GET', url: `/api/sync/pull?depuis=${curseur}`, headers: bearer(jeton),
    });
    expect(second.json().changements.matieres).toHaveLength(0);
    expect(second.json().changements.creuseurs).toHaveLength(0);

    // Un changement de tarif doit redescendre. Seul un ADMIN peut le faire.
    const admin = await creerUtilisateur(ctx.db, 'ADMIN', 'admin-sync');
    const jetonAdmin = await jetonPour(ctx.app, admin.identifiant, admin.motDePasse);
    const maj = await ctx.app.inject({
      method: 'PATCH', url: `/api/matieres/${ids.matiere}`, headers: bearer(jetonAdmin),
      payload: { prixParPourcent: '150', motif: 'Nouveau cours' },
    });
    expect(maj.statusCode).toBe(200);
    const troisieme = await ctx.app.inject({
      method: 'GET', url: `/api/sync/pull?depuis=${curseur}`, headers: bearer(jeton),
    });
    expect(troisieme.json().changements.matieres).toHaveLength(1);
    expect(troisieme.json().changements.matieres[0].prix_par_pourcent).toBe('150.0000');
    expect(troisieme.json().curseur).toBeGreaterThan(curseur);
  });
});
