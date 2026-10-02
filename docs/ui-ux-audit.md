# Revue UI/UX du 2 octobre 2026

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
