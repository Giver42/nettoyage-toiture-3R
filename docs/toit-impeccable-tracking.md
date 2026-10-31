# Avis de la variante Toit impeccable

## Vues et avis uniques

Toutes les cartes `.lp-google-review` sont observees, dans toutes les sections.
Une vue exige au moins 60 % de la surface visible pendant 800 ms continus,
onglet visible et sans formulaire superpose. Masquer l'onglet ou ouvrir un
formulaire annule les confirmations en attente.

`cro_review_view` transmet `review_id`, `review_position`, `section_id` et
`reviews_seen_unique_count`. Le compteur est cumulatif pour le chargement de
page courant ; ne pas sommer ses instantanes. Recharger remet le compteur a zero.

L'identite est le nom d'auteur normalise, coherent avec les IDs deja transmis
par cette page. Christian M apparait deux fois : ses deux cartes ont le meme ID
`christian_m` et ne comptent qu'une fois. Sept emplacements representent donc
six avis distincts. Les timers sont propres a chaque emplacement pour qu'une
carte masquee ne puisse pas annuler la confirmation d'une autre du meme auteur.

Cette convention suppose un avis par auteur sur cette page. Si deux avis
distincts d'un meme auteur sont ajoutes, definir des IDs explicites distincts.
`review_position` est la position globale de la carte dans la page, a partir de 1.
Le second affichage d'un avis deja vu n'emet pas une nouvelle vue.

## Ouvertures et durees

Le script de presentation reste seul responsable de Voir plus / Voir moins.
`assets/content-tracking.js` observe les transitions reelles de `aria-expanded`
sans ajouter un second gestionnaire de clic ni fermer les autres cartes.

- `cro_content_expand` : `content_type=review`, ID stable dans `content_id`,
  `section_id` de la carte, `content_position`, `content_open_index`,
  `content_open_type=first|reopen`, `content_engagement_time=null`.
- `cro_content_time` : memes identifiants et delta positif en millisecondes.
- L'index d'ouverture est propre a chaque carte pendant le chargement courant.
- Les deux occurrences de Christian M partagent l'ID d'avis, mais les contextes
  section/position distinguent leurs ouvertures et leurs temps.

La zone verticale et le seuil de recouvrement sont ceux du module existant :
35-50 % de hauteur de fenetre a partir de 64rem, sinon 25-40 %, avec au moins
40 % de recouvrement de la plus petite hauteur entre detail et zone. Aucun
minimum de quatre secondes pour ce temps. La regle du centre horizontal du
carrousel reste reservee aux cartes du carrousel historique ; une carte statique
de la variante n'a pas a traverser le centre horizontal de la fenetre.

Sortie de zone, fermeture, onglet masque, formulaire et sortie de page suspendent
la mesure et transmettent seulement le temps non encore envoye. Une simple pause
ne cree pas une reouverture. Additionner les deltas, pas le nombre d'evenements.

## Portee de verification

Verification navigateur locale sur mobile et ordinateur : sept cartes, six IDs,
deduplication, retours, confirmation 800 ms, ouvertures/reouvertures, durees,
pause onglet/formulaire, contextes des sections et remise a zero au rechargement.
Les tests existants du module contenu couvrent aussi le comportement historique.

Ces controles prouvent les emissions dans dataLayer, pas leur reception GA4.
Conserver un seul chemin GTM pour chaque evenement. Le compteur est emis sur
`cro_review_view` ; cette correction ne l'ajoute pas aux clics CTA ou aux leads.
