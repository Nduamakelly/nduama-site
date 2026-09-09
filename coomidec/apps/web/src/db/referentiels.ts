/**
 * Référentiels locaux : matières, barèmes, creuseurs.
 *
 * Ils sont tirés du serveur à la synchronisation, mais l'application doit
 * pouvoir démarrer et fonctionner sans avoir jamais vu le réseau — sinon une
 * tablette neuve sur un site isolé serait inutilisable. Un jeu de
 * démonstration local sert alors d'amorce.
 */
import { db, type BaremeLocal, type CreuseurLocal, type MatiereLocale } from './dexie.ts';
import demo from './demo.json';

/** Aplati nom, prénom, téléphone et n° de carte, sans accents ni casse. */
export function clefRecherche(c: Pick<CreuseurLocal,
  'nom' | 'postnom' | 'prenom' | 'telephone' | 'numeroCarte' | 'code'>): string {
  return [c.code, c.nom, c.postnom, c.prenom, c.telephone, c.numeroCarte]
    .filter(Boolean).join(' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export async function referentielsPresents(): Promise<boolean> {
  return (await db.matieres.count()) > 0;
}

/** Amorce hors ligne. Marquée DÉMONSTRATION : jamais des données réelles. */
export async function amorcerDemonstration(): Promise<void> {
  if (await referentielsPresents()) return;
  await db.transaction('rw', db.matieres, db.baremes, db.creuseurs, async () => {
    await db.matieres.bulkPut(demo.matieres as MatiereLocale[]);
    await db.baremes.bulkPut(demo.baremes as BaremeLocal[]);
    await db.creuseurs.bulkPut(
      (demo.creuseurs as Omit<CreuseurLocal, 'recherche'>[]).map((c) => ({
        ...c, recherche: clefRecherche(c),
      })),
    );
  });
}

export function matieresActives(): Promise<MatiereLocale[]> {
  return db.matieres.filter((m) => m.actif).toArray();
}

export function baremesDe(matiereId: string): Promise<BaremeLocal[]> {
  return db.baremes.where('matiereId').equals(matiereId).toArray();
}

/** Recherche instantanée : le terrain tape trois lettres, pas une requête. */
export async function chercherCreuseurs(terme: string, limite = 20): Promise<CreuseurLocal[]> {
  const t = terme.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const actifs = await db.creuseurs.filter((c) => c.statut === 'ACTIF').toArray();
  const tries = actifs.sort((a, b) => a.recherche.localeCompare(b.recherche, 'fr'));
  if (!t) return tries.slice(0, limite);
  return tries.filter((c) => c.recherche.includes(t)).slice(0, limite);
}

/** Jours avant expiration de la carte artisanale ; négatif si déjà périmée. */
export function joursAvantExpiration(c: CreuseurLocal, aujourdhui = new Date()): number | null {
  if (!c.dateExpirationCarte) return null;
  const ms = Date.parse(`${c.dateExpirationCarte}T00:00:00`) - aujourdhui.setHours(0, 0, 0, 0);
  return Math.round(ms / 86_400_000);
}
