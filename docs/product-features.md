# Listes, partage et gestion de l’instance

Cette évolution conserve un propriétaire par instance. La migration crée la liste
publique **Ma Ouichlist** pour les envies existantes et conserve leurs identifiants,
catégories, montants et contributions. Les participations déclarées continuent à
compter par défaut. Les volumes existants ne changent pas.

## Listes et confidentialité

Dans **Listes et partage**, créer un événement, renseigner sa date et choisir :

| Visibilité      | Accès                                                                   |
| --------------- | ----------------------------------------------------------------------- |
| Publique        | Accueil, lien direct, aperçu social avec nom et description de la liste |
| Non répertoriée | Lien secret généré par le propriétaire ; aucune apparition publique     |
| Privée          | Propriétaire connecté uniquement                                        |

Le lien secret est affiché lors de sa création. Le serveur conserve uniquement son
empreinte. L’ouverture du lien donne un cookie HttpOnly ; les visites suivantes
vérifient que ce droit existe toujours. Créer un autre lien, révoquer le lien,
changer la confidentialité ou archiver bloque les futurs accès avec l’ancien droit,
y compris aux fiches, aux images et aux nouvelles contributions/réservations.
Un contenu déjà vu ou une image autrefois publique peut avoir été copié : la
révocation ne retire pas ces copies. Le profil et ses illustrations sont communs
aux listes accessibles. Un détenteur du lien secret peut le transmettre ; ce
n’est pas une invitation nominative.

Les catégories restent communes au propriétaire. Les visiteurs ne voient que les
catégories utilisées par les envies auxquelles ils ont accès. Une envie peut
changer de liste dans son formulaire. L’import propose aussi une liste de
destination. Archiver une liste ferme sa consultation publique sans supprimer son
historique financier.

Le QR code est calculé dans le navigateur, sans service externe. Les aperçus des
listes non publiques et des liens personnels restent génériques et non indexables.
Les liens de partage contiennent un secret : ne les placer ni dans un ticket public,
ni dans une capture partagée ; les journaux d’un proxy sont à gérer par son opérateur.

## Offrir un cadeau ou contribuer

**Offrir directement** réserve une quantité pendant 14 jours, sans PayPal et sans
compte. Conserver le lien personnel pour annuler ou confirmer l’achat. L’expiration
libère les exemplaires ; un achat confirmé les garde réservés jusqu’à intervention
du propriétaire. Une transaction SQLite empêche deux visiteurs de réserver le
dernier exemplaire. Le propriétaire peut annuler depuis **Historique → Réservations**.

Réservation et financement sont exclusifs : des réservations actives ferment les
nouvelles contributions ; un paiement, une déclaration ou une intention encore
valable empêche la réservation. Une réservation n’inscrit jamais un paiement.
Le lien personnel reste utilisable pour annuler même si l’accès à la liste a été
révoqué ; il ne révèle ni nom du cadeau ni message privé.

Dans **Contributions**, activer **Compter uniquement les contributions validées**
pour exclure les déclarations non approuvées du financement et de la fermeture de
l’objectif. Les déclarations restent visibles comme telles. Valider une déclaration
ne crée aucune fausse référence PayPal. Si un paiement détaillé est ensuite saisi,
il remplace la déclaration ; les frais et remboursements continuent à s’appliquer.
Il n’y a pas de vérification automatique de réception des versements.

Depuis 1.3.0, le formulaire propose aussi **J’ai fait un virement** et **Je participerai plus tard**,
même sans PayPal configuré. Un virement déjà effectué suit le même mode normal/strict.
Une promesse reste affichée séparément, sans remplir l’objectif ; le lien privé permet
de déclarer ensuite le versement ou d’annuler. Les promesses actives n’expirent pas,
résistent au nettoyage et empêchent une réservation pour achat direct jusqu’à résolution.
Le propriétaire peut filtrer les **Promesses** dans **Contributions** et ne confirme
que les sommes réellement reçues. Les coordonnées bancaires se demandent directement
au bénéficiaire : aucun transfert ni partage d’IBAN n’est réalisé par Ouicheur.

## Ajout mobile et actualisation

La page `/add` ouvre le formulaire d’ajout. Sur un navigateur compatible et en HTTPS
(ou localhost), installer Ouicheur depuis le menu du navigateur permet de recevoir
un lien via la fonction **Partager** d’une autre application. La connexion
propriétaire et une validation sont nécessaires. Aucun lien reçu n’est extrait ni
enregistré automatiquement. Le support du partage vers une PWA dépend du navigateur
et du système ; `/add` reste disponible partout.

Le service worker ne conserve aucune liste, image privée ou réponse API hors ligne.
La perte du réseau affiche un message neutre et les fonctions privées nécessitent
une connexion au serveur.

Dans une envie existante, **Actualiser le prix et la disponibilité** crée un relevé
daté. Le nouvel objectif n’est appliqué qu’après un clic de confirmation, dans la
devise de l’envie et multiplié par la quantité. Un relevé vieux de plus de 24 heures
ou une modification concurrente exige une nouvelle lecture. La disponibilité
reflète les données publiées par le marchand, sans garantie de stock. CAPTCHA,
refus d’accès et prix absents conservent le formulaire manuel.

## Sauvegardes et notifications

**Mon instance** propose une sauvegarde SQLite cohérente avec les images référencées
et un manifeste de contrôles SHA-256. Le téléchargement `.tar.gz` exige une session
propriétaire. Les archives contiennent des données privées, notamment le hachage du
mot de passe. Les protéger comme les données de l’instance.

Choisir une sauvegarde quotidienne ou hebdomadaire et entre 1 et 30 archives à
conserver. La tâche vérifie l’échéance chaque minute tant que le serveur de production
fonctionne ; une échéance manquée est reprise au démarrage. La rétention ne supprime
les anciennes archives gérées qu’après une nouvelle sauvegarde réussie. Les dossiers
de sauvegarde créés auparavant en CLI restent indépendants. Copier régulièrement
une archive sur un autre appareil.

Configuration du conteneur :

```yaml
environment:
  BACKUP_DIR: /app/backups
  # Facultatif, après avoir installé/configuré votre serveur ntfy :
  NTFY_URL: https://ntfy.example/ouicheur-topic
  NTFY_TOKEN: votre-jeton
```

Un serveur ntfy du LAN en HTTP est aussi accepté : cette destination vient de la
configuration de l’opérateur, jamais d’un lien produit. Les redirections sont
refusées. Activer ensuite **Notifications ntfy** et utiliser le test. La file
persistante envoie des événements génériques pour déclarations, réservations et
échecs d’import, sans nom, montant ou lien personnel. Elle réessaie jusqu’à cinq
fois avec un délai croissant. Les compteurs affichent les envois et les échecs.
La livraison est au moins une fois : une coupure après envoi peut produire un doublon.
SMTP n’est pas requis ; cette version utilise ntfy.

## Restaurer une archive

Arrêter l’application et extraire une archive que vous avez créée dans un dossier
vide. La restauration contrôle les sommes et l’intégrité SQLite puis refuse toute
destination contenant déjà une base.

```sh
mkdir backup-extracted
tar -xzf ouicheur-IDENTIFIANT.tar.gz -C backup-extracted
npm run restore -- backup-extracted /chemin/vers/nouvelles-donnees
```

Dans le conteneur, `node scripts/manage.ts restore /sauvegarde-extraite
/app/nouvelles-donnees` utilise le même mécanisme. Choisir ensuite ce nouveau
`DATA_DIR` ou le monter sur `/app/data`, avec des permissions adaptées à l’UID/GID
du conteneur. Les sessions et liens de partage sont révoqués ; régénérer les liens
non répertoriés après vérification. Les tâches de sauvegarde interrompues sont
marquées en échec. Les variables d’environnement, dont les
secrets ntfy, restent à reconfigurer ; ne pas remplacer une instance active.
Après restauration, se reconnecter et vérifier les envies et images avant de
supprimer l’ancienne installation.

## Diagnostic, historique et nettoyage

Le diagnostic téléchargeable contient les versions, l’architecture, la présence de
Chromium, l’espace disque, des compteurs et le dernier état de sauvegarde. Il exclut
les chemins locaux, variables secrètes, liens privés, noms, messages et montants.
Il indique la présence du navigateur ; la CI teste aussi son lancement réel.

Les contributions, réservations, imports et journaux sont consultables par pages
de 50 entrées. La grille ajoute 24 envies à la fois ; recherche et filtres portent
sur toutes les envies chargées. La lecture initiale des envies reste globale :
cette version ne promet pas un catalogue de millions de produits.

Le nettoyage demande une confirmation liée à son aperçu ; un changement impose
une nouvelle confirmation. Il conserve les paiements, leurs corrections,
les déclarations et le journal. Il retire les imports terminés/échoués et intentions
sans paiement expirées depuis plus de 90 jours. Les images non référencées ont un
délai de grâce de 24 heures ; un import ou une sauvegarde en cours les protège.
Une limite d’images configurable et une réserve d’espace libre évitent de continuer
les téléversements quand le stockage est insuffisant.

## Mise à jour sur TrueNAS

Sauvegarder la version actuelle, conserver les mêmes volumes, puis recréer le
conteneur avec la version validée. La migration est transactionnelle. Une ancienne
image ne doit pas être réutilisée sur une base déjà migrée : pour revenir en arrière,
restaurer aussi la sauvegarde correspondante dans un nouveau dossier. Le test positif
rapporté par le propriétaire concerne la version précédant cette évolution ; la
nouvelle version doit être essayée sur une copie avant de remplacer son installation.

La CI utilise des machines natives AMD64 et ARM64. Les tags de release ne réunissent
les deux images qu’après validation des deux architectures. Les soumissions aux
catalogues TrueNAS et Unraid restent en attente de la finalisation du produit.
