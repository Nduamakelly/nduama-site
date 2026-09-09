# C — Écrans

## Contraintes d'ergonomie terrain

Tablette Android 10 pouces, tenue à une main, souvent en plein soleil, parfois avec des gants ou les doigts poussiéreux.

| Règle | Valeur |
|---|---|
| Cible tactile minimale | 64 × 64 px (boutons principaux : 96 px de haut) |
| Taille de texte minimale | 16 px ; valeurs numériques 24 px |
| Contraste | ≥ 7:1 (lisibilité en extérieur) |
| Clics pour enregistrer une opération | **4** au maximum |
| Champs à saisir par défaut | 3 (matière, QTY, teneur) — le reste est prérempli |
| Confirmation | bandeau plein écran 1,5 s + vibration courte |

Pas d'ouverture de clavier alphabétique pour les nombres : pavé numérique intégré à l'écran, gros chiffres.

---

## 1. Écran d'accueil

Bandeau permanent en haut :

```
COOMIDEC · Site KOLWEZI / ZEA-04     lun. 9 septembre 2026
Responsable : MUKENDI Joseph     ● HORS LIGNE     7 en attente
```

L'indicateur de connexion est un **point de couleur + un mot**, jamais une couleur seule (lisibilité et daltonisme).

Huit grands boutons, deux colonnes :

`NOUVELLE SAISIE` (pleine largeur, dominant) · `OPÉRATIONS DU JOUR` · `CLÔTURE JOURNALIÈRE` · `RAPPORT` · `TABLEAU DE BORD` · `CREUSEURS` · `PARAMÈTRES` · `SYNCHRONISATION`

Les tuiles portent un compteur quand c'est utile : `OPÉRATIONS DU JOUR · 23`, `SYNCHRONISATION · 7 en attente`.
`PARAMÈTRES` est masqué pour le rôle `AGENT`.

## 2. Nouvelle saisie

Un seul écran, pas d'assistant multi-étapes.

**Préremplis, non saisis** : numéro, date, heure, site, responsable, devise.

**Saisis** :
1. **Matière première** — grosses tuiles (Cuivre, Cobalt, …), pas de liste déroulante.
2. **QTY** + unité — pavé numérique ; l'unité vient de la matière, modifiable si plusieurs sont autorisées.
3. **Teneur (%)** — pavé numérique.
4. *(optionnel)* Creuseur — recherche instantanée par nom ou n° de carte.
5. *(optionnel)* Observation, signature.

**Bandeau de calcul en direct**, sous les champs, mis à jour à chaque frappe :

```
Barème appliqué   3,00 – 4,00 %      Coût/unité   120,00 USD      % coût   85 %
MONTANT                                                       1 275,00 USD
```

Trois états visibles de ce bandeau : *calculé* · *hors barème* (avertissement orange, enregistrement possible avec statut `À VALIDER`) · *incomplet*.

Actions : `ENREGISTRER` · `ENREGISTRER ET NOUVELLE SAISIE` · `ANNULER`.

`ENREGISTRER` écrit dans IndexedDB **avant** d'afficher la confirmation, et n'attend jamais le réseau.

## 3. Opérations du jour

Tableau dense mais lisible : `N°` · `Heure` · `Matière` · `QTY` · `Teneur` · `Coût/unité` · `Montant` · `Responsable` · `Sync` · `Statut`.

- Recherche libre + filtres (matière, statut, synchronisation, responsable).
- Bandeau de totaux figé en bas : nombre, QTY totale, montant total.
- Appui sur une ligne → fiche détail avec l'**intégralité du snapshot de calcul** (barème utilisé, formule, version du moteur).
- `MODIFIER` : possible tant que la journée n'est pas clôturée ; produit une entrée d'audit avec ancienne et nouvelle valeur.
- `ANNULER` : **motif obligatoire**. L'opération reste visible, barrée, statut `ANNULÉE`, exclue des totaux. Aucune suppression.

## 4. Clôture journalière

**Écran de pré-clôture** — récapitulatif avant confirmation :

nombre d'opérations · QTY totale · QTY par matière · teneur moyenne (pondérée **et** arithmétique, voir Q1) · teneur min · teneur max · montant total · **opérations non synchronisées** · observations et incidents du jour.

Blocages : aucune opération en statut `BROUILLON`, aucune opération `HORS BARÈME` non validée.

Avertissement (non bloquant, à arbitrer — Q10) : *« 7 opérations ne sont pas encore synchronisées. Le rapport sera marqué PROVISOIRE. »*

Confirmation explicite : saisie du nom du responsable, pas un simple « OK ».

Après clôture : numéro de clôture, horodatage, verrouillage des opérations, génération du rapport.

## 5. Rapport journalier

Rendu A4 portrait, en-tête COOMIDEC (logo, raison sociale, site/ZEA, date).

Corps : identification · indicateurs · détail par matière première · teneur moyenne/min/max · montant total · observations · heure de clôture · emplacements de signature (responsable de site, chef de poste).

Pied de page : numéro de clôture, `Page n/N`, mention `PROVISOIRE` en filigrane si des opérations restaient non synchronisées.

Actions : `APERÇU` · `PDF` · `IMPRIMER`.

Le PDF est généré **localement** (pdf-lib), donc disponible hors ligne — la génération côté serveur serait indisponible précisément quand on en a besoin.

## 6. Tableau de bord

Ligne d'indicateurs du jour : nombre d'opérations · QTY totale · teneur moyenne · montant total · non synchronisées.

Filtres : jour / semaine / mois / période personnalisée · site · matière première.

Quatre graphiques simples : évolution de la QTY · évolution de la teneur · production par matière · valeur/coût par période.

Hors ligne, le tableau de bord calcule sur les données locales et l'indique clairement : *« Données locales de cet appareil »*.

## 7. Creuseurs

Recherche instantanée (nom, postnom, prénom, téléphone, n° de carte). Fiche complète, création et modification.

**Alerte carte artisanale** : pastille orange à 30 jours de l'expiration, rouge après échéance. Le comportement à la saisie d'une opération reste à trancher (Q13).

## 8. Paramètres

Sections : COOMIDEC · Sites / ZEA · Unités · Matières premières · **Barèmes de teneur** · Formules de calcul · Utilisateurs et rôles · Appareils · Devise · Règles de clôture · Sauvegarde / restauration.

L'écran **Barèmes** est le plus sensible de l'application :

- édition par matière, tranches affichées bout à bout sur une règle graphique de 0 à 100 % ;
- **détection immédiate** des chevauchements et des trous ;
- **simulateur intégré** : « teneur = 3,2 % → tranche 3–4 %, coût 120 USD, % coût 85 % » ;
- toute modification demande un **motif**, ferme l'ancienne ligne et en ouvre une nouvelle ;
- avertissement explicite : *« Les opérations déjà enregistrées ne seront pas recalculées. »*

## 9. Synchronisation

Trois listes : `EN ATTENTE` · `EN ERREUR` · `SYNCHRONISÉES (24 h)`.

Pour chaque élément : numéro, horodatage, nombre de tentatives, message d'erreur lisible, date du prochain essai.

Actions : `SYNCHRONISER MAINTENANT` · `Réessayer` (unitaire) · `EXPORTER LA FILE` (fichier JSON de secours, pour un appareil qui ne parvient plus à joindre le serveur).

## Codes couleur d'état

| État | Couleur | Libellé affiché |
|---|---|---|
| Synchronisé | vert | `SYNCHRONISÉ` |
| En attente | ambre | `EN ATTENTE DE SYNCHRONISATION` |
| En erreur | rouge | `ERREUR DE SYNCHRONISATION` |
| Clôturé / verrouillé | gris ardoise | `CLÔTURÉE` |
| Annulé | rouge barré | `ANNULÉE` |
| Hors barème | orange | `HORS BARÈME` |

Le mot accompagne toujours la couleur.
