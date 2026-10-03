# Variantes, offres et envies sans produit

Une envie peut être un produit, une expérience, un service, du fait main ou une autre attention. Seul le produit exige un lien marchand. Taille, couleur, édition/modèle et précisions sont facultatifs ; indiquer si ces caractéristiques sont exigées ou si une alternative est acceptable.

Le budget peut être **précisé**, **non précisé** ou **sans dépense nécessaire**. Les deux derniers modes ne permettent pas de contribution financière. Le budget inconnu ne correspond pas à zéro dans les filtres de prix. Une réparation, une promenade ou un repas partagé restent réservables avec quantité et créneau indicatif. Aucun achat, rendez-vous ou paiement automatique n’est déclenché.

Jusqu’à dix offres alternatives peuvent accompagner une envie : neuf, occasion, reconditionné ou fait main, prix et devise, livraison séparée, disponibilité datée, précisions sur l’équivalence. Tous les liens satisfont la même quantité. La réservation porte sur l’envie entière, pas sur un stock indépendant par boutique. Aucun lien affilié n’est ajouté.

L’ajout d’une offre est manuel. La lecture du lien principal conserve ses protections réseau et respecte les refus du marchand. Un prix ou un stock observé n’est jamais garanti. Une autre variante exigée doit être une envie distincte ; une offre représente une alternative acceptable au même cadeau.

Les réservations conservent un instantané des caractéristiques et de l’offre choisie. Une modification ultérieure affiche un avertissement au détenteur du lien, sans réécrire son historique. Les anciens liens restent valides, sans inventer d’instantané rétroactif. Le suivi personnel reste disponible pour annuler après révocation d’un partage.

Les imports CSV/JSON conservent les champs `kind`, `budget_mode`, `size`, `color`, `model`, `variant_note`, `variant_policy`, `time_hint`, `original_url`, `quantity` et `offers`. Un prix d’import est un montant décimal par exemplaire ; les montants des offres sont en centimes. Une URL identique avec une taille/couleur/modèle différents est une autre variante. Deux envies sans URL ne sont pas considérées comme doublons de lien.

La migration 017 garde les produits existants et leur financement. Le stockage historique garde un objectif technique minimal pour les envies sans budget ; les vues et exports interprètent toujours `budget_mode` et n’affichent pas cet objectif. Un historique de contributions interdit de retirer le budget. Sauvegarder avant migration ; revenir à une ancienne image demande une restauration de sa sauvegarde dans des volumes neufs.
