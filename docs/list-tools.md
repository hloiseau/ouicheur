# Organiser, exporter et réutiliser une liste

Depuis une liste, le propriétaire peut sélectionner jusqu’à 500 envies parmi les résultats affichés : changement de catégorie, déplacement vers une autre liste, archivage ou remise en ligne. La confirmation indique le nombre d’envies concernées. Le serveur vérifie toute la sélection avant d’appliquer l’action dans une transaction. Les réservations et contributions restent rattachées à l’envie ; un déplacement vers une liste privée peut supprimer l’accès des invités. Les actions sensibles respectent le mode surprise.

Les boutons Monter et Descendre sont utilisables au clavier. Le tri « Ordre manuel » affiche cet ordre, avec un identifiant comme dernier critère pour éviter les égalités instables.

« Dupliquer pour une autre occasion » crée une liste **privée**, avec de nouveaux identifiants, les envies visibles, leurs variantes et offres, et les préférences. La copie repart sans achats déclarés, réservations, contributions, liens de partage, accès des proches, notes de préparation ou idées secrètes. La date peut être choisie avant la création. Les catégories et images locales sont réutilisées dans la même instance.

## Préférences facultatives

Les centres d’intérêt, tailles, couleurs, objets déjà possédés et cadeaux à éviter sont privés par défaut. Chaque champ a sa propre visibilité. Le destinataire associé au compte et le propriétaire peuvent les modifier ; les coorganisateurs voient seulement les champs partagés. Vider un champ le supprime. Les notes de préparation sont séparées, propres au compte de leur auteur, et ne sont jamais affichées au destinataire ni ajoutées aux exports de liste. Comme les autres données de l’instance, elles restent lisibles par la personne ayant accès au serveur et à ses sauvegardes.

## Export portable et impression

Chaque liste accessible dispose d’un export JSON (`schema: ouicheur.list`, version 1), d’un CSV UTF-8 et d’une page imprimable utilisable avec « Enregistrer en PDF » du navigateur. Ces exports contiennent uniquement les envies visibles : descriptions, liens, quantités, budgets, variantes et offres. Ils excluent les noms de donateurs, réservations, contributions, achats déclarés, préférences privées, notes et jetons. La date de naissance du destinataire n’est pas exportée.

L’autorisation de lecture est recalculée à chaque requête, y compris après révocation d’un lien privé. Un fichier déjà téléchargé ne peut pas être révoqué. Les cellules CSV potentiellement interprétées comme des formules reçoivent une apostrophe protectrice ; Ouicheur la retire uniquement pour son propre format CSV versionné lors de la réimportation.

Les fichiers sont réimportables via l’aperçu d’import existant, avec choix explicite pour les doublons, par lots de **200 envies maximum**. Le JSON préserve aussi le nom et la description de la liste comme métadonnées ; l’import permet de choisir sa liste de destination sans modifier automatiquement les listes existantes. Les images locales ne sont réutilisées que si leur fichier existe dans l’instance de destination. Pour déplacer une installation complète avec ses images et données privées, utiliser une sauvegarde, pas cet export sélectif.

Le QR code facultatif de la page imprimable est proposé seulement pour une liste publique active. Il renvoie à sa page en ligne sans ajouter de secret dans le document. Les prix imprimés sont indicatifs : vérifier les disponibilités en ligne avant d’acheter.

## Favori de navigateur

La page `/help` présente l’aide pour les invités et le code du favori « Ajouter à Ouicheur ». Il transmet exclusivement l’URL courante ou sélectionnée et le titre ou texte sélectionné à l’instance choisie. Il ne lit ni l’historique ni le contenu complet de la page. Une connexion propriétaire, un aperçu et une confirmation restent nécessaires ; l’ouverture du lien n’ajoute rien en base.

Certains sites bloquent les favoris JavaScript. L’ajout mobile/PWA et le copier-coller d’un lien restent disponibles. Une extension navigateur n’est pas nécessaire à ce parcours et sera évaluée à partir de retours d’utilisation du favori.
