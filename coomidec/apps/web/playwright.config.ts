import { defineConfig, devices } from '@playwright/test';

/**
 * Le TEST 1 exige un vrai navigateur : un faux IndexedDB ne prouverait pas
 * que les données survivent à la fermeture de l'application. On sert donc le
 * build de production (service worker compris) et on pilote Chromium.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'tablette',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        hasTouch: true,
        // En CI, Playwright installe le navigateur qu'il attend. En local, la
        // variable pointe vers un Chromium déjà présent quand la version
        // empaquetée diffère de celle du conteneur.
        launchOptions: process.env.CHROMIUM_PATH
          ? { executablePath: process.env.CHROMIUM_PATH }
          : {},
      },
    },
  ],
  // Pas de `webServer` : chaque test démarre et arrête SON serveur, pour
  // pouvoir couper le réseau pour de vrai. `npm run e2e` construit d'abord.
});
