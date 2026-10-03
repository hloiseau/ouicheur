# Feuille de route Ouicheur

Revue du 28 septembre 2026. [Suivi central : issue #2](https://github.com/hloiseau/ouicheur/issues/2). Les issues portent les critères d’acceptation et leur état courant ; ce document explique l’ordre proposé.

## Direction retenue

Des listes d’envies auto-hébergées pour les proches et les occasions, avec respect des budgets, seconde main, expériences et fait main.

## Finalisation 1.2.0 — 3 octobre 2026

Le socle libre inclut désormais les lots #4 à #23 : envies détaillées, outils de
listes, coordination, comptes proches, sessions, notifications facultatives,
suivi personnel, échanges familiaux et pagination. #24 apporte le diagnostic par
commit, les formulaires de retours, les migrations/restaurations systématiques et
les outils de livraison. Les critères détaillés et preuves restent dans les issues.

Les [notes 1.2.0](releases/1.2.0.md) définissent la version finale à publier ; les
[contrôles de livraison](release-checklist.md) distinguent le code fusionné du tag
stable, de l’image effectivement disponible et de la validation terrain. Le code
historique 1.1 reste dans l’historique : ne pas le retagger sur le nouveau `main`.

La suite porte sur la recette finale TrueNAS/Unraid et #45, puis sur les retours
réels, les corrections et l’entretien des dépendances. Les catalogues et annonces
attendent la validation du produit et l’instruction de publication.

Les tables ci-dessous conservent le découpage initial pour retrouver les tickets ;
elles ne constituent plus une liste de fonctionnalités restant à développer.

## Lire les priorités

P0 = prérequis de sa phase ; P1 = valeur forte/prochaine livraison ; P2 = amélioration après fondations ; P3 = exploration. S/M/L/XL exprime une complexité relative, pas un délai promis. Les dépendances sont à vérifier dans les tickets avant chaque lot.

## 1.1

| Ticket                                              | Priorité | Taille | Sujet                                      |
| --------------------------------------------------- | -------- | ------ | ------------------------------------------ |
| [#3](https://github.com/hloiseau/ouicheur/issues/3) | P0       | M      | Publier et valider la version stable 1.1.0 |

## 1.2

| Ticket                                                | Priorité | Taille | Sujet                                                              |
| ----------------------------------------------------- | -------- | ------ | ------------------------------------------------------------------ |
| [#4](https://github.com/hloiseau/ouicheur/issues/4)   | P1       | M      | Filtrer les envies par budget, devise et disponibilité             |
| [#5](https://github.com/hloiseau/ouicheur/issues/5)   | P1       | L      | Préserver la surprise pour le destinataire                         |
| [#6](https://github.com/hloiseau/ouicheur/issues/6)   | P1       | L      | Recevoir des suggestions de cadeaux des proches                    |
| [#7](https://github.com/hloiseau/ouicheur/issues/7)   | P1       | M      | Décrire les variantes et préférences exactes d’un cadeau           |
| [#8](https://github.com/hloiseau/ouicheur/issues/8)   | P1       | L      | Proposer plusieurs boutiques et des alternatives d’occasion        |
| [#9](https://github.com/hloiseau/ouicheur/issues/9)   | P1       | M      | Créer des envies sans produit : expériences, services et fait main |
| [#10](https://github.com/hloiseau/ouicheur/issues/10) | P1       | M      | Ajouter événements récurrents et export calendrier privé           |
| [#11](https://github.com/hloiseau/ouicheur/issues/11) | P1       | L      | Configurer rappels et notifications sans divulguer les surprises   |
| [#12](https://github.com/hloiseau/ouicheur/issues/12) | P2       | L      | Consulter l’historique des prix et définir une alerte              |
| [#13](https://github.com/hloiseau/ouicheur/issues/13) | P1       | M      | Exporter une liste et imprimer une version adaptée aux invités     |

## 1.x

| Ticket                                                | Priorité | Taille | Sujet                                                               |
| ----------------------------------------------------- | -------- | ------ | ------------------------------------------------------------------- |
| [#14](https://github.com/hloiseau/ouicheur/issues/14) | P2       | M      | Réorganiser et modifier plusieurs envies à la fois                  |
| [#15](https://github.com/hloiseau/ouicheur/issues/15) | P2       | M      | Partager des préférences cadeaux choisies par la personne           |
| [#16](https://github.com/hloiseau/ouicheur/issues/16) | P2       | M      | Ajouter rapidement une envie depuis un navigateur                   |
| [#17](https://github.com/hloiseau/ouicheur/issues/17) | P2       | L      | Retrouver les cadeaux que l’on s’est engagé à offrir                |
| [#18](https://github.com/hloiseau/ouicheur/issues/18) | P2       | M      | Suivre les cadeaux reçus et préparer les remerciements              |
| [#19](https://github.com/hloiseau/ouicheur/issues/19) | P2       | M      | Proposer des modèles d’événements et une aide au démarrage          |
| [#20](https://github.com/hloiseau/ouicheur/issues/20) | P2       | XL     | Gérer des profils familiaux et des coorganisateurs                  |
| [#21](https://github.com/hloiseau/ouicheur/issues/21) | P2       | L      | Organiser un échange Secret Santa avec exclusions                   |
| [#22](https://github.com/hloiseau/ouicheur/issues/22) | P1       | L      | Renforcer la gestion des sessions et la récupération d’accès        |
| [#23](https://github.com/hloiseau/ouicheur/issues/23) | P2       | L      | Paginer côté serveur sans fuite entre listes                        |
| [#24](https://github.com/hloiseau/ouicheur/issues/24) | P1       | L      | Fiabiliser les mises à jour, sauvegardes et contributions au projet |

## Validation d’une livraison

- Une PR liée au ticket, avec comportement attendu et limites connues.
- Tests métier ciblés sur confidentialité, argent, quantités et concurrence lorsque ces domaines changent.
- Parcours mobile, clavier et FR/EN ; pas de données personnelles dans les captures de démonstration.
- Migration et retour arrière documentés si le schéma évolue ; sauvegarde avant essai NAS.
- Aucun ticket fermé au seul stade d’idée ou de PR ouverte.

Voir l’[étude concurrentielle](competitive-review-2026-09.md) pour les sources et les arbitrages.
