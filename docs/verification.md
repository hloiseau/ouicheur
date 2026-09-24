# Vérifications de livraison

Exécution le **24 septembre 2026**, sous Windows, avec Node 24.21.0 local au projet et Docker Desktop / moteur Linux 28.3.3. Application Next.js 16.3.6, React 19.3.0. Dépendances verrouillées dans `package-lock.json`.

## Résultats

| Vérification                               | Résultat                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                            | TypeScript sans erreur                                                                                                                |
| `npm run format:check`                     | Sources et documentation formatées                                                                                                    |
| `npm test`                                 | 12 tests réussis                                                                                                                      |
| `npm run build`                            | Compilation de production réussie                                                                                                     |
| `npm run test:e2e`                         | 6 scénarios validés : parcours, accessibilité et premier démarrage sur ordinateur et mobile                                           |
| `docker compose build`                     | Image Linux construite avec succès                                                                                                    |
| `npm run test:docker`                      | Démarrage, lecture publique, authentification, financement, redémarrage, sauvegarde et restauration dans un nouveau conteneur réussis |
| Audit des dépendances npm à l’installation | Aucune vulnérabilité signalée lors de l’exécution ; constat daté                                                                      |

## Scénarios couverts

1. **Initialisation et accès** : l’assistant web exige le code des journaux, refuse un code incorrect, une origine étrangère et des mots de passe différents, puis ouvre une session. Le code n’apparaît pas dans le HTML. Il persiste avant initialisation, est supprimé à la création du propriétaire et ne permet plus de rejouer le setup après redémarrage. Deux connexions concurrentes ne créent qu’un propriétaire. L’alternative CLI et la récupération locale restent testées, avec vérification scrypt et révocation des sessions lors d’un changement de mot de passe.
2. **Cadeaux** : métadonnées HTML / JSON-LD fictives, prix en centimes et date d’extraction, image SVG rejetée. Le navigateur provoque un échec d’extraction puis enregistre un cadeau manuellement et le publie.
3. **Contributions** : deux intentions de même montant sur des cadeaux distincts restent séparées. Déclaration, détection et expiration ne créditent rien. Identifiants aléatoires sur 256 bits.
4. **Confirmation** : confirmation manuelle idempotente, transaction unique, provenance manuelle imposée même si l’entrée tente de déclarer `verified`. Deux workers / connexions SQLite concurrentes confirment une seule fois. Une intention expirée reste rapprochable.
5. **Montants** : frais inconnus exclus du net et affichés séparément, dépassement conservé, nouvelles intentions fermées, aucun achat automatique. Ancienne devise et destinataire PayPal.Me de l’intention préservés.
6. **Événements** : rejeu d’une correction sans double retrait, révision obsolète refusée, remboursement partiel puis total avec historique correct. Un litige seul ne retire aucun financement.
7. **Imports** : fixtures Amazon / Throne, éléments sans lien à corriger, CSV et JSON, aperçu avant écriture, doublons, absence de financement importé, remplacement explicite. Le navigateur importe un JSON puis présente un doublon au réimport sans enregistrement silencieux. L’état d’une tâche en cours est conservé dans la sauvegarde.
8. **Sécurité HTTP** : confirmation interdite à un visiteur non connecté, origine malveillante refusée, accès aux métadonnées cloud bloqué, quota de connexion testé. IP privées/réservées, IPv6, IP encodées en entier/hexadécimal, DNS mixtes, protocoles et borne de redirections.
9. **Docker et sauvegarde** : le conteneur neuf affiche son code, le conserve après redémarrage, accepte le setup web, conserve la session et ferme ensuite l’initialisation. Une instance existante reste utilisable. L’instantané SQLite utilise `VACUUM INTO` : image WebP restaurée à l’identique, intégrité SQLite, refus d’écrasement d’une base existante, sessions révoquées. Le test Docker vérifie 19 € nets avant/après redémarrage puis après restauration dans un autre conteneur.
10. **Navigateur** : page publique, recherche sans résultat, cadeau, intention, lien PayPal exact, déclaration, connexion, confirmation, extraction en erreur, ajout manuel, import JSON et doublon. Messages privés absents des pages publiques et références PayPal absentes du suivi visiteur. Aucun débordement horizontal détecté sur les vues principales. Captures ordinateur/mobile inspectées.

## Accessibilité

Contrôles axe-core WCAG 2 A/AA et 2.1 A/AA sur la page publique, la connexion, l’assistant d’installation et la vue d’ensemble administrateur, en Chromium ordinateur et Pixel 7 simulé. Aucun problème détecté après correction des contrastes. Contrôle de présence du focus clavier. Formulaires natifs, libellés, boutons, progression nommée, lien d’évitement et états annoncés.

Ces contrôles et captures ne constituent pas une certification ni un test exhaustif avec tous les lecteurs d’écran. Aucun test Safari / iOS réel effectué.

## Non validé réellement

- Aucun compte PayPal connecté, aucun transfert, remboursement ou webhook PayPal réel/sandbox. Seule la construction documentée du lien est vérifiée. Les confirmations des tests sont fictives. L’interface interne `recordConfirmedPayment` sépare le registre d’un futur adaptateur, mais **aucun adaptateur automatique n’est livré ou activé**. Une route web ne peut sélectionner la provenance `verified`.
- Aucun import réussi d’une liste personnelle Amazon ou Throne réelle. Les points d’entrée publics ont été sondés : Amazon `ECONNRESET`, Throne HTTP 429. Fixtures et imports génériques ne prouvent pas l’intégration native. [Détail](imports-status.md).
- Aucun domaine, certificat public ou déploiement Internet configuré. L’accès local est limité à la machine ; le README explique HTTPS.
- Aucun déploiement réel sur TrueNAS. Le modèle Compose pour TrueNAS 25.10 passe la validation de syntaxe Docker Compose. L’image est construite localement et doit encore être publiée dans un registre accessible au NAS ; son adresse dans le modèle est un exemple à remplacer. [Guide TrueNAS](truenas.md).
- Le module SQLite natif est fourni par Node LTS et son API conserve un statut de stabilité évolutif dans la documentation Node. Le runtime est verrouillé ; vérifier migrations, sauvegarde et concurrence avant tout changement majeur.

## Rejouer

```sh
npm ci
npm run check
npm run format:check
npm test
npm run build
npm run browser:install
npm run test:e2e
docker compose build
npm run test:docker
```

Le navigateur intégré n’était pas connecté. Les tests utilisent un Chromium indépendant dans `.local/pw-browsers`, sans profil ni session personnels. Le serveur E2E écoute sur 127.0.0.1:3211, chaque test de setup crée une instance vide isolée sur 127.0.0.1:3213 et le test Docker utilise 127.0.0.1:3212. Les conteneurs de test sont supprimés à la fin ; données et captures de test sont ignorées par Git. Aucun test ne clique sur le lien PayPal.
