# Installer Ouicheur sur TrueNAS 25.10

Ouicheur fonctionne dans un conteneur Docker unique. Le premier accès ouvre `/setup` : aucun `npm run setup`, SSH ou shell de conteneur n’est nécessaire pour créer le compte.

## État de livraison

Le dépôt public est [hloiseau/ouicheur](https://github.com/hloiseau/ouicheur). Le [workflow](../.github/workflows/ci.yml) publie `ghcr.io/hloiseau/ouicheur:main` et un tag `sha-COMMIT` uniquement après les vérifications TypeScript, les tests serveur, les parcours navigateur et le test Docker. Le déploiement utilise ensuite le digest exact de l’image testée.

L’image GHCR doit être rendue **publique** dans les paramètres du package après sa première publication ; un dépôt public ne rend pas automatiquement son package public. Vérifier qu’un téléchargement anonyme est possible avant l’installation. Voir la [documentation du registre GitHub](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

Le modèle fourni cible `https://ouicheur.hugoloiseau.fr`, le port NAS `31000` et les dossiers `/mnt/Main/tank/ouicheur/data` et `/mnt/Main/tank/ouicheur/backups`. Adapter ces chemins pour une autre installation. Les données personnelles et les secrets sont exclus du dépôt et de l’image Docker.

## Configuration de l’application

TrueNAS 25.10 permet une installation par **Apps → Discover Apps → Custom App**, ou par **⋮ → Install via YAML**. Le second choix accepte le [modèle Compose fourni](../compose.truenas.yaml), après adaptation. Les paramètres sont décrits dans la [documentation officielle des applications personnalisées](https://www.truenas.com/docs/scale/25.10/scaleuireference/apps/installcustomappscreens/).

Pour une installation avec le formulaire graphique :

| Paramètre               | Valeur Ouicheur                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Nom de l’application    | `ouicheur`                                                                           |
| Image et tag            | Adresse de l’image publiée et version choisie                                        |
| Command / Entrypoint    | Laisser ceux de l’image : le démarrage prépare le setup automatiquement              |
| Redémarrage             | `Unless stopped`                                                                     |
| Utilisateur / groupe    | UID `1000`, GID `1000`, comme l’image ; pas de mode privilégié                       |
| Port conteneur          | `3000/TCP`                                                                           |
| Port hôte               | `31000`, ou un autre port libre                                                      |
| `APP_ORIGIN`            | Adresse principale, par exemple `http://192.168.1.20:31000`, ou domaine public HTTPS |
| `DATA_DIR`              | `/app/data`                                                                          |
| `TRUST_PROXY`           | `0` ; `1` seulement avec un proxy de confiance qui remplace `X-Forwarded-For`        |
| Portail web             | Même protocole et port que `APP_ORIGIN`, chemin `/`                                  |
| Stockage de données     | Dataset dédié monté en écriture sur `/app/data`                                      |
| Stockage de sauvegardes | Dataset dédié monté en écriture sur `/app/backups`                                   |

Créer les deux datasets dans TrueNAS avant l’installation, ici `Main/tank/ouicheur/data` et `Main/tank/ouicheur/backups`. Accorder l’écriture et la traversée à l’UID/GID `1000`, y compris la traversée des parents. Les montages **Host Path** permettent de conserver ces datasets lors du remplacement du conteneur. Ne pas utiliser un partage SMB/NFS pour le fichier SQLite. Voir les [options de stockage des applications](https://apps.truenas.com/managing-apps/installing-custom-apps/#setting-up-app-storage).

Le modèle YAML refuse de créer silencieusement un dossier hôte absent : un chemin erroné doit être corrigé avant le démarrage.

## Premier accès

1. Démarrer l’application, puis ouvrir ses journaux dans l’interface TrueNAS.
2. Copier la valeur après **Setup code**. Ce code est privé ; il n’est pas affiché sur la page publique.
3. Ouvrir le portail web de Ouicheur. `/` et `/admin` dirigent vers l’assistant tant que le propriétaire n’existe pas.
4. Coller le code, choisir le pseudonyme, le mot de passe et sa confirmation, puis la devise. PayPal.Me est facultatif à cette étape.
5. Cliquer sur **Créer ma Ouichlist**. Le compte est créé et la connexion à l’administration est automatique.

Le code reste identique en cas de redémarrage avant la fin du setup. Une fois le compte créé, il est supprimé de la base, n’est plus imprimé au démarrage et ne peut plus initialiser l’instance. Deux demandes simultanées ne créent qu’un propriétaire. Un ancien onglet de setup ne peut pas remplacer le compte.

Les instances déjà configurées arrivent directement sur la Ouichlist et conservent leurs données. Changer une image, recréer le conteneur ou redémarrer TrueNAS ne relance pas le setup si `/app/data` est conservé.

## Adresse publique et mises à jour

Caddy est déjà installé sur le NAS. Ajouter le bloc de [deploy/Caddyfile.ouicheur](../deploy/Caddyfile.ouicheur) au Caddyfile existant `/mnt/Main/tank/caddy/caddy-conf/Caddyfile`, après sauvegarde. Il transmet les requêtes à `192.168.1.159:31000`. Conserver les ports globaux existants `8081` et `8443`, les redirections réseau et tous les autres sites. Valider le fichier dans le conteneur Caddy avant un rechargement avec `caddy reload` ; ne pas redémarrer les autres apps.

Le DNS `ouicheur.hugoloiseau.fr` doit atteindre le même Caddy que les autres domaines. Caddy gère le certificat HTTPS lorsque le DNS et les accès nécessaires sont en place : [HTTPS automatique](https://caddyserver.com/docs/automatic-https), [reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy). Ne pas exposer le port `31000` sur Internet. Le modèle garde `TRUST_PROXY=0` tant que l’accès direct au port de l’app reste possible.

Pour publier la Ouichlist, configurer le reverse proxy HTTPS et adapter `APP_ORIGIN` à l’adresse publique. Le setup et la connexion restent accessibles directement par l’IP ou le nom local du NAS, sans reconfigurer le domaine pour les tests. Chaque requête doit provenir du même protocole, hôte et port que l’adresse ouverte. Les cookies sont `Secure` pour les connexions HTTPS ; l’accès HTTP local garde sa propre session. Changer d’hôte demande de se reconnecter, sans refaire le setup.

Avant une mise à jour, sauvegarder le registre et ses images selon le [README](../README.md#sauvegarder-et-restaurer). Changer uniquement le tag de l’image et conserver les deux montages. Les migrations s’appliquent au démarrage. Une remise à zéro du stockage de données n’est pas une procédure de mise à jour.

En cas de problème d’écriture, vérifier le dataset et ses permissions. Si le navigateur refuse encore l’origine, recharger la page. Derrière un reverse proxy qui modifie l’hôte ou termine HTTPS, vérifier que `APP_ORIGIN` correspond à l’adresse publique, puis redémarrer l’application après correction. Si le code est absent des journaux alors qu’un compte existe, ouvrir `/admin` pour se connecter : l’installation est terminée.

## Déploiement automatique GitHub Actions

Les pull requests exécutent les tests sur les machines GitHub. Seuls les changements de `main` peuvent publier une image et lancer le déploiement. La production accepte uniquement les branches protégées. Les Actions sont verrouillées sur leurs commits et les déploiements sont sérialisés.

Le job rejoint le réseau privé avec [l’Action Tailscale](https://github.com/tailscale/github-action), puis appelle le script fixe `/root/ouicheur/deploy.py` via SSH. Aucun runner GitHub n’est installé sur le NAS. Le script met à jour l’app TrueNAS par [app.update](https://api.truenas.com/v25.10/api_methods_app.update.html), en conservant sa configuration et ses montages.

Installer [scripts/deploy-truenas.py](../scripts/deploy-truenas.py) à cet emplacement, propriété de `root`, dans un dossier non modifiable par le compte de déploiement. Accorder à ce compte uniquement l’exécution sans mot de passe de ce script. Utiliser une clé SSH dédiée à ce dépôt, limitée à cette commande dans `authorized_keys` :

```text
restrict,command="sudo -n /root/ouicheur/deploy.py \"$SSH_ORIGINAL_COMMAND\"" ssh-ed25519 CLE_PUBLIQUE github-actions-ouicheur
```

Le workflow transmet uniquement le digest comme commande SSH ; le script forcé le valide avant toute modification. Cette clé n’ouvre pas de shell et ne peut pas modifier les autres sites.

Configurer les valeurs suivantes dans **Settings → Secrets and variables → Actions** du dépôt :

| Type     | Nom                       | Valeur                                                                        |
| -------- | ------------------------- | ----------------------------------------------------------------------------- |
| Secret   | `TS_OAUTH_CLIENT_ID`      | Identifiant du client OAuth Tailscale dédié                                   |
| Secret   | `TS_OAUTH_SECRET`         | Secret du client OAuth, avec droit de créer des clés et tag `tag:ouicheur-ci` |
| Secret   | `TRUENAS_SSH_PRIVATE_KEY` | Clé privée SSH dédiée au déploiement                                          |
| Secret   | `TRUENAS_KNOWN_HOSTS`     | Clé hôte SSH du NAS, vérifiée avant enregistrement                            |
| Variable | `TRUENAS_HOST`            | Adresse Tailscale du NAS                                                      |
| Variable | `TRUENAS_USER`            | Compte de déploiement                                                         |
| Variable | `TRUENAS_DEPLOY_ENABLED`  | `true`, seulement après installation et configuration des accès               |

Dans Tailscale, autoriser le tag `tag:ouicheur-ci` à joindre uniquement le port SSH du NAS. Le client OAuth et la politique doivent utiliser ce même tag. Les secrets se saisissent directement dans GitHub ; ne jamais les committer ni les coller dans une conversation.

Avant chaque mise à jour, le script télécharge l’image, crée une sauvegarde cohérente de la base et des images dans `/app/backups/pre-deploy-DATE`, et conserve l’ancienne configuration dans `/root/ouicheur/compose-DATE.json`. Une sauvegarde échouée bloque la mise à jour. Le digest accepté est limité au package Ouicheur. Après redémarrage, les contrôles vérifient la santé du conteneur et l’URL publique.

En cas d’échec après migration, consulter les journaux avant toute restauration. Les sauvegardes sont conservées et aucune restauration automatique ne vient écraser les nouvelles contributions. Pour revenir en arrière, arrêter l’app, restaurer une sauvegarde vers un nouveau dossier selon le README, puis utiliser le digest précédent et ce dossier. Les sauvegardes de déploiement sont à inclure dans la politique de rétention du NAS.
