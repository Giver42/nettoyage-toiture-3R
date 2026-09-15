# Etape 5 : ouvertures et temps de consultation

## Fonctionnement implemente

- Risques, avis developpes et reponses FAQ : chaque ouverture volontaire produit
  `cro_content_expand`, y compris les reouvertures.
- Une seule ouverture par groupe (risk, review, faq). Ouvrir un autre element du
  meme groupe ferme le precedent, sans fermer les elements des autres groupes.
- Le texte du detail doit recouvrir au moins 40% de la plus petite hauteur entre
  sa propre hauteur et la zone de lecture.
- Zone ordinateur (largeur >= 64rem) : 35% a 50% de la hauteur de la fenetre.
- Zone mobile (<64rem) : 25% a 40% de la hauteur de la fenetre.
- Pour les avis, la carte doit aussi traverser le centre horizontal de la zone visible du carrousel (pas celui de la fenetre),
  a l'interieur de la partie visible du carrousel.
- Aucun seuil temporel : meme une consultation inferieure a 4 secondes compte.
- Le temps concerne le detail ouvert, pas le titre ni le bouton.
- Hors de la zone, onglet masque ou formulaire recouvrant la page : pause du
  compteur. Le contenu reste ouvert ; sa reapparition reprend la meme ouverture.
- Fermeture manuelle ou ouverture d'un autre contenu du groupe : fin de l'ouverture.
- Chaque pause/fermeture envoie `cro_content_time` avec uniquement les millisecondes
  non encore envoyees. Le total est la somme de ces increments.
- `content_open_index` vaut 1, 2, 3, etc. pour chaque contenu ; `content_open_type`
  vaut first pour 1, reopen ensuite. Un rechargement remet ces compteurs a zero.
- Aucun evenement de fermeture separe. Aucun envoi de duree nulle.
- La presence dans la zone est un indicateur de consultation, pas une preuve de lecture.

## 1. Variables GTM

Conteneur : GTM-PMPVH6W9. Reutiliser la variable existante qui lit `section_id`.

Le fichier `gtm-content-dlv.json`, dans le dossier parent du depot, contient les
six variables suivantes. Il ne contient ni balise ni declencheur.

| Nom affiche de la DLV | Nom de variable de couche de donnees |
| --- | --- |
| DLV - content_type | content_type |
| DLV - content_id | content_id |
| DLV - content_position | content_position |
| DLV - content_open_type | content_open_type |
| DLV - content_open_index | content_open_index |
| DLV - content_engagement_time | content_engagement_time |

Toutes sont de type Variable de couche de donnees, Version 2, sans valeur par defaut.
Reutiliser une variable existante lisant la meme cle plutot que creer un doublon.

Pour importer : Administration > Importer un conteneur > choisir le fichier >
espace de travail actuel > Fusionner > Remplacer les variables en conflit.
Verifier l'apercu : seulement des variables ajoutees/modifiees, aucune suppression.
Ne pas choisir le remplacement complet du conteneur. Confirmer l'import.

## 2. Declencheur GTM

Declencheurs > Nouveau :

- Nom : CE - cro_content
- Type : Evenement personnalise
- Nom de l'evenement : `^cro_content_(expand|time)$`
- Utiliser une expression reguliere : coche
- Declenchement : Tous les evenements personnalises

Ne pas ajouter un declencheur de clic ou de visibilite GTM : la page gere ces regles.

## 3. Balise GA4

Modifier une balise de contenus deja existante si elle existe. Sinon, creer :

- Nom : GA4 - cro_content
- Type : Google Analytics : Evenement GA4
- ID de mesure : variable GA4 existante commencant par G-, pas AW-.
- Nom de l'evenement : `{{Event}}` (variable integree Evenement).
- Si Event n'apparait pas : Variables > Variables integrees > Configurer > Evenement.
- Declenchement : CE - cro_content.
- Parametres avances > Options de declenchement : Une fois par evenement.

| Parametre envoye a GA4 | Valeur GTM |
| --- | --- |
| section_id | {{DLV - section_id}} |
| content_type | {{DLV - content_type}} |
| content_id | {{DLV - content_id}} |
| content_position | {{DLV - content_position}} |
| content_open_type | {{DLV - content_open_type}} |
| content_open_index | {{DLV - content_open_index}} |
| content_engagement_time | {{DLV - content_engagement_time}} |

Garder les parametres communs de page et de visite deja valides, une seule fois.
Ne pas recopier les parametres CTA dans cette balise.
Si une balise generique envoie deja ces evenements, la reutiliser OU exclure ces
deux noms de son declencheur. Il doit exister un seul chemin d'envoi vers GA4.

Sur cro_content_expand, la duree est explicitement null : cela efface la valeur
precedente dans le modele GTM et evite de reutiliser une ancienne duree. Une
duree positive est fournie uniquement sur cro_content_time.

## 4. Definitions personnalisees GA4

Administration > Affichage des donnees > Definitions personnalisees.
La dimension existante associee a section_id est reutilisee.
Creer les cinq dimensions suivantes, de portee Evenement. Mettre le nom exact
dans les champs Nom de la dimension ET Parametre d'evenement.

| Nom / parametre | Description |
| --- | --- |
| content_type | Categorie du contenu consulte : risk, review ou faq. |
| content_id | Identifiant du risque, de l'avis ou de la reponse FAQ. |
| content_position | Position dans le groupe de contenus, a partir de 1. |
| content_open_type | Premiere ouverture : first ; reouverture : reopen. |
| content_open_index | Numero d'ouverture de ce contenu pendant le chargement de page actuel. |

Puis Metriques personnalisees > Creer :

- Nom : content_engagement_time
- Parametre d'evenement : content_engagement_time
- Unite : Millisecondes
- Description : Duree supplementaire de consultation du detail ouvert dans la
  zone de lecture, onglet visible. Les valeurs s'additionnent sans double comptage.

Il ne faut pas creer de metrique de compteur d'ouvertures : Nombre d'evenements
filtre sur cro_content_expand donne ce compteur.

## 5. Verification

Apres publication du code sur le site utilise pour tester :

1. GTM > Previsualiser > connecter le site.
2. Ouvrir Voir le detail du premier risque : un cro_content_expand avec first et 1.
3. Placer le detail dans la zone de lecture puis attendre environ 2 secondes.
4. Defiler hors de la zone : cro_content_time positif ; le detail reste ouvert.
5. Revenir au detail, attendre puis le fermer : nouveau temps avec index 1.
6. Le rouvrir : cro_content_expand avec reopen et index 2.
7. Ouvrir un autre risque : le premier se ferme, le second a son propre index 1.
8. Tester la FAQ de la meme facon.
9. Pour un avis developpe, centrer sa carte horizontalement ET son texte dans la
   zone verticale. Le compteur s'arrete si le carrousel retire la carte du centre.
10. Masquer puis reafficher l'onglet : le temps masque est exclu et l'index reste le meme.
11. Dans Tag Assistant : un seul declenchement GA4 pour chaque evenement, valeurs
    exactes dans Variables et dans la balise. Une ouverture sans duree est normale.
12. Verifier les deux evenements dans GA4 DebugView. Puis publier la configuration
    GTM validee. Les tests locaux ne prouvent pas la reception dans GA4.

## 6. Explorations GA4

- Ouvertures : filtrer Nom de l'evenement = cro_content_expand ; lignes content_type
  et content_id ; colonnes content_open_type ; valeurs Nombre d'evenements et
  Nombre total d'utilisateurs.
- Temps : filtrer Nom de l'evenement = cro_content_time ; lignes content_type et
  content_id ; colonnes content_open_index ; valeur SOMME de content_engagement_time.
- Pour toutes les reouvertures : filtre content_open_type = reopen.
- Ne pas utiliser le nombre de cro_content_time comme nombre d'ouvertures : une
  ouverture peut comporter plusieurs segments de consultation.
- Les durées ne sont disponibles que pour les evenements effectivement recus.

## Verification du code

`node --test tests/section-time.test.cjs tests/content-time.test.cjs`

Le test navigateur utilise Playwright et Chrome :
`node tests/content-browser.cjs <chemin-du-module-playwright> <chemin-de-chrome>`
