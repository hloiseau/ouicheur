# Occasions, calendriers et rappels

Dans **Listes et partage**, choisir une date, le fuseau de l’occasion et éventuellement « Répéter chaque année ». Le 29 février peut être célébré le 28 février les années non bissextiles, ou uniquement les années bissextiles. Les dates restent des journées entières ; le fuseau sert au calcul du prochain événement et des rappels, sans décaler la journée dans un autre pays.

Le menu **Ajouter à mon calendrier** télécharge un fichier iCalendar conforme à [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545). Par défaut, il contient une date et le titre neutre « Ouicheur ». Nom, description et lien public sont des choix explicites. Aucun cadeau, montant, réservation, âge ou année de naissance n’est ajouté. Pour un événement annuel, le début est la prochaine occurrence, pas l’année d’origine. Les retours à la ligne et caractères spéciaux sont échappés, les longues lignes sont repliées sur des limites UTF-8.

Le propriétaire peut créer un abonnement pour une liste, y compris privée. **Son URL donne accès aux champs choisis** : la conserver comme un secret, ne pas la publier et veiller à ce que le reverse proxy ne journalise pas les chemins `/api/calendar/feed/`. Un nouveau lien révoque le précédent. Révocation explicite, changement de visibilité, archivage et restauration invalident l’abonnement. Une copie déjà importée dans un logiciel de calendrier ne peut pas être supprimée à distance. Aucun calendrier public global n’agrège les listes privées.

## Choix personnels

**Accès et sécurité → Mes rappels et notifications** permet au propriétaire et aux coorganisateurs de choisir :

- le type d’événement, une liste ou toutes les listes autorisées ;
- un canal, l’envoi à chaque événement ou un résumé quotidien neutre ;
- le délai avant une occasion (0 à 60 jours), le fuseau et la pause nocturne.

Les heures identiques désactivent la pause. Un résumé est envoyé au plus une fois par jour et par canal ; plusieurs mises à jour en attente sont regroupées. Les notifications immédiates restent différées pendant la pause. Les préférences désactivées n’envoient rien. Enregistrer des préférences annule les envois encore en attente, pour ne pas hériter d’un consentement précédent.

Les réservations bientôt expirées déclenchent un rappel dans leurs dernières 24 heures. Les notifications de réservation sont masquées au destinataire d’une liste en mode surprise. Les messages n’incluent jamais noms, montants, URL privées ou détails du cadeau. Les droits, la validité du compte et l’état de l’événement sont revérifiés avant envoi. Les idées secrètes confiées à un tiers ne passent pas dans cette file.

Le worker durable se réveille chaque minute. Après un arrêt, il recalcule les occasions encore à venir et les réservations encore actives ; la clé événement/date/compte/canal empêche les doublons. Une livraison échouée est réessayée avec délai croissant, au maximum cinq tentatives. Une panne entre l’envoi et son acquittement peut produire un doublon : aucun protocole SMTP/ntfy ne permet ici de garantir l’exactement-une-fois. Les tâches trop anciennes sont abandonnées, l’historique technique est borné à 180 jours, les marqueurs de résumé à 30 jours.

## Canaux facultatifs

`ntfy` reste compatible avec les installations existantes et est réservé au propriétaire. Configurer `NTFY_URL` (URL complète avec topic) et éventuellement `NTFY_TOKEN` dans l’environnement du conteneur. Un serveur local est permis ; les redirections ne sont pas suivies. L’ancien réglage ntfy continue de fonctionner jusqu’au premier enregistrement des préférences détaillées.

Pour le courriel, configurer :

```text
SMTP_HOST=smtp.example.org
SMTP_PORT=587
SMTP_FROM=ouicheur@example.org
SMTP_USER=ouicheur@example.org
SMTP_PASSWORD=secret-a-configurer-sur-le-serveur
# Facultatif : destination du propriétaire gérée par l’administrateur
SMTP_TO=proprietaire@example.org
```

Le port 465 utilise TLS implicite ; les autres ports exigent STARTTLS. La validation du certificat reste active. Les paramètres suivent le [transport SMTP de Nodemailer](https://nodemailer.com/smtp). Aucun fichier, URL distante ou HTML n’est injecté dans les courriels. Les identifiants restent dans l’environnement, hors API, exports et journaux applicatifs.

Chaque compte peut vérifier son adresse par un code valable 15 minutes : trois demandes par heure, cinq essais au maximum, hash du code conservé et aucun code journalisé. Vérifier une adresse n’active pas les rappels. Supprimer l’adresse annule les envois email en attente ; le propriétaire peut continuer d’utiliser `SMTP_TO` s’il est configuré par l’administrateur. Les coorganisateurs ne peuvent pas utiliser le topic ntfy du propriétaire ni recevoir ses événements financiers/techniques. Une adresse coorganisateur ne peut recevoir que des événements de ses listes encore autorisées.

Les migrations 019 et 020 préservent les données existantes. Une restauration supprime les abonnements calendaires, invalide la vérification des adresses, désactive les préférences et vide la file de notifications afin qu’une instance restaurée ne reprenne pas des envois inattendus. Il faut reconfigurer le consentement après restauration.

La livraison SMTP réelle dépend du serveur de l’administrateur. Les tests du projet utilisent des transports simulés et ne contactent aucun destinataire réel.
