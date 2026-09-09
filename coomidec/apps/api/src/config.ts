import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL est requis'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET doit faire au moins 16 caractères'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Durée du jeton d'accès. Le rafraîchissement longue durée gère le hors-ligne. */
  JWT_EXPIRATION: z.string().default('12h'),
  FUSEAU_HORAIRE: z.string().default('Africa/Lubumbashi'),
});

export type Config = z.infer<typeof schema>;

export function chargerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = schema.safeParse(env);
  if (!r.success) {
    const details = r.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuration invalide :\n${details}`);
  }
  return r.data;
}
