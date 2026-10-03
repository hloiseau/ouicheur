# Ouicheur sur Unraid

Le [modèle Docker XML](../templates/ouicheur.xml) est une **proposition bêta**.
Sa présence dans GitHub ne signifie pas qu'il est accepté dans Community
Applications. Les premiers essais sur Unraid ont reçu un retour positif. La
recette complète de l’image 1.2.0 finale reste à consigner, notamment sa mise à
jour et sa restauration.

Le modèle épingle une image 1.2.0 existante, testée par la CI en Linux
**amd64 et arm64** (Unraid utilise amd64) :
`ghcr.io/hloiseau/ouicheur:sha-35e849507983f3e5139b7b4f34f13899214a8f46`.
Elle comprend la licence MIT, les notices et les inventaires de dépendances.
Avant la soumission au catalogue, choisir la version stable réellement publiée
et consigner son digest. Aucun tag `latest` n’est utilisé.

## Installation de test

1. Créer deux dossiers dédiés, `appdata/ouicheur/data` et
   `appdata/ouicheur/backups`, sur un stockage local. Configurer leurs permissions
   pour l'utilisateur `99:100`, sans ouvrir les dossiers à tous les utilisateurs.
   Pour SQLite, préférer le stockage local du pool ; éviter SMB/NFS.
2. Importer le XML comme modèle utilisateur Docker, ou reprendre ses paramètres
   dans **Docker → Add Container**. Un XML utilisateur peut être placé dans
   `/boot/config/plugins/dockerMan/templates-user/my-ouicheur.xml`.
3. Vérifier le port hôte `31000`, les deux dossiers et les paramètres avancés
   `--user=99:100 --security-opt=no-new-privileges:true --cap-drop=ALL`.
   Le processus est ainsi non privilégié. `PUID` et `PGID` ne sont pas pris en
   charge par l'image et ne remplaceraient pas `--user`.
4. Démarrer, ouvrir la WebUI et lire le code d'installation dans les journaux du
   conteneur. Créer le propriétaire dans le navigateur ; aucun mot de passe
   prédéfini n'est fourni.
5. Pour un domaine public, placer l'application derrière HTTPS et définir
   `APP_ORIGIN=https://votre-domaine`. Laisser `TRUST_PROXY=0` tant que le port
   reste accessible directement. PayPal.Me est facultatif.

Si le démarrage signale `EACCES`, corriger les droits des deux dossiers ou choisir
un UID/GID correspondant dans les paramètres avancés. Ne pas exécuter le service
en root pour contourner le problème. Vérifier aussi l'import via Chromium sous
l'UID retenu : un simple `/api/health` ne valide pas ce parcours.

## Sauvegarde et mise à jour

Dans la console du conteneur :

```sh
node scripts/manage.ts backup /app/backups/avant-mise-a-jour
```

Exporter ce dossier hors du NAS. Changer ensuite l'image en conservant les deux
montages. Vérifier la connexion, les images, les contributions et les imports.
Tester aussi un compte proche et ses droits, la révocation d’une session et le
mode surprise. Utiliser le [formulaire NAS](https://github.com/hloiseau/ouicheur/issues/new?template=nas.yml)
pour conserver la version d’Unraid, l’image et le résultat.

La restauration doit cibler un dossier de données vide, application arrêtée ;
voir le [README](../README.md#sauvegarder-et-restaurer). Une ancienne image ne
constitue pas à elle seule un retour arrière sûr après migration de base.

## Soumission Community Applications

Le dépôt contient `LICENSE`, `ca_profile.xml` à la racine et le modèle XML v2.
Après fusion sur la branche par défaut, publication de la version et tests NAS,
utiliser https://ca.unraid.net/submit/new avec le dépôt
https://github.com/hloiseau/ouicheur. Le portail exige un compte Unraid, puis
**Validate**, **Scan** et une revue. Il demande également l'acceptation des
conditions Unraid. Ne pas annoncer l'app disponible avant acceptation.

Sources officielles consultées le 28 septembre 2026 :
[procédure](https://ca.unraid.net/submit/help),
[profil de dépôt](https://ca.unraid.net/submit/help/repository-info-xml),
[champs XML](https://ca.unraid.net/submit/help/xml-field-reference).
