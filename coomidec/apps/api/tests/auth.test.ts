import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, creerUtilisateur, jetonPour, nettoyer, preparer } from './aide.js';

let ctx: Awaited<ReturnType<typeof preparer>>;

beforeAll(async () => { ctx = await preparer(); });
afterAll(async () => { await ctx.app.close(); await ctx.db.destroy(); });
beforeEach(async () => { await nettoyer(ctx.db); });

describe('authentification', () => {
  it('répond à la sonde de santé sans jeton', async () => {
    const r = await ctx.app.inject({ method: 'GET', url: '/api/sante' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ statut: 'OK' });
  });

  it('délivre un jeton sur des identifiants valides', async () => {
    const u = await creerUtilisateur(ctx.db, 'ADMIN');
    const r = await ctx.app.inject({
      method: 'POST', url: '/api/auth/connexion',
      payload: { identifiant: u.identifiant, motDePasse: u.motDePasse },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().utilisateur).toMatchObject({ role: 'ADMIN', pinDefini: false });
  });

  it('ne révèle pas si un identifiant existe', async () => {
    const u = await creerUtilisateur(ctx.db, 'AGENT');
    const inconnu = await ctx.app.inject({
      method: 'POST', url: '/api/auth/connexion',
      payload: { identifiant: 'personne', motDePasse: 'x' },
    });
    const mauvaisMdp = await ctx.app.inject({
      method: 'POST', url: '/api/auth/connexion',
      payload: { identifiant: u.identifiant, motDePasse: 'mauvais' },
    });
    expect(inconnu.statusCode).toBe(401);
    expect(mauvaisMdp.statusCode).toBe(401);
    expect(inconnu.json().erreur).toBe(mauvaisMdp.json().erreur);
  });

  it('refuse un utilisateur désactivé', async () => {
    const u = await creerUtilisateur(ctx.db, 'AGENT');
    await ctx.db.updateTable('utilisateurs').set({ actif: false }).where('id', '=', u.id).execute();
    const r = await ctx.app.inject({
      method: 'POST', url: '/api/auth/connexion',
      payload: { identifiant: u.identifiant, motDePasse: u.motDePasse },
    });
    expect(r.statusCode).toBe(401);
  });

  it('trace chaque connexion dans le journal d audit', async () => {
    const u = await creerUtilisateur(ctx.db, 'AGENT');
    await jetonPour(ctx.app, u.identifiant, u.motDePasse);
    const traces = await ctx.db.selectFrom('audit_logs').selectAll()
      .where('action', '=', 'CONNEXION').execute();
    expect(traces).toHaveLength(1);
    expect(traces[0]?.utilisateur_id).toBe(u.id);
  });

  it('exige un jeton sur les routes protégées', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/matieres' })).statusCode).toBe(401);
  });

  it('applique la hiérarchie des rôles', async () => {
    const agent = await creerUtilisateur(ctx.db, 'AGENT', 'agent1');
    const admin = await creerUtilisateur(ctx.db, 'ADMIN', 'admin1');
    const jAgent = await jetonPour(ctx.app, agent.identifiant, agent.motDePasse);
    const jAdmin = await jetonPour(ctx.app, admin.identifiant, admin.motDePasse);

    const corps = { code: 'KOL', nom: 'Kolwezi' };
    const refuse = await ctx.app.inject({
      method: 'POST', url: '/api/sites', headers: bearer(jAgent), payload: corps,
    });
    const accepte = await ctx.app.inject({
      method: 'POST', url: '/api/sites', headers: bearer(jAdmin), payload: corps,
    });
    expect(refuse.statusCode).toBe(403);
    expect(accepte.statusCode).toBe(201);

    // L'agent peut lire.
    const lecture = await ctx.app.inject({
      method: 'GET', url: '/api/sites', headers: bearer(jAgent),
    });
    expect(lecture.statusCode).toBe(200);
    expect(lecture.json()).toHaveLength(1);
  });

  it('définit un PIN de déverrouillage hors ligne', async () => {
    const u = await creerUtilisateur(ctx.db, 'AGENT');
    const j = await jetonPour(ctx.app, u.identifiant, u.motDePasse);
    const trop = await ctx.app.inject({
      method: 'POST', url: '/api/auth/pin', headers: bearer(j), payload: { pin: '12' },
    });
    expect(trop.statusCode).toBe(400);

    const ok = await ctx.app.inject({
      method: 'POST', url: '/api/auth/pin', headers: bearer(j), payload: { pin: '4821' },
    });
    expect(ok.statusCode).toBe(200);

    const row = await ctx.db.selectFrom('utilisateurs').select('pin_hash')
      .where('id', '=', u.id).executeTakeFirstOrThrow();
    expect(row.pin_hash).toMatch(/^\$argon2id\$/);   // jamais le PIN en clair
    expect(row.pin_hash).not.toContain('4821');
  });
});
