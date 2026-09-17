# Formulaires : Brevo + Cloudflare Free

Statut : preparation locale, pas encore deploye. Aucun secret dans ce depot.

## Configuration du Worker existant

Worker : `3r-formulaires`, endpoint `https://3r-formulaires.croizads.workers.dev/submit`.

Secrets existants : `BREVO_API_KEY`, `TURNSTILE_SECRET_KEY`.

Variables texte a ajouter dans Settings > Runtime variables and secrets :

| Nom | Valeur initiale |
| --- | --- |
| DELIVERY_MODE | test |
| TEST_RECIPIENT | croizads@outlook.com |

En mode test, les trois emails ET leurs adresses de reponse sont rediriges vers
TEST_RECIPIENT. Aucun envoi au client ou au prospect. Les sujets portent TEST.
La phrase validee "quelques places ... ce mois-ci" est incluse dans les deux emails.

## Base D1 gratuite

1. Cloudflare > Storage & databases > D1 SQL Database > Create database.
2. Nom : `3r-formulaires`, choisir une localisation europeenne si disponible.
3. Ouvrir la console SQL de cette base et executer `worker/schema.sql`.
4. Worker > Bindings > Add binding > D1 database.
5. Variable name : `DB`. Base : `3r-formulaires`. Deploy.
6. Ne pas souscrire de forfait payant ; D1 a des quotas gratuits propres au compte.

## Code et reprises

1. Worker > Edit code : remplacer Hello World par `worker/index.mjs`, puis Deploy.
2. Settings > Trigger Events > Cron Triggers : ajouter `*/5 * * * *`.
3. La tache periodique envoie les emails en attente et purge les donnees apres 30 jours.

Une reponse 202 signifie que la demande et ses trois messages sont enregistres
ensemble dans D1, pas que les emails sont arrives en boite de reception.
Les envois sont independants ; un echec partiel ne renvoie pas les emails deja acceptes.
Une erreur 429 est reessayee apres une heure (nombre de reprises limite).
Un resultat reseau incertain, une erreur Brevo ou une interruption restent en statut
`review`. Verifier les journaux transactionnels Brevo avant toute reprise manuelle :
le fournisseur a peut-etre deja accepte l'email. Pas de promesse d'exactly-once
entre deux services distants, ni de reessai aveugle des envois incertains.

Controle operationnel a effectuer regulierement dans D1 :

```sql
SELECT status, COUNT(*) FROM mail_jobs GROUP BY status;
SELECT id, error, updated FROM mail_jobs WHERE status='review';
```

Les logs Worker ne contiennent ni le contenu des demandes ni les secrets.
Les donnees personnelles persistent dans D1 et dans les emails/Brevo. La purge D1
ne supprime pas les emails ou l'historique Brevo. Valider ces durees avec le client.

## Tests et mise en ligne

- Tests automatises : `node --test tests/lead-worker.test.mjs tests/section-time.test.cjs tests/content-time.test.cjs`.
- Test navigateur : `node tests/lead-browser.cjs <chemin-playwright> <chemin-chrome>`.
- Les tests automatiques simulent Brevo et Turnstile : ils n'envoient aucun email.
- Le vrai widget ne fonctionne pas en file:// et autorise uniquement toiture.3rservices.fr.
- Tester la branche sur une URL privee de travail n'est pas suffisant : il faudra
  autoriser explicitement un hostname de test dans le widget ET le Worker si on
  souhaite un test reel avant publication sur le domaine principal.
- Ne pas publier index.html avant que le Worker, D1 et le cron soient prets.
- Valider en mode test : deux formulaires, 3 emails, prix HT, aucune fausse confirmation
  lors d'une erreur, une seule demande sur nouvelle tentative, reply-to correct.
- Avant live : corriger le lien de confidentialite encore provisoire dans le formulaire,
  valider la mention des destinataires et du traitement, verifier quota Brevo disponible
  et restrictions IP du compte client. Les autres integrations partagent ses quotas.
- Ne pas modifier le filtrage IP global sans accord du client. Si Brevo active un
  filtrage incompatible avec les sorties Workers, les envois seront bloques et mis
  en review ; cette compatibilite doit etre testee avant production.
- Apres accord : DELIVERY_MODE=live. Les nouveaux messages vont aux vrais destinataires.
  Les jobs deja crees conservent leur destinataire de creation.
- Rien dans ce guide n'active de forfait payant.

## Prix et tracking

Le serveur utilise uniquement surface, materiau, hydrofuge. Il ignore les prix
provenant du navigateur. Les montants sont des fourchettes en EUR/m2 HT.
Materiau inconnu, surface inconnue ou sous 75 m2 : aucun prix.
Beton avec hydrofuge inconnu : ligne tarifaire specifique 18-35 ou 16-35.
La tranche 225+ a ete remplacee par 225-300 et plus de 300 pour eviter l'ambiguite.
Le formulaire transmet des tranches, pas une surface numerique exacte.
Les tableaux GA4 utilisant les anciennes valeurs de surface doivent en tenir compte.
Le message vert et cro_lead_success n'apparaissent qu'apres acceptation du Worker.
Le prix personnalise est envoye par email, sans changer l'affichage actuel du resultat.
