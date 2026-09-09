import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demarrerServeur, type ServeurStatique } from './serveur.ts';

/**
 * CRITÈRE DE VALIDATION — TEST 2
 *
 *   Connexion Internet rétablie → les 10 opérations sont synchronisées
 *   une seule fois.
 *
 * Le serveur est réellement arrêté puis redémarré SUR LE MÊME PORT : le
 * service worker et IndexedDB sont liés à l'origine, changer de port
 * effacerait ce que le test doit vérifier.
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

async function attendreInstallation(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
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

async function saisir(page: Page, dernier: boolean): Promise<void> {
  await taper(page, 'qty', '5');
  await taper(page, 'teneur', '3');
  await expect(page.getByTestId('montant')).not.toHaveText('—');
  await page.getByTestId(dernier ? 'enregistrer' : 'enregistrer-et-nouvelle').click();
  await expect(page.getByTestId('confirmation')).toBeVisible();
  await expect(page.getByTestId('confirmation')).toBeHidden({ timeout: 6_000 });
}

test('TEST 2 — au retour du réseau, les 10 opérations partent une seule fois', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'coomidec-sync-'));
  let serveur: ServeurStatique | null = await demarrerServeur(DIST);
  const port = serveur.port;
  const base = serveur.base;

  try {
    // ── 1. Installation au bureau ─────────────────────────────────────────
    const ctx = await ouvrirApplication(profil);
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(base);
    await attendreInstallation(page);

    // ── 2. Le réseau disparaît ────────────────────────────────────────────
    await serveur.arreter();
    serveur = null;
    await page.goto(base);
    await expect(page.getByTestId('etat-reseau')).toHaveText(/HORS LIGNE/);

    // ── 3. Dix opérations hors ligne ──────────────────────────────────────
    await page.getByTestId('tuile-saisie').click();
    await page.getByTestId('matiere-CU').click();
    await page.getByTestId('creuseur-CR-0001').click();
    for (let i = 1; i <= 10; i++) await saisir(page, i === 10);
    await expect(page.getByTestId('compteur-attente')).toHaveText('10 en attente');

    // ── 4. Le réseau revient, sur la même origine ─────────────────────────
    serveur = await demarrerServeur(DIST, port);
    expect(serveur.port).toBe(port);

    await page.getByTestId('tuile-sync').click();
    await expect(page.getByTestId('liste-attente').locator('tr')).toHaveCount(10);
    await page.getByTestId('synchroniser-maintenant').click();
    await expect(page.getByTestId('resultat-sync')).toContainText('10 opération(s) synchronisée(s)');

    // ── 5. Chaque opération est arrivée UNE SEULE FOIS ────────────────────
    expect(serveur.recus).toHaveLength(10);
    expect(new Set(serveur.recus).size).toBe(10);
    expect(serveur.lots).toBe(1);

    // La file est vide, le compteur a disparu.
    await expect(page.getByTestId('liste-attente').locator('tr')).toHaveCount(0);
    await expect(page.getByTestId('compteur-attente')).toHaveCount(0);

    // ── 6. Un second déclenchement n'envoie rien de plus ──────────────────
    const retour = page.getByRole('button', { name: 'Retour' });
    await retour.click();
    await page.getByTestId('tuile-jour').click();
    await expect(page.getByTestId('ligne-operation')).toHaveCount(10);

    await retour.click();
    await page.getByTestId('tuile-sync').click();
    // File vide : le bouton est inactif, il n'y a plus rien à envoyer.
    await expect(page.getByTestId('synchroniser-maintenant')).toBeDisabled();
    expect(serveur.recus).toHaveLength(10);
    expect(serveur.lots).toBe(1);

    await ctx.close();
  } finally {
    await serveur?.arreter();
    rmSync(profil, { recursive: true, force: true });
  }
});
