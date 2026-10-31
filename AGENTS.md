# Variante Toit impeccable

Le contenu de `toit-impeccable.html` est valide et verrouille par le proprietaire.
La reference initiale est le tag Git `toit-impeccable-v1`.
URL : https://toiture.3rservices.fr/toit-impeccable.html

Les prochaines demandes de mise en page autorisent les changements de styles,
responsive, espacements, typographie et structure HTML necessaire au rendu.
Elles n'autorisent pas a reecrire, ajouter ou retirer les textes, titres, prix,
arguments, avis, questions/reponses, labels de boutons ou leur ordre editorial.
Un changement de contenu demande explicitement par le proprietaire reste autorise.

Conserver les formulaires, leurs validations, les destinations des boutons et
les attributs/evenements de tracking lors des changements visuels.
Ne pas modifier `index.html` pour une demande visant cette variante.
Preferer les styles scopes dans `assets/hero-toit-impeccable.css`.

Le tag conserve la V1 sans dupliquer les fichiers de page. L'URL de la variante
affiche sa derniere version publiee, elle n'est pas une archive immuable de la V1.
Les emplacements photo restent des emplacements tant que les photos ne sont pas
fournies. Leur remplacement requiert une demande ou les ressources du proprietaire.

## Mise en page mobile first

La variante utilise une colonne de lecture de `min(100% - 32px, 640px)` et un
breakpoint de mise en page a 760px. La navigation fait exception a la largeur.
Le header reste a 68px. Les boutons du hero doivent rester visibles a 390x844.
Les nouvelles regles sont scopees sous `.lp-page` dans le fichier CSS existant.
Les styles historiques sont encore presents ; ne pas supposer qu'ils ont ete
nettoyes ou que toutes les classes fonctionnelles ont ete renommees.
La barre mobile est geree par `assets/toit-impeccable-layout.js` et doit rester
masquee sur ordinateur, pendant un formulaire et quand un autre groupe CTA est visible.
