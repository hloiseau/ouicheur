# Distribuer Ouicheur dans les catalogues NAS

Ouicheur dispose déjà d’une image Docker publique, d’un assistant de premier démarrage et de volumes persistants. L’installation TrueNAS par YAML est disponible ; l’application n’est pas encore référencée dans les catalogues TrueNAS ou Unraid. Les étapes ci-dessous décrivent le travail restant, pas des soumissions déjà effectuées.

## TrueNAS Apps

Créer une entrée `ix-dev/community/ouicheur` dans un fork de `truenas/apps`, avec les métadonnées `app.yaml`, les champs d’installation `questions.yaml` et le modèle Compose Jinja2. Le formulaire doit proposer le port, l’adresse publique, le stockage et l’utilisateur du conteneur. Ajouter l’icône, la documentation de premier démarrage et les tests de rendu, puis tester installation et mise à jour sur TrueNAS.

La publication se fait par pull request dans le catalogue, avec vérifications automatiques et revue des mainteneurs. Toutes les nouvelles contributions vont dans le train `community`. Voir le [guide officiel de contribution](https://github.com/truenas/apps/blob/master/CONTRIBUTIONS.md).

## Unraid Community Applications

Créer et tester un modèle Docker XML v2 dans l’interface Docker d’Unraid, puis le publier dans un dépôt de modèles. Ce modèle décrit l’image, le port, les volumes, les variables, l’URL d’ouverture de l’application, l’icône et les liens de projet/support. Le mainteneur de Community Applications recommande le XML généré par Unraid pour éviter les incompatibilités avec son parseur : [schéma et consignes](https://forums.unraid.net/topic/38619-docker-template-xml-schema/).

Faire ensuite référencer le dépôt auprès des mainteneurs de Community Applications selon leur procédure en vigueur. La présence du dépôt sur GitHub ne constitue pas à elle seule une publication dans l’onglet Apps. [Présentation du catalogue](https://docs.unraid.net/community-applications/).

Tester les permissions des dossiers `appdata` avec l’utilisateur choisi. L’image Ouicheur tourne par défaut sous `1000:1000` et ne traite pas de variables `PUID`/`PGID` : il faut configurer l’utilisateur Docker et les droits des volumes, sans ajouter de variables inopérantes.

## Configuration commune

| Élément                       | Valeur Ouicheur                                                     |
| ----------------------------- | ------------------------------------------------------------------- |
| Image actuelle                | `ghcr.io/hloiseau/ouicheur:main` ou `sha-COMMIT`                    |
| Port interne                  | `3000/tcp`                                                          |
| Données persistantes          | `/app/data`                                                         |
| Sauvegardes persistantes      | `/app/backups`                                                      |
| Adresse du site               | `APP_ORIGIN`                                                        |
| Vérification de disponibilité | `/api/health`                                                       |
| Icône de catalogue            | [`public/icon.png`](../public/icon.png), 512 × 512                  |
| Initialisation                | Code privé dans les journaux, création du compte dans le navigateur |

Le modèle ne doit embarquer aucun compte, mot de passe, domaine ou chemin personnel. Chaque volume vide déclenche sa propre installation. Caddy ou un autre reverse proxy reste une configuration du serveur de l’utilisateur.

## Ordre de préparation conseillé

1. Publier une version numérotée, par exemple `v1.0.0`, avec changelog et image correspondante ; la CI actuelle publie `main` et `sha-COMMIT`.
2. Préparer les deux modèles avec les mêmes paramètres, puis vérifier installation vierge, redémarrage, mise à jour et restauration sur chaque plateforme.
3. Soumettre l’entrée TrueNAS et demander le référencement Unraid. L’acceptation dépend des mainteneurs de chaque catalogue.
4. Ajouter les autres plateformes selon la demande : la même image peut servir sur un hôte Docker compatible ; les catalogues intégrés demandent leur propre format de configuration.

La CI actuelle construit pour Linux x86-64. Une prise en charge ARM64 devra inclure une compilation et des tests dédiés, notamment pour Chromium utilisé par les imports. Le favicon ou le modèle d’installation ne suffit pas à garantir cette compatibilité.
