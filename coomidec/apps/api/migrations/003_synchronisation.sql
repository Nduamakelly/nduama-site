-- =====================================================================
-- COOMIDEC — support de la synchronisation incrémentale
--
-- Le tirage (pull) a besoin d'un ORDRE TOTAL des changements, valable
-- entre les tables : une tablette demande « tout ce qui a changé depuis
-- le rang N » et doit recevoir chaque ligne une fois et une seule.
-- Un horodatage ne suffirait pas — deux écritures dans la même
-- milliseconde deviendraient indiscernables et l'une serait perdue.
-- =====================================================================

CREATE SEQUENCE seq_changements;

CREATE OR REPLACE FUNCTION marquer_changement() RETURNS TRIGGER AS $$
BEGIN
  NEW.sequence_serveur := nextval('seq_changements');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sites', 'unites', 'matieres_premieres', 'baremes_teneur',
    'creuseurs', 'clotures_journalieres', 'operations', 'parametres'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN sequence_serveur BIGINT NOT NULL DEFAULT nextval(''seq_changements'')', t);
    EXECUTE format(
      'CREATE INDEX %I ON %I (sequence_serveur)', t || '_sequence', t);
    -- « aa_ » : les triggers se déclenchent par ordre alphabétique, et le
    -- marquage doit précéder les contrôles métier.
    EXECUTE format(
      'CREATE TRIGGER aa_marquer_changement BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION marquer_changement()', t);
  END LOOP;
END $$;

-- Journal des lots reçus : permet de répondre à « ai-je déjà traité ce
-- lot ? » et de diagnostiquer une tablette qui renvoie sans cesse.
CREATE TABLE lots_synchronisation (
  id            UUID PRIMARY KEY,
  device_id     UUID NOT NULL REFERENCES devices (id),
  utilisateur_id UUID REFERENCES utilisateurs (id),
  nb_recus      INTEGER NOT NULL,
  nb_appliques  INTEGER NOT NULL,
  nb_ignores    INTEGER NOT NULL,
  nb_rejetes    INTEGER NOT NULL,
  recu_le       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lots_par_appareil ON lots_synchronisation (device_id, recu_le DESC);

-- Purge des clés d'idempotence : elles n'ont d'intérêt que le temps qu'une
-- tablette puisse rejouer un envoi. 30 jours couvrent largement une mission.
CREATE INDEX idempotency_age ON idempotency_keys (cree_le);
