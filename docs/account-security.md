# Accès et sécurité

Dans **Mon espace → Accès et sécurité**, le propriétaire retrouve les sessions
actives, leur navigateur/système indicatif, leur date de connexion, leur dernière
activité et leur expiration. Il peut fermer un appareil, tous les autres ou sa
session courante, après confirmation. La dernière activité est arrondie par les
mises à jour du serveur à une minute environ ; elle ne prolonge pas l’expiration.

Le changement de mot de passe demande le mot de passe actuel et au moins
12 caractères pour le nouveau. Il révoque toutes les anciennes sessions et ouvre
une nouvelle session sur l’appareil courant. Les surprises sont de nouveau
masquées. Une révocation ou une réinitialisation concurrente ne peut pas être
annulée par une connexion ou un changement de mot de passe déjà en cours.

## Accès perdu

Sur une installation Node, exécuter `npm run password` depuis le répertoire du
projet avec son `DATA_DIR` habituel. Avec Docker Compose :

```sh
docker compose exec app node scripts/manage.ts password
```

Sur TrueNAS ou Unraid, ouvrir la console du conteneur Ouicheur et exécuter :

```sh
node scripts/manage.ts password
```

La commande demande et confirme le nouveau mot de passe sans l’afficher. Elle
ferme toutes les sessions et conserve les envies et les données. Elle nécessite
l’accès au serveur ; aucun lien de récupération distant ni compte externe n’est
nécessaire. Une restauration de sauvegarde révoque également les sessions.

## Migration et confidentialité

La migration 014 conserve les sessions existantes et leur expiration, sans
inventer leurs dates ou leurs appareils : les informations inconnues sont
indiquées comme telles. Aucun mot de passe, jeton de connexion, hash de jeton,
adresse IP ou User-Agent complet ne figure dans la liste renvoyée au navigateur.
L’identifiant servant à fermer une session ne permet pas de se connecter.

Les sessions ont une durée absolue de 12 heures. Les cookies restent HttpOnly,
SameSite=Strict et Secure en HTTPS. La session est vérifiée côté serveur à chaque
requête protégée ; les opérations POST vérifient l’origine et les changements de
mot de passe sont limités en fréquence. Les sessions expirées sont nettoyées et
les 100 connexions les plus récentes sont conservées au maximum. Les noms
d’appareils sont de simples indications, pas une preuve d’identité.

Sauvegarder avant la mise à jour. Pour revenir à une image antérieure à la
migration, restaurer sa sauvegarde correspondante dans un stockage vide :
revenir à l’ancienne image seule ne remet pas la base à son ancien schéma.

## Évolutions des accès

Le périmètre livré ici reste le propriétaire de l’instance. Les coorganisateurs
auront des comptes individuels et des autorisations explicites par liste (#20) ;
ils ne doivent jamais devenir administrateurs par simple présence d’une session.

TOTP et OIDC ont été évalués dans #22, sans activation dans ce lot. Pour TOTP,
prévoir une bibliothèque maintenue, l’enrôlement confirmé, la protection du secret,
les codes de récupération hachés, la prévention du rejeu et une récupération
locale testée avant de proposer l’option. Pour OIDC, lier explicitement un compte
local à une paire émetteur/sujet vérifiée, jamais à un seul nom ou courriel ;
conserver un accès local de récupération. Ces options ne sont pas des prérequis
pour l’installation sur un NAS et n’introduisent aucun fournisseur obligatoire.

Référence : [OWASP — gestion des sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
