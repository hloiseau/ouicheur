# Grandes listes et ressources du NAS

Les vues publique, propriétaire et coorganisateur chargent 24 envies à la fois (API : 60 au maximum). Recherche, tri, devises, budget, catégories et compteurs portent sur toute la sélection autorisée. Une catégorie sans envie dans la liste sélectionnée est masquée ; le propriétaire peut conserver visible celle qu’il vient de créer et sélectionner.

Le serveur applique les droits aux requêtes SQLite avant de charger les envies et leurs offres. Il filtre et trie ensuite cette sélection en mémoire : le coût serveur reste proportionnel à sa taille. Ce n’est pas une promesse de performance illimitée. L’export propriétaire complet reste disponible explicitement ; l’interface utilise `/api/admin?summary=1` et `/api/team?summary=1`.

Les curseurs signés expirent après une heure. Ils se rapportent aux filtres, aux données autorisées et à un identifiant stable. Une modification, une réservation expirée ou un retrait d’accès invalide la continuation : l’interface recharge la première page et l’explique. Aucune carte n’est silencieusement sautée ou dupliquée. Une modification dans une liste inaccessible n’invalide pas le curseur public.

## Mesure reproductible

`node --import tsx --test tests/wishlist-query.test.ts` crée 10 000 envies synthétiques et affiche durée et taille de réponse. Mesure de développement le 3 octobre 2026 : environ 270 ms pour la première page triée par titre, 17 Ko de JSON pour 24 cartes. Ce chiffre concerne l’environnement de développement, pas un NAS réel ; la CI contrôle les résultats, la confidentialité et une limite de durée volontairement large de 10 secondes. Les images, délais réseau et rendu du navigateur ne sont pas inclus.

## Images et extraction

Les cartes utilisent des vignettes WebP de 160, 320, 640, 960 ou 1600 pixels, décodées à la demande sans agrandissement. Deux conversions simultanées au maximum par processus, une file bornée et un cache mémoire de 32 Mio / 128 entrées empêchent l’accumulation. Il n’y a pas de nouveaux fichiers à sauvegarder. Les droits sont contrôlés avant et après la conversion, même sur un cache chaud ; toutes les réponses d’images restent `private, no-store`.

Les extractions de produits sont limitées à deux simultanément par processus, huit en attente et trente secondes d’attente au maximum. Le worker et le serveur ont chacun leur processus ; les quotas des vérifications automatiques restent communs à l’instance dans SQLite. Les limites réseau, la validation SSRF et l’arrêt sur refus marchand restent actifs.

Le scénario Playwright vérifie recherche sur la dernière page, continuation, modification concurrente, édition d’une carte chargée ensuite et révocation d’une vignette déjà calculée, sur ordinateur et mobile.
