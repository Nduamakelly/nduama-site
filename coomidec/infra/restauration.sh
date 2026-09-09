#!/usr/bin/env bash
# Restauration d'une sauvegarde COOMIDEC.
#   ./restauration.sh <fichier.sql.gz[.gpg]>
# ATTENTION : écrase le contenu de la base cible.
set -euo pipefail

FICHIER="${1:?Indiquez le fichier de sauvegarde}"
: "${DATABASE_URL:?DATABASE_URL est requis}"

[ -f "$FICHIER" ] || { echo "Fichier introuvable : $FICHIER"; exit 1; }

echo "La base ciblée par DATABASE_URL va être ÉCRASÉE par $FICHIER."
read -r -p "Tapez RESTAURER pour confirmer : " confirmation
[ "$confirmation" = "RESTAURER" ] || { echo "Annulé."; exit 1; }

TEMPORAIRE="$(mktemp -d)"
trap 'rm -rf "$TEMPORAIRE"' EXIT

if [[ "$FICHIER" == *.gpg ]]; then
  : "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE est requis pour une sauvegarde chiffrée}"
  gpg --batch --yes --decrypt --passphrase "$BACKUP_PASSPHRASE" \
      --output "$TEMPORAIRE/dump.sql.gz" "$FICHIER"
  SOURCE="$TEMPORAIRE/dump.sql.gz"
else
  SOURCE="$FICHIER"
fi

gunzip -c "$SOURCE" > "$TEMPORAIRE/dump.sql"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$TEMPORAIRE/dump.sql"

echo "Restauration terminée."
