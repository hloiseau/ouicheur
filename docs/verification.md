# Vérifications de livraison

## Finalisation du 3 octobre 2026

Les contrôles reproductibles actuels sont définis dans `.github/workflows/ci.yml`.
Ils couvrent Linux AMD64/ARM64, TypeScript/format/build, tests métier, transport
Chromium, scénarios Playwright ordinateur et Pixel 7 émulé, axe et Docker avec
redémarrage, sauvegarde/restauration et UID personnalisé. La CI de la PR et du
commit final fait foi ; les résultats historiques ci-dessous ne la remplacent pas.

Le test `release-readiness.test.ts` reconstruit chacun des 23 schémas historiques,
les migre, vérifie l’intégrité et le registre financier puis restaure une sauvegarde
sur une copie isolée. Les tests des fonctions concernées couvrent aussi les nouveaux
comptes, sessions, préférences, réservations, notifications et échanges.

`wishlist-query.test.ts` mesure 10 000 envies synthétiques : 24 cartes par réponse,
17 Ko environ, 180–300 ms observés dans les environnements de développement/CI.
Voir [les limites de cette mesure](performance.md). Les tests navigateur vérifient
la dernière page, la concurrence, les catégories ciblées et les images révoquées.

| Environnement                          | Validation réellement disponible                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Chromium Linux ordinateur/mobile émulé | CI des PR, captures synthétiques inspectées                                                              |
| Docker AMD64 et ARM64                  | CI native, worker et conteneur                                                                           |
| TrueNAS 25.04                          | Retour positif du propriétaire sur une image antérieure aux derniers ajouts ; référence finale à relever |
| Unraid                                 | Retour positif des proches avant les derniers ajouts ; version/digest et recette finale à relever        |
| Safari / iPhone / iPad réels           | Non testés pendant cette finalisation                                                                    |
| SMTP et paiements réels                | Aucun envoi ni paiement réel pendant les tests                                                           |

Les durées sont visibles par étape dans chaque run ; un passage navigateur dure
environ 4–6 minutes dans les derniers runs. Les caches npm et Docker sont déjà actifs.
Les vérifications réseau marchands réels restent distinctes des fixtures CI.

## Historique conservé

## Évolution produit 1.1.0 — 28 septembre 2026

Les résultats associés au commit final sont accessibles depuis la
[pull request de finalisation](https://github.com/hloiseau/ouicheur/pull/1).
La matrice de CI utilise deux machines natives, Ubuntu AMD64 et ARM64. Chaque
architecture exécute le formatage, TypeScript, **59 tests unitaires/intégration**,
un contrôle réseau Chromium, la compilation, **34 scénarios navigateur**
ordinateur/mobile, puis la construction et le test du conteneur réel. Une
publication d’image requiert le succès des deux architectures.

Les nouveaux contrôles couvrent la migration d’une base déjà remplie, la
conservation des contributions, les listes privées et leurs images, la révocation
des liens, les réservations concurrentes, le mode strict, les relevés de prix,
les notifications avec reprise, la planification des sauvegardes, la restauration
avec révocation des accès, les quotas et le nettoyage sans perte du registre.
Le conteneur lance réellement Chromium et Sharp et vérifie le téléchargement
d’une sauvegarde depuis l’administration, en plus du premier démarrage,
des redémarrages et de la restauration dans une nouvelle instance.

Les [captures de démonstration](screenshots/README.md) ont été inspectées sur
ordinateur et en vue étroite. Les contrôles axe-core incluent les nouveaux écrans
de listes et de maintenance. Toutes ces données sont fictives. Le contrôle npm de
production signale **0 vulnérabilité connue** à cette date ; son périmètre reste npm.

La CI conserve la taille non compressée donnée par `docker image inspect` dans
`image-size-amd64.txt` et `image-size-arm64.txt`. Elle mesure aussi l’ancienne image
AMD64, au digest documenté dans l’audit, avec la même commande pour comparer des
grandeurs identiques. Ces résultats se trouvent dans les artefacts de la CI ;
ils ne mesurent ni la RAM ni les performances d’un NAS.

Le retour positif du propriétaire sur TrueNAS concerne la version précédente.
Cette évolution nécessite encore un essai sur son NAS, avec sauvegarde préalable ;
Unraid et Safari/iOS réels n’ont pas été essayés. Les soumissions aux catalogues
restent suspendues. Voir le [guide de mise à jour](product-features.md).

## Historique antérieur à la finalisation produit

**Actualisation du 28 septembre 2026 :** les paragraphes ci-dessous sont des résultats historiques. L’image GHCR est désormais publiée et lisible anonymement ; la [CI du commit étudié](https://github.com/hloiseau/ouicheur/actions/runs/36264329576) est verte. L’[audit du 28 septembre](review-2026-09-28.md) distingue les nouveaux contrôles des essais non réalisés. Le propriétaire a ensuite signalé un essai positif de cette version sur son TrueNAS. Ce retour ne couvre pas encore l’évolution produit en cours ; Unraid reste à essayer.

Exécution le **24 septembre 2026**, sous Windows, avec Node 24.21.0 local au projet et Docker Desktop / moteur Linux 28.3.3. Application Next.js 16.3.6, React 19.3.0. Dépendances verrouillées dans `package-lock.json`.

## Résultats

| Vérification                               | Résultat                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                            | TypeScript sans erreur                                                                                                                |
| `npm run format:check`                     | Sources et documentation formatées                                                                                                    |
| `npm test`                                 | 12 tests réussis                                                                                                                      |
| `npm run build`                            | Compilation de production réussie                                                                                                     |
| `npm run test:e2e`                         | 6 scénarios validés : parcours, accessibilité et premier démarrage sur ordinateur et mobile                                           |
| `docker compose build`                     | Image Linux construite avec succès                                                                                                    |
| `npm run test:docker`                      | Démarrage, lecture publique, authentification, financement, redémarrage, sauvegarde et restauration dans un nouveau conteneur réussis |
| Audit des dépendances npm à l’installation | Aucune vulnérabilité signalée lors de l’exécution ; constat daté                                                                      |

## Scénarios couverts

Complément du **26 septembre 2026 — revue des imports, extractions et images** : **33 tests unitaires/intégration**, le test du transport Chromium et **20 scénarios navigateur ordinateur/mobile** réussis. TypeScript, formatage et compilation de production réussis. L’image Linux passe aussi `npm run test:docker` : premier démarrage, session, instance existante, financement fictif, redémarrage, sauvegarde et restauration. Les nouveaux contrôles portent sur les prix Open Graph localisés, les variantes produit, les données Amazon, les lignes de liste imbriquées, le BOM et les fichiers vides, la devise au réimport, le refus transactionnel d’un double remplacement et la conservation des saisies pendant un téléchargement d’image. Les tests réseau couvrent aussi les redirections vers une autre origine publique, leur limite, les pages marchandes de 3 Mo et la préférence IPv4 sans relâcher les contrôles DNS.

Vérification réelle sous Windows : quatre variantes du lien Throne `claw61` donnent 11 cadeaux ; les neuf liens marchands distincts et Chrono24 donnent **10 fiches avec titre, prix, devise et image téléchargée**, dont six produits Amazon. Les mêmes dix produits passent ensuite dans un conteneur Docker Linux temporaire, via les routes authentifiées : les dix images sont téléchargées, converties en WebP et servies correctement. Le navigateur valide aussi les formulaires Chrono24 et Throne par collage du lien. [Liste des produits et détails des corrections](imports-status.md).

Complément du **26 septembre 2026 — liste Amazon réelle** : la liste partagée `21JDMRZC1ARHC` contenait 20 articles, mais seuls les dix premiers étaient présents au chargement initial. Après correction de la pagination publique, **34 tests unitaires/intégration** et le contrôle Chromium passent. La compilation Windows et Docker Linux réussit. Dans un conteneur temporaire, les aperçus mobile et ordinateur contiennent les 20 articles avec prix EUR et images ; les 20 images sont téléchargées depuis le formulaire, stockées en WebP et servies correctement. L’enregistrement crée 20 brouillons sans financement ; le réimport détecte les 20 doublons. Le nouveau test reproduit l’omission initiale et refuse les boucles, destinations étrangères, dépassements et erreurs de page sans aperçu partiel.

La relance de la suite navigateur générale a été interrompue : les fichiers de compilation du serveur Windows partagé ont changé pendant l’exécution (`.next/BUILD_ID` absent et réponses HTTP 500 pour les scripts `_next/static`), alors qu’une autre session de test travaillait dans `.local/home-check`. Cette relance n’est pas comptée comme réussie. La vérification Amazon ci-dessus utilise une image Docker immuable indépendante et est passée intégralement. Le contrôle de format des fichiers de cette correction passe ; le contrôle global signale aussi le nouveau fichier de travail parallèle `tests/e2e/profile.spec.ts`, laissé intact.

Complément du **25 septembre 2026 — imports automatiques corrigés** : 20 tests unitaires/intégration réussis et un test Chromium réel de téléchargement (redirections, scripts/ressources bloqués, adresse privée refusée, limite de taille et délai). Les tests HTTP négocient réellement TLS et HTTP/2, vérifient le repli HTTP/1.1 et refusent un certificat non approuvé. Les deux régressions ont été observées avant correction : HTTP 403 et image `contentUrl` ignorée. TypeScript et compilation Docker Linux réussis.

Vérification dans un conteneur Linux temporaire avec les restrictions Compose (`no-new-privileges`, capacités supprimées) : `/admin/extract` récupère l’annonce Chrono24 `id47455476`, son titre, 2 500 EUR et son image ; `/admin/images` la stocke en WebP et la sert correctement. L’import Throne par URL passe à `preview` avec 11 produits et 2 doublons. Le navigateur confirme les deux parcours par collage du lien, sans HTML fourni ni favori JavaScript. Aucune donnée de l’instance utilisateur n’est utilisée par ces tests.

Le **26 septembre 2026**, le mode « Capture from my browser » est supprimé à la demande du propriétaire : interface, favori JavaScript, réception du fragment et fourniture de HTML à l’extraction produit. L’ajout d’une envie utilise le lien produit. Les tests du mode supprimé sont retirés ; les contrôles d’analyse des métadonnées et de refus des pages de contrôle sont conservés dans `tests/metadata.test.ts`. Vérification : 34 tests réussis, compilation Docker avec contrôle TypeScript réussie, puis formulaire anglais sur ordinateur et français sur mobile vérifiés dans un conteneur isolé. Le bloc supprimé est absent et le lien Chrono24 préremplit toujours le titre et l’objectif de 2 500 EUR, avec une requête contenant uniquement l’URL.

1. **Initialisation et accès** : l’assistant web exige le code des journaux, refuse un code incorrect, une origine étrangère et des mots de passe différents, puis ouvre une session. Le code n’apparaît pas dans le HTML. Il persiste avant initialisation, est supprimé à la création du propriétaire et ne permet plus de rejouer le setup après redémarrage. Deux connexions concurrentes ne créent qu’un propriétaire. L’alternative CLI et la récupération locale restent testées, avec vérification scrypt et révocation des sessions lors d’un changement de mot de passe.
2. **Cadeaux** : métadonnées HTML / JSON-LD fictives, prix en centimes et date d’extraction, image SVG rejetée. Le navigateur provoque un échec d’extraction puis enregistre un cadeau manuellement et le publie.
3. **Contributions** : deux intentions de même montant sur des cadeaux distincts restent séparées. Un envoi déclaré compte immédiatement dans la progression, sans créer de versement confirmé ; détection et expiration seules ne comptent rien. Déclaration répétée, refus, validation ultérieure et remboursements ne produisent pas de double comptage. Identifiants aléatoires sur 256 bits. Vérification du **26 septembre 2026 — parcours raccourci** : 8 tests ciblés registre/traductions, compilation de production et 4 scénarios navigateur ordinateur/mobile réussis. Ouverture directe de PayPal simulée, absence de lien vers l’onglet d’origine, lien de secours si les fenêtres sont bloquées, jauge et fermeture à l’objectif avant validation vérifiés. Captures du suivi inspectées sur les deux formats ; aucun versement réel.
4. **Validation** : les boutons **Valider** et **Refuser** enregistrent la décision du propriétaire sans référence, frais ni justification à saisir. La validation conserve le total déjà compté ; le refus le retire. Répéter une décision ne duplique pas le journal et un refus peut être corrigé. Aucune transaction PayPal ni absence de frais n’est inventée. Les versements détaillés existants conservent leur correction dédiée : confirmation manuelle idempotente, transaction unique, provenance manuelle imposée même si l’entrée tente de déclarer `verified`. Deux workers / connexions SQLite concurrentes confirment une seule fois. Une intention expirée reste rapprochable. Vérification du **26 septembre 2026 — deux boutons** : 43 tests unitaires/intégration, compilation de production et 4 scénarios ordinateur/mobile réussis. Captures de la fiche sans formulaire inspectées ; accès anonyme et origine étrangère refusés ; total et suivi visiteur cohérents après validation, refus et correction du refus.
5. **Montants** : frais inconnus exclus du net confirmé mais brut restant inclus dans la progression, dépassement conservé, nouvelles intentions fermées dès que les participations atteignent l’objectif, aucun achat automatique. Ancienne devise et destinataire PayPal.Me de l’intention préservés.
6. **Événements** : rejeu d’une correction sans double retrait, révision obsolète refusée, remboursement partiel puis total avec historique correct. Un litige seul ne retire aucun financement.
7. **Imports** : fixtures Amazon / Throne, éléments sans lien à corriger, CSV et JSON, aperçu avant écriture, doublons, absence de financement importé, remplacement explicite. Le navigateur importe un JSON puis présente un doublon au réimport sans enregistrement silencieux. L’état d’une tâche en cours est conservé dans la sauvegarde.
8. **Sécurité HTTP** : confirmation interdite à un visiteur non connecté, origine malveillante refusée, accès aux métadonnées cloud bloqué, quota de connexion testé. IP privées/réservées, IPv6, IP encodées en entier/hexadécimal, DNS mixtes, protocoles et borne de redirections.
9. **Docker et sauvegarde** : le conteneur neuf affiche son code, le conserve après redémarrage, accepte le setup web, conserve la session et ferme ensuite l’initialisation. Une instance existante reste utilisable. L’instantané SQLite utilise `VACUUM INTO` : image WebP restaurée à l’identique, intégrité SQLite, refus d’écrasement d’une base existante, sessions révoquées. Le test Docker vérifie 19 € nets avant/après redémarrage puis après restauration dans un autre conteneur.
10. **Navigateur** : page publique, recherche sans résultat, cadeau, intention, lien PayPal exact, déclaration, connexion, validation/refus en un clic, correction d’un refus, extraction en erreur, ajout manuel, import JSON et doublon. Messages privés absents des pages publiques et références PayPal absentes du suivi visiteur. Aucun débordement horizontal détecté sur les vues principales. Captures ordinateur/mobile inspectées.

### Extraction générique et image automatique — 26 septembre 2026

37 tests unitaires réussis, TypeScript et compilation Docker réussis ; le test Chromium conserve les contrôles DNS, redirections, tailles et délais. Les nouvelles régressions couvrent le prix visible Amazon lorsque sa copie accessible est vide, les graphes Schema.org avec références, offres multiples, prix détaillés, Microdata et RDFa. Les spécifications réservées aux membres sont ignorées au profit du prix public.

Le scénario `tests/e2e/product-extraction.spec.ts` échoue sur l’ancienne image Docker, qui n’envoie aucune demande automatique de téléchargement. Il passe sur la nouvelle image, sur ordinateur et mobile : l’image est importée en WebP, les saisies faites pendant l’attente sont conservées, le cadeau enregistré contient bien ces saisies et l’image. Une réponse d’erreur sur l’image conserve le titre et le prix et permet l’enregistrement.

Essais réels dans une base Docker temporaire : Amazon `B07218FXLK` à 29,90 EUR et Back Market `8e20c4ac-1df0-4a5b-ad97-f041c41b47ee?l=11` à 540 EUR. Les routes authentifiées et les formulaires anglais sur ordinateur / français sur mobile récupèrent les deux images automatiquement puis enregistrent les brouillons. Les captures sont inspectées. Le contrôle précédent Chrono24, Throne et des neuf produits marchands distincts passe également avec titre, prix, devise et image. Les données de l’instance utilisateur restent hors de ces tests.

## Accessibilité

Contrôles axe-core WCAG 2 A/AA et 2.1 A/AA sur la page publique, la connexion, l’assistant d’installation et la vue d’ensemble administrateur, en Chromium ordinateur et Pixel 7 simulé. Aucun problème détecté après correction des contrastes. Contrôle de présence du focus clavier. Formulaires natifs, libellés, boutons, progression nommée, lien d’évitement et états annoncés.

Ces contrôles et captures ne constituent pas une certification ni un test exhaustif avec tous les lecteurs d’écran. Aucun test Safari / iOS réel effectué.

## Non validé réellement

- Aucun compte PayPal connecté, aucun transfert, remboursement ou webhook PayPal réel/sandbox. Seule la construction documentée du lien est vérifiée. Les confirmations des tests sont fictives. L’interface interne `recordConfirmedPayment` sépare le registre d’un futur adaptateur, mais **aucun adaptateur automatique n’est livré ou activé**. Une route web ne peut sélectionner la provenance `verified`.
- Les listes privées ou exigeant une connexion ne sont pas couvertes. Les résultats Amazon, Throne et Chrono24 ci-dessus sont des vérifications datées des liens testés, sans garantie sur tous les formats de listes ou annonces. [Détail](imports-status.md).
- Aucun domaine, certificat public ou déploiement Internet configuré. L’accès local est limité à la machine ; le README explique HTTPS.
- Ces essais automatisés ne documentent pas un déploiement natif TrueNAS. Le propriétaire a confirmé le 28 septembre le bon fonctionnement de la version précédente sur son propre TrueNAS. Le modèle Compose pour TrueNAS 25.10 a passé la validation de syntaxe Docker Compose. Depuis le 26 septembre, l’image `ghcr.io/hloiseau/ouicheur:main` est publiée ; son accès anonyme a été vérifié le 28 septembre. La publication de l’image ne valide pas l’installation native NAS. [Guide TrueNAS](truenas.md).
- Le module SQLite natif est fourni par Node LTS et son API conserve un statut de stabilité évolutif dans la documentation Node. Le runtime est verrouillé ; vérifier migrations, sauvegarde et concurrence avant tout changement majeur.

## Rejouer

```sh
npm ci
npm run check
npm run format:check
npm test
npm run build
npm run browser:install
npm run test:fetch-browser
npm run test:e2e
docker compose build
npm run test:docker
```

Le navigateur intégré n’était pas connecté. Les tests utilisent un Chromium indépendant dans `.local/pw-browsers`, sans profil ni session personnels. Le serveur E2E écoute sur 127.0.0.1:3211, chaque test de setup crée une instance vide isolée sur 127.0.0.1:3213 et le test Docker utilise 127.0.0.1:3212. Les conteneurs de test sont supprimés à la fin ; données et captures de test sont ignorées par Git. Aucun test ne clique sur le lien PayPal.
