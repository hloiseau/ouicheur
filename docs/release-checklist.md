# Livraison reproductible et catalogues NAS

Cette checklist distingue préparation du code, publication d’une image et recette NAS. Cocher uniquement ce qui a été observé pour la référence concernée.

## Code et vérification

1. Mettre à jour `package.json`, les versions racines du lockfile et `CHANGELOG.md`. Rédiger `docs/releases/X.Y.Z.md` avec migrations, options nouvelles et effets d’une restauration.
2. Vérifier la PR : format, TypeScript, tests métier (dont tous les préfixes des migrations), réseau Chromium, build, navigateur FR/EN/mobile/accessibilité et Docker AMD64/ARM64. Le contrôle requis s’appelle exactement `verify`.
3. Inspecter les captures synthétiques des écrans modifiés. Documenter les essais Safari/iOS et NAS effectivement réalisés, en séparant les validations historiques.
4. Fusionner après ces contrôles. Vérifier aussi la publication de l’image du commit de `main` avant de l’annoncer disponible.

## Version stable

1. Créer `vX.Y.Z` sur le commit validé, jamais sur une branche supposée inchangée. Ne jamais déplacer un tag publié ; une correction reçoit un nouveau numéro. Le tag historique 1.1 ne doit pas désigner le code 1.2.
2. Attendre la CI du tag : elle refuse une divergence avec `package.json`, teste les deux architectures et publie le manifeste numéroté. La publication refuse de remplacer une version numérotée déjà présente. Aucun tag `latest` n’est publié.
3. Vérifier anonymement le téléchargement GHCR, les deux architectures, la révision OCI, la version/révision de l’interface et le digest. Épingler le digest pour une référence immuable ; `main` est volontairement mobile et les références par commit ne remplacent pas le digest.
4. Télécharger `release-inventory-amd64` et `release-inventory-arm64` du même run. Joindre les archives à la GitHub Release avec notes, commit, digest, résultats et limites. Les artefacts Actions expirent après 30 jours : leur copie dans la release permet de les conserver.
5. Préserver MIT et les notices embarquées. Le SBOM npm n’inventorie pas Debian/Chromium ; l’inventaire final complète ce périmètre. Examiner les obligations des composants natifs lors de leur mise à jour.

## Canaux, sauvegarde et entretien

`main` reçoit les changements vérifiés et convient aux volontaires suivant le développement. Un tag numéroté/digest validé convient aux installations qui doivent rester stables. Ouicheur ne change pas le canal choisi par le propriétaire.

Sauvegarder avant mise à jour, puis tester la restauration sur une copie. Pour revenir en arrière, associer l’ancienne image à sa sauvegarde de schéma correspondant dans un stockage vide. Une rétrogradation de l’image seule ne défait pas une migration. Voir les [notes 1.2.0](releases/1.2.0.md).

Dependabot propose les mises à jour npm/Actions/Docker chaque semaine, sans auto-merge. La CI utilise les caches npm et Docker par architecture. Relever les durées par étape dans le run avant d’ajouter des caches ou de retirer des contrôles. Les marchands réels sont testés ponctuellement et volontairement ; les PR reposent sur des fixtures synthétiques.

## Validation sur NAS

Consigner version du NAS, architecture, image/digest, UID/GID et stockage. Une installation depuis YAML/XML ne prouve pas une présence dans un catalogue.

| Essai                                                       | TrueNAS                            | Unraid                             |
| ----------------------------------------------------------- | ---------------------------------- | ---------------------------------- |
| Installation vide, code et propriétaire                     | À consigner pour la version finale | À consigner pour la version finale |
| Permissions, images, import, langues et mobile              | À consigner                        | À consigner                        |
| Partage, réservations, comptes proches et sessions          | À consigner                        | À consigner                        |
| Redémarrage/recréation et mise à jour de données existantes | À consigner                        | À consigner                        |
| Sauvegarde exportée et restauration dans un stockage vide   | À consigner                        | À consigner                        |

Utiliser le [formulaire NAS](https://github.com/hloiseau/ouicheur/issues/new?template=nas.yml).

## Catalogues — après validation et instruction de publication

- Épingler l’image stable réellement publiée dans le XML Unraid et le candidat TrueNAS, puis vérifier l’installation de cette référence.
- TrueNAS : suivre le [candidat](../deploy/truenas/README.md), régénérer et vérifier les métadonnées avec les outils officiels avant soumission.
- Unraid : le propriétaire effectue **Validate**, **Scan** et la soumission dans [le portail](https://ca.unraid.net/submit/new), selon sa préférence pour les actions de navigateur.
- Consigner les réponses des équipes avant d’annoncer une disponibilité. Les catalogues et annonces restent différés jusque-là.
