# B — Modèle de données

Convention appliquée à **toutes** les tables métier :
`id UUID PK` · `created_at` · `updated_at` · `created_by` · `device_id` · `sync_status` · `version INT` (concurrence optimiste) · `deleted_at` (suppression logique — **rien n'est jamais supprimé physiquement**).

Les UUID sont générés **sur l'appareil** (`crypto.randomUUID()`). L'identité d'une opération ne change donc jamais entre la tablette et le serveur : c'est la base de l'anti-doublon.

---

## `sites`

`id` · `code` (ex. `KOL`) · `nom` · `zea` · `territoire` · `province` · `responsable_defaut_id` · `actif`

## `unites`

`id` · `code` (`T`, `KG`, `SAC`) · `libelle` · `decimales` (nb de décimales affichées) · `facteur_kg` (conversion, nullable) · `actif`

## `matieres_premieres`

`id` · `code` · `nom` · `unite_id` → `unites` · `methode_calcul` · `prix_par_pourcent NUMERIC(18,4)` · `formule TEXT` · `devise` · `actif` · `created_at` · `updated_at`

```sql
methode_calcul ∈ ('PRIX_PAR_POURCENT', 'BAREME_TRANCHES')
```

`formule` est une **expression textuelle** évaluée par l'évaluateur restreint du moteur (voir `05-MOTEUR-CALCUL.md`). Vide ⇒ formule par défaut de la méthode.

## `baremes_teneur` — historisée, **append-only**

`id` · `matiere_id` · `teneur_min NUMERIC(6,3)` · `teneur_max NUMERIC(6,3)` · `cout_unitaire NUMERIC(18,4)` · `pct_cout NUMERIC(9,6)` · `devise` · `valide_du TIMESTAMPTZ NOT NULL` · `valide_au TIMESTAMPTZ NULL` · `version_barreme INT` · `cree_par` · `motif`

C'est le mécanisme central du **TEST 3**. Un tarif n'est **jamais** modifié en place :

```sql
-- Changer un prix = fermer la ligne courante, en insérer une nouvelle
UPDATE baremes_teneur SET valide_au = now() WHERE id = $1 AND valide_au IS NULL;
INSERT INTO baremes_teneur (...) VALUES (..., valide_du = now(), valide_au = NULL);
```

Contrainte d'intégrité : pour une matière donnée, **aucun chevauchement de tranches parmi les lignes actives** (`valide_au IS NULL`). Bornes **semi-ouvertes `[min, max)`** — corrige l'ambiguïté du fichier Excel (voir Q2).

```sql
ALTER TABLE baremes_teneur ADD CONSTRAINT baremes_sans_chevauchement
  EXCLUDE USING gist (
    matiere_id WITH =,
    numrange(teneur_min, teneur_max, '[)') WITH &&,
    tstzrange(valide_du, valide_au, '[)') WITH &&
  );
```

## `operations` — table centrale

**Identité et contexte**
`id UUID` · `numero` (voir plus bas) · `site_id` · `date_operation DATE` · `heure TIME` · `responsable_id` · `creuseur_id` (nullable) · `equipe`

**Saisie de l'agent**
`matiere_id` · `qty NUMERIC(18,3)` · `unite_id` · `teneur NUMERIC(6,3)` · `observation TEXT` · `signature_blob`

**Snapshot de calcul — figé à l'enregistrement, jamais recalculé**
`montant NUMERIC(18,2)` · `devise` · `calcul JSONB`

```jsonc
// operations.calcul — exemple réel
{
  "moteurVersion": "1.0.0",
  "methode": "BAREME_TRANCHES",
  "formule": "QTY * COUT_UNITAIRE * PCT_COUT",
  "baremeId": "3f9a…",
  "baremeVersion": 2,
  "entrees":  { "qty": 12.5, "teneur": 3.2, "unite": "T" },
  "tarif":    { "coutUnitaire": 120.0, "pctCout": 0.85, "devise": "USD" },
  "intermediaires": { "valeurTeneur": null },
  "montantBrut": 1275.0,
  "montantArrondi": 1275.00,
  "calculeA": "2026-09-09T08:14:03+02:00"
}
```

**Cycle de vie**
`statut` · `motif_annulation` · `cloture_id` (nullable) · `verrouillee BOOLEAN`

```sql
statut ∈ ('BROUILLON', 'VALIDEE', 'ANNULEE', 'CLOTUREE', 'CORRIGEE')
```

**Numérotation.** Le numéro lisible doit être stable dès la création hors ligne, sinon il change à la synchronisation et les rapports papier déjà signés deviennent faux. Format retenu :

```
COOMIDEC/{SITE}/{YYYYMMDD}/{DEVICE4}-{SEQ:3}
exemple : COOMIDEC/KOL/20260909/A7F3-014
```

`DEVICE4` = 4 caractères stables issus de l'identifiant d'appareil ; `SEQ` = compteur local du jour. Deux appareils ne peuvent donc pas produire le même numéro, et le numéro ne bouge jamais. Contrainte `UNIQUE (site_id, date_operation, numero)`.

**Index**
```sql
CREATE INDEX ON operations (site_id, date_operation) WHERE deleted_at IS NULL;
CREATE INDEX ON operations (sync_status) WHERE sync_status <> 'SYNCHRONISE';
CREATE INDEX ON operations (matiere_id, date_operation);
```

## `creuseurs`

`id` · `code` (`CR-0001`) · `nom` · `postnom` · `prenom` · `sexe ∈ ('H','F')` · `telephone` · `numero_carte_artisanale` · `date_expiration_carte` · `equipe` · `site_id` · `statut ∈ ('ACTIF','INACTIF')` · `observation`

Index de recherche rapide (nom/postnom/prénom/téléphone/n° carte) : `pg_trgm` côté serveur, index composé en minuscules sans accents côté Dexie.

## `clotures_journalieres`

`id` · `numero` (`CLO/KOL/20260909`) · `site_id` · `date_journee DATE` · `responsable_id` · `cloture_le TIMESTAMPTZ` · `statut ∈ ('CLOTUREE','REOUVERTE')` · `totaux JSONB` · `nb_operations` · `nb_non_synchronisees_a_la_cloture` · `observations` · `reouverte_le` · `reouverte_par` · `motif_reouverture`

```sql
CREATE UNIQUE INDEX ON clotures_journalieres (site_id, date_journee)
  WHERE deleted_at IS NULL;
```

`totaux` est un **snapshot figé** (QTY totale, QTY par matière, teneur moyenne/min/max, montant total, devise). Le rapport journalier réimprimé dans six mois affichera exactement les mêmes chiffres qu'au moment de la clôture, même si une correction contrôlée est intervenue depuis — la correction apparaît alors comme un avenant tracé.

## `utilisateurs`

`id` · `identifiant` · `nom_complet` · `role ∈ ('AGENT','SUPERVISEUR','ADMIN')` · `mot_de_passe_hash` (Argon2id) · `pin_hash` (Argon2id, déverrouillage hors ligne) · `site_id` · `actif`

## `devices`

`id` · `libelle` · `site_id` · `enregistre_le` · `derniere_sync` · `actif` · `revoque_le`

## `parametres`

`cle` · `valeur JSONB` · `portee ∈ ('GLOBAL','SITE')` · `site_id` (nullable) · `updated_at` · `updated_by`

Contient : identité COOMIDEC (raison sociale, adresse, logo), devise par défaut, fuseau horaire, arrondis, règles de clôture, seuils d'alerte teneur.

## `audit_logs`

`id` · `entite` · `entite_id` · `action` · `ancienne_valeur JSONB` · `nouvelle_valeur JSONB` · `utilisateur_id` · `device_id` · `survenu_le` · `motif` · `adresse_ip`

```sql
action ∈ ('CREATION','MODIFICATION','ANNULATION','CLOTURE',
          'REOUVERTURE','CORRECTION','CHANGEMENT_TARIF',
          'CONNEXION','REVOCATION_APPAREIL')
```

Table **en ajout seul** : `REVOKE UPDATE, DELETE ON audit_logs FROM app_user;`

## `sync_queue` (locale) et `idempotency_keys` (serveur)

`sync_queue` **n'existe que dans IndexedDB** — c'est l'outbox de l'appareil. La détailler côté serveur n'aurait pas de sens : le serveur n'a rien à mettre en file.

Côté serveur, l'anti-doublon repose sur :

```sql
CREATE TABLE idempotency_keys (
  cle           TEXT PRIMARY KEY,     -- "{operation_id}:{version}"
  reponse       JSONB NOT NULL,
  cree_le       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Un renvoi de la même requête retourne la réponse mémorisée sans réécrire — **TEST 2**.

## Schéma local IndexedDB (Dexie v1)

```ts
db.version(1).stores({
  operations:       'id, [site_id+date_operation], sync_status, statut, numero',
  outbox:           '++seq, entite, entite_id, statut, prochain_essai_le',
  matieres:         'id, code, actif',
  baremes:          'id, matiere_id, [matiere_id+valide_au]',
  creuseurs:        'id, code, statut, recherche',
  clotures:         'id, [site_id+date_journee]',
  sites:            'id, code',
  unites:           'id, code',
  parametres:       'cle',
  meta:             'cle'          // curseur de synchronisation, profil, PIN
});
```
