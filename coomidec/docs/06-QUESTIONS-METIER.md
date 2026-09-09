# F — Risques et questions métier à valider

Classement par impact. **Bloquant** = le développement du module concerné ne peut pas commencer sans réponse.

---

## Bloquantes

### Q4 — Que signifie exactement `% COÛT` ? *(bloquant — moteur de calcul)*

La colonne `PARAMETRES!H` multiplie le montant, mais rien dans le fichier n'en donne la définition. Trois lectures possibles, aux conséquences comptables très différentes :

- une **part revenant à la coopérative** sur la valeur du minerai ;
- un **rendement / taux de récupération** technique ;
- une **décote qualité** appliquée au prix de référence.

Sans cette définition, l'intitulé du rapport journalier et le traitement comptable ne peuvent pas être écrits correctement.

### Q5 — « Coût » ou « valeur » ? *(bloquant — rapports)*

Le fichier dit `COÛT CALCULÉ`. S'agit-il de ce que **COOMIDEC paie** au creuseur pour le minerai, ou de la **valeur estimée** de la production ? Le même nombre ne se lit pas de la même façon dans un rapport de production et dans un journal de trésorerie.

### Q1 — Teneur moyenne : arithmétique ou pondérée par la QTY ? *(bloquant — rapports, tableau de bord)*

Le fichier calcule `SUMIF(teneur)/COUNTIF` — une **moyenne arithmétique simple**. Pour du minerai, c'est statistiquement faux : une opération de 0,5 t à 8 % pèse autant qu'une opération de 40 t à 2 %.

**Recommandation** : la teneur moyenne du site devient la **moyenne pondérée par la QTY** (`Σ(qty × teneur) / Σ qty`), et la moyenne arithmétique reste affichée à côté, explicitement libellée, pour la continuité avec le fichier Excel.

### Q8 — Une opération est-elle rattachée à un creuseur ? *(bloquant — modèle de données)*

Le fichier Excel n'établit **aucun lien** entre `BASE CREUSEURS` et `SAISIE JOURNALIERE`. Une opération correspond-elle :

- à un **creuseur** (donc base d'une rémunération individuelle) ?
- à une **équipe** ?
- à un **lot / camion / sac** sans attribution nominative ?

La réponse détermine si `creuseur_id` est obligatoire, facultatif ou inutile — et si l'application devient un outil de paie, ce qui change son périmètre.

---

## Importantes

### Q2 — Tranches qui se chevauchent

Dans le fichier, les bornes sont inclusives des deux côtés et `LOOKUP(2, 1/…)` retient **la dernière** ligne correspondante, sans avertir. **Recommandation appliquée par défaut** : intervalles `[min, max)`, chevauchement interdit à la configuration, contrôle visuel dans l'écran Barèmes. À confirmer.

### Q3 — Teneur hors de toute tranche

Excel enregistre sans montant et sans alerte. **Recommandation** : avertissement orange `HORS BARÈME`, enregistrement autorisé avec le statut `À VALIDER`, blocage de la clôture tant qu'il en reste. Faut-il au contraire **interdire** l'enregistrement ?

### Q6 — Unités et conversions

Le fichier n'a pas de colonne d'unité. En quoi la QTY est-elle exprimée : tonnes, kilogrammes, sacs, colis ? Faut-il gérer une **conversion** (par exemple sacs → kg) et, si oui, avec quel facteur, et ce facteur est-il constant ?

### Q7 — Multi-site

Un fichier Excel = un site. L'application est multi-site. Un agent voit-il **uniquement son site** ? Qui consolide plusieurs sites ? Le tableau de bord doit-il proposer un total groupe ?

### Q9 — Devise

USD, CDF, ou les deux ? En cas de bi-devise, faut-il un **taux de change figé dans le snapshot** de chaque opération ? (Fortement recommandé si la réponse est « les deux ».)

### Q10 — Clôturer avec des opérations non synchronisées

**Recommandation** : autoriser, mais marquer le rapport `PROVISOIRE` en filigrane et enregistrer le nombre d'opérations non synchronisées dans la clôture. Faut-il au contraire **bloquer** la clôture ?

### Q11 — Qui autorise une réouverture ?

Rôle `ADMIN` seul ? Faut-il une **double validation** (deux personnes) ? Une fenêtre de temps maximale (par exemple 7 jours après la clôture) ?

### Q13 — Carte artisanale expirée

Une opération peut-elle être attribuée à un creuseur dont la carte est périmée ? **Recommandation** : avertissement visible, enregistrement autorisé, mention dans le rapport. Blocage strict s'il existe une obligation réglementaire.

### Q17 — Formule exacte de la méthode « prix par 1 % »

Votre exemple s'arrête à `valeurTeneur = 3 × 120 = 360 USD`. La formule finale est-elle `QTY × valeurTeneur` (`= 12,5 × 360 = 4 500 USD`) ou autre chose ? Le `% coût` s'applique-t-il aussi dans cette méthode ?

---

## À arbitrer plus tard

### Q12 — Signature

Signature de l'agent, du creuseur, ou des deux ? A-t-elle une **valeur probante** en cas de litige — ce qui imposerait un horodatage renforcé et une empreinte cryptographique ?

### Q14 — Bornes de la journée

Une « journée » va-t-elle de minuit à minuit, ou suit-elle des **postes de travail** (par exemple 6 h → 6 h) ? Une opération saisie à 23 h 45 appartient à quelle journée ?

### Q15 — Perte d'un appareil

Une tablette perdue avant synchronisation emporte ses données. **Recommandations** : politique de synchronisation quotidienne obligatoire, alerte à partir de 24 h sans synchronisation, chiffrement des données locales au repos, et export manuel de la file de secours.

### Q16 — Données personnelles des creuseurs

Nom, téléphone, numéro de carte artisanale sont des **données à caractère personnel**. Durée de conservation ? Qui peut les consulter et les exporter ? Une politique explicite est nécessaire.

### Q18 — Volumétrie réelle

Combien d'opérations par jour et par site ? Combien de sites, de tablettes, d'utilisateurs simultanés ? La réponse conditionne le dimensionnement du serveur et les stratégies de pagination.

### Q19 — Qualité de la connectivité

2G, 3G, satellite, ou synchronisation uniquement au retour au bureau ? Si la connexion n'est disponible qu'une fois par jour, la taille des lots et la stratégie de temporisation doivent être ajustées.

### Q20 — Reprise de l'historique

Le classeur fourni est **vide**. Existe-t-il d'autres fichiers Excel contenant des opérations déjà saisies à importer ? Si oui, sur quelle profondeur d'historique ?
