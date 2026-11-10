# Historique et alertes de prix

Les cartes et la fiche affichent le prix marchand vérifié à côté du budget de l’envie. Elles indiquent la date, le stock et les frais de port connus. Un relevé de plus de 48 heures est signalé comme ancien. Si une nouvelle tentative ne permet pas de vérifier le prix, le dernier prix vérifié reste daté et distinct de cette tentative.

Une **promo annoncée par le marchand** exige un prix de référence explicite `StrikethroughPrice` pour la même offre et la même devise. Elle disparaît lorsque l’échéance déclarée passe, lorsque l’offre n’est plus vérifiable ou quand le relevé dépasse 48 heures. Les dates seules sont lues en UTC, jour de fin inclus. Une **baisse observée** compare les deux derniers prix vérifiés de l’offre. Elle peut apparaître sans promo annoncée. [Documentation du balisage marchand](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing)

La fiche donne accès à la courbe et au tableau des prix de l’offre affichée sur la carte. Dans l’édition d’une envie, **Prix, disponibilité et alertes** permet d’examiner séparément le lien principal et chaque offre secondaire. La courbe et le plus bas observé utilisent uniquement les relevés comparables de l’offre sélectionnée. Le tableau de l’éditeur donne aussi la disponibilité, la source et les frais de livraison indiqués manuellement. Aucun relevé ne modifie automatiquement l’objectif, les offres saisies ou les réservations.

Le lien principal conserve l’action de confirmation explicite d’un nouvel objectif. Cette confirmation est refusée si la devise, la variante, la quantité, le budget ou l’objectif a changé depuis le relevé, si le prix est trop ancien, ou si l’envie n’a pas de budget fixé. Les anciens relevés sans empreinte de variante ne peuvent plus servir à modifier un objectif : actualiser d’abord.

## Alertes choisies

Le propriétaire peut définir un seuil sur le prix unitaire hors livraison ou sur le total unitaire livré, et activer séparément un retour en stock, après avoir confirmé que le lien correspond à la bonne variante. Le total livré demande des frais de port connus pour l’offre. Le seuil de prix ne se déclenche que pour un relevé comparable d’au plus 48 heures avec un stock confirmé. Le propriétaire peut mettre le suivi en pause, le réactiver ou le supprimer en conservant l’historique.

Les événements récents sont visibles dans **Mes rappels et notifications** pour les listes auxquelles le compte a accès. Le type **Baisse de prix ou disponibilité** doit être activé dans les préférences pour recevoir une notification externe. Les courriels, instantanés ou groupés, indiquent le marchand, le prix vérifié, les frais connus, l’heure et le lien de l’offre. Les messages ntfy restent neutres. Le courriel est écarté si le prix n’atteint plus le seuil, si l’offre n’est plus en stock ou si le compte ne peut plus voir la liste. La configuration du suivi marchand est réservée au propriétaire.

Un seuil atteint déclenche une alerte une seule fois tant que le prix reste à ce niveau ou en dessous. Un retour au-dessus puis sous le seuil constitue un nouvel événement. Un retour en stock demande un précédent état explicitement indisponible, pour la même offre ; les états inconnus ne sont pas assimilés à une rupture. Les alertes de stock sont limitées à une par jour par offre. Le seuil et la disponibilité n’entraînent aucun achat ni aucune mise à jour financière.

Les relevés comparent uniquement la même URL canonique, taille, couleur, modèle, condition et devise. Une autre devise ou une modification pendant l’extraction marque le relevé non comparable. Un prix absent ne devient pas zéro ; les devises malformées sont écartées. Les frais de livraison ne sont pas ajoutés à un prix marchand comme s’ils avaient été extraits.

## Actualisation facultative

Par défaut, tout relevé est manuel. L’activation automatique d’une offre autorise au plus un relevé toutes les 24 heures, 20 par jour UTC pour l’instance, deux par heure UTC pour un même nom d’hôte, et un seul par passage du worker (une minute). Les compteurs sont persistants, séparés de l’historique et réservés avant la requête réseau. Réenregistrer une configuration n’efface pas son prochain délai.

Le suivi s’arrête après toute erreur, refus, contrôle anti-robot ou résultat non comparable. Il n’essaie pas de contourner un CAPTCHA, une authentification ou un blocage. Les protections réseau de l’extracteur existant restent applicables. Une variante changée, une offre retirée ou une liste archivée ne continue pas à être interrogée. Après vérification manuelle du lien, le propriétaire peut réactiver le suivi. Les prix restent indicatifs et la disponibilité doit être confirmée chez le marchand.

L’historique conserve au maximum 100 relevés par offre pendant 180 jours. La migration 021 ajoute les historiques, configurations et compteurs. La migration 025 conserve les suivis existants avec leur seuil hors livraison. Les migrations 026 et 027 ajoutent les références marchandes et les nouveaux événements sans modifier les historiques existants. Les sauvegardes contiennent les réglages. Après restauration, le suivi automatique est désactivé jusqu’à confirmation pour éviter de reprendre des requêtes réseau inattendues.
