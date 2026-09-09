/**
 * Jeu de données de DÉMONSTRATION.
 *
 * ⚠️ Ces données sont entièrement FICTIVES. Elles ne représentent aucun site,
 * aucun agent et aucun creuseur réel de COOMIDEC, et ne doivent jamais être
 * utilisées comme données réelles. Le site porte le code `SITE-DEMO` et le
 * drapeau `demonstration = true` : l'interface affiche un bandeau permanent
 * tant qu'il est actif.
 *
 * Le classeur Excel fourni était vide — il n'existe aucune donnée réelle à
 * reprendre. Tout ce qui suit a été inventé pour permettre les tests.
 */
import { randomUUID } from 'node:crypto';
import { creerDb } from '../src/db/index.js';
import { hacher } from '../src/auth/hash.js';

const COMPTES = [
  { identifiant: 'admin',      nom: 'Administrateur DÉMO',   role: 'ADMIN' as const,       mdp: 'Demo!Admin2026' },
  { identifiant: 'superviseur', nom: 'Superviseur DÉMO',      role: 'SUPERVISEUR' as const, mdp: 'Demo!Super2026' },
  { identifiant: 'agent',      nom: 'Agent de terrain DÉMO', role: 'AGENT' as const,       mdp: 'Demo!Agent2026' },
];

// Noms fictifs, générés pour la démonstration.
const CREUSEURS = [
  { nom: 'DEMO-A', postnom: 'Fictif', prenom: 'Un',    sexe: 'H' as const, equipe: 'Équipe 1' },
  { nom: 'DEMO-B', postnom: 'Fictif', prenom: 'Deux',  sexe: 'H' as const, equipe: 'Équipe 1' },
  { nom: 'DEMO-C', postnom: 'Fictif', prenom: 'Trois', sexe: 'F' as const, equipe: 'Équipe 1' },
  { nom: 'DEMO-D', postnom: 'Fictif', prenom: 'Quatre', sexe: 'H' as const, equipe: 'Équipe 2' },
  { nom: 'DEMO-E', postnom: 'Fictif', prenom: 'Cinq',  sexe: 'F' as const, equipe: 'Équipe 2' },
  { nom: 'DEMO-F', postnom: 'Fictif', prenom: 'Six',   sexe: 'H' as const, equipe: 'Équipe 2' },
];

export async function semer(databaseUrl: string): Promise<void> {
  const db = creerDb(databaseUrl);
  try {
    const existant = await db
      .selectFrom('sites').select('id').where('code', '=', 'SITE-DEMO').executeTakeFirst();
    if (existant) {
      console.log('  Le jeu de démonstration est déjà en place.');
      return;
    }

    const siteId = randomUUID();
    await db.insertInto('sites').values({
      id: siteId, code: 'SITE-DEMO', nom: 'Site de démonstration',
      zea: 'ZEA-DEMO', territoire: 'Territoire fictif', province: 'Province fictive',
      demonstration: true,
    }).execute();

    const unites = { T: randomUUID(), KG: randomUUID(), SAC: randomUUID() };
    await db.insertInto('unites').values([
      { id: unites.T,   code: 'T',   libelle: 'Tonne',     decimales: 3, facteur_kg: 1000 },
      { id: unites.KG,  code: 'KG',  libelle: 'Kilogramme', decimales: 2, facteur_kg: 1 },
      { id: unites.SAC, code: 'SAC', libelle: 'Sac',       decimales: 0, facteur_kg: null },
    ]).execute();

    const utilisateurs: Record<string, string> = {};
    for (const c of COMPTES) {
      const id = randomUUID();
      utilisateurs[c.identifiant] = id;
      await db.insertInto('utilisateurs').values({
        id, identifiant: c.identifiant, nom_complet: c.nom, role: c.role,
        mot_de_passe_hash: await hacher(c.mdp), site_id: siteId,
      }).execute();
    }
    const adminId = utilisateurs.admin!;

    await db.insertInto('devices').values({
      id: randomUUID(), libelle: 'Tablette DÉMO 01', site_id: siteId,
    }).execute();

    // Cuivre — méthode A, décision D4 : 1 % de teneur = 140 USD.
    const cuivreId = randomUUID();
    await db.insertInto('matieres_premieres').values({
      id: cuivreId, code: 'CU', nom: 'Cuivre', unite_id: unites.T,
      methode_calcul: 'PRIX_PAR_POURCENT', prix_par_pourcent: 140, pct_cout_defaut: 1,
      devise: 'USD', created_by: adminId,
    }).execute();

    // Cobalt — méthode B, pour illustrer le comportement du classeur.
    const cobaltId = randomUUID();
    await db.insertInto('matieres_premieres').values({
      id: cobaltId, code: 'CO', nom: 'Cobalt', unite_id: unites.T,
      methode_calcul: 'BAREME_TRANCHES', pct_cout_defaut: 1,
      devise: 'USD', created_by: adminId,
    }).execute();

    await db.insertInto('baremes_teneur').values([
      { id: randomUUID(), matiere_id: cobaltId, teneur_min: 0, teneur_max: 1, cout_unitaire: 200, pct_cout: 0.9,  devise: 'USD', created_by: adminId, motif: 'Barème initial (démonstration)' },
      { id: randomUUID(), matiere_id: cobaltId, teneur_min: 1, teneur_max: 2, cout_unitaire: 350, pct_cout: 0.9,  devise: 'USD', created_by: adminId, motif: 'Barème initial (démonstration)' },
      { id: randomUUID(), matiere_id: cobaltId, teneur_min: 2, teneur_max: 5, cout_unitaire: 520, pct_cout: 0.85, devise: 'USD', created_by: adminId, motif: 'Barème initial (démonstration)' },
    ]).execute();

    let n = 0;
    for (const c of CREUSEURS) {
      n++;
      const expiration = new Date();
      // Une carte volontairement proche de l'expiration, pour voir l'alerte.
      expiration.setDate(expiration.getDate() + (n === 3 ? 12 : 300));
      await db.insertInto('creuseurs').values({
        id: randomUUID(),
        code: `CR-${String(n).padStart(4, '0')}`,
        nom: c.nom, postnom: c.postnom, prenom: c.prenom, sexe: c.sexe,
        telephone: `+243 000 000 ${String(n).padStart(3, '0')}`,
        numero_carte_artisanale: `DEMO-CARTE-${String(n).padStart(4, '0')}`,
        date_expiration_carte: expiration.toISOString().slice(0, 10),
        equipe: c.equipe, site_id: siteId, statut: 'ACTIF',
        observation: 'Creuseur fictif — jeu de démonstration',
        created_by: adminId,
      }).execute();
    }

    await db.insertInto('parametres').values([
      { cle: 'organisation', valeur: JSON.stringify({ raisonSociale: 'COOMIDEC', adresse: 'Adresse à compléter' }), portee: 'GLOBAL', site_id: null, updated_by: adminId },
      { cle: 'devise_defaut', valeur: JSON.stringify('USD'), portee: 'GLOBAL', site_id: null, updated_by: adminId },
      { cle: 'fuseau_horaire', valeur: JSON.stringify('Africa/Lubumbashi'), portee: 'GLOBAL', site_id: null, updated_by: adminId },
      { cle: 'cloture_bloque_si_non_synchronise', valeur: JSON.stringify(false), portee: 'GLOBAL', site_id: null, updated_by: adminId },
      { cle: 'jeu_de_demonstration', valeur: JSON.stringify(true), portee: 'GLOBAL', site_id: null, updated_by: adminId },
    ]).execute();

    console.log('  ✓ Jeu de démonstration créé (site SITE-DEMO).');
    console.log('    Comptes : ' + COMPTES.map((c) => `${c.identifiant} / ${c.mdp}`).join('  ·  '));
    console.log('    ⚠️  Données FICTIVES — ne jamais utiliser comme données réelles COOMIDEC.');
  } finally {
    await db.destroy();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL est requis.');
    process.exit(1);
  }
  semer(url).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
