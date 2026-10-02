# État des importateurs — 26 septembre 2026

## Prix marchands et conversion automatique

Le profil public `https://throne.com/claw61` identifie les produits et leurs variantes. Le prix est ensuite récupéré exclusivement chez le marchand : aucun prix, frais, livraison ou financement de Throne n’est repris. Amazon renvoyait une page intermédiaire avec HTTP 200 à notre client ; un nouvel accès à la même fiche avec l’identité native de Chromium fournit le produit. Aucun formulaire de contrôle n’est soumis. Chez Kojima, le sélecteur d’achat affiche un prix EUR alors que les balises génériques indiquent GBP : le montant et la devise de la variante choisie priment ensemble.

La préparation convertit automatiquement les prix étrangers vers la devise du profil (EUR sur l’instance vérifiée), avec le [flux quotidien de la BCE](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml). Une requête suffit pour tout le lot. Le prix et la devise d’origine, ainsi que la date du taux, restent dans l’aperçu ; le prix converti préremplit l’objectif. Une devise inconnue ou un taux indisponible laisse le prix d’origine et demande de réessayer, sans transformer un montant étranger en euros par simple changement d’étiquette. Un cadeau existant conserve sa propre devise lors d’un remplacement.

Vérification réelle du 26 septembre : **11 lignes, 11 images locales et 11 prix marchands en EUR**, pour **10 produits distincts**. Les deux affiches Artwork A/B gardent leurs variantes différentes ; le second Seagate 12 To reste désélectionné comme doublon. Les liens Amazon sont normalisés avec `www` pour retrouver les cadeaux déjà importés. Exemples lus chez les marchands : Sigma 523,90 EUR, clavier 119,99 EUR, Samsung 1 439,96 EUR et montre 1 170,95 EUR. Anicorn publie 48 USD pour chaque affiche et 65 USD pour le bracelet ; conversion avec les taux BCE du 25 septembre : 42,09 EUR et 57,00 EUR.

Les observations plus anciennes ci-dessous décrivent les étapes précédentes, notamment l’absence de conversion et l’ancienne devise GBP incorrectement lue pour la montre.

Validation : 46 tests unitaires, contrôle du transport Chromium, puis 4 scénarios de navigateur sur ordinateur/mobile dans Docker (profil réel, enregistrement, variantes et repli HTML). L’image validée est installée sur l’instance locale.

L’import **Throne automatique par URL** est vérifié sur `https://throne.com/claw61`, sous Windows et dans l’application Docker Linux : 11 cadeaux extraits. Les variantes marchandes sont conservées : les affiches Artwork A et B sont distinctes, seul le Seagate 12 To apparaît deux fois à l’identique. L’import **Amazon automatique par URL** est vérifié sur la liste partagée `21JDMRZC1ARHC` : 20 produits récupérés sur deux pages. Les formulaires normaux préparent l’aperçu après collage du lien.

## Accès réellement observé

Commande locale : `npm run probe:imports`, utilisant le même téléchargement que l’application, sans session utilisateur ni API privée. Chromium doit être installé hors Docker (`npm run browser:install`).

| Source | URL sondée                              | Résultat observé                                                                       |
| ------ | --------------------------------------- | -------------------------------------------------------------------------------------- |
| Amazon | `https://www.amazon.fr/hz/wishlist/ls/` | 2026-09-24 18:11:57 UTC : connexion interrompue, `read ECONNRESET`                     |
| Throne | `https://throne.com/`                   | 2026-09-24 18:11:57 UTC : HTTP 429, accès refusé ; aucun nouvel essai de contournement |

Ces essais du 24 septembre décrivent l’ancien client. Le 25 septembre, le transport corrigé télécharge automatiquement `https://throne.com/claw61` et prépare ses 11 produits. Le refus 429 de Vercel persiste avec Node, y compris en changeant les en-têtes ; Chromium reçoit le HTML public avec les produits intégrés, sans exécuter les scripts. L’import utilise cette lecture automatiquement après un 403/429. Les tests réels portent sur les routes de l’application et le formulaire, dans un conteneur Linux temporaire sans données utilisateur.

Le transport Chromium vérifie les adresses DNS publiques et fixe l’IP de connexion. Chaque redirection est interceptée avant connexion ; un changement d’origine déclenche une nouvelle validation DNS et une connexion fixée à l’adresse validée (trois redirections maximum). Les scripts, images, cadres et autres ressources sont bloqués, avec une limite de 8 Mo et un délai global de 15 secondes partagé avec la première tentative Node. Le navigateur est fermé à chaque tentative. Aucun CAPTCHA résolu ni session existante réutilisée.

## Vérification élargie du 26 septembre

Les quatre formes du profil `claw61` (HTTPS, HTTP, `www`, barre finale) donnent les mêmes 11 cadeaux. Les neuf liens marchands distincts de ce profil et l’annonce Chrono24 ont ensuite été récupérés par le client de l’application : **10 fiches avec titre, prix, devise et image téléchargée**, sous Windows puis via les routes authentifiées d’un conteneur Docker Linux temporaire. Les dix images sont converties en WebP et servies par l’application. Les formulaires Docker de récupération Chrono24 et d’import Throne sont également vérifiés dans le navigateur.

| Boutique              | Produits vérifiés                                                                  |
| --------------------- | ---------------------------------------------------------------------------------- |
| Amazon France         | `B09JVBB36L`, `B0G1528CH5`, `B0GTYK5GK8`, `B0DK59YKRS`, `B0CDTW2CNR`, `B0B94KSFTH` |
| Kojima Productions UK | Montre anniversaire LUDENS, variante `58607530377597`, prix GBP                    |
| Anicorn               | LUDENS Metal Print, variante `44070238519383`, et LUDENS Cuff, prix USD            |
| Chrono24              | Annonce Seiko Astron `id47455476`, 2 500 EUR                                       |

Corrections issues de ces essais : prix Open Graph localisés, variantes `ProductGroup.hasVariant`, données principales Amazon sans JSON-LD, pages dépassant 2 Mo et images JSON-LD. Les connexions IPv6 Amazon étaient intermittentes alors que les mêmes requêtes IPv4 aboutissaient ; le client privilégie désormais IPv4 lorsqu’elle est disponible, après validation de toutes les réponses DNS. Le User-Agent conserve l’identification explicite de l’application avec un format compatible. La lecture Chromium automatique est partagée par tous les imports HTML et extractions produit.

Les tests de listes Amazon couvrent les lignes imbriquées, prix avec séparateurs de milliers, devises du site et liens malformés. Les prix ci-dessus sont des observations datées, sans garantie de disponibilité future.

Les imports CSV/JSON refusent explicitement les fichiers vides et acceptent le BOM JSON. Le réimport affiche la devise du cadeau existant et refuse deux remplacements du même cadeau dans un lot, sans écriture partielle. Le téléchargement d’une image préserve les modifications saisies pendant son attente ; ces deux derniers cas sont testés dans les formulaires sur ordinateur et mobile.

## Liste Amazon réelle et pagination

Le lien fourni `https://www.amazon.fr/hz/wishlist/ls/21JDMRZC1ARHC?ref_=wl_share` a révélé une omission : le premier document contenait seulement **10 des 20 articles**. L’import suit maintenant la continuation publique `scrollState.showMoreUrl` tant que `lastEvaluatedKey` est présent. Amazon laisse une URL de continuation sur la dernière page : le curseur vide, et non l’absence d’URL, indique la fin.

Le client récupère les **20 titres, liens marchands, prix EUR et images** sous Windows. L’aperçu Docker Linux affiche également les 20 éléments sans erreur sur mobile et ordinateur. Les requêtes de pagination restent sur la même origine Amazon et le chemin public `/hz/wishlist/slv/items`, avec validation DNS pour chaque connexion. Les plafonds sont de 200 articles, 20 pages, 8 Mo cumulés et 15 secondes pour l’ensemble. Une boucle, une page inaccessible ou une limite dépassée fait échouer le travail sans enregistrer un aperçu partiel. Le test `tests/amazon-pagination.test.ts` reproduit l’omission avant correction et vérifie ces cas.

Le test réel dans un conteneur temporaire poursuit le formulaire jusqu’au bout : **20 images importées, converties en WebP et servies**, puis **20 cadeaux enregistrés en brouillons**, en EUR et sans financement. Un nouvel import retrouve les 20 doublons. Ces enregistrements sont faits uniquement dans la base de test ; la liste personnelle de l’instance utilisateur n’est pas modifiée.

## Extraction produit générique — complément du 26 septembre

### Publication et images automatiques

Le mode brouillon a été supprimé à la demande du propriétaire. Les envies créées manuellement et les imports validés sont directement publics ; l’archivage reste disponible. La migration `006` publie les anciens brouillons et conserve les archives. Les anciennes valeurs `draft` reçues d’un formulaire ouvert avant la mise à jour sont converties en `visible`.

Les imports Amazon et Throne lisent les fiches marchandes avec le même extracteur que le formulaire d’une envie. Les prix marchands gardent leur devise ; les prix convertis de Throne ne sont jamais repris, même si la fiche marchande échoue. Les identifiants de variantes fournis par Throne complètent les liens Shopify et Amazon avant extraction et détection des doublons. Les URL finales des fiches rapprochent également les liens Amazon avec et sans `www`.

Les imports Amazon, Throne, HTML, CSV et JSON téléchargent les images pendant la préparation, par groupes de quatre. Les produits préparés sont mis en cache dans l’aperçu. Le formulaire d’un produit récupère également l’image avec ses informations, sans bouton d’import d’image. Les images préparées sont stockées en WebP et incluses dans les sauvegardes, même avant validation d’une liste. Une image inaccessible est signalée sans perdre les autres informations du produit.

Vérification du 26 septembre 2026 : les 20 miniatures Amazon de 135 × 135 pixels sont remplacées par les images des fiches, de 801 à 1 500 pixels sur leur grand côté (couvertures Doga : 800 × 1 108). L’extracteur préfère l’original de l’image principale Amazon, puis sa plus grande résolution déclarée. Les cartes affichent l’image entière, sans le cadre beige ni les marges ajoutées auparavant.

Le parseur commun lit [Schema.org Product et Offer](https://schema.org/Product) dans les trois encodages usuels : JSON-LD, Microdata et RDFa. Il traite les références `@id` des graphes JSON-LD, les offres multiples en privilégiant leur URL, `AggregateOffer.lowPrice` et les spécifications de prix unitaires. Les prix de livraison, d’abonnement, réservés aux membres ou barrés ne sont pas utilisés comme prix unitaires. Les propriétés HTML restent limitées à leur produit et à leur offre, sans récupérer les prix d’un avis imbriqué. Open Graph reste un repli. Aucun contexte JSON-LD externe ni script marchand n’est exécuté.

Deux causes distinctes ont été reproduites puis corrigées :

- Amazon `B07218FXLK` : le prix accessible `.a-offscreen` est vide, mais le prix visible vaut **29,90 EUR**. Cette page ne publie ni JSON-LD produit, ni prix Microdata ou Open Graph ; la lecture HTML du bloc d’achat principal complète les standards, sans lire les recommandations ou les prix barrés.
- Back Market `8e20c4ac-1df0-4a5b-ad97-f041c41b47ee`, avec `l=11` : les requêtes Chromium interceptées étaient refusées. L’en-tête `Accept` HTML explicite permet la récupération par le transport commun, sans règle de domaine. Le JSON-LD existant donne le ThinkPad T14s G2, **540 EUR** et son image.

Ces deux URL passent sous Windows et dans un conteneur Docker Linux isolé. Le formulaire anglais sur ordinateur et français sur mobile récupère le prix et l’image locale WebP sans clic sur « Importer l’image », puis publie l’envie dès l’enregistrement. La récupération automatique préserve les changements de titre et de montant saisis pendant le téléchargement. Un échec de l’image conserve les métadonnées et permet l’enregistrement.

La couverture est générique pour les données publiées dans ces formats, sans garantie pour une page privée, un contrôle d’accès persistant ou des données absentes du HTML public. Le minimum d’une offre agrégée reste une suggestion ; les prix observés ci-dessus sont datés.

## Produits AmiAmi et récupération manuelle

Le 2 octobre 2026, le propriétaire signale HTTP 406 pour les fiches AmiAmi `FIGURE-055579-R207` et `FIGURE-055581-R235`. Le transport partagé tente désormais une seule lecture Chromium après HTTP 406, comme après HTTP 403/429. Les limites DNS/TLS, redirections, taille et délai restent identiques ; aucun script, compte ou contrôle d’accès n’est exécuté.

Le [diagnostic ponctuel depuis GitHub](https://github.com/hloiseau/ouicheur/actions/runs/37044460622) reçoit HTTP 403 sur ces deux liens, avec Node comme avec Chromium. La compatibilité réelle depuis le NAS reste à confirmer : l’ajout du cas 406 ne garantit pas qu’AmiAmi acceptera la seconde lecture. Les régressions réseau utilisent une boutique synthétique locale et vérifient une seule seconde tentative, la conservation du paramètre `scode`, l’absence de boucle lors d’un refus persistant et l’absence de nouvelle tentative sur HTTP 404.

Dans le formulaire, la récupération est facultative et ne complète que les champs vides restés inchangés depuis le début de la lecture. Une image choisie et les saisies effectuées pendant l’attente sont conservées. Le lien reste en lecture seule pendant la requête ; la lecture et l’enregistrement ont des libellés distincts. En cas d’échec, **Compléter manuellement** place le focus sur le nom de l’envie, conserve le lien et permet de saisir le montant puis d’enregistrer. Le détail technique reste accessible dans un bloc repliable. Les tests navigateur couvrent ce parcours en français sur mobile et en anglais sur ordinateur.

## Produits Chrono24

L’annonce `https://www.chrono24.fr/seiko/astron-limited--seiko--id47455476.htm?utm_source=chatgpt.com` répondait 403 en HTTP/1.1. HTTP/2 avec un User-Agent compatible identifiant Ouicheur reçoit 200. Le client partagé négocie désormais HTTP/2, avec HTTP/1.1 si le serveur ne le propose pas. Les vérifications TLS, DNS, redirections, types et tailles restent actives.

Vérification réelle le 25 septembre : titre Seiko Astron, **2 500 EUR**, image JPEG téléchargée puis stockée en WebP par l’application Docker. Le parseur prend en charge `ImageObject.contentUrl`, utilisé par Chrono24, ainsi que `url` et Open Graph. Le formulaire se préremplit avec le lien seul.

## Couverture implémentée

Amazon : éléments HTML de liste portant un identifiant de ligne / ASIN ; lien `/dp/` ou `/gp/product/`, titre, image et prix présents. Canonicalisation de l’ASIN et retrait des paramètres d’affiliation. Les lignes identifiées sans lien sont signalées, pas publiées silencieusement. La pagination publique annoncée dans `scrollState` est suivie jusqu’à son terme, dans les limites ci-dessus. Les listes privées et les formats nécessitant une session ou une autre API ne sont pas couverts.

Throne : produits présents dans `__NEXT_DATA__.props.pageProps.ssrWishlistItems` du HTML public, avec repli sur les produits JSON-LD. Ce format a été observé sur `claw61` ; il peut évoluer. Seuls les champs produit sont conservés : identifiant de souhait, titre, description, URL de la variante marchande et image. Les données de profil, les financements et les prix Throne sont ignorés. Les éléments masqués ou enregistrés pour plus tard sont exclus. Le prix et la devise proviennent ensuite de la fiche marchande : EUR pour les produits Amazon.fr testés, USD pour Anicorn et GBP pour la montre Kojima UK. Aucune conversion n’est effectuée. Un lien interne Throne sans URL marchande est marqué à corriger. Un script reCAPTCHA présent dans une page contenant des produits ne suffit plus à déclarer l’import bloqué.

### Importer une page Throne enregistrée

1. Ouvrir le profil public dans votre navigateur et attendre l’affichage des cadeaux.
2. Enregistrer avec **Ctrl+S**, au format **HTML** (page complète ou HTML uniquement).
3. Dans l’administration, choisir **Throne — page enregistrée (HTML)** et sélectionner le fichier `.html`, sans son éventuel dossier de ressources. Limite : 900 Ko.
4. Préparer l’aperçu, vérifier les objectifs et la devise, puis enregistrer la sélection. Les doublons de la même variante sont signalés et désélectionnés par défaut ; les variantes différentes restent sélectionnables séparément.

Ce mode fichier reste facultatif. Le HTML est analysé comme du texte : ses scripts ne sont jamais exécutés, ses ressources ne sont pas téléchargées et le fichier brut n’est pas conservé. L’aperçu couvre les cadeaux inclus dans la page fournie, jusqu’à 200, sans garantie sur les collections ou pages supplémentaires.

Les deux parcours passent par la même table de travaux, le format commun `ImportItem` et un aperçu éditable. Pas d’import d’adresses, de contributeurs, d’historique de paiement ou de montant déjà financé. Tout cadeau commence à zéro ; un remplacement explicite conserve les contributions locales existantes.

Les détections HTML peuvent cesser de fonctionner lorsque les sources changent. En cas de CAPTCHA, HTTP non 200, connexion requise ou absence de produit exploitable, l’application l’annonce et propose l’import HTML pour Throne ou CSV/JSON. Elle ne résout pas les CAPTCHA, ne rejoue pas de session et n’automatise pas la connexion.

## Vérifier une liste autorisée ultérieurement

```sh
npm run probe:imports -- "https://www.amazon.fr/hz/wishlist/ls/VOTRE_ID" "https://throne.com/VOTRE_PROFIL"
```

Puis faire l’import dans l’administration, comparer l’aperçu aux produits visibles sur la liste, corriger les éléments signalés et confirmer la sélection. Archiver la date, le nombre de produits et le résultat effectivement obtenu. Une lecture partielle du HTML ne démontre pas que toute la liste a été importée.

## Secours générique

CSV/JSON fonctionnel avec exemples dans `public/examples/`. Validation ligne par ligne, champs modifiables, sélection, détection de doublons par URL canonique et source/identifiant, choix explicite avant remplacement, validation transactionnelle du lot. Une erreur de validation conserve l’aperçu. Le texte source original et les champs inconnus ne sont pas conservés.

Une tâche distante en cours possède un bail de 30 secondes. Après arrêt/reprise, elle peut être relancée depuis l’administration ; trois prises au maximum. Les erreurs d’accès terminent la tentative : elles ne provoquent pas de trafic en boucle. Les aperçus prêts survivent aux redémarrages.
