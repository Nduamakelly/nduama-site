/**
 * Petit serveur statique qui sert `dist/`.
 *
 * Le test le démarre et l'ARRÊTE lui-même : la coupure réseau est alors
 * réelle, pas émulée. C'est la seule façon de prouver honnêtement qu'une
 * tablette privée de serveur ouvre quand même l'application.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';
import type { AddressInfo, Socket } from 'node:net';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export interface ServeurStatique {
  base: string;
  arreter: () => Promise<void>;
}

export async function demarrerServeur(racine: string): Promise<ServeurStatique> {
  const sockets = new Set<Socket>();

  const serveur: Server = createServer((req, res) => {
    const chemin = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    // Le service worker doit être servi depuis la racine pour avoir la portée.
    let fichier = join(racine, normalize(chemin).replace(/^(\.\.[/\\])+/, ''));
    if (!existsSync(fichier) || statSync(fichier).isDirectory()) {
      fichier = join(racine, 'index.html'); // repli de navigation
    }
    res.setHeader('Content-Type', TYPES[extname(fichier)] ?? 'application/octet-stream');
    // Pas de cache HTTP : seul le service worker doit expliquer un succès hors ligne.
    res.setHeader('Cache-Control', 'no-store');
    createReadStream(fichier).pipe(res);
  });

  serveur.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });

  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  const { port } = serveur.address() as AddressInfo;

  return {
    base: `http://127.0.0.1:${port}`,
    async arreter() {
      // Les connexions ouvertes (keep-alive) doivent tomber aussi, sinon la
      // coupure ne serait pas totale.
      for (const s of sockets) s.destroy();
      await new Promise<void>((ok) => serveur.close(() => ok()));
    },
  };
}
