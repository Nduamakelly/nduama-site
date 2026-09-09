#!/usr/bin/env bash
# Sauvegarde chiffrée de la base COOMIDEC.
#   ./sauvegarde.sh [dossier]
# Restauration : ./restauration.sh <fichier.sql.gz.gpg>
set -euo pipefail

DOSSIER="${1:-./sauvegardes}"
: "${DATABASE_URL:?DATABASE_URL est requis}"
HORODATAGE="$(date +%Y%m%d-%H%M%S)"
FICHIER="$DOSSIER/coomidec-$HORODATAGE.sql.gz"

mkdir -p "$DOSSIER"

echo "Sauvegarde vers $FICHIER…"
pg_dump --no-owner --no-privileges --format=plain "$DATABASE_URL" | gzip -9 > "$FICHIER"

if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  echo "Chiffrement…"
  gpg --batch --yes --symmetric --cipher-algo AES256 \
      --passphrase "$BACKUP_PASSPHRASE" --output "$FICHIER.gpg" "$FICHIER"
  rm -f "$FICHIER"
  FICHIER="$FICHIER.gpg"
else
  echo "AVERTISSEMENT : BACKUP_PASSPHRASE non défini — sauvegarde NON chiffrée."
  echo "  La base contient des données personnelles de creuseurs (nom, téléphone,"
  echo "  numéro de carte artisanale). Définissez BACKUP_PASSPHRASE."
fi

# Rétention : 30 jours sur place. Copiez hors du serveur pour une vraie sécurité.
find "$DOSSIER" -name 'coomidec-*.sql.gz*' -mtime +30 -delete

echo "Terminé : $FICHIER ($(du -h "$FICHIER" | cut -f1))"
