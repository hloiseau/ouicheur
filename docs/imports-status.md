# État des importateurs — 24 septembre 2026

Les deux adaptateurs natifs sont implémentés et testés sur **fixtures fictives**. Aucun import de liste personnelle réelle n’a été validé. Les liens de partage du propriétaire ont été demandés mais n’étaient pas disponibles lors des premiers essais.

## Accès réellement observé

Commande locale : `npm run probe:imports`, utilisant exactement le client HTTP sécurisé de l’application, sans session utilisateur, sans proxy de contournement et sans API privée.

| Source | URL sondée                              | Résultat observé                                                                       |
| ------ | --------------------------------------- | -------------------------------------------------------------------------------------- |
| Amazon | `https://www.amazon.fr/hz/wishlist/ls/` | 2026-09-24 18:11:57 UTC : connexion interrompue, `read ECONNRESET`                     |
| Throne | `https://throne.com/`                   | 2026-09-24 18:11:57 UTC : HTTP 429, accès refusé ; aucun nouvel essai de contournement |

Ces adresses sont les **points d’entrée publics**, pas des liens de listes complètes. Elles permettent de documenter l’accès réel depuis cet environnement, mais ne prouvent ni l’import de produits ni le comportement d’une liste partagée précise. Le statut natif des deux sources reste **non vérifié sur une vraie liste**. Une extraction de fixture ou un import CSV ne change pas ce statut.

## Couverture implémentée

Amazon : éléments HTML de liste portant un identifiant de ligne / ASIN ; lien `/dp/` ou `/gp/product/`, titre, image et prix présents. Canonicalisation de l’ASIN et retrait des paramètres d’affiliation. Les lignes identifiées sans lien sont signalées, pas publiées silencieusement. La pagination ou les produits chargés uniquement par JavaScript ne sont pas parcourus ; un aperçu ne doit pas être considéré comme exhaustif.

Throne : produits `Product` présents dans des données structurées JSON-LD publiques, éventuellement dans `ItemList` / `@graph`. Champs conservés : identifiant produit disponible, titre, URL marchande, image, prix/devise. Un lien interne Throne sans URL marchande exploitable est marqué à corriger. Aucun schéma interne, API privée ou mécanisme d’authentification n’est supposé.

Les deux parcours passent par la même table de travaux, le format commun `ImportItem` et un aperçu éditable. Pas d’import d’adresses, de contributeurs, d’historique de paiement ou de montant déjà financé. Tout cadeau commence à zéro ; un remplacement explicite conserve les contributions locales existantes.

Les détections HTML peuvent cesser de fonctionner lorsque les sources changent. En cas de CAPTCHA, HTTP non 200, connexion requise ou absence de produit exploitable, l’application l’annonce et propose CSV/JSON. Elle ne résout pas les CAPTCHA, ne rejoue pas de session et n’automatise pas la connexion.

## Vérifier une liste autorisée ultérieurement

```sh
npm run probe:imports -- "https://www.amazon.fr/hz/wishlist/ls/VOTRE_ID" "https://throne.com/VOTRE_PROFIL"
```

Puis faire l’import dans l’administration, comparer l’aperçu aux produits visibles sur la liste, corriger les éléments signalés et confirmer la sélection. Archiver la date, le nombre de produits et le résultat effectivement obtenu. Une lecture partielle du HTML ne démontre pas que toute la liste a été importée.

## Secours générique

CSV/JSON fonctionnel avec exemples dans `public/examples/`. Validation ligne par ligne, champs modifiables, sélection, détection de doublons par URL canonique et source/identifiant, choix explicite avant remplacement, validation transactionnelle du lot. Une erreur de validation conserve l’aperçu. Le texte source original et les champs inconnus ne sont pas conservés.

Une tâche distante en cours possède un bail de 30 secondes. Après arrêt/reprise, elle peut être relancée depuis l’administration ; trois prises au maximum. Les erreurs d’accès terminent la tentative : elles ne provoquent pas de trafic en boucle. Les aperçus prêts survivent aux redémarrages.
