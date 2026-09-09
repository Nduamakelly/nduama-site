import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demarrerServeur, type ServeurStatique } from './serveur.ts';

/**
 * CRITÈRE DE VALIDATION — TEST 1
 *
 *   Tablette sans Internet → créer 10 opérations → fermer l'application →
 *   rouvrir → les 10 opérations sont toujours présentes.
 *
 * Deux choix rendent ce test probant plutôt que décoratif :
 *   - le navigateur tourne sur un PROFIL DISQUE PERSISTANT, fermé puis
 *     rouvert : IndexedDB est réellement relu depuis le disque ;
 *   - la coupure réseau est RÉELLE — le serveur est arrêté et ses connexions
 *     détruites — au lieu d'être émulée.
 */

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const EXE = process.env.CHROMIUM_PATH || undefined;

async function ouvrirApplication(profil: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(profil, {
    ...(EXE ? { executablePath: EXE } : {}),
    viewport: { width: 1280, height: 900 },
    hasTouch: true,
  });
}

/**
 * Attend que l'application soit réellement INSTALLÉE : service worker actif,
 * contrôlant la page, ET précache garni. Se contenter de « actif » laisserait
 * passer une tablette pas encore utilisable hors ligne.
 */
async function attendreInstallation(page: Page): Promise<void> {
  // `page.waitForFunction` avec un prédicat ASYNC serait un piège : il renvoie
  // une Promise, toujours vraie, et l'attente se terminerait immédiatement.
  // `expect.poll` + `page.evaluate` attendent réellement le résultat.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          if (!('serviceWorker' in navigator)) return false;
          const reg = await navigator.serviceWorker.getRegistration();
          if (!reg?.active || navigator.serviceWorker.controller === null) return false;
          const nom = (await caches.keys()).find((k) => k.includes('precache'));
          if (!nom) return false;
          const chemins = (await (await caches.open(nom)).keys()).map((r) => new URL(r.url).pathname);
          return chemins.includes('/index.html') && chemins.some((c) => c.endsWith('.js'));
        }),
      { timeout: 30_000, message: "le service worker n'a pas fini d'installer l'application" },
    )
    .toBe(true);
}

async function taper(page: Page, champ: 'qty' | 'teneur', valeur: string): Promise<void> {
  for (const c of valeur) {
    await page.getByTestId(c === ',' || c === '.' ? `${champ}-virgule` : `${champ}-${c}`).click();
  }
}

async function viderChamp(page: Page, champ: 'qty' | 'teneur'): Promise<void> {
  for (let i = 0; i < 12; i++) await page.getByTestId(`${champ}-effacer`).click();
}

async function saisir(page: Page, qty: string, teneur: string, dernier: boolean): Promise<void> {
  await taper(page, 'qty', qty);
  await taper(page, 'teneur', teneur);
  await expect(page.getByTestId('montant')).not.toHaveText('—');
  await page.getByTestId(dernier ? 'enregistrer' : 'enregistrer-et-nouvelle').click();
  await expect(page.getByTestId('confirmation')).toBeVisible();
  await expect(page.getByTestId('confirmation')).toBeHidden({ timeout: 6_000 });
}

test('TEST 1 — 10 opérations hors ligne survivent à la fermeture de l application', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'coomidec-tablette-'));
  let serveur: ServeurStatique | null = await demarrerServeur(DIST);
  const base = serveur.base;   // l'adresse survit à l'arrêt du serveur
  let numeros: string[] = [];

  try {
    // ── 1. Installation de la PWA, au bureau, avec réseau ─────────────────
    const ctx = await ouvrirApplication(profil);
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(base);
    await attendreInstallation(page);

    // ── 2. Départ sur le site : le serveur devient injoignable, pour de vrai
    await serveur.arreter();
    serveur = null;

    // L'application se rouvre sans réseau — c'est le service worker qui sert.
    await page.goto(base);
    await expect(page.getByTestId('etat-reseau')).toHaveText(/HORS LIGNE/);

    // ── 3. Dix opérations, sans aucun serveur ─────────────────────────────
    await page.getByTestId('tuile-saisie').click();
    await page.getByTestId('matiere-CU').click();
    await page.getByTestId('creuseur-CR-0001').click();
    for (let i = 1; i <= 10; i++) await saisir(page, '5', '3', i === 10);

    await page.getByTestId('tuile-jour').click();
    await expect(page.getByTestId('ligne-operation')).toHaveCount(10);
    await expect(page.getByTestId('total-operations')).toHaveText('10');
    await expect(page.getByTestId('compteur-attente')).toHaveText('10 en attente');
    numeros = await page.getByTestId('ligne-operation').locator('td').first().allTextContents();

    // ── 4. Fermeture de l'application ─────────────────────────────────────
    await ctx.close();

    // ── 5. Réouverture, toujours sans serveur ─────────────────────────────
    const ctx2 = await ouvrirApplication(profil);
    const page2 = ctx2.pages()[0] ?? (await ctx2.newPage());
    await page2.goto(base);
    await expect(page2.getByTestId('etat-reseau')).toHaveText(/HORS LIGNE/);

    await page2.getByTestId('tuile-jour').click();

    // Les 10 opérations sont là, avec exactement les mêmes numéros…
    await expect(page2.getByTestId('ligne-operation')).toHaveCount(10);
    await expect(page2.getByTestId('total-operations')).toHaveText('10');
    expect(await page2.getByTestId('ligne-operation').locator('td').first().allTextContents())
      .toEqual(numeros);

    // …et toujours en file de synchronisation : rien n'a été perdu.
    await expect(page2.getByTestId('compteur-attente')).toHaveText('10 en attente');

    await ctx2.close();
  } finally {
    await serveur?.arreter();
    rmSync(profil, { recursive: true, force: true });
  }
});

test('le calcul en direct applique la décision D4 et le barème', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'coomidec-calcul-'));
  const serveur = await demarrerServeur(DIST);
  try {
    const ctx = await ouvrirApplication(profil);
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(serveur.base);

    await page.getByTestId('tuile-saisie').click();
    await page.getByTestId('matiere-CU').click();
    await taper(page, 'qty', '5');
    await taper(page, 'teneur', '3');

    // Cuivre : 1 % de teneur = 140 USD ⇒ 5 × (3 × 140) = 2 100,00 USD
    await expect(page.getByTestId('montant')).toHaveText('2 100,00 USD');

    // Cobalt à 1,4 % : tranche [1, 2) ⇒ 5 × 350 × 0,9 = 1 575,00 USD
    await page.getByTestId('matiere-CO').click();
    await viderChamp(page, 'teneur');
    await taper(page, 'teneur', '1,4');
    await expect(page.getByTestId('montant')).toHaveText('1 575,00 USD');

    // Teneur hors de toute tranche : aucun montant inventé.
    await viderChamp(page, 'teneur');
    await taper(page, 'teneur', '9');
    await expect(page.getByTestId('montant')).toHaveText('—');
    await expect(page.getByTestId('bandeau-calcul')).toContainText('Hors barème');

    await ctx.close();
  } finally {
    await serveur.arreter();
    rmSync(profil, { recursive: true, force: true });
  }
});
