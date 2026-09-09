-- =====================================================================
-- COOMIDEC — opérations, creuseurs, clôtures, idempotence
-- =====================================================================

CREATE TABLE creuseurs (
  id                      UUID PRIMARY KEY,
  code                    TEXT NOT NULL,            -- CR-0001
  nom                     TEXT NOT NULL,
  postnom                 TEXT,
  prenom                  TEXT,
  sexe                    sexe_creuseur,
  telephone               TEXT,
  numero_carte_artisanale TEXT,
  date_expiration_carte   DATE,
  equipe                  TEXT,
  site_id                 UUID NOT NULL REFERENCES sites (id),
  statut                  statut_creuseur NOT NULL DEFAULT 'ACTIF',
  observation             TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              UUID REFERENCES utilisateurs (id),
  device_id               UUID REFERENCES devices (id),
  sync_status             statut_sync NOT NULL DEFAULT 'SYNCHRONISE',
  version                 INTEGER NOT NULL DEFAULT 1,
  deleted_at              TIMESTAMPTZ
);
CREATE UNIQUE INDEX creuseurs_code_unique ON creuseurs (code) WHERE deleted_at IS NULL;
CREATE INDEX creuseurs_site_statut ON creuseurs (site_id, statut) WHERE deleted_at IS NULL;
-- Recherche rapide par nom, postnom, prénom, téléphone ou n° de carte.
CREATE INDEX creuseurs_recherche ON creuseurs USING gin (
  (coalesce(nom, '') || ' ' || coalesce(postnom, '') || ' ' || coalesce(prenom, '') || ' ' ||
   coalesce(telephone, '') || ' ' || coalesce(numero_carte_artisanale, '')) gin_trgm_ops
);

CREATE TABLE clotures_journalieres (
  id                              UUID PRIMARY KEY,
  numero                          TEXT NOT NULL,     -- CLO/KOL/20260909
  site_id                         UUID NOT NULL REFERENCES sites (id),
  date_journee                    DATE NOT NULL,
  responsable_id                  UUID NOT NULL REFERENCES utilisateurs (id),
  cloture_le                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  statut                          statut_cloture NOT NULL DEFAULT 'CLOTUREE',
  -- Snapshot figé : le rapport réimprimé dans six mois affiche les mêmes chiffres.
  totaux                          JSONB NOT NULL,
  nb_operations                   INTEGER NOT NULL,
  nb_non_synchronisees_a_la_cloture INTEGER NOT NULL DEFAULT 0,
  observations                    TEXT,
  reouverte_le                    TIMESTAMPTZ,
  reouverte_par                   UUID REFERENCES utilisateurs (id),
  motif_reouverture               TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                      UUID REFERENCES utilisateurs (id),
  device_id                       UUID REFERENCES devices (id),
  sync_status                     statut_sync NOT NULL DEFAULT 'SYNCHRONISE',
  version                         INTEGER NOT NULL DEFAULT 1,
  deleted_at                      TIMESTAMPTZ,
  CONSTRAINT motif_requis_a_la_reouverture CHECK (
    statut <> 'REOUVERTE' OR (motif_reouverture IS NOT NULL AND reouverte_par IS NOT NULL)
  )
);
-- Une seule clôture par site et par jour : la première arrivée gagne.
CREATE UNIQUE INDEX clotures_site_jour_unique
  ON clotures_journalieres (site_id, date_journee) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX clotures_numero_unique
  ON clotures_journalieres (numero) WHERE deleted_at IS NULL;

CREATE TABLE operations (
  id                UUID PRIMARY KEY,               -- généré sur l'appareil
  numero            TEXT NOT NULL,                  -- COOMIDEC/KOL/20260909/A7F3-014
  site_id           UUID NOT NULL REFERENCES sites (id),
  date_operation    DATE NOT NULL,                  -- journée métier, heure locale du site
  heure             TIME NOT NULL,
  responsable_id    UUID NOT NULL REFERENCES utilisateurs (id),
  -- Décision D8 : chaque opération est nominative.
  creuseur_id       UUID NOT NULL REFERENCES creuseurs (id),
  equipe            TEXT,

  matiere_id        UUID NOT NULL REFERENCES matieres_premieres (id),
  qty               NUMERIC(18, 3) NOT NULL CHECK (qty >= 0),
  unite_id          UUID NOT NULL REFERENCES unites (id),
  teneur            NUMERIC(6, 3) NOT NULL CHECK (teneur >= 0),
  observation       TEXT,
  signature_blob    BYTEA,

  -- Snapshot de calcul figé à l'enregistrement, jamais recalculé (TEST 3).
  montant           NUMERIC(18, 2),
  devise            TEXT NOT NULL DEFAULT 'USD',
  calcul            JSONB NOT NULL,

  statut            statut_operation NOT NULL DEFAULT 'VALIDEE',
  motif_annulation  TEXT,
  cloture_id        UUID REFERENCES clotures_journalieres (id),
  verrouillee       BOOLEAN NOT NULL DEFAULT false,

  heure_appareil    TIMESTAMPTZ NOT NULL,
  heure_serveur     TIMESTAMPTZ NOT NULL DEFAULT now(),
  decalage_horloge_ms BIGINT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID NOT NULL REFERENCES utilisateurs (id),
  device_id         UUID NOT NULL REFERENCES devices (id),
  sync_status       statut_sync NOT NULL DEFAULT 'SYNCHRONISE',
  version           INTEGER NOT NULL DEFAULT 1,
  deleted_at        TIMESTAMPTZ,

  CONSTRAINT motif_requis_a_l_annulation CHECK (
    statut <> 'ANNULEE' OR motif_annulation IS NOT NULL
  ),
  CONSTRAINT cloture_requise_si_cloturee CHECK (
    statut <> 'CLOTUREE' OR cloture_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX operations_numero_unique
  ON operations (site_id, date_operation, numero) WHERE deleted_at IS NULL;
CREATE INDEX operations_journee     ON operations (site_id, date_operation) WHERE deleted_at IS NULL;
CREATE INDEX operations_a_synchroniser ON operations (sync_status) WHERE sync_status <> 'SYNCHRONISE';
CREATE INDEX operations_matiere     ON operations (matiere_id, date_operation);
CREATE INDEX operations_creuseur    ON operations (creuseur_id, date_operation);  -- ventilation D8

-- Une opération verrouillée ne se modifie que par la procédure de correction
-- contrôlée, qui lève explicitement le drapeau le temps de l'écriture.
CREATE OR REPLACE FUNCTION operations_verrou() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.verrouillee AND NEW.verrouillee
     AND current_setting('coomidec.correction_autorisee', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION
      'Opération % clôturée : une modification exige la procédure de correction contrôlée.', OLD.numero
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER operations_verrou_trigger
  BEFORE UPDATE ON operations
  FOR EACH ROW EXECUTE FUNCTION operations_verrou();

-- --- Anti-rejeu de la synchronisation --------------------------------

CREATE TABLE idempotency_keys (
  cle      TEXT PRIMARY KEY,          -- "{operation_id}:{version}"
  reponse  JSONB NOT NULL,
  cree_le  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idempotency_purge ON idempotency_keys (cree_le);
