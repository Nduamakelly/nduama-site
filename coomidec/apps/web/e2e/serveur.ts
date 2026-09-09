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
  port: number;
  /** Identifiants d'opérations reçus par /api/sync/push, dans l'ordre. */
  recus: string[];
  /** Nombre de lots reçus : permet de vérifier qu'on ne renvoie pas pour rien. */
  lots: number;
  arreter: () => Promise<void>;
}

/**
 * `port` permet de redémarrer sur la MÊME origine après une coupure : sans
 * cela le service worker et IndexedDB, qui sont liés à l'origine, seraient
 * perdus et le test ne prouverait rien.
 */
export async function demarrerServeur(racine: string, port = 0): Promise<ServeurStatique> {
  const sockets = new Set<Socket>();
  const etat = { recus: [] as string[], lots: 0 };

  const serveur: Server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0] ?? '/';

    // Sonde de connectivité : l'application exige du JSON portant statut OK.
    if (url === '/api/sante') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ statut: 'OK', heureServeur: new Date().toISOString() }));
      return;
    }

    // Bouchon de synchronisation : il note ce qu'il reçoit, ce qui permet de
    // vérifier que chaque opération n'arrive qu'une fois.
    if (url === '/api/sync/push' && req.method === 'POST') {
      let corps = '';
      req.on('data', (c) => { corps += c; });
      req.on('end', () => {
        const { operations } = JSON.parse(corps || '{}') as { operations?: { id: string }[] };
        const ids = (operations ?? []).map((o) => o.id);
        etat.recus.push(...ids);
        etat.lots += 1;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
          heureServeur: new Date().toISOString(),
          resultats: ids.map((id) => ({ id, etat: 'APPLIQUEE' })),
        }));
      });
      return;
    }

    const chemin = decodeURIComponent(url);
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

  await new Promise<void>((ok) => serveur.listen(port, '127.0.0.1', ok));
  const portReel = (serveur.address() as AddressInfo).port;

  return {
    base: `http://127.0.0.1:${portReel}`,
    port: portReel,
    get recus() { return etat.recus; },
    get lots() { return etat.lots; },
    async arreter() {
      // Les connexions ouvertes (keep-alive) doivent tomber aussi, sinon la
      // coupure ne serait pas totale.
      for (const s of sockets) s.destroy();
      await new Promise<void>((ok) => serveur.close(() => ok()));
    },
  };
}
