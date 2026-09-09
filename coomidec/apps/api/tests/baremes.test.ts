import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, creerUtilisateur, jetonPour, nettoyer, preparer } from './aide.js';

let ctx: Awaited<ReturnType<typeof preparer>>;
let jeton: string;

beforeAll(async () => { ctx = await preparer(); });
afterAll(async () => { await ctx.app.close(); await ctx.db.destroy(); });

beforeEach(async () => {
  await nettoyer(ctx.db);
  const admin = await creerUtilisateur(ctx.db, 'ADMIN');
  jeton = await jetonPour(ctx.app, admin.identifiant, admin.motDePasse);
});

async function uniteTonne(): Promise<string> {
  const r = await ctx.app.inject({
    method: 'POST', url: '/api/unites', headers: bearer(jeton),
    payload: { code: 'T', libelle: 'Tonne' },
  });
  return r.json().id as string;
}

async function creerCuivre(prixParPourcent: string | null = '140'): Promise<string> {
  const uniteId = await uniteTonne();
  const r = await ctx.app.inject({
    method: 'POST', url: '/api/matieres', headers: bearer(jeton),
    payload: {
      code: 'CU', nom: 'Cuivre', uniteId,
      methodeCalcul: prixParPourcent ? 'PRIX_PAR_POURCENT' : 'BAREME_TRANCHES',
      prixParPourcent,
    },
  });
  expect(r.statusCode).toBe(201);
  return r.json().id as string;
}

describe('M1 — matières premières', () => {
  it('refuse la méthode « prix par 1 % » sans prix de référence', async () => {
    const uniteId = await uniteTonne();
    const r = await ctx.app.inject({
      method: 'POST', url: '/api/matieres', headers: bearer(jeton),
      payload: { code: 'CO', nom: 'Cobalt', uniteId, methodeCalcul: 'PRIX_PAR_POURCENT' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().erreur).toMatch(/prix de référence/);
  });

  it('refuse une formule invalide avant de toucher la base', async () => {
    const uniteId = await uniteTonne();
    const r = await ctx.app.inject({
      method: 'POST', url: '/api/matieres', headers: bearer(jeton),
      payload: {
        code: 'CU', nom: 'Cuivre', uniteId, methodeCalcul: 'PRIX_PAR_POURCENT',
        prixParPourcent: '140', formule: 'QTY * PRIX_SPOT',
      },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().erreur).toMatch(/Variable inconnue/);
    expect(await ctx.db.selectFrom('matieres_premieres').selectAll().execute()).toHaveLength(0);
  });

  it('exige un motif pour changer un prix, et trace le changement', async () => {
    const id = await creerCuivre();

    const sansMotif = await ctx.app.inject({
      method: 'PATCH', url: `/api/matieres/${id}`, headers: bearer(jeton),
      payload: { prixParPourcent: '150' },
    });
    expect(sansMotif.statusCode).toBe(400);

    const avecMotif = await ctx.app.inject({
      method: 'PATCH', url: `/api/matieres/${id}`, headers: bearer(jeton),
      payload: { prixParPourcent: '150', motif: 'Révision mensuelle du cours' },
    });
    expect(avecMotif.statusCode).toBe(200);
    expect(avecMotif.json().avertissement).toMatch(/conservent leur ancien calcul/);

    const traces = await ctx.db.selectFrom('audit_logs').selectAll()
      .where('action', '=', 'CHANGEMENT_TARIF').execute();
    expect(traces).toHaveLength(1);
    expect(traces[0]?.motif).toBe('Révision mensuelle du cours');
    // ancienne ET nouvelle valeur conservées
    expect((traces[0]?.ancienne_valeur as { prix_par_pourcent: string }).prix_par_pourcent).toBe('140.0000');
    expect((traces[0]?.nouvelle_valeur as { prix_par_pourcent: string }).prix_par_pourcent).toBe('150.0000');
  });
});

describe('M1 — barèmes historisés', () => {
  it('accepte des tranches adjacentes et refuse un chevauchement', async () => {
    const id = await creerCuivre(null);
    const t1 = await ctx.app.inject({
      method: 'POST', url: `/api/matieres/${id}/baremes`, headers: bearer(jeton),
      payload: { teneurMin: 3, teneurMax: 4, coutUnitaire: 120, pctCout: 0.85 },
    });
    expect(t1.statusCode).toBe(201);

    // [4,5) est adjacente à [3,4) : pas de chevauchement grâce aux bornes semi-ouvertes.
    const t2 = await ctx.app.inject({
      method: 'POST', url: `/api/matieres/${id}/baremes`, headers: bearer(jeton),
      payload: { teneurMin: 4, teneurMax: 5, coutUnitaire: 130, pctCout: 0.85 },
    });
    expect(t2.statusCode).toBe(201);

    const chevauche = await ctx.app.inject({
      method: 'POST', url: `/api/matieres/${id}/baremes`, headers: bearer(jeton),
      payload: { teneurMin: 3.5, teneurMax: 4.5, coutUnitaire: 999 },
    });
    expect(chevauche.statusCode).toBe(409);
    expect(chevauche.json().erreur).toMatch(/chevauche/);
  });

  it('ferme la tranche au lieu de la modifier, et conserve l historique', async () => {
    const id = await creerCuivre(null);
    const t = await ctx.app.inject({
      method: 'POST', url: `/api/matieres/${id}/baremes`, headers: bearer(jeton),
      payload: { teneurMin: 3, teneurMax: 4, coutUnitaire: 120, pctCout: 0.85 },
    });
    const trancheId = t.json().id as string;

    const maj = await ctx.app.inject({
      method: 'PUT', url: `/api/baremes/${trancheId}`, headers: bearer(jeton),
      payload: { coutUnitaire: 130, motif: 'Nouveau cours' },
    });
    expect(maj.statusCode).toBe(200);
    expect(maj.json().nouvelle.version_bareme).toBe(2);

    const actives = await ctx.app.inject({
      method: 'GET', url: `/api/matieres/${id}/baremes`, headers: bearer(jeton),
    });
    expect(actives.json().baremes).toHaveLength(1);
    expect(actives.json().baremes[0].cout_unitaire).toBe('130.0000');

    const historique = await ctx.app.inject({
      method: 'GET', url: `/api/matieres/${id}/baremes?historique=1`, headers: bearer(jeton),
    });
    expect(historique.json().baremes).toHaveLength(2);
    // L'ancienne ligne existe toujours, fermée, avec son ancien prix.
    const ancienne = historique.json().baremes.find((b: { id: string }) => b.id === trancheId);
    expect(ancienne.cout_unitaire).toBe('120.0000');
    expect(ancienne.valide_au).not.toBeNull();
  });

  it('refuse de rouvrir une tranche déjà fermée', async () => {
    const id = await creerCuivre(null);
    const t = await ctx.app.inject({
      method: 'POST', url: `/api/matieres/${id}/baremes`, headers: bearer(jeton),
      payload: { teneurMin: 3, teneurMax: 4, coutUnitaire: 120 },
    });
    const trancheId = t.json().id as string;
    await ctx.app.inject({
      method: 'PUT', url: `/api/baremes/${trancheId}`, headers: bearer(jeton),
      payload: { coutUnitaire: 130, motif: 'x' },
    });
    const rejoue = await ctx.app.inject({
      method: 'PUT', url: `/api/baremes/${trancheId}`, headers: bearer(jeton),
      payload: { coutUnitaire: 140, motif: 'y' },
    });
    expect(rejoue.statusCode).toBe(409);
    expect(rejoue.json().erreur).toMatch(/immuable/);
  });

  it('signale les trous du barème à l écran Paramètres', async () => {
    const id = await creerCuivre(null);
    for (const [min, max] of [[0, 2], [6, 8]]) {
      await ctx.app.inject({
        method: 'POST', url: `/api/matieres/${id}/baremes`, headers: bearer(jeton),
        payload: { teneurMin: min, teneurMax: max, coutUnitaire: 100 },
      });
    }
    const r = await ctx.app.inject({
      method: 'GET', url: `/api/matieres/${id}/baremes`, headers: bearer(jeton),
    });
    expect(r.json().problemes).toHaveLength(1);
    expect(r.json().problemes[0].type).toBe('TROU');
  });
});

describe('M1 — simulateur', () => {
  it('applique la décision D4 : cuivre 1 % = 140 USD', async () => {
    const id = await creerCuivre('140');
    const r = await ctx.app.inject({
      method: 'POST', url: `/api/matieres/${id}/simuler`, headers: bearer(jeton),
      payload: { qty: '12.5', teneur: '3.2' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ statut: 'CALCULE', montant: '5600.00', devise: 'USD' });
    expect(r.json().snapshot.intermediaires.valeurTeneur).toBe('448');
  });

  it('reproduit le classeur en méthode B', async () => {
    const id = await creerCuivre(null);
    await ctx.app.inject({
      method: 'POST', url: `/api/matieres/${id}/baremes`, headers: bearer(jeton),
      payload: { teneurMin: 3, teneurMax: 4, coutUnitaire: 120, pctCout: 0.85 },
    });
    const r = await ctx.app.inject({
      method: 'POST', url: `/api/matieres/${id}/simuler`, headers: bearer(jeton),
      payload: { qty: '12.5', teneur: '3.2' },
    });
    expect(r.json().montant).toBe('1275.00');
  });

  it('signale une teneur hors barème sans inventer de montant', async () => {
    const id = await creerCuivre(null);
    await ctx.app.inject({
      method: 'POST', url: `/api/matieres/${id}/baremes`, headers: bearer(jeton),
      payload: { teneurMin: 3, teneurMax: 4, coutUnitaire: 120 },
    });
    const r = await ctx.app.inject({
      method: 'POST', url: `/api/matieres/${id}/simuler`, headers: bearer(jeton),
      payload: { qty: '10', teneur: '9' },
    });
    expect(r.json().statut).toBe('HORS_BAREME');
    expect(r.json().montant).toBeNull();
  });

  it('un changement de tarif ne modifie pas une simulation déjà produite (TEST 3)', async () => {
    const id = await creerCuivre('140');
    const avant = await ctx.app.inject({
      method: 'POST', url: `/api/matieres/${id}/simuler`, headers: bearer(jeton),
      payload: { qty: '12.5', teneur: '3.2' },
    });
    const snapshotAvant = avant.json().snapshot;

    await ctx.app.inject({
      method: 'PATCH', url: `/api/matieres/${id}`, headers: bearer(jeton),
      payload: { prixParPourcent: '150', motif: 'Nouveau cours' },
    });

    const apres = await ctx.app.inject({
      method: 'POST', url: `/api/matieres/${id}/simuler`, headers: bearer(jeton),
      payload: { qty: '12.5', teneur: '3.2' },
    });

    // Le snapshot déjà produit porte son propre tarif et reste vrai.
    expect(snapshotAvant.tarif.prixParPourcent).toBe('140');
    expect(avant.json().montant).toBe('5600.00');
    // Une saisie faite après le changement applique le nouveau tarif.
    expect(apres.json().montant).toBe('6000.00');
  });
});
