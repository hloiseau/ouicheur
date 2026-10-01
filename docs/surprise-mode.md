# Mode surprise

Dans **Mon espace → Listes et partage**, activer **Préserver la surprise sur cette liste**. Le réglage est désactivé par défaut pour les listes existantes.

## Ce qui est masqué

Pour le propriétaire connecté, les réservations, quantités réservées et états acheté/fermé des envies de cette liste sont masqués côté serveur, y compris dans l’aperçu public et les pages de détail. Les réponses API et RSC transmettent `null` pour ces valeurs, avec `surprise_hidden: true` ; elles ne transmettent pas un faux zéro.

Les compteurs d’envies réalisées et le filtre de disponibilité ne sont pas proposés dans une vue contenant des envies protégées. Les autres tris et budgets utilisent les prix demandés et les montants financiers réels. Les proches conservent les disponibilités réelles et le contrôle contre les réservations en double.

Les contributions financières, confirmations, remboursements et messages financiers restent visibles : le registre ne doit jamais présenter des montants faux pour conserver une surprise. Le mode convient donc surtout aux cadeaux achetés directement par les proches.

## Révélation volontaire et administration

Le bouton **Révéler pour cette session** demande confirmation et donne accès aux surprises de toutes les listes protégées, uniquement pour la session du navigateur. Une autre session du propriétaire reste protégée. **Masquer à nouveau**, une déconnexion ou l’expiration de la session rétablit le masquage. L’activation du mode sur une liste remet toutes les sessions en mode masqué.

Tant qu’une liste reste protégée pour la session, le journal détaillé, l’historique des réservations, les exports complets, les diagnostics et les téléchargements de sauvegardes demandent une révélation. Le suivi financier reste accessible. Modifier une envie protégée, déplacer des envies, annuler une réservation ou valider un import demande aussi une révélation ; créer une nouvelle envie reste possible.

Cette séparation évite qu’un compteur, un message de validation ou un export révèle indirectement une réservation. Les archives de sauvegarde restent complètes ; elles ne sont jamais expurgées ni présentées comme des exports sans surprise.

Les notifications de réservation des listes protégées sont supprimées, y compris les notifications encore en attente lorsque la protection est activée. Les notifications financières restent actives. Une notification déjà envoyée ne peut pas être rappelée.

## Limites

C’est un mode de confort pour le propriétaire connecté. Un administrateur peut lire directement la base ou une sauvegarde. Une visite déconnectée à une liste publique, ou avec un lien privé valide, donne la vue d’un proche. Ne pas présenter ce mode comme une barrière contre un destinataire déterminé.

La révélation recharge la page pour supprimer les données de la vue précédente dans ce navigateur. Une autre page déjà ouverte ou une copie déjà exportée ne peut pas être effacée rétroactivement. Les liens privés conservent leurs règles d’accès et de révocation indépendantes du mode surprise.

## Migration et restauration

La migration `011-surprise-mode.sql` ajoute un réglage par liste et un indicateur de révélation par session, tous deux désactivés par défaut. Elle ne modifie ni les réservations ni les données financières.

La restauration conserve le réglage des listes et toutes les réservations, révoque les anciens liens de partage et supprime les sessions. Une nouvelle connexion retrouve donc le masquage. Sauvegarder avant mise à jour ; un retour à une ancienne version utilise sa sauvegarde correspondante.
