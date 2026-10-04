# Livraison reproductible et catalogues NAS

Cette checklist distingue préparation du code, publication d’une image et recette NAS. Cocher uniquement ce qui a été observé pour la référence concernée.

## Code et vérification

1. Mettre à jour `package.json`, les versions racines du lockfile et `CHANGELOG.md`. Rédiger `docs/releases/X.Y.Z.md` avec migrations, options nouvelles et effets d’une restauration.
2. Vérifier la PR : format, TypeScript, tests métier (dont tous les préfixes des migrations), réseau Chromium, build, navigateur FR/EN/mobile/accessibilité et Docker AMD64/ARM64. Le contrôle requis s’appelle exactement `verify`.
3. Inspecter les captures synthétiques des écrans modifiés. Documenter les essais Safari/iOS et NAS effectivement réalisés, en séparant les validations historiques.
4. Fusionner après ces contrôles. Vérifier aussi la publication de l’image du commit de `main` avant de l’annoncer disponible.

## Version stable

1. Dans une PR, renseigner `release-request.json` avec la version stable de `package.json` et préparer ses notes. La fusion autorise la publication automatique après réussite de la CI de ce commit sur `main`. Une demande qui ne correspond pas à la version courante reste inactive. Une version déjà publiée reste inchangée.
2. Attendre le job `publish-release`, après les tests des deux architectures, le contrôle requis `verify` et `publish-manifest`. Il vérifie les révisions OCI, l’accès GHCR anonyme et les inventaires du même run, puis donne le numéro stable au manifeste déjà testé, sans reconstruction et avec le même digest. Il refuse tout tag ou image numérotée désignant une autre référence. Aucun tag `latest` n’est publié.
3. Le job crée `vX.Y.Z` sur le commit testé, prépare une GitHub Release brouillon, joint les deux inventaires, `release-proof.json` et `SHA256SUMS`, puis la publie. La CI de `main` porte cette validation : le tag créé avec `GITHUB_TOKEN` ne déclenche pas un second workflow. Les artefacts Actions expirent après 30 jours ; leurs copies dans la release sont conservées. Une reprise d’un brouillon doit utiliser le run d’origine.
4. Vérifier la Release publiée, ses pièces jointes, son digest et la version/révision affichée à l’installation. Épingler le digest pour une référence immuable ; `main` reste mobile. Ne jamais déplacer un tag publié ; une correction reçoit un nouveau numéro. Le déclenchement manuel de cette même CI sur `main` permet aussi la publication d’une demande, avec tous les contrôles.
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
