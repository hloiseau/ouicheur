# Étude concurrentielle et pistes pour Ouicheur

**Consultation : 28 septembre 2026.** Comparaison de 16 solutions de listes d’envies à partir de leurs pages officielles, centres d’aide et dépôts publics. Ce panorama large n’est pas un recensement garanti de tous les services existants. Les parcours connectés et la qualité du support n’ont pas été testés. Une fonction absente de la documentation consultée n’est pas considérée comme absente du produit.

Les observations ci-dessous décrivent les sources publiques. La colonne de droite est une proposition pour Ouicheur. Aucun code, catalogue, illustration ni texte marketing concurrent n’est repris. Les versions et conditions peuvent changer ; revalider les sources avant toute nouvelle comparaison.

## Panorama

| Solution et source primaire                                                              | Fonctionnalités observées                                                                                   | Adaptation proposée pour Ouicheur                                                                |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [Giftster](https://www.giftster.com/)                                                    | Groupes familiaux, profils enfants, réservations cachées au destinataire et Secret Santa.                   | Surprise, cercles privés et profils gérés par des adultes.                                       |
| [GoWish](https://support.gowish.com/en/articles/9323675-how-can-i-create-a-new-wishlist) | Listes par occasion, collaborateurs et listes créées pour un proche.                                        | Coorganisation et invitations explicites, avec confidentialité par défaut.                       |
| [Giftful](https://giftful.com/)                                                          | Ajout par URL, partage, applications/extension et réservation discrète des cadeaux.                         | Parcours très court pour les proches ; éviter les doublons sans imposer d’application.           |
| [Elfster](https://www.elfster.com/lp/ssg)                                                | Tirage Secret Santa, listes multi-boutiques, questions anonymes et rappels.                                 | Échanges de cadeaux avec exclusions, budget et questions sans révéler le donneur.                |
| [drawnames](https://www.drawnames.com/app)                                               | Tirages avec exclusions, date/budget, invitations et listes ; application annoncée sans inscription.        | Parcours invité léger et suivi organisateur limité à ce qui lui est nécessaire.                  |
| [MyRegistry](https://www.myregistry.com/ca/en/)                                          | Registre universel, synchronisation de listes de magasins et suivi des remerciements.                       | Portabilité et suivi après le cadeau ; les intégrations marchands restent à valider une par une. |
| [Babylist](https://help.babylist.com/hc/en-us/articles/218422637-How-do-I-choose-a-gift) | Plusieurs offres marchandes pour un cadeau ; achat via la boutique ou chez le commerçant.                   | Alternatives équivalentes, prix datés et choix du marchand.                                      |
| [Mes Envies](https://www.mesenvies.fr/liste-cadeaux.html)                                | Listes libres, extension, réemploi/fait main/virtuel, impression et messages.                               | Valoriser les petits budgets, le fait main et une version imprimable sobre.                      |
| [Milirose](https://www.milirose.com/comment-ca-marche.html)                              | Listes multi-sites, personnalisation, réservation et participation à une cagnotte.                          | Modèles adaptés aux événements et choix explicite entre offrir et contribuer.                    |
| [Kadolog](https://www.kadolog.com/fr-fr/faq/45203)                                       | Cadeaux multi-magasins, seconde main, services/expériences et division en parts ou participations libres.   | Alternatives acceptées, services rendus et contributions compréhensibles.                        |
| [Un Grand Jour](https://help.ungrandjour.com/docs/default-purchasing-method)             | Choix du mode de participation : cagnotte ou réservation pour remise en mains propres.                      | Expliciter qui achète, qui reçoit l’argent et comment remettre le cadeau.                        |
| [Wishlist (cmintey)](https://github.com/cmintey/wishlist)                                | Groupes, suggestions soumises à approbation ou secrètes, registre public et ajout par favori de navigateur. | Contrôle des suggestions et ajout rapide, sans reprendre le code.                                |
| [wishthis](https://github.com/wishthis/wishthis)                                         | Plateforme de listes pour diverses occasions et large couverture linguistique annoncée.                     | Internationalisation et simplicité d’auto-hébergement.                                           |
| [Poenskelisten](https://github.com/aunefyren/poenskelisten)                              | Application auto-hébergée de partage de listes et de collaboration autour des cadeaux.                      | Étudier les rôles de groupe et l’interopérabilité après la 1.2.                                  |
| [Wishpage](https://github.com/macurovc/wishpage)                                         | Application auto-hébergée de listes pour la famille et les amis.                                            | Garder un parcours lisible et peu de dépendances.                                                |
| [Wishlist (Reggio Digital)](https://github.com/Reggio-Digital/wishlist)                  | Listes partagées et réservation préservant la surprise ; simplicité revendiquée.                            | Tester le parcours avec des proches peu technophiles.                                            |

## Ce qui existe déjà en 1.1

Listes et événements avec visibilité publique/non répertoriée/privée ; liens révocables ; catégories et favoris ; réservations anonymes avec gestion/expiration ; contributions déclarées et approbation facultative ; import de listes et extraction de produits ; quantités et doublons volontaires ; anglais/français ; QR local ; partage PWA ; actualisation manuelle des prix ; sauvegarde/restauration ; diagnostic ; notifications ntfy ; images AMD64/ARM64. L’export JSON propriétaire existe déjà. Le futur travail porte sur des extensions précises, pas sur le fait de recréer ces bases.

## Les écarts les plus utiles

1. **Surprise cohérente** : Giftster, Giftful et GoWish la mettent au centre du parcours. Pour Ouicheur, masquer un badge ne suffit pas : compteurs, payloads, notifications, imports/exports et administration doivent suivre la même règle. Un administrateur de son propre serveur conserve néanmoins accès aux données ; une liste publique permet aussi une consultation anonyme.
2. **Choix selon le budget** : distinguer exemplaire, objectif total et reste à financer. Les familles doivent pouvoir préférer une variante, de l’occasion, un autre vendeur ou un service rendu. Une autre devise ne peut pas être comparée numériquement sans un taux explicite.
3. **Coordination entre proches** : suggestions modérées, coorganisateurs, listes pour enfants gérées par adultes, récapitulatif des cadeaux promis, puis Secret Santa. Garder un parcours invité utilisable sans installer une application.
4. **Occasions réutilisables** : dates récurrentes, calendrier, rappels choisis et duplication d’une liste sans reconduire les anciennes participations.
5. **Après le cadeau** : reçu, remerciement préparé, export/impression et archivage. « Réservé », « acheté déclaré », « payé » et « reçu » sont des états distincts.

Ces propositions sont détaillées dans les issues reliées à la [feuille de route](roadmap.md).

## Fonctionnalités documentées plus précisément

- [Giftster : suggestions secrètes et listes enfants](https://www.giftster.com/news/child-list-suggested-items/) ; [profils enfants](https://help.giftster.com/article/66-how-child-accounts-work).
- [GoWish : collaboration](https://support.gowish.com/en/articles/9490498-how-do-you-collaborate-on-a-wishlist), [réservations vues par le propriétaire](https://support.gowish.com/en/articles/10001734-why-can-i-see-reservations-on-my-own-wishlist) et [préférences de notifications](https://support.gowish.com/en/articles/10420474-how-do-i-manage-my-notifications). Certaines fonctions varient selon pays/application.
- [Giftful : description publiée sur l’App Store](https://apps.apple.com/us/app/giftful-wishlist-registry/id1450175505) : comparaison/suivi des prix annoncés, à distinguer d’un test réel de couverture des marchands.

## Suite de l’édition auto-hébergée

Les 22 tickets de la feuille de route couvrent publication, budget, surprise, suggestions, variantes, alternatives, événements, exports et fiabilité. Les évolutions sont livrées par lots vérifiés dans des PR dédiées.
