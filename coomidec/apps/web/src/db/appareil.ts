/**
 * Identité de l'appareil et contexte de saisie, persistés localement.
 * L'identifiant est tiré une fois puis ne change plus : il entre dans le
 * numéro de chaque opération et distingue deux tablettes du même site.
 */
import { ecrireMeta, lireMeta } from './dexie.ts';
import type { ContexteSaisie } from './operations.ts';

const CLE_DEVICE = 'device:id';
const CLE_CONTEXTE = 'contexte:saisie';

export async function identifiantAppareil(): Promise<string> {
  const existant = await lireMeta<string | null>(CLE_DEVICE, null);
  if (existant) return existant;
  const id = crypto.randomUUID();
  await ecrireMeta(CLE_DEVICE, id);
  return id;
}

export function lireContexte(): Promise<ContexteSaisie | null> {
  return lireMeta<ContexteSaisie | null>(CLE_CONTEXTE, null);
}

export function ecrireContexte(ctx: ContexteSaisie): Promise<void> {
  return ecrireMeta(CLE_CONTEXTE, ctx);
}
