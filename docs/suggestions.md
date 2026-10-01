# Suggestions des proches

Ce lot 1.2 permet aux visiteurs autorisés de proposer une idée sans créer eux-mêmes
une envie. Il reste indépendant de la version 1.1 en cours de recette NAS.

## Activer et proposer

Dans **Listes et partage**, activer **Autoriser les suggestions des proches**.
L’option est désactivée par défaut après la migration 012. Elle s’applique à chaque
liste : publique ou non répertoriée accessible par un lien valide. Une liste privée,
archivée ou désactivée ne reçoit pas de propositions. La révocation de son lien
de partage bloque immédiatement les nouvelles propositions depuis cet ancien accès.

Le visiteur choisit **Proposer une idée**, donne un titre et peut ajouter un pseudo,
un message et un lien HTTP(S). Il confirme que le propriétaire lira sa proposition.
Les autres visiteurs ne voient ni la proposition, ni son auteur, ni son statut.

Le mode surprise masque les réservations et achats. Il ne masque pas ces propositions
au propriétaire. La coordination secrète par un tiers reste liée aux futurs rôles
de coorganisateur (#20) ; aucun rôle de ce type n’est créé dans ce lot.

## Modérer

L’onglet **Suggestions** présente une file paginée, filtrée par état : en attente,
acceptée ou refusée. **Préparer cette envie** ouvre l’éditeur avec le titre et le lien.
Le pseudo et le message restent privés et ne préremplissent pas la description publique.

Le propriétaire vérifie les champs, renseigne un lien produit et un objectif si
nécessaire, puis choisit **Accepter et créer l’envie**. Une suggestion sans lien est
donc recevable ; sa transformation utilise ensuite les exigences actuelles d’une envie.
Les envies sans produit sont un autre lot (#9). La liste d’origine est conservée.
Une liste archivée doit être réactivée avant acceptation ; la désactivation des
nouvelles suggestions n’empêche pas de traiter celles déjà reçues.

L’acceptation et la création sont dans la même transaction SQLite. Un double clic
ou une requête répétée renvoie la même envie. Une proposition refusée ou supprimée
ne peut pas être acceptée. L’envie créée reste modifiable par les outils existants,
avec les protections habituelles du mode surprise.

## Liens personnels et suppression

Après envoi, conserver le **lien personnel de suivi** : sans compte ni adresse
e-mail, il est le seul accès du visiteur à sa proposition. Il permet de consulter
son statut, renouveler le lien en révoquant l’ancien, ou supprimer la proposition.
Le propriétaire peut également supprimer une proposition depuis la modération.

Le secret aléatoire de 256 bits est conservé haché en base. Il est placé dans le
fragment `#` du lien de suivi ; le navigateur l’envoie uniquement dans le corps
JSON des requêtes de gestion, pas dans le chemin ou la query string HTTP. Les
réponses ne sont pas mises en cache, la page est non indexable et le site applique
`Referrer-Policy: no-referrer`. L’application n’inscrit ni ce secret ni le contenu
privé de la suggestion dans son journal d’audit. Les configurations externes qui
enregistreraient les corps HTTP doivent protéger ces données.

Le suivi ne renvoie que le contenu envoyé et son statut : aucun nom de liste,
identifiant d’envie ni information sur d’autres personnes. Il reste utilisable
après révocation de l’accès à la liste, notamment pour retirer sa proposition.

La suppression efface la proposition de la base active et les notifications qui
lui sont liées. Le journal garde seulement l’identifiant et l’action. Une envie
déjà créée est conservée ; les champs que le propriétaire a volontairement publiés
ne sont pas effacés. Les anciennes sauvegardes peuvent conserver le contenu supprimé.

## Limites et notifications

- Titre : 160 caractères ; pseudo : 80 ; message : 2 000 ; lien : 2 048.
- Corps d’une création : 16 Kio ; gestion personnelle : 1 Kio.
- Création : 10 tentatives par heure et par adresse de proxy de confiance, ou
  quota partagé quand `TRUST_PROXY=0` ; 100 par heure sur l’instance.
- Suivi : 120 requêtes par heure et par adresse/quota partagé ; 1 000 globalement.
- Stockage : 100 propositions conservées par liste et 1 000 dans l’instance,
  états traités inclus. Supprimer les anciennes propositions libère de la place.
- Modération : 20 propositions par page. Aucun comptage public.

Ces limites complètent la vérification d’origine et des droits. Un invité ne
déclenche aucune résolution DNS, extraction de métadonnées ni récupération d’image.
Les liens refusent notamment les protocoles autres que HTTP(S), les identifiants,
les adresses IP privées et les ports non autorisés. Une vérification DNS et des
redirections a lieu dans le récupérateur existant lorsque le propriétaire choisit
explicitement **Récupérer les informations**. Les invités ne téléversent pas d’images.

Si ntfy est activé, une notification neutre indique qu’une suggestion attend une
revue, sans titre, pseudo, lien ni message. Elle ne contient aucun événement de
réservation et reste compatible avec la visibilité explicitement consentie des
propositions. Les décisions et suppressions retirent les notifications associées.

## Migration et sauvegarde

La migration 012 ajoute l’option par liste et une table indépendante. Elle conserve
les envies, réservations et contributions existantes. Les sauvegardes complètes
incluent les suggestions ; la restauration conserve leur état mais révoque tous
les liens personnels de suivi. Le propriétaire peut encore modérer les propositions.
L’export propriétaire inclut les contenus et états, sans les hachages des liens.

Avant mise à jour, exporter une sauvegarde de la version de départ. Un retour à
une ancienne image exige la restauration de sa base correspondante sur un stockage
vide. Ne pas publier une sauvegarde dans une issue.
