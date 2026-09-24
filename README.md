# Wishlister

Une wishlist personnelle en français, libre et auto-hébergeable. Un propriétaire, des cadeaux ajoutés par liens, des contributions sans compte visiteur et des versements directs sur son **compte PayPal particulier**.

**La confirmation des versements est manuelle en V1.** Le propriétaire vérifie son activité PayPal et rapproche explicitement chaque transaction. L’application ne commande aucun produit, ne détient pas l’argent et n’ajoute aucune commission. Elle ne promet pas l’absence de frais PayPal.

## Démarrer avec Docker

Prérequis : Docker Engine / Docker Desktop démarré et Docker Compose.

```sh
cp .env.example .env
docker compose up -d --build
```

Sous PowerShell, remplacer la première ligne par `Copy-Item .env.example .env` si `.env` n’existe pas encore. Le projet livré dispose déjà d’un `.env` local sans secret.

Ouvrir **http://localhost:3000** : au premier démarrage, un assistant web demande votre pseudonyme, un mot de passe d’au moins 12 caractères, sa confirmation et votre devise. PayPal.Me est facultatif. **Aucun compte ni mot de passe par défaut.**

Un **code d’installation privé** apparaît dans les journaux de l’application (Docker Desktop, TrueNAS, ou `docker compose logs app`). Copier ce code dans l’assistant empêche un premier visiteur public de s’approprier l’instance. Le code persiste jusqu’à la création du propriétaire, puis est supprimé et définitivement désactivé. La connexion à `/admin` est automatique après création du compte. Un redémarrage conserve le compte et ne rouvre pas le setup.

Compléter ensuite le profil, le lien PayPal.Me personnel et les catégories, puis ajouter ou importer les cadeaux. L’instance est volontairement vide ; les données fictives restent dans les tests.

**TrueNAS 25.10 :** voir le [guide d’installation comme application](docs/truenas.md) et le [modèle YAML](compose.truenas.yaml). Le setup s’effectue dans le navigateur ; seule la lecture du code dans les journaux de l’application est nécessaire.

Le port est lié à `127.0.0.1` pour l’accès local et le reverse proxy. Deux volumes conservent les données et les sauvegardes : `wishlister-data` et `wishlister-backups` (préfixés par Compose). `docker compose down` conserve ces volumes. `down -v` les supprimerait.

## Développement sans Docker

Node **24 LTS** et npm. Un binaire Node 24 exact est également verrouillé dans les dépendances de développement pour harmoniser les scripts npm, sans modifier Node globalement.

```sh
npm ci
cp .env.example .env
npm run dev
```

Production locale : `npm run build`, puis `npm start`. Ces démarrages affichent le code d’installation dans le terminal si le compte n’existe pas encore. Si `.env` est déjà configuré, ne le remplacez pas. Le moteur SQLite intégré à Node est utilisé directement ; il n’y a ni ORM ni serveur de base à administrer. Les migrations SQL de `migrations/` sont appliquées transactionnellement à l’ouverture de la base.

| Commande                                             | Usage                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `npm run dev`                                        | Développement sur localhost:3000                                  |
| `npm run build` / `npm start`                        | Compiler / démarrer en production                                 |
| `npm run setup`                                      | Alternative locale facultative au setup web, une seule fois       |
| `npm run password`                                   | Récupérer l’accès depuis le serveur, révoquer toutes les sessions |
| `npm run check`                                      | Vérifier TypeScript                                               |
| `npm test`                                           | Tests du registre, sécurité, imports, sauvegarde/restauration     |
| `npm run browser:install`                            | Installer Chromium de test dans `.local/`                         |
| `npm run test:e2e`                                   | Parcours navigateur ordinateur + mobile, après compilation        |
| `npm run backup -- chemin/nouveau-dossier`           | Sauvegarde cohérente, utilisable application ouverte              |
| `npm run restore -- sauvegarde nouveau-data-dir`     | Restaurer vers une destination sans base existante                |
| `npm run probe:imports -- "URL_AMAZON" "URL_THRONE"` | Tester vos liens autorisés, sans contournement                    |

## Utiliser les cadeaux et contributions

1. Dans **Mes envies**, coller un lien produit. Les métadonnées HTML / JSON-LD alimentent un aperçu modifiable. Un refus d’accès laisse le lien et tous les champs manuels disponibles. Les images se téléchargent explicitement ou se choisissent depuis un fichier ; elles sont décodées, nettoyées et stockées localement.
2. Définir un objectif, une catégorie et la visibilité. Un brouillon ou un cadeau archivé reste privé. Le prix extrait est une suggestion datée. Le prix cible peut inclure la livraison et être modifié sans modifier les contributions reçues.
3. Le visiteur choisit son montant. L’intention est enregistrée avant l’ouverture du lien PayPal.Me. Le lien comprend uniquement le nom PayPal.Me, le montant et la devise. Aucune référence marchande n’y est inventée.
4. « J’ai envoyé l’argent » annonce un versement ; cela ne crédite rien. Le visiteur conserve sa page de suivi privée. La référence aléatoire locale peut aider une discussion avec le propriétaire, mais ne prouve pas le paiement et n’est pas automatiquement transmise à PayPal.
5. Dans **Contributions**, le propriétaire vérifie le versement réellement reçu et son association au bon cadeau. Il saisit la référence réelle de transaction, brut, frais connus et justification. Les éléments incertains restent « Détectée, à vérifier » ; le montant et l’heure seuls ne suffisent pas.

Les cadeaux affichent le **net confirmé restant** : somme des nets reçus moins les retraits nets constatés. Avec frais inconnus, le brut reçu restant est affiché séparément et **ne compte pas dans le net confirmé**. Saisir `0` seulement quand l’absence de frais est vérifiée. Toutes les valeurs en base sont des centimes entiers ; aucune arithmétique flottante de paiement.

Un dépassement d’objectif est conservé et affiché intégralement. L’objectif atteint, la fermeture manuelle ou l’achat effectif empêchent de nouvelles intentions. Les intentions déjà créées restent rapprochables, même après expiration. Une intention non annoncée expire après sept jours ; aucune contribution historique n’est supprimée.

Un changement de devise de l’instance concerne les nouveaux cadeaux. Les cadeaux existants conservent leur devise et ceux dans une ancienne devise sont fermés aux nouvelles intentions. Le destinataire PayPal.Me est conservé sur chaque intention afin qu’une modification ultérieure du profil n’en change pas le lien.

## Corrections, remboursements et journal

Une transaction ne peut confirmer qu’une intention et une intention reçoit au plus une transaction. Deux paiements effectivement distincts nécessitent deux intentions ; si le second arrive après fermeture, conserver son rapprochement hors application jusqu’à disposer d’une intention correspondante : ne jamais fusionner ses références dans une fausse transaction.

Pour corriger un montant, compléter des frais, enregistrer un remboursement ou une annulation confirmée, utiliser **Corriger / rembourser**. Saisir les nouveaux **totaux cumulés**, jamais un delta : brut initial corrigé, frais, total brut remboursé et total net à retirer du financement. Par exemple : 25 € bruts, 1 € de frais, puis 10 € remboursés et 10 € nets retirés donnent 14 € nets restants. Pour un remboursement intégral, le financement du versement doit être nul. Un litige en cours reste une indication distincte et ne retire aucun argent automatiquement.

La révision attendue empêche qu’une ancienne page de correction écrase une opération récente. Les événements sont dédupliqués et chaque confirmation/correction est enregistrée dans le journal. L’origine publique reste « Confirmé par le propriétaire » même lorsque l’administrateur a consulté une source externe.

## Imports Amazon, Throne et fichiers

**Statuts distincts, sans succès d’intégration externe inventé :**

| Source     | Implémentation V1                                                                       | Validation                                                                                     |
| ---------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Amazon     | Adaptateur de lignes produit du HTML public, identifiants ASIN, métadonnées disponibles | Fixtures testées ; accès réseau local interrompu. Aucune liste personnelle réelle validée      |
| Throne     | Adaptateur de produits JSON-LD dans le HTML public                                      | Fixtures testées ; entrée publique répondant HTTP 429. Aucune liste personnelle réelle validée |
| CSV / JSON | Format commun, aperçu, sélection, édition et dédoublonnage                              | Tests locaux exécutés ; exemples fournis                                                       |

L’import natif ne se connecte pas aux comptes, n’appelle aucune API privée et n’exécute pas JavaScript. Si une source n’expose que sa coquille JavaScript, refuse l’accès ou présente un CAPTCHA, le traitement s’arrête avec son diagnostic. Aucun contournement. Un fichier générique n’est pas présenté comme une réussite de l’import natif.

Les travaux et aperçus sont persistés en SQLite. Une tâche interrompue peut être reprise depuis l’administration après expiration du verrou de 30 secondes, avec trois prises de tâche au maximum. Une erreur explicite demande de créer un nouvel import après résolution du problème ; il n’y a pas de boucle de requêtes ni de synchronisation permanente.

Les exemples [CSV](public/examples/import.csv) et [JSON](public/examples/import.json) contiennent : `source_id`, `url`, `title`, `description`, `image_url`, `price`, `currency`. Prix décimal sous forme de texte, 200 éléments / 900 Ko maximum, CSV UTF-8 avec en-tête et séparateur virgule. Les champs inconnus sont ignorés. Aucune adresse personnelle, donnée de contributeur ni ancien financement n’est importé. Les devises ne sont jamais converties implicitement.

Une URL marchande manquante reste signalée avant publication. Réimporter ne remplace pas vos modifications sans choix explicite. La validation finale est atomique : un conflit annule l’enregistrement du lot et conserve son aperçu. Voir [l’état détaillé des importateurs](docs/imports-status.md).

## Sauvegarder et restaurer

```sh
# Docker, application en fonctionnement :
docker compose exec app npm run backup -- /app/backups/ma-sauvegarde
# Exporter le dossier hors du serveur / volume Docker :
docker compose cp app:/app/backups/ma-sauvegarde ./ma-sauvegarde
```

La sauvegarde utilise **SQLite `VACUUM INTO`**, qui produit un instantané cohérent des données validées, y compris celles du journal WAL. Elle ouvre ensuite cet instantané et copie les images qu’il référence. Les images adressées par contenu sont immuables : une modification concurrente ne remplace pas leur contenu. Ne copiez pas seulement `wishlist.sqlite` à chaud.

Le dossier contient la base, les images référencées et `manifest.json` : version, empreintes SHA-256 et configuration `APP_ORIGIN` / `TRUST_PROXY`. Il contient aussi le hachage d’accès du propriétaire et les messages privés ; conservez-le dans un emplacement privé. Le logiciel n’a aucun secret API à sauvegarder. Les paramètres de votre reverse proxy restent à sauvegarder à part.

Restaurer sur une **nouvelle instance arrêtée ou non initialisée**, dans un volume vide :

```sh
docker compose stop app
# Adapter le chemin de montage au dossier de sauvegarde local :
docker compose run --rm -v ./ma-sauvegarde:/restore:ro app npm run restore -- /restore /app/data
docker compose up -d
```

La restauration refuse toute base existante. Elle vérifie les noms de fichiers, leurs empreintes et `PRAGMA integrity_check`, puis copie la base et les images. Toutes les sessions restaurées sont révoquées. Reporter les valeurs utiles de `data/restored-config.json` dans `.env`, adapter `APP_ORIGIN` au nouveau domaine, et se reconnecter avec le mot de passe sauvegardé ou lancer la récupération locale.

Pour une installation sans Docker : `npm run restore -- ./ma-sauvegarde ./nouveau-data`, puis configurer `DATA_DIR=./nouveau-data`. La restauration et le redémarrage d’une connexion SQLite sont testés automatiquement ; voir [les vérifications de livraison](docs/verification.md).

## Domaine et HTTPS

Publier seulement après avoir choisi le domaine et configuré le propriétaire. Pointer le domaine vers votre serveur. Conserver le port 3000 sur l’interface locale et placer un reverse proxy HTTPS devant. Exemple Caddy installé sur le même serveur :

```caddyfile
envies.example.org {
    reverse_proxy 127.0.0.1:3000
}
```

Configurer `APP_ORIGIN=https://envies.example.org`, puis recréer le conteneur avec `docker compose up -d`. Cette valeur doit correspondre exactement à l’origine utilisée dans le navigateur, faute de quoi les écritures sont refusées. Avec HTTPS, les cookies portent `Secure` ; ils sont toujours `HttpOnly` et `SameSite=Strict`, avec expiration à douze heures.

`TRUST_PROXY=1` ne doit être activé que si le proxy de confiance remplace réellement `X-Forwarded-For`, et qu’un client ne peut pas contourner ce proxy. Sinon la limitation utilise un quota partagé. Les valeurs par défaut sont 10 tentatives de connexion / 15 minutes, 30 intentions / heure par adresse de confiance ou quota partagé, 300 intentions / heure sur l’instance, et des limites supplémentaires sur extraction/imports/images.

La V1 n’a aucun listener de paiement ni besoin d’accès entrant PayPal spécifique. Seul le trafic web habituel entre par le reverse proxy. Aucun service SaaS central, envoi d’e-mails payant ou compte professionnel n’est nécessaire. Les polices, scripts et images affichés restent locaux ; aucune télémétrie applicative ni suivi publicitaire.

## Sécurité et architecture

Monolithe Next.js / React / TypeScript, SQLite Node, images WebP locales. Les domaines sont dans `lib/` : `auth`, `gifts`, `payments`, `imports`, `metadata`, `fetch-safe`, `images`, `backup`. Les routes contrôlent les sessions et l’origine avant les écritures ; les extractions réseau sont réservées à l’administrateur. Mots de passe scrypt, sel aléatoire, sessions aléatoires dont seul le hachage est stocké.

L’initialisation web exige un code aléatoire de 192 bits généré au démarrage et conservé dans le stockage privé jusqu’à utilisation. Il n’est jamais renvoyé par HTTP. `/api/setup` vérifie l’origine, limite les essais à 10 par 15 minutes sur l’instance et borne le corps à 16 Ko. La création du propriétaire et la suppression du code sont atomiques, y compris en cas de requêtes concurrentes. Une instance déjà configurée refuse toute nouvelle initialisation.

Le téléchargement refuse les protocoles non HTTP(S), les identifiants dans les URLs, les ports inattendus, les IP privées/réservées IPv4 et IPv6 et les résolutions DNS mixtes. Il fixe l’IP validée pour la connexion, revalide chaque redirection et impose trois redirections / 15 secondes / 2 Mo HTML / 5 Mo image. Les images raster sont décodées avec une limite de pixels, réencodées et débarrassées de leurs métadonnées ; SVG refusé. Les textes sont échappés par React, le HTML externe n’est jamais rendu ni exécuté.

Le journal et les contributions sont conservés. L’écran affiche les 1 000 dernières intentions, les 50 derniers imports et les 100 dernières opérations ; l’export contient le registre et le journal complets. Cette limite de vue convient à la V1 personnelle ; prévoir une pagination avant un usage dépassant ces volumes.

Le point d’évolution des paiements est le registre `lib/payments.ts` et ses tables transaction/événements. Aucun endpoint n’accepte une provenance « vérifiée » fournie par un visiteur. Un futur adaptateur devra démontrer authenticité, destinataire, statut, montants, devise et association certaine avant d’écrire un événement vérifié. [Étude PayPal](docs/payments-feasibility.md).

## Vérification et licence

```sh
npm run check
npm test
npm run build
npm run browser:install
npm run test:e2e
```

Les tests navigateur utilisent le port 3211 pour les parcours courants et une instance vide sur le port 3213 pour chaque scénario de setup. Les données restent dans `.local/e2e/` et `.local/e2e-setup/`. Ils n’ouvrent jamais PayPal et n’effectuent aucun paiement. Les captures sont dans `test-results/` et le rapport dans `playwright-report/`, tous ignorés par Git. [Détail des vérifications et limites](docs/verification.md).

Documentation technique consultée : [installation Next.js](https://nextjs.org/docs/app/getting-started/installation), [déploiement standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [SQLite Node](https://nodejs.org/api/sqlite.html), [scrypt Node](https://nodejs.org/docs/latest-v24.x/api/crypto.html), [Cheerio](https://cheerio.js.org/docs/basics/loading/), [réencodage Sharp](https://sharp.pixelplumbing.com/api-output/).

Licence [MIT](LICENSE). Le dépôt local n’est pas publié et aucun déploiement public n’est effectué.
