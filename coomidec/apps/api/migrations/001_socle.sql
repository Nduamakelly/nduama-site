-- =====================================================================
-- COOMIDEC — schéma initial
-- Conventions appliquées à toutes les tables métier :
--   id UUID (généré sur l'appareil) · created_at · updated_at · created_by
--   device_id · sync_status · version · deleted_at (suppression logique)
-- Rien n'est jamais supprimé physiquement.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;   -- requis par les contraintes EXCLUDE
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- recherche rapide des creuseurs

CREATE TYPE statut_sync     AS ENUM ('LOCAL', 'EN_ATTENTE', 'SYNCHRONISE', 'ERREUR', 'CONFLIT');
CREATE TYPE role_utilisateur AS ENUM ('AGENT', 'SUPERVISEUR', 'ADMIN');
CREATE TYPE methode_calcul   AS ENUM ('PRIX_PAR_POURCENT', 'BAREME_TRANCHES');
CREATE TYPE statut_operation AS ENUM ('BROUILLON', 'A_VALIDER', 'VALIDEE', 'ANNULEE', 'CLOTUREE', 'CORRIGEE');
CREATE TYPE statut_cloture   AS ENUM ('CLOTUREE', 'REOUVERTE');
CREATE TYPE sexe_creuseur    AS ENUM ('H', 'F');
CREATE TYPE statut_creuseur  AS ENUM ('ACTIF', 'INACTIF');
CREATE TYPE action_audit     AS ENUM (
  'CREATION', 'MODIFICATION', 'ANNULATION', 'CLOTURE', 'REOUVERTURE',
  'CORRECTION', 'CHANGEMENT_TARIF', 'CONNEXION', 'REVOCATION_APPAREIL'
);

-- --- Référentiels -----------------------------------------------------

CREATE TABLE sites (
  id            UUID PRIMARY KEY,
  code          TEXT NOT NULL,
  nom           TEXT NOT NULL,
  zea           TEXT,
  territoire    TEXT,
  province      TEXT,
  actif         BOOLEAN NOT NULL DEFAULT true,
  demonstration BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  version       INTEGER NOT NULL DEFAULT 1,
  deleted_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX sites_code_unique ON sites (code) WHERE deleted_at IS NULL;

CREATE TABLE unites (
  id          UUID PRIMARY KEY,
  code        TEXT NOT NULL,
  libelle     TEXT NOT NULL,
  decimales   SMALLINT NOT NULL DEFAULT 3 CHECK (decimales BETWEEN 0 AND 6),
  facteur_kg  NUMERIC(18, 6),
  actif       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  version     INTEGER NOT NULL DEFAULT 1,
  deleted_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX unites_code_unique ON unites (code) WHERE deleted_at IS NULL;

CREATE TABLE utilisateurs (
  id                UUID PRIMARY KEY,
  identifiant       TEXT NOT NULL,
  nom_complet       TEXT NOT NULL,
  role              role_utilisateur NOT NULL DEFAULT 'AGENT',
  mot_de_passe_hash TEXT NOT NULL,
  pin_hash          TEXT,                        -- déverrouillage hors ligne
  site_id           UUID REFERENCES sites (id),
  actif             BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID,
  version           INTEGER NOT NULL DEFAULT 1,
  deleted_at        TIMESTAMPTZ
);
CREATE UNIQUE INDEX utilisateurs_identifiant_unique ON utilisateurs (identifiant) WHERE deleted_at IS NULL;

CREATE TABLE devices (
  id            UUID PRIMARY KEY,
  libelle       TEXT NOT NULL,
  site_id       UUID NOT NULL REFERENCES sites (id),
  enregistre_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  derniere_sync TIMESTAMPTZ,
  actif         BOOLEAN NOT NULL DEFAULT true,
  revoque_le    TIMESTAMPTZ,
  revoque_par   UUID REFERENCES utilisateurs (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  version       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE matieres_premieres (
  id                 UUID PRIMARY KEY,
  code               TEXT NOT NULL,
  nom                TEXT NOT NULL,
  unite_id           UUID NOT NULL REFERENCES unites (id),
  methode_calcul     methode_calcul NOT NULL,
  -- Décision D4 : valeur d'un point de teneur (cuivre 1 % = 140 USD).
  prix_par_pourcent  NUMERIC(18, 4),
  pct_cout_defaut    NUMERIC(9, 6) NOT NULL DEFAULT 1,
  formule            TEXT,          -- vide ⇒ formule par défaut de la méthode
  devise             TEXT NOT NULL DEFAULT 'USD',
  decimales_montant  SMALLINT NOT NULL DEFAULT 2 CHECK (decimales_montant BETWEEN 0 AND 6),
  actif              BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES utilisateurs (id),
  version            INTEGER NOT NULL DEFAULT 1,
  deleted_at         TIMESTAMPTZ,
  -- La méthode A est inutilisable sans son prix de référence.
  CONSTRAINT prix_requis_en_methode_a CHECK (
    methode_calcul <> 'PRIX_PAR_POURCENT' OR prix_par_pourcent IS NOT NULL
  )
);
CREATE UNIQUE INDEX matieres_code_unique ON matieres_premieres (code) WHERE deleted_at IS NULL;

-- --- Barèmes : historisés, en ajout seul ------------------------------

CREATE TABLE baremes_teneur (
  id              UUID PRIMARY KEY,
  matiere_id      UUID NOT NULL REFERENCES matieres_premieres (id),
  teneur_min      NUMERIC(6, 3) NOT NULL,
  teneur_max      NUMERIC(6, 3) NOT NULL,
  cout_unitaire   NUMERIC(18, 4) NOT NULL,
  pct_cout        NUMERIC(9, 6) NOT NULL DEFAULT 1,
  devise          TEXT NOT NULL DEFAULT 'USD',
  valide_du       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valide_au       TIMESTAMPTZ,                     -- NULL ⇒ tranche active
  version_bareme  INTEGER NOT NULL DEFAULT 1,
  motif           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES utilisateurs (id),
  CONSTRAINT bornes_ordonnees CHECK (teneur_min < teneur_max),
  CONSTRAINT periode_ordonnee CHECK (valide_au IS NULL OR valide_au > valide_du)
);

-- Bornes semi-ouvertes [min, max) : « 2 » n'est plus disputé par 0–2 et 2–5.
-- Deux tranches de la même matière ne peuvent se chevaucher qu'à condition
-- d'être valides sur des périodes disjointes.
ALTER TABLE baremes_teneur ADD CONSTRAINT baremes_sans_chevauchement
  EXCLUDE USING gist (
    matiere_id WITH =,
    numrange(teneur_min, teneur_max, '[)') WITH &&,
    tstzrange(valide_du, valide_au, '[)')  WITH &&
  );

CREATE INDEX baremes_actifs ON baremes_teneur (matiere_id) WHERE valide_au IS NULL;

-- Un tarif ne se modifie jamais en place : on ferme la ligne, on en ouvre
-- une nouvelle. Seule la fermeture (valide_au) est autorisée en UPDATE.
CREATE OR REPLACE FUNCTION baremes_append_only() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.valide_au IS NOT NULL THEN
    RAISE EXCEPTION 'Tranche % déjà fermée : un tarif historisé est immuable.', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.matiere_id, NEW.teneur_min, NEW.teneur_max, NEW.cout_unitaire,
      NEW.pct_cout, NEW.devise, NEW.valide_du, NEW.version_bareme)
     IS DISTINCT FROM
     (OLD.matiere_id, OLD.teneur_min, OLD.teneur_max, OLD.cout_unitaire,
      OLD.pct_cout, OLD.devise, OLD.valide_du, OLD.version_bareme) THEN
    RAISE EXCEPTION 'Un barème ne se modifie pas en place : fermez la tranche et créez-en une nouvelle.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER baremes_append_only_trigger
  BEFORE UPDATE ON baremes_teneur
  FOR EACH ROW EXECUTE FUNCTION baremes_append_only();

CREATE RULE baremes_pas_de_suppression AS
  ON DELETE TO baremes_teneur DO INSTEAD NOTHING;

-- --- Paramètres -------------------------------------------------------

CREATE TABLE parametres (
  cle         TEXT NOT NULL,
  portee      TEXT NOT NULL DEFAULT 'GLOBAL' CHECK (portee IN ('GLOBAL', 'SITE')),
  site_id     UUID REFERENCES sites (id),
  valeur      JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES utilisateurs (id),
  CONSTRAINT site_requis_si_portee_site CHECK (
    (portee = 'GLOBAL' AND site_id IS NULL) OR (portee = 'SITE' AND site_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX parametres_cle_globale ON parametres (cle) WHERE site_id IS NULL;
CREATE UNIQUE INDEX parametres_cle_site    ON parametres (cle, site_id) WHERE site_id IS NOT NULL;

-- --- Journal d'audit : en ajout seul ---------------------------------

CREATE TABLE audit_logs (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entite           TEXT NOT NULL,
  entite_id        UUID,
  action           action_audit NOT NULL,
  ancienne_valeur  JSONB,
  nouvelle_valeur  JSONB,
  utilisateur_id   UUID REFERENCES utilisateurs (id),
  device_id        UUID REFERENCES devices (id),
  motif            TEXT,
  adresse_ip       INET,
  survenu_le       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_entite ON audit_logs (entite, entite_id, survenu_le DESC);

CREATE RULE audit_pas_de_modification AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_pas_de_suppression  AS ON DELETE TO audit_logs DO INSTEAD NOTHING;
