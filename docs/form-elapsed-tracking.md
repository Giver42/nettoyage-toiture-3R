# Temps ecoule dans les formulaires

## Regles

- Formulaires : bilan et estimation. Une page = une etape du formulaire.
- Horloge de duree ecoulee : le temps dans un autre onglet compte.
- Aucun seuil minimum. Attente Turnstile et requete d'envoi incluse dans contact.
- Fermeture du formulaire et confirmation de succes : arret du compteur.
- Retours et reouvertures : nouvelles durees additives, sans inclure les periodes fermees.
- Rechargement : nouveau contexte. Pagehide suspend ; restauration BFCache reprend
  sans compter le temps ou la page avait ete quittee.
- Envoi de deltas lors des transitions, fermetures, changements de visibilite,
  sortie de page et toutes les 15 secondes lorsque l'onglet est visible.
- Chaque delta est envoye une seule fois pour chaque mesure.
- Une fermeture brutale peut perdre la derniere portion, voire le temps cache
  depuis le dernier point transmis. DataLayer n'est pas une garantie de livraison GA4.
- Ne pas additionner temps formulaire ET temps etapes : deux vues de la meme duree.
- Il ne s'agit pas d'un temps de lecture active ; les longues absences sont incluses.

## Evenements et parametres

`cro_form_time` : form_type, source_cta_id, source_section, form_elapsed_time (ms).

`cro_form_step_time` : form_type, source_cta_id, source_section,
form_step_id, form_step_index, form_step_elapsed_time (ms).

Les parametres exclus de chaque evenement sont explicitement remis a null pour
eviter de reprendre une ancienne valeur dans GTM. Ne mapper que les parametres
correspondant a chaque balise. Aucun contenu des champs n'est ajoute ici.

Pages : roof_surface, roof_material, hydrofuge_choice, postcode, contact.
L'index varie selon le parcours : privilegier form_step_id pour comparer.
Le contexte de source est celui de l'ouverture courante.

## GTM

Reutiliser les DLV existantes form_type, source_cta_id, source_section.
Creer 4 DLV Version 2, sans valeur par defaut :

| Nom GTM | Nom dans la couche de donnees |
| --- | --- |
| DLV - form_elapsed_time | form_elapsed_time |
| DLV - form_step_id | form_step_id |
| DLV - form_step_index | form_step_index |
| DLV - form_step_elapsed_time | form_step_elapsed_time |

Creer deux declencheurs Evenement personnalise, sans regex, tous evenements
personnalises : CE - cro_form_time et CE - cro_form_step_time, chacun avec le nom
d'evenement exact correspondant.

Creer deux balises GA4 Event avec l'ID G- existant, une fois par evenement :

- GA4 - cro_form_time : nom evenement cro_form_time ; form_type, source_cta_id,
  source_section, form_elapsed_time, chacun relie a sa DLV correspondante.
- GA4 - cro_form_step_time : nom evenement cro_form_step_time ; form_type,
  source_cta_id, source_section, form_step_id, form_step_index,
  form_step_elapsed_time, chacun relie a sa DLV correspondante.

Associer a chacune son seul declencheur. Exclure ces evenements de toute autre
balise generique qui les transmettrait deja. Ne pas ajouter de timer GTM.

## GA4

Dans Definitions personnalisees, reutiliser form_type si existante.
Dimensions portee Evenement (nom affiche = parametre) : form_step_id,
form_step_index. Descriptions : page du formulaire ; position dans le parcours.

Metriques personnalisees portee Evenement, unite Millisecondes :

- form_elapsed_time : duree ecoulee du formulaire ouvert, onglet masque inclus.
- form_step_elapsed_time : duree ecoulee de la page du formulaire, onglet masque inclus.

Exploration formulaire : filtre evenement=cro_form_time, lignes=form_type,
valeurs=form_elapsed_time et nombre total d'utilisateurs.
Exploration pages : filtre evenement=cro_form_step_time, lignes=form_type puis
form_step_id, valeurs=form_step_elapsed_time et nombre total d'utilisateurs.
Le nombre d'evenements represente des portions de temps, pas des visites ni
des ouvertures. Une moyenne par utilisateur n'est pas une moyenne par ouverture.

## Etat

Implementation locale seulement : ne pas considerer ces donnees comme disponibles
en production avant publication du code et des balises GTM.
Le tracking par champ propose precedemment n'est pas ajoute par cette modification.
