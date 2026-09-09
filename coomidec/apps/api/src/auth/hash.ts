import { hash, verify } from '@node-rs/argon2';

// Paramètres Argon2id : coût mémoire 19 Mio, 2 passes — recommandation OWASP.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hacher(secret: string): Promise<string> {
  return hash(secret, OPTIONS);
}

/** Ne lève jamais : un hachage corrompu se solde par un refus, pas par une erreur 500. */
export async function verifier(empreinte: string, secret: string): Promise<boolean> {
  try {
    return await verify(empreinte, secret, OPTIONS);
  } catch {
    return false;
  }
}
