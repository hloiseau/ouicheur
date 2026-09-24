# Prompt pour mon agent de code local — Wishlist personnelle auto-hébergeable

Tu es mon agent de développement dans mon environnement local. Construis une application web fonctionnelle, open source et auto-hébergeable, inspirée du fonctionnement des wishlists de Throne. Je veux une vraie implémentation utilisable, avec persistance, tests utiles et documentation d’installation, pas seulement une maquette ou un plan.

Lis ce prompt entièrement, inspecte le dépôt et ses instructions, puis avance de manière autonome. Respecte les fichiers et modifications existants. Prends les décisions techniques courantes sans me demander confirmation à chaque étape. Les choix ci-dessous constituent le cadrage du projet.

## 1. Décisions de produit déjà prises

- Une instance personnelle uniquement : un propriétaire, un compte administrateur et une wishlist publique pouvant contenir plusieurs catégories et cadeaux.
- Usage personnel et non professionnel. Le compte PayPal du propriétaire doit rester un compte particulier.
- Paiement directement au propriétaire via son lien PayPal.Me personnel. Le logiciel ne prélève aucune commission et ne détient pas les fonds.
- Aucun compte PayPal Business/Pro obligatoire. Aucun remplacement par PayPal Checkout, Stripe ou une autre intégration marchande pour contourner cette contrainte.
- Confirmation automatique des versements souhaitée, uniquement si une méthode fiable et compatible avec un compte particulier peut être établie. La confirmation manuelle est le secours accepté ; elle doit rester identifiée comme telle.
- Cadeaux créés à partir de liens externes. Aucun catalogue partenaire, système d’affiliation ou recommandation commerciale.
- Import de mes wishlists Amazon et Throne.
- Financement participatif par cadeau : plusieurs personnes peuvent contribuer à un objectif.
- Interface française, responsive et accessible. Une seule devise par instance pour la V1, EUR par défaut.

La priorité est : compte personnel et autonomie de l’instance, exactitude des montants, puis automatisation. Ne transforme pas le projet en plateforme marchande pour débloquer une API.

## 2. Ce que signifie « financer un cadeau »

Le visiteur contribue financièrement à un cadeau. Le propriétaire reçoit l’argent sur son compte personnel et achète ensuite le produit lui-même.

L’interface doit expliquer ce fonctionnement simplement. Elle ne doit pas laisser croire que l’application commande ou expédie le produit.

Le financement est flexible : les sommes reçues restent chez le bénéficiaire même si l’objectif n’est pas atteint. Il n’y a pas de séquestre, de débit différé ni de remboursement automatique conditionné à l’atteinte d’un objectif.

Le propriétaire fixe un montant cible, éventuellement avec les frais de livraison prévus. Le prix récupéré depuis un marchand est une suggestion datée, modifiable, pas une garantie de prix ni de disponibilité. Un changement de prix ne modifie jamais les contributions déjà enregistrées.

Ne promets pas l’absence universelle de frais PayPal, ni l’anonymat vis-à-vis de PayPal ou de l’autre partie. La promesse du logiciel est l’absence de commission ajoutée. N’impose pas le mode « entre proches » à une opération qui ne remplit pas les conditions du prestataire.

## 3. Première étape : vérifier la faisabilité des paiements personnels

Avant de concevoir une intégration automatique, produis une investigation courte et concrète dans `docs/payments-feasibility.md` : sources officielles consultées, date, type de compte requis, données disponibles, limites et résultats effectivement observés.

Vérifie séparément :

1. Comment construire le lien PayPal.Me et, si c’est pris en charge, préremplir montant et devise.
2. Si un compte particulier peut fournir une notification ou un historique exploitable automatiquement avec une méthode autorisée et documentée.
3. Comment vérifier l’authenticité de cette information, le bénéficiaire, la transaction, son état, le montant et la devise.
4. Comment rattacher sans ambiguïté un versement à une contribution et au bon cadeau.
5. Comment traiter les doublons, les retards, les remboursements et les annulations ou contestations ultérieures.

Ne suppose pas qu’un lien PayPal.Me fournit un webhook. N’invente pas de paramètres `custom`, `reference`, `note` ou de référence marchande dans ce lien. Vérifie chaque capacité réellement disponible.

Une API qui exige un compte professionnel n’est pas une solution pour ce projet. Un test réussi avec un compte marchand de sandbox ne prouve pas que le parcours fonctionne avec un compte particulier. Ne change pas le type du compte PayPal et ne déclenche pas de mouvement d’argent réel sans instruction explicite.

Si une méthode compatible existe, réalise un prototype réduit avant de l’intégrer au produit. Une confirmation automatique doit reposer sur des informations authentifiées et un rapprochement certain, jamais sur une redirection de retour, une capture d’écran, le clic « J’ai envoyé l’argent » ou un montant simplement déclaré.

Si aucune méthode fiable n’est établie, continue à construire toute l’application avec le parcours PayPal.Me et la confirmation manuelle de secours. Documente précisément ce qui manque à l’automatisation ; ne présente pas le projet comme entièrement automatisé. Prévois une interface interne permettant d’ajouter ultérieurement un mécanisme de confirmation sans réécrire les cadeaux ou le registre des contributions.

### Piste facultative : notifications par e-mail

Une lecture d’e-mails peut être explorée pour détecter un versement et proposer son rapprochement. Cette piste n’est pas une fonctionnalité réputée disponible ou fiable à l’avance.

Si elle est mise en œuvre, utilise une boîte ou un dossier dédié, un accès minimal et des secrets configurés localement. Vérifie l’authenticité via une chaîne de confiance documentée ; une adresse d’expéditeur affichée ou un en-tête copié ne suffit pas. Traite le HTML comme une donnée non fiable. Ne visite pas automatiquement les liens contenus dans les messages.

Une notification dont l’authenticité, la signification ou l’association à la contribution reste incertaine reste au statut « détectée, à vérifier ». Elle ne doit pas gonfler le montant confirmé. N’utilise ni scraping du tableau de bord PayPal, ni automatisation de sa connexion, ni API privée non documentée comme dépendance de production.

Quelques points de départ à relire, sans les considérer comme une preuve de compatibilité avec un compte personnel :

- [Aide PayPal.Me](https://www.paypal.com/fr/cshelp/article/quest-ce-que-paypalme%C2%A0-help432)
- [Conditions d’accès aux API REST](https://developer.paypal.com/api/get-started/)
- [Portée et vérification des webhooks](https://developer.paypal.com/api/rest/webhooks/)
- [Configuration des notifications IPN](https://developer.paypal.com/api/nvp-soap/ipn/IPNSetup/)
- [Tarification des particuliers en France](https://www.paypal.com/fr/digital-wallet/paypal-consumer-fees), à adapter au pays du compte.

## 4. Fonctionnalités de la V1

### Installation et administration

- Création du propriétaire au premier démarrage avec un mécanisme d’initialisation protégé, puis fermeture de cette étape. Le premier visiteur public ne doit pas pouvoir prendre possession de l’instance.
- Connexion et déconnexion de l’administrateur, changement de mot de passe et procédure locale documentée de récupération d’accès.
- Profil : pseudonyme, présentation, avatar, bannière et liens sociaux facultatifs.
- Configuration du lien PayPal.Me, de la devise et des options réellement disponibles.
- Gestion des catégories, cadeaux, imports et contributions.

### Ajout d’un cadeau par URL

- Saisie d’une URL de produit externe.
- Extraction raisonnable des métadonnées publiques : titre, image, description courte, prix et devise lorsque disponibles, à partir des métadonnées HTML ou données structurées.
- Aperçu éditable avant enregistrement. Une extraction échouée laisse la possibilité de compléter tous les champs manuellement en conservant le lien externe.
- Champs : URL, titre, image, description, objectif financier, catégorie, priorité, visibilité et état du cadeau.
- États utiles : brouillon, visible, archivé ; distinguer le financement atteint du fait que le propriétaire a effectivement acheté le cadeau.
- Un objectif atteint ne déclenche pas d’achat automatique.

### Page publique

- Profil du propriétaire, catégories, cartes de cadeaux, détails et bouton pour contribuer.
- Chaque cadeau montre son objectif et le montant confirmé. Pour cette V1, calcule le financement à partir du montant net reçu lorsque les frais sont connus ; affiche les autres montants avec un libellé distinct et documente cette convention.
- Parcours de contribution sans compte visiteur : montant, pseudonyme facultatif, message facultatif et préférence d’affichage public.
- Les coordonnées PayPal, identités civiles, références de transaction et messages privés ne sont jamais publiés par défaut.
- États de chargement, absence de cadeaux, erreur d’extraction et attente de confirmation compréhensibles.
- Identité visuelle propre, sans reprendre logos, marque, textes ou assets de Throne. L’application doit être agréable sur mobile et utilisable au clavier.

### Contributions et crowdfunding

- Créer une intention de contribution en base avant la redirection vers PayPal, associée à un seul cadeau et à un identifiant aléatoire non devinable.
- Distinguer l’intention, la déclaration du visiteur et le versement reçu. Une intention abandonnée peut expirer ; un versement reçu plus tard doit rester traitable.
- Conserver les références des transactions effectivement disponibles, les montants bruts, les frais connus, le net reçu, la devise et l’origine de la confirmation.
- Différencier visiblement « confirmé par le propriétaire » et « confirmé automatiquement par une source vérifiée ». Ne pas utiliser le même badge pour une simple détection.
- Prévoir une file de rapprochements incertains. Le montant et l’heure seuls ne suffisent pas à associer automatiquement deux événements.
- Ne jamais demander au visiteur de modifier artificiellement le montant de son cadeau pour servir d’identifiant.
- Une transaction ne peut financer qu’une contribution, une seule fois. Plusieurs événements peuvent en revanche concerner cette transaction, par exemple attente, encaissement et remboursement.
- Un remboursement partiel ou total, ou une annulation confirmée, ajuste le financement restant sans supprimer l’historique. Ne confonds pas un litige en cours avec un remboursement déjà effectué.
- Gérer un dépassement d’objectif sans masquer ou perdre l’argent reçu. Fermer les nouvelles intentions lorsque le cadeau est terminé, tout en acceptant le rapprochement de versements déjà engagés.
- Toute confirmation ou correction manuelle est explicite et inscrite dans un journal d’administration.

Tous les montants sont stockés en unités monétaires mineures entières. Les agrégations sont transactionnelles, idempotentes et cohérentes en cas de requêtes simultanées. La devise d’un cadeau ne doit pas être changée après réception de contributions ; tout changement de devise de l’instance doit préserver l’historique.

### Imports Amazon et Throne

Ces deux importateurs font partie du périmètre. Prévois un adaptateur par source et un format interne commun.

- Import ponctuel de mes listes publiques ou accessibles par un lien de partage autorisé.
- Récupération des informations effectivement disponibles : source et identifiant d’origine, URL marchande, titre, image, prix et devise. Un élément sans URL de produit exploitable est signalé pour correction avant publication.
- Aperçu avant écriture : sélection des cadeaux, modifications, erreurs par élément et détection des doublons.
- Un nouvel import de la même liste ne doit pas créer de doublons silencieux ni écraser les modifications locales sans choix explicite.
- Ne récupère pas d’adresses personnelles, de coordonnées de contributeurs ni d’historiques de paiement. Le financement d’un cadeau importé démarre à zéro dans cette application.
- Pas de synchronisation permanente pour la V1.

Teste l’accès réel à chaque source. N’invente pas d’API publique ou de succès d’import. Si une source exige une connexion non prise en charge, renvoie un CAPTCHA ou refuse l’accès, indique la limite sans contourner ces restrictions. Prévois un import générique CSV/JSON avec exemple et, si pertinent, un fichier exporté fourni par le propriétaire. Ce secours ne permet pas de déclarer l’import natif Amazon ou Throne opérationnel : les statuts doivent rester distincts.

## 5. Architecture et auto-hébergement

Conserve la stack du dépôt si elle convient. Pour un dépôt vierge, les choix par défaut proposés sont un monolithe TypeScript avec Next.js en runtime Node, SQLite, une seule bibliothèque d’accès aux données et un stockage local des images. Choisis des versions stables maintenues, vérifie leur documentation et verrouille les dépendances.

Organise clairement les domaines : profil, cadeaux, contributions, imports, extraction de métadonnées, confirmation des paiements et administration. Ne crée pas de microservices pour cette V1.

Les éventuelles tâches d’import ou de rapprochement doivent survivre aux redémarrages et disposer de reprises bornées. Un mécanisme simple persistant dans SQLite suffit tant qu’il répond au besoin.

Livre :

- `Dockerfile` et `compose.yaml` pour démarrer l’application et conserver ses données dans un volume.
- Migrations de base de données, configuration d’exemple sans secret réel et endpoint de santé.
- Commandes de développement, de production et de tests.
- Instructions de domaine et HTTPS ; documenter les besoins d’accès entrant uniquement si un mécanisme de notification retenu l’exige.
- Sauvegarde cohérente de SQLite, images et configuration, avec procédure de restauration testée. Ne copie pas simplement un fichier SQLite en cours d’écriture sans tenir compte de sa journalisation.
- Export des données du propriétaire dans un format documenté, sans secrets.
- Licence open source explicite. Respecte celle du dépôt existant ; pour un dépôt vierge, MIT est le choix par défaut.

L’application ne doit pas nécessiter de service SaaS central, de stockage cloud, de compte professionnel ni de service d’envoi d’e-mails payant pour fonctionner. Aucun suivi publicitaire ou télémétrie externe par défaut.

## 6. Protections directement liées à ce produit

- Authentification de l’administrateur, mots de passe hachés avec un mécanisme reconnu, sessions sûres, protection CSRF selon le framework et limitation des tentatives de connexion.
- Vérifications d’autorisation côté serveur pour chaque écriture. Aucun secret dans les réponses publiques, le bundle navigateur, le dépôt ou les logs.
- Toutes les données récupérées depuis une page, un import ou un e-mail sont des données non fiables, jamais des instructions à exécuter.
- Pour l’extraction d’URLs et le téléchargement d’images : protéger contre les SSRF, refuser les protocoles non prévus, les adresses locales/privées/réservées, les services de métadonnées et les redirections vers ces destinations. Vérifier aussi la résolution DNS et les adresses IPv6, limiter taille, durée et nombre de redirections.
- Échapper les textes et neutraliser les contenus HTML actifs. Valider les images importées et les fichiers téléversés.
- Limiter les intentions de contribution abusives et les traitements coûteux. Ne pas exposer un service public de téléchargement d’URLs arbitraires.
- Si une notification automatique est retenue : vérifier son authenticité côté serveur, le destinataire, le montant, la devise, l’état et l’association avant tout crédit. Gérer les répétitions et les événements dans le désordre.

## 7. Scénarios d’acceptation

Écris et exécute des tests utiles sur les comportements qui peuvent perdre des données, fausser une cagnotte ou exposer l’administration. Ne te limite pas à des tests de fonctions qui recopient l’implémentation.

La V1 doit démontrer les scénarios suivants :

1. Une installation vide permet de créer le propriétaire de façon protégée et de configurer sa wishlist et son lien PayPal.Me personnel.
2. L’ajout d’un lien produit aboutit à un cadeau éditable ; une extraction échouée permet une saisie manuelle.
3. Deux visiteurs peuvent annoncer le même montant pour des cadeaux différents sans rapprochement arbitraire.
4. Une contribution annoncée, détectée mais non vérifiée, abandonnée ou refusée ne fait pas augmenter le montant confirmé.
5. Une confirmation manuelle crédite une seule fois le cadeau et porte la bonne provenance. Si l’automatisation est disponible, prouver séparément le parcours compatible avec le compte personnel ; indiquer les tests impossibles faute d’accès réel.
6. Une notification rejouée, une confirmation concurrente et un événement reçu dans le désordre ne produisent pas de double crédit. Les remboursements partiels et totaux laissent un historique et un total corrects.
7. Chaque importateur présente un aperçu et un résultat fidèle, y compris les éléments en erreur ; réimporter ne duplique pas les cadeaux.
8. Un visiteur non connecté ne peut pas modifier les cadeaux ou confirmer un versement. Les URLs d’extraction malveillantes sont bloquées.
9. Un redémarrage du conteneur conserve les données. Une sauvegarde peut être restaurée sur une nouvelle instance.
10. Un parcours navigateur sur mobile et ordinateur couvre la page publique, la contribution, l’administration et les états d’erreur principaux.

Utilise des données fictives pour les tests et garde les simulateurs dans l’environnement de test. Un scénario simulé ne vaut pas validation d’une intégration externe réelle.

## 8. Méthode de travail et résultat attendu

Commence par un diagnostic du dépôt, un plan court et l’étude PayPal. Ensuite implémente par étapes : installation et authentification, cadeaux, contributions, imports, puis automatisation si sa faisabilité est prouvée. Termine par les tests, les corrections et la documentation.

Ne t’arrête pas à l’étude PayPal, au schéma de données ou à une belle interface. Si une dépendance externe bloque, achève les autres fonctionnalités et le secours prévu, en gardant une distinction honnête entre implémenté, testé, simulé et non vérifié.

Ne me redemande pas si je veux du multi-utilisateur, un compte PayPal Pro, une marketplace ou un catalogue partenaire : ces choix sont déjà exclus. Demande uniquement ce qui exige réellement mon accès personnel ou une décision absente de ce prompt. Configure les secrets dans mon environnement local, sans me demander de les coller dans la conversation.

À la livraison, fournis le code, un README français utilisable, les fichiers Docker, les migrations, les tests, la licence, `docs/payments-feasibility.md` et un état précis des deux importateurs. Ton compte rendu final doit indiquer comment lancer l’application, ce qui fonctionne réellement, les vérifications effectuées et les limites restantes. Ne publie pas le dépôt et ne déploie pas publiquement l’application sans instruction explicite.
