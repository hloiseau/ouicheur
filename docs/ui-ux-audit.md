# Revue UI/UX

## Direction visuelle approfondie — 7 octobre 2026

La seconde passe recompose l’interface, au-delà des corrections fonctionnelles. La première version réservait presque tout le premier écran mobile au profil et à plusieurs rangées de commandes. La version revue présente les premières cartes vers **515 px sur un écran de 390 × 844**, avec leurs titres et prix visibles dès le premier écran, pour les mêmes 47 produits.

- Le profil sans bannière devient un en-tête compact. Les vraies bannières personnalisées restent prises en charge ; la décoration de remplacement ne réserve plus un grand espace vide.
- Palette claire plus douce, sombre légèrement teintée, typographie et espacements unifiés. La couleur choisie pour le profil se prolonge sur les fiches produit.
- Vues de liste et sélection de liste regroupées ; catégories en boutons compacts ; recherche principale et filtres secondaires clairement séparés. Les priorités rejoignent le panneau de filtres. Un raccourci permet d’effacer les filtres actifs.
- Cartes centrées sur l’objet, le titre et le budget. Les descriptions marchandes restent sur les fiches. L’action « Offrir ou participer » rend les deux possibilités explicites.
- Prix visible dès le titre sur les fiches ; images servies à la taille adaptée à la grande vue ; blocs de réservation et contribution mieux espacés.
- En-tête propriétaire mobile recomposé, actions de création mieux hiérarchisées, organisation en lot compacte lorsqu’elle est repliée.
- Espacements des paragraphes corrigés dans les panneaux empilés : les marges ne doublent plus les intervalles sur les écrans de suivi et les formulaires.

Les 708 captures de cette direction sont sous `.local/ui-design/`. La galerie `index.html` compare la première passe à la nouvelle composition et permet de filtrer les écrans par format et thème. Les contrôles utilisent les mêmes données réelles, les deux thèmes et des largeurs de 320, 390, 768 et 1440 pixels. Les 116 états contrôlés ne présentent ni débordement, ni erreur JavaScript, ni violation axe. Les parcours Chromium restent une émulation, pas une validation sur téléphone physique.

La compilation et les 181 tests unitaires passent. Les 32 scénarios navigateur ciblés ont été validés, ainsi que les quatre exécutions du parcours visuel complet. Ils couvrent également priorités personnalisées, changement de langue, conservation des saisies, filtres de budget, réservations, contributions, pagination, accessibilité et thèmes. Les sélecteurs des tests suivent le déplacement des priorités dans le panneau de filtres ; le contrôle du pied de page cible le repère accessible actif.

## Passe du 7 octobre 2026 — produits réels et thèmes

L’instance publique `https://ouicheur.hugoloiseau.fr` a servi de référence visuelle, en lecture seule. Une instance locale distincte sur le port 3215 contient **47 envies de 16 domaines marchands**, dont 43 avec une image téléchargée et réencodée localement. Les liens indisponibles restent représentés avec leur vrai nom et un budget non précisé, sans prix inventé. Les montants de cette instance servent à la revue et ne constituent pas un catalogue à jour.

Les contrôles couvrent ordinateur 1440 × 1000 et mobile 390 × 844, chacun en clair et sombre : liste et pagination, filtres, recherche vide, fiche produit, connexion, ajout et récupération refusée, toutes les rubriques propriétaire, aide, suivi et page introuvable. Le parcours `ui-audit.spec.ts` complète cette revue avec installation, réservation, contribution, suggestions, partage privé et fenêtres de saisie. Les contrôles de contraste automatisés complètent l’inspection des captures ; le format mobile est émulé sous Chromium.

Corrections :

- Choix **Appareil / Clair / Sombre** dans les en-têtes, mémorisé pendant un an. Sans choix manuel, CSS suit immédiatement les changements du thème système. Le serveur applique le choix enregistré avant l’exécution de JavaScript ; aucun script d’initialisation visuelle ni dépendance supplémentaire.
- Couleurs de profil adaptées aux deux fonds, messages d’erreur et de confirmation, champs, illustrations et états de financement lisibles en clair.
- Catégories et navigation propriétaire mobile plus compactes, champs de saisie mobiles agrandis, titres marchands limités à trois lignes dans les cartes et images encadrées. Le titre intégral reste disponible sur la fiche.
- Suppression de la répétition du budget inconnu et des progressions vides dans les cartes. Repli illustré si une image ne se charge pas.
- Les descriptions marchandes de plus de 400 caractères se déplient sur la fiche : le prix et les actions restent accessibles sans parcourir toute la publicité importée.
- Pagination centrée avec compteur affiché/total. Une erreur temporaire conserve les cartes et propose de réessayer ; une recherche échouée n’affiche plus un faux état « aucune envie ».
- Une salle d’attente Patagonia ne devient plus un titre de cadeau. Les anciens liens IKEA et Decathlon redirigés vers un catalogue sans image ni prix de produit identifiable sont refusés : le prix minimum d’une catégorie ne devient plus l’objectif du cadeau. La saisie manuelle conserve le lien.
- L’absence de prix récupéré indique explicitement comment saisir un montant ou choisir un budget non précisé.

Les essais réseau ont inclus LEGO, Amazon France, Kojima Productions, Anicorn, MUJI, Patagonia, Nintendo Canada, IKEA, Steam, Fairphone, Framework, Peak Design, Chrono24, Apple, Decathlon et Etsy. Etsy a répondu HTTP 403 ; Patagonia a présenté une salle d’attente ; certains sites n’ont pas fourni de prix. Le lien IKEA actuel a fourni titre, image et prix, contrairement à l’ancien lien. Aucun contournement des refus marchands n’a été ajouté.

Les données, scripts de collecte, résultats d’extraction et captures restent sous `.local/ui-pass/`, hors Git et hors de l’instance personnelle. `index.html` permet de parcourir la galerie. La collecte a été réalisée avec `ui-pass-seed.ts`, complétée par `ui-pass-extra.ts` et les reprises consignées dans `extraction-report.json`. `ui-pass-capture.mjs` reproduit les captures de l’instance locale ; `visual-report.json` relève les erreurs JavaScript, débordements et constats axe pour chaque écran.

Résultat : compilation, TypeScript, 181 tests unitaires, 26 tests navigateur ciblés et les quatre exécutions du parcours visuel complet passent. Des contrôles supplémentaires à 320 et 768 pixels couvrent les champs, l’import réel MUJI et les images indisponibles. Le test de thème vérifie aussi le premier affichage sans JavaScript. Les fichiers modifiés passent Prettier ; le contrôle global signale 239 fichiers préexistants, notamment à cause des fins de ligne CRLF du checkout Windows (les fichiers témoins passent après normalisation LF). Ils n’ont pas été reformatés dans cette passe.

Vérifications reproductibles :

```sh
npm run check
npm test
npm run build
npm run test:e2e -- tests/e2e/theme.spec.ts tests/e2e/pagination.spec.ts tests/e2e/ui-finishing.spec.ts tests/e2e/categories.spec.ts tests/e2e/product-extraction.spec.ts tests/e2e/wishlist-filters.spec.ts tests/e2e/accessibility.spec.ts
UI_AUDIT=1 UI_AUDIT_THEME=light npm run test:e2e -- tests/e2e/ui-audit.spec.ts
UI_AUDIT=1 UI_AUDIT_THEME=dark npm run test:e2e -- tests/e2e/ui-audit.spec.ts
```

Sous PowerShell, définir les variables avec `$env:UI_AUDIT='1'` et `$env:UI_AUDIT_THEME='light'` ou `'dark'` avant la commande. Node 24 est requis. Les captures du parcours complet sont écrites dans `test-results/ui-audit-{light|dark}-{desktop|mobile}/` ; un `--output` distinct par exécution conserve les captures des deux thèmes.

## Revue du 2 octobre 2026

Suivi : [issue #49](https://github.com/hloiseau/ouicheur/issues/49) et [PR #50](https://github.com/hloiseau/ouicheur/pull/50).

La revue utilise une instance jetable, des cadeaux fictifs et deux formats Chromium : ordinateur (1440 × 1000) et mobile Pixel 7 (412 × 839). Les captures sont examinées visuellement, en complément des parcours et contrôles d’accessibilité automatisés. Elles ne constituent pas un test sur un téléphone physique ou sur le NAS du propriétaire.

## Périmètre

Le parcours `ui-audit.spec.ts` produit 38 états par format, avec des captures de page entière, des vues pendant le défilement et le bas des fenêtres de saisie.

| Écran                                     | États examinés                                                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Connexion `/admin`                        | Français et anglais                                                                                      |
| Accueil `/`                               | Visiteur, français/anglais, propriétaire, mode surprise                                                  |
| Cadeau `/cadeaux/[id]`                    | Disponible, partiellement réservé, réservation directe et contribution                                   |
| Réservation `/reservation/[token]`        | Active, achetée, lien invalide                                                                           |
| Contribution `/contribution/[id]`         | Intention, envoi déclaré, lien invalide                                                                  |
| Liste `/lists/[id]`, partage `/s/[token]` | Lien autorisé, accès révoqué, vue propriétaire                                                           |
| Suggestions `/suggestions`                | Formulaire, suivi personnel, absence de lien                                                             |
| Ajout `/add`                              | Lien prérempli et fenêtre de saisie                                                                      |
| Installation `/setup`                     | Première installation sur une seconde instance vide                                                      |
| Page introuvable                          | Retour à la liste, langue                                                                                |
| Rubriques propriétaire                    | Envies, réservations, contributions, imports, listes, suggestions, historique, instance, profil, journal |
| Formulaires                               | Envie et options, catégorie, aperçu JSON, modification de liste et partage QR                            |

Les parcours de régression complètent les captures : création puis annulation d’une catégorie depuis un brouillon, changement de langue sans perte de saisie, réservation achetée puis annulée par le propriétaire, quantité libérée, confirmation refusée, reprise après une erreur HTTP 503 et liens de contribution invalides. Les tests existants couvrent aussi modification/suppression de catégorie, téléversements, apparence, imports, contribution, modération et mode surprise.

## Corrections

- Le choix de langue rejoint les en-têtes. Il reste accessible dans une fenêtre de saisie et conserve les valeurs du formulaire.
- Une catégorie peut être créée depuis une envie, puis sélectionnée immédiatement. Annuler cette création conserve le brouillon.
- Une rubrique « Réservations » et des liens depuis les cadeaux donnent accès à l’annulation, y compris après confirmation d’achat. La confirmation explicite, l’authentification et la protection des surprises restent requises.
- La rubrique propriétaire est conservée dans l’URL, après rechargement ou changement de langue. L’annulation rafraîchit aussi les disponibilités.
- Le suivi personnel offre un retour et une copie du lien. L’expiration n’est plus affichée après achat. Les liens invalides n’offrent plus de suivi inexistant ni de demande de connexion administrateur.
- Les états vides et de chargement de l’historique sont explicites. La pagination n’apparaît que lorsqu’elle est utile.
- Une indisponibilité temporaire de l’administration propose de réessayer, sans présenter un faux écran de déconnexion.
- Les en-têtes, la fermeture des fenêtres et les espacements du menu sont adaptés au mobile. Les titres des écrans de suivi sont moins encombrants.
- L’éditeur de listes distingue création et modification, annonce la liste sélectionnée et confirme l’enregistrement. L’aide à l’import emploie des termes orientés utilisateur.

## Reproduire la revue

```sh
npm ci
npm run browser:install
npm run build
UI_AUDIT=1 npm run test:e2e -- tests/e2e/ui-audit.spec.ts
npm run test:e2e -- tests/e2e/ui-finishing.spec.ts
```

Le serveur et les données des tests sont isolés sous `.local/e2e/`. Le parcours d’installation utilise aussi le port 3213. Ne pas diriger ces tests vers une instance personnelle. Les captures et `observations.json` sont écrits dans `test-results/ui-audit-desktop/` et `test-results/ui-audit-mobile/` ; le journal relève les erreurs JavaScript et les débordements horizontaux. Le parcours opt-in est ignoré dans la CI habituelle ; les régressions fonctionnelles s’y exécutent systématiquement.
