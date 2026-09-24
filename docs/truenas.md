# Installer Wishlister sur TrueNAS 25.10

Wishlister fonctionne dans un conteneur Docker unique. Le premier accès ouvre `/setup` : aucun `npm run setup`, SSH ou shell de conteneur n’est nécessaire pour créer le compte.

## État de livraison

L’image `wishlister:local` est construite et testée sur Docker Linux. Elle n’est pas encore publiée dans un registre accessible au NAS ; ce nom local ne se transfère pas automatiquement sur TrueNAS. Avant l’installation, publier cette image dans le registre choisi, puis utiliser son adresse et un tag versionné dans l’application. Le fichier [compose.truenas.yaml](../compose.truenas.yaml) contient une adresse de registre **d’exemple à remplacer**. Aucun déploiement sur un NAS réel n’a été effectué.

## Configuration de l’application

TrueNAS 25.10 permet une installation par **Apps → Discover Apps → Custom App**, ou par **⋮ → Install via YAML**. Le second choix accepte le [modèle Compose fourni](../compose.truenas.yaml), après adaptation. Les paramètres sont décrits dans la [documentation officielle des applications personnalisées](https://www.truenas.com/docs/scale/25.10/scaleuireference/apps/installcustomappscreens/).

Pour une installation avec le formulaire graphique :

| Paramètre               | Valeur Wishlister                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Nom de l’application    | `wishlister`                                                                        |
| Image et tag            | Adresse de l’image publiée et version choisie                                       |
| Command / Entrypoint    | Laisser ceux de l’image : le démarrage prépare le setup automatiquement             |
| Redémarrage             | `Unless stopped`                                                                    |
| Utilisateur / groupe    | UID `1000`, GID `1000`, comme l’image ; pas de mode privilégié                      |
| Port conteneur          | `3000/TCP`                                                                          |
| Port hôte               | `31000`, ou un autre port libre                                                     |
| `APP_ORIGIN`            | Adresse exacte utilisée dans le navigateur, par exemple `http://192.168.1.20:31000` |
| `DATA_DIR`              | `/app/data`                                                                         |
| `TRUST_PROXY`           | `0` ; `1` seulement avec un proxy de confiance qui remplace `X-Forwarded-For`       |
| Portail web             | Même protocole et port que `APP_ORIGIN`, chemin `/`                                 |
| Stockage de données     | Dataset dédié monté en écriture sur `/app/data`                                     |
| Stockage de sauvegardes | Dataset dédié monté en écriture sur `/app/backups`                                  |

Créer les deux datasets dans TrueNAS avant l’installation, par exemple `tank/apps/wishlister/data` et `tank/apps/wishlister/backups`. Accorder l’écriture et la traversée à l’UID/GID `1000`, y compris la traversée des parents. Les montages **Host Path** permettent de conserver ces datasets lors du remplacement du conteneur. Ne pas utiliser un partage SMB/NFS pour le fichier SQLite. Voir les [options de stockage des applications](https://apps.truenas.com/managing-apps/installing-custom-apps/#setting-up-app-storage).

Le modèle YAML refuse de créer silencieusement un dossier hôte absent : un chemin erroné doit être corrigé avant le démarrage.

## Premier accès

1. Démarrer l’application, puis ouvrir ses journaux dans l’interface TrueNAS.
2. Copier la valeur après **Code d’installation**. Ce code est privé ; il n’est pas affiché sur la page publique.
3. Ouvrir le portail web de Wishlister. `/` et `/admin` dirigent vers l’assistant tant que le propriétaire n’existe pas.
4. Coller le code, choisir le pseudonyme, le mot de passe et sa confirmation, puis la devise. PayPal.Me est facultatif à cette étape.
5. Cliquer sur **Créer ma wishlist**. Le compte est créé et la connexion à l’administration est automatique.

Le code reste identique en cas de redémarrage avant la fin du setup. Une fois le compte créé, il est supprimé de la base, n’est plus imprimé au démarrage et ne peut plus initialiser l’instance. Deux demandes simultanées ne créent qu’un propriétaire. Un ancien onglet de setup ne peut pas remplacer le compte.

Les instances déjà configurées arrivent directement sur la wishlist et conservent leurs données. Changer une image, recréer le conteneur ou redémarrer TrueNAS ne relance pas le setup si `/app/data` est conservé.

## Adresse publique et mises à jour

Pour publier la wishlist, configurer le reverse proxy HTTPS et adapter `APP_ORIGIN` à l’adresse publique. Les cookies deviennent `Secure` avec une origine HTTPS. Ne pas utiliser une adresse interne différente pour soumettre le setup ou se connecter : les écritures sont volontairement limitées à l’origine configurée.

Avant une mise à jour, sauvegarder le registre et ses images selon le [README](../README.md#sauvegarder-et-restaurer). Changer uniquement le tag de l’image et conserver les deux montages. Les migrations s’appliquent au démarrage. Une remise à zéro du stockage de données n’est pas une procédure de mise à jour.

En cas de problème d’écriture, vérifier le dataset et ses permissions. Si le navigateur refuse l’origine, corriger `APP_ORIGIN` dans l’application TrueNAS puis la redémarrer. Si le code est absent des journaux alors qu’un compte existe, ouvrir `/admin` pour se connecter : l’installation est terminée.
