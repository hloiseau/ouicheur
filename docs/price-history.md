# Historique et alertes de prix

Dans l’édition d’une envie, ouvrir **Prix, disponibilité et alertes**. Le lien principal et chaque offre secondaire ont leur propre historique daté. Le tableau donne prix unitaire, devise, disponibilité, source et frais de livraison indiqués manuellement. Il reste utilisable au clavier et sur un écran étroit. Aucun relevé ne modifie silencieusement l’objectif, les offres saisies ou les réservations.

Le lien principal conserve l’action de confirmation explicite d’un nouvel objectif. Cette confirmation est refusée si la devise, la variante, la quantité, le budget ou l’objectif a changé depuis le relevé, si le prix est trop ancien, ou si l’envie n’a pas de budget fixé. Les anciens relevés sans empreinte de variante ne peuvent plus servir à modifier un objectif : actualiser d’abord.

## Alertes choisies

Le propriétaire peut définir un seuil unitaire hors livraison et/ou un retour en stock, après avoir confirmé que le lien correspond à la bonne variante. Le type **Baisse de prix ou disponibilité** doit aussi être activé dans ses préférences de notification, sur un canal configuré. Les messages restent neutres. Les coorganisateurs peuvent choisir ce type de rappel pour les listes qu’ils préparent ; ils ne modifient pas la configuration du suivi marchand.

Un seuil atteint déclenche une alerte une seule fois tant que le prix reste à ce niveau ou en dessous. Un retour au-dessus puis sous le seuil constitue un nouvel événement. Un retour en stock demande un précédent état explicitement indisponible, pour la même offre ; les états inconnus ne sont pas assimilés à une rupture. Les alertes de stock sont limitées à une par jour par offre. Le seuil et la disponibilité n’entraînent aucun achat ni aucune mise à jour financière.

Les relevés comparent uniquement la même URL canonique, taille, couleur, modèle, condition et devise. Une autre devise ou une modification pendant l’extraction marque le relevé non comparable. Un prix absent ne devient pas zéro ; les devises malformées sont écartées. Les frais de livraison ne sont pas ajoutés à un prix marchand comme s’ils avaient été extraits.

## Actualisation facultative

Par défaut, tout relevé est manuel. L’activation automatique d’une offre autorise au plus un relevé toutes les 24 heures, 20 par jour UTC pour l’instance, deux par heure UTC pour un même nom d’hôte, et un seul par passage du worker (une minute). Les compteurs sont persistants, séparés de l’historique et réservés avant la requête réseau. Réenregistrer une configuration n’efface pas son prochain délai.

Le suivi s’arrête après toute erreur, refus, contrôle anti-robot ou résultat non comparable. Il n’essaie pas de contourner un CAPTCHA, une authentification ou un blocage. Les protections réseau de l’extracteur existant restent applicables. Une variante changée, une offre retirée ou une liste archivée ne continue pas à être interrogée. Après vérification manuelle du lien, le propriétaire peut réactiver le suivi. Les prix restent indicatifs et la disponibilité doit être confirmée chez le marchand.

L’historique conserve au maximum 100 relevés par offre pendant 180 jours. La migration 021 ajoute les historiques, configurations et compteurs sans réécrire les objectifs ni les engagements. Les sauvegardes contiennent les réglages ; après restauration, le suivi automatique est désactivé jusqu’à confirmation pour éviter de reprendre des requêtes réseau inattendues.
