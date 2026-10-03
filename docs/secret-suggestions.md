# Idées secrètes entre proches

Le propriétaire active les suggestions d’une liste publique ou non répertoriée, puis désigne son coorganisateur dans **Famille et coorganisateurs → Coordination des idées secrètes**. Ce compte doit être actif, avoir accès à la liste et être différent de son destinataire.

Lors de la proposition, le proche choisit explicitement entre une idée visible au propriétaire et une idée confiée au coorganisateur. Les propositions existantes conservent leur fonctionnement. Changer le coorganisateur ne transfère jamais les anciennes propositions.

Le coorganisateur retrouve ses idées dans **Les listes que je prépare → Idées secrètes à préparer**. Accepter crée une préparation privée modifiable : titre, notes et état prêt. Cette préparation reste indépendante des envies publiées : pas de paiement, réservation, image ou publication automatique. Pour préserver la surprise, ne pas recopier son contenu sur la liste du destinataire.

Les idées secrètes sont exclues des boîtes du propriétaire, de ses compteurs, du journal, des exports de listes et JSON, et des notifications de l’instance. Révéler les surprises d’une session ne donne pas accès à cette boîte. Les changements de destinataire et d’habilitation sont contrôlés à chaque lecture et modification. Un compte qui perd ses droits ne peut plus lire les idées ; elles ne sont pas redirigées vers quelqu’un d’autre.

L’auteur conserve son lien personnel de suivi, renouvelable et révocable. Il lit sa proposition et son état, jamais les notes du coorganisateur. Supprimer l’idée secrète supprime aussi sa préparation. Les données présentes dans des sauvegardes antérieures subsistent jusqu’à la suppression de ces sauvegardes.

La protection porte sur les accès dans l’application. L’administrateur du serveur peut lire la base et les sauvegardes complètes ; ce n’est pas une messagerie chiffrée de bout en bout. Cette limite est expliquée au moment du consentement. Une restauration révoque les liens de suivi et les sessions, tout en conservant les préparations et leurs habilitations.

La migration 016 ajoute des tables sans modifier les envies existantes. Avant mise à jour, conserver une sauvegarde complète et la référence de l’image. Un retour arrière utilise la sauvegarde antérieure dans des volumes neufs, avec l’image correspondante.
