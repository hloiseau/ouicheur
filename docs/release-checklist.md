# Première release pour les catalogues NAS

Les soumissions aux catalogues sont suspendues à la demande du propriétaire,
le temps de finaliser le produit. Le propriétaire confirme un essai positif sur
son TrueNAS de la version précédant la finalisation ; il ne s’agit pas encore
d’une validation des nouveaux parcours ni d’Unraid.

Cette liste est un suivi de travail, pas une déclaration de validation.

- [ ] Fusionner la finalisation produit après CI verte et revue.
- [x] Embarquer MIT, les notices des dépendances de production et un inventaire
      npm CycloneDX de construction/exécution ; conserver les notices Debian
      et Chromium de l’image.
- [ ] Archiver l’inventaire de l’image publiée avec la release ; l’inventaire npm
      ne couvre pas les paquets Debian ni Chromium.
- [x] Rédiger un changelog, noter les migrations et documenter une restauration
      depuis une sauvegarde de la version précédente.
- [x] Préparer la version `1.1.0` ; `package.json` et `package-lock.json` sont cohérents.
- [ ] Créer le tag `vX.Y.Z` correspondant après tests. La CI reconstruit, teste et
      publie `ghcr.io/hloiseau/ouicheur:X.Y.Z` ainsi que son tag de commit. Elle ne
      crée pas automatiquement la GitHub Release et ne publie pas `latest`.
- [ ] Vérifier le téléchargement anonyme de l'image, son architecture, le digest,
      `/app/LICENSE` et les notices. Créer la GitHub Release avec changelog et digest.
- [ ] Mettre à jour les références dans le XML Unraid et le candidat TrueNAS.
- [x] Ajouter le démarrage rapide anglais et le guide des nouvelles fonctionnalités.
- [x] Ajouter les captures avec données fictives après vérification visuelle.
- [ ] Activer un canal privé de signalement GitHub si souhaité.

## Essais à réaliser sur chaque NAS

| Essai                                                               | TrueNAS | Unraid  |
| ------------------------------------------------------------------- | ------- | ------- |
| Installation sur stockage vide ; code privé ; création propriétaire | À faire | À faire |
| UID/GID par défaut et personnalisé ; volumes inscriptibles          | À faire | À faire |
| Affichage, images locales, langues et ajout/import par Chromium     | À faire | À faire |
| Contributions fictives, refus/validation et authentification        | À faire | À faire |
| Redémarrage/recréation sans perte de données ou retour au setup     | À faire | À faire |
| Mise à jour depuis l'image de départ en gardant les volumes         | À faire | À faire |
| Sauvegarde puis restauration sur stockage vide, sessions révoquées  | À faire | À faire |
| Accès LAN et HTTPS avec `APP_ORIGIN`, proxy de confiance si utilisé | À faire | À faire |

Pour TrueNAS, exécuter aussi les commandes officielles du
[candidat catalogue](../deploy/truenas/README.md), régénérer les métadonnées et
soumettre une PR dans `truenas/apps` après la demande d'application. Pour Unraid,
le dépôt public sur sa branche par défaut doit contenir les fichiers du
[guide Unraid](unraid.md) ; se connecter à https://ca.unraid.net/submit/new,
effectuer **Validate** et **Scan**, corriger les retours puis soumettre.

L'acceptation et le délai dépendent de chaque équipe de catalogue. Ne pas annoncer
une disponibilité dans les stores sur la seule base d'une PR ou d'un XML valide.
