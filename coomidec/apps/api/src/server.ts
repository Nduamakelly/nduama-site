import { chargerConfig } from './config.js';
import { construireApp } from './app.js';

const config = chargerConfig();
const { app, db } = await construireApp(config);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void (async () => {
      app.log.info('arrêt en cours…');
      await app.close();
      await db.destroy();
      process.exit(0);
    })();
  });
}

await app.listen({ port: config.PORT, host: config.HOST });
