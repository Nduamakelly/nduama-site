import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { hacher, verifier } from '../auth/hash.js';
import { journaliser } from '../audit.js';

const connexion = z.object({
  identifiant: z.string().min(1),
  motDePasse: z.string().min(1),
  deviceId: z.string().uuid().optional(),
});

const definirPin = z.object({ pin: z.string().regex(/^\d{4,8}$/, 'Le PIN doit faire 4 à 8 chiffres.') });

export async function routesAuth(app: FastifyInstance, opts: { db: Db }): Promise<void> {
  const { db } = opts;

  app.post('/api/auth/connexion', async (req, rep) => {
    const parse = connexion.safeParse(req.body);
    if (!parse.success) return rep.code(400).send({ erreur: 'Requête invalide.' });
    const { identifiant, motDePasse, deviceId } = parse.data;

    const u = await db
      .selectFrom('utilisateurs')
      .selectAll()
      .where('identifiant', '=', identifiant)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    // Message identique dans les deux cas : ne pas révéler quels identifiants existent.
    const refus = { erreur: 'Identifiant ou mot de passe incorrect.' };
    if (!u || !u.actif) return rep.code(401).send(refus);
    if (!(await verifier(u.mot_de_passe_hash, motDePasse))) return rep.code(401).send(refus);

    if (deviceId) {
      const d = await db
        .selectFrom('devices')
        .select(['id', 'actif', 'site_id'])
        .where('id', '=', deviceId)
        .executeTakeFirst();
      if (!d) return rep.code(403).send({ erreur: 'Appareil inconnu. Enregistrez-le d abord.' });
      if (!d.actif) return rep.code(403).send({ erreur: 'Appareil révoqué.' });
    }

    await journaliser(db, {
      entite: 'utilisateurs',
      entiteId: u.id,
      action: 'CONNEXION',
      utilisateurId: u.id,
      deviceId: deviceId ?? null,
      adresseIp: req.ip,
    });

    const jeton = app.jwt.sign({
      sub: u.id,
      identifiant: u.identifiant,
      role: u.role,
      siteId: u.site_id,
    });

    return {
      jeton,
      utilisateur: {
        id: u.id,
        identifiant: u.identifiant,
        nomComplet: u.nom_complet,
        role: u.role,
        siteId: u.site_id,
        pinDefini: u.pin_hash !== null,
      },
    };
  });

  app.get('/api/auth/moi', { preHandler: [app.authentifier] }, async (req) => ({
    id: req.user.sub,
    identifiant: req.user.identifiant,
    role: req.user.role,
    siteId: req.user.siteId,
  }));

  /**
   * Définit le PIN de déverrouillage hors ligne. Le hachage redescend sur la
   * tablette à la synchronisation : c'est lui qui permet d'ouvrir une session
   * sans réseau, sans jamais stocker le PIN en clair.
   */
  app.post('/api/auth/pin', { preHandler: [app.authentifier] }, async (req, rep) => {
    const parse = definirPin.safeParse(req.body);
    if (!parse.success) {
      return rep.code(400).send({ erreur: parse.error.issues[0]?.message ?? 'PIN invalide.' });
    }
    const empreinte = await hacher(parse.data.pin);
    await db
      .updateTable('utilisateurs')
      .set({ pin_hash: empreinte, updated_at: new Date() })
      .where('id', '=', req.user.sub)
      .execute();
    await journaliser(db, {
      entite: 'utilisateurs',
      entiteId: req.user.sub,
      action: 'MODIFICATION',
      nouvelleValeur: { pin: 'défini' },
      utilisateurId: req.user.sub,
      adresseIp: req.ip,
    });
    return { statut: 'PIN_DEFINI' };
  });
}
