/**
 * Numérotation locale.
 *
 * Le numéro doit être définitif dès la création hors ligne : s'il changeait à
 * la synchronisation, un rapport papier déjà signé deviendrait faux. Il est
 * donc composé sur l'appareil, et le préfixe d'appareil garantit que deux
 * tablettes du même site ne peuvent pas produire le même numéro.
 *
 *   COOMIDEC/KOL/20260909/A7F3-014
 */

/** 4 caractères stables dérivés de l'UUID de l'appareil. */
export function prefixeAppareil(deviceId: string): string {
  return deviceId.replace(/-/g, '').slice(0, 4).toUpperCase();
}

export function composerNumero(
  siteCode: string,
  dateOperation: string,   // AAAA-MM-JJ
  deviceId: string,
  sequence: number,
): string {
  const jour = dateOperation.replace(/-/g, '');
  return `COOMIDEC/${siteCode}/${jour}/${prefixeAppareil(deviceId)}-${String(sequence).padStart(3, '0')}`;
}

/** Journée métier en heure locale du site : une saisie à 23 h appartient à ce jour-là. */
export function journeeMetier(maintenant: Date, fuseau = 'Africa/Lubumbashi'): string {
  const f = new Intl.DateTimeFormat('fr-CA', {
    timeZone: fuseau, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return f.format(maintenant);   // fr-CA donne AAAA-MM-JJ
}

export function heureLocale(maintenant: Date, fuseau = 'Africa/Lubumbashi'): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: fuseau, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(maintenant);
}
