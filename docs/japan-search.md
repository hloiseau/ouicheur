# Chiner au Japon depuis la France

Contexte donné par le propriétaire le 25 septembre 2026 : le problème principal est l’impossibilité de consulter les annonces japonaises depuis la France. Une recherche qui renvoie seulement des liens japonais, ou qui demande de capturer une page inaccessible, laisse le problème entier.

Le prompt copié dans ChatGPT doit contenir ce contexte sans dépendre de cette conversation. La destination de ce cas d’usage est la France, dans les versions française et anglaise du prompt ; changer la langue ne change pas le pays. L’utilisateur peut préciser une autre destination dans sa conversation avec ChatGPT.

## Comportement attendu

- L’option reste volontaire, par envie, désactivée par défaut. Elle est modifiable dans le formulaire et l’aperçu d’import ; seuls les objets activés affichent le prompt, côté public et propriétaire.
- Utiliser le titre et la description disponibles lorsque le lien de référence est bloqué. Demander seulement les informations manquantes que la personne peut réellement fournir.
- Privilégier la consultation dans les catalogues intégrés à Sendico lorsqu’ils couvrent le site recherché. Distinguer consultation des annonces et service d’achat : une page de présentation ou un formulaire de commande ne garantit pas un moteur de recherche pour cette place de marché.
- Pour chaque piste, distinguer annonce consultée, accès de l’acheteur depuis la France, disponibilité et prise en charge par Sendico. L’accès du modèle n’est pas une vérification depuis une connexion française. Un extrait de moteur de recherche reste une piste à vérifier.
- Si l’accès reste bloqué, fournir les mots-clés japonais, l’endroit précis où les saisir et un message prêt à envoyer au support Sendico demandant les détails et la faisabilité de l’achat. Ce message est un texte à copier, sans envoi automatique.
- Livrer une prochaine action réalisable depuis la France, même sans annonce vérifiable. Un blocage ne prouve pas l’absence d’annonces. Les URL d’annonces et les liens Sendico doivent provenir d’une source consultée ; les frais, disponibilités et compatibilités sont à vérifier au moment de la recherche.

## Sources et limites

Vérifiées le 25 septembre 2026. Yahoo! JAPAN annonce des restrictions d’accès depuis l’EEE et le Royaume-Uni, avec des exceptions : cela ne permet pas d’affirmer que tous les sites japonais sont géobloqués. Voir [l’avis officiel Yahoo! JAPAN](https://privacy.yahoo.co.jp/notice/globalaccess.html).

Sendico décrit la recherche par mots-clés ou identifiant dans ses [catalogues intégrés](https://sendico.com/usage-guide/how-to-buy/mercari) et un [formulaire pour les autres magasins](https://sendico.com/usage-guide/how-to-order-others). Sa [page Flea Market](https://sendico.com/shop/other/paypay-fleamarket) présente un service d’achat ; elle ne constitue pas à elle seule la preuve qu’une annonce précise est consultable depuis la France ou achetable. Revalider ces capacités plutôt que promettre un accès universel.

Le composant [japan-search.tsx](../components/japan-search.tsx) porte les deux versions du prompt. Le [parcours navigateur](../tests/e2e/japan-search.spec.ts) vérifie leur contexte français, la copie et l’activation par envie. Ces tests locaux ne prouvent pas l’accès aux sites marchands ni la capacité de navigation du modèle auquel le prompt sera collé.
