# Installer Ouicheur sur TrueNAS

Ouicheur fonctionne dans un conteneur Docker, avec deux volumes persistants pour les données et les sauvegardes. Le [modèle Compose](../compose.truenas.yaml) convient aux Apps Docker de TrueNAS 25.04 et 25.10.

## Installer l’application

1. Dans **Apps → Discover Apps → ⋮ → Install via YAML**, choisir le nom `ouicheur` et coller le modèle Compose. Voir la [documentation TrueNAS](https://www.truenas.com/docs/scale/25.10/scaleuireference/apps/installcustomappscreens/).
2. Remplacer `APP_ORIGIN` par l’adresse souhaitée, par exemple `http://192.0.2.10:31000` pour un accès local ou `https://envies.example.org` derrière un reverse proxy.
3. Installer, puis attendre que le conteneur soit sain. Le port de l’application est `31000` sur le NAS, relié au port `3000` du conteneur.
4. Ouvrir les journaux de l’application et copier le code affiché après **Setup code**.
5. Ouvrir l’adresse de l’application, saisir ce code, puis choisir le pseudonyme, le mot de passe et la devise. PayPal.Me est facultatif.

Les volumes `ouicheur-data` et `ouicheur-backups` sont créés par Docker, avec les permissions de l’image pour l’utilisateur `1000:1000`. Ils sont conservés lors des mises à jour. Pour conserver les données lors d’une suppression d’app, ne pas demander la suppression de ses volumes. Exporter également les sauvegardes hors du NAS.

L’image publiée est `ghcr.io/hloiseau/ouicheur:main`. Elle inclut Chromium pour les imports et ne requiert ni compilation sur le NAS ni clé API. Un tag `sha-COMMIT` permet de choisir une version précise.

## Ajouter Caddy

Ajouter le bloc de [deploy/Caddyfile.example](../deploy/Caddyfile.example) au Caddyfile existant en remplaçant le domaine et l’adresse du NAS :

```caddyfile
envies.example.org {
    encode zstd gzip
    reverse_proxy 192.0.2.10:31000
}
```

Le DNS du domaine doit atteindre Caddy. Le proxy doit pouvoir joindre le port `31000` du NAS. Conserver les options globales et les autres sites du Caddyfile existant.

Dans le shell du conteneur Caddy, valider puis recharger la configuration, en adaptant son chemin si nécessaire :

```sh
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Caddy obtient le certificat HTTPS lorsque le DNS et les accès HTTP/HTTPS sont en place : [HTTPS automatique](https://caddyserver.com/docs/automatic-https), [reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy). Vérifier ensuite `https://envies.example.org/api/health`.

Configurer la même adresse HTTPS dans `APP_ORIGIN`. Le modèle garde `TRUST_PROXY=0` tant que le port de l’app reste accessible directement. Le port `31000` sert au réseau local et au proxy ; seul Caddy reçoit le trafic Internet.

## Migrer une instance existante

Créer une sauvegarde avec la commande du [README](../README.md#sauvegarder-et-restaurer), puis la transférer dans un emplacement privé sur le NAS. Elle contient la base, les images et `manifest.json`.

Avant le premier démarrage de la nouvelle app, restaurer cette sauvegarde dans son volume de données vide. Avec Docker Compose et le même nom de projet que l’installation :

```sh
docker compose -f compose.truenas.yaml run --rm \
  -v /chemin/prive/ma-sauvegarde:/restore:ro \
  ouicheur node scripts/manage.ts restore /restore /app/data
docker compose -f compose.truenas.yaml up -d
```

La restauration refuse une base déjà existante. Elle conserve le compte, les envies et les participations, et révoque les anciennes sessions. Reconnectez-vous avec votre mot de passe habituel. Pour une app déjà gérée par TrueNAS, utiliser ses volumes existants et ses outils d’administration ; ne pas créer un second projet Compose à côté.

## Mettre à jour et sauvegarder

La CI publique lance les tests et publie l’image sur GHCR. Elle ne se connecte à aucun NAS et ne requiert aucun secret SSH ou Tailscale.

Avant une mise à jour, créer et exporter une sauvegarde. Dans le shell du conteneur Ouicheur :

```sh
node scripts/manage.ts backup /app/backups/avant-mise-a-jour
```

Utiliser ensuite la commande de mise à jour de l’app dans TrueNAS, ou modifier son image pour choisir un tag `sha-COMMIT`. Conserver les volumes. Pour une installation gérée directement avec Compose :

```sh
docker compose -f compose.truenas.yaml pull
docker compose -f compose.truenas.yaml up -d
```

Les migrations s’appliquent au démarrage et le compte existant reste configuré. Vérifier `/api/health` et l’affichage des envies après la mise à jour.
