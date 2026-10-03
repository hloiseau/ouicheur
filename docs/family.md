# Famille et coorganisateurs

L’édition open source permet de préparer les envies à plusieurs, sans partager
le mot de passe du propriétaire. Aucun service externe ni courriel n’est requis.

## Inviter un proche

Dans **Famille et coorganisateurs → Inviter un proche**, saisir son nom, choisir
un identifiant de connexion et sélectionner les listes confiées. Copier le lien
personnel et le transmettre soi-même à la personne : aucun message n’est envoyé
automatiquement. Le lien expire après 7 jours, ne fonctionne qu’une fois et peut
être révoqué en désactivant l’accès ou en créant une nouvelle invitation.

La personne choisit son propre mot de passe puis accède à **Les listes que je
prépare**. Pour revenir, elle ouvre la page de connexion, coche **Je suis
coorganisateur**, puis saisit son identifiant et son mot de passe. Le propriétaire
garde sa connexion habituelle avec son seul mot de passe.

| Action                                                                              | Propriétaire      | Coorganisateur                                    |
| ----------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------- |
| Voir les listes privées, brouillons et archives                                     | Toutes ses listes | Listes explicitement confiées                     |
| Ajouter, modifier et archiver une envie, importer sa fiche/image                    | Oui               | Listes confiées actives                           |
| Marquer un cadeau acheté ou revenir sur cet état                                    | Oui               | Listes confiées, hors surprises masquées          |
| Choisir catégorie/priorité                                                          | Oui               | Catégories de ses listes, priorités de l’instance |
| Modifier le partage, créer des listes ou gérer les catégories/priorités             | Oui               | Non                                               |
| Gérer contributions, paiements, sauvegardes, imports de listes, journal et réglages | Oui               | Non                                               |
| Inviter, changer les droits et associer les profils                                 | Oui               | Non                                               |
| Voir/révoquer les sessions et changer le mot de passe                               | Son propre compte | Son propre compte                                 |

Modifier les listes confiées ferme les sessions de ce compte. Désactiver l’accès
ferme ses sessions et ses invitations, sans supprimer les envies qu’il a aidé à
préparer. **Réinviter** permet aussi de récupérer un accès perdu : cela remplace
le mot de passe précédent après acceptation et révoque les anciens liens. Une
instance accepte au maximum 50 comptes coorganisateurs et 100 profils familiaux.

L’ajout d’une nouvelle envie reste possible sans révéler les surprises. Modifier
une envie existante dans une liste dont on est destinataire demande d’abord de
révéler les surprises pour cette session, afin de conserver les états masqués.

## Profils et surprises

Un profil familial est un nom ou surnom associé à une ou plusieurs listes. Il ne
crée ni compte enfant, ni messagerie, ni annuaire public, et ne publie aucune
liste. Le propriétaire choisit séparément la visibilité et les accès à la liste.

Un profil adulte peut être lié au propriétaire ou à un compte coorganisateur.
Lorsque le mode surprise est activé sur sa liste, ce destinataire ne voit pas les
achats ni les réservations, y compris dans la réponse API et la consultation
habituelle de la liste. Les autres organisateurs autorisés peuvent les voir.
Le destinataire peut les révéler volontairement pour sa session. Les changements
de destinataire/profil remettent cette révélation à zéro.

Sans profil, une liste reste destinée au propriétaire, comme avant la migration.
Un profil sans compte, notamment un enfant, est géré par les adultes disposant
des accès. Associer un compte à un profil ne lui donne pas automatiquement accès
à une liste privée : le propriétaire doit également lui confier cette liste.

La protection des surprises évite les découvertes involontaires. Elle ne peut pas
empêcher le propriétaire physique du serveur de lire sa base, ni une personne
d’ouvrir une liste publique dans une session anonyme. Les contributions restent
des montants réels affichés sans falsification, comme dans le mode surprise
existant. Les suggestions secrètes coordonnées par un tiers (#6) et leur
modération collaborative restent un lot distinct ; ce lot ne les active pas.

## Migration, export et récupération

La migration 015 conserve le propriétaire, ses sessions, les listes, les envies,
les images et le registre des contributions. Elle n’ajoute aucun coorganisateur
automatiquement et ne change aucune visibilité existante.

Les sauvegardes complètes incluent comptes, droits et profils. La restauration
révoque toutes les sessions et les invitations encore inutilisées ; les comptes
déjà activés peuvent se reconnecter, les autres doivent être réinvités. Les
exports JSON (format 4) incluent les profils, les comptes sans leurs secrets,
les droits et les associations aux listes. Ils n’incluent pas les mots de passe,
les sessions ni les secrets des invitations. L’import d’envies ne recrée pas
les comptes : ces exports ne remplacent pas une sauvegarde complète pour
restaurer les accès.

Ces fonctions font entièrement partie de l’édition libre sous licence MIT.

La commande locale `npm run password` récupère le compte propriétaire et ferme
ses sessions. Elle ne change pas les mots de passe des coorganisateurs. Pour
revenir à une image antérieure, arrêter l’application et restaurer la sauvegarde
de cette image dans un stockage vide ; conserver la base migrée avec un ancien
conteneur n’est pas une procédure de retour arrière prise en charge.

## Contrôles

Les autorisations sont vérifiées côté serveur, à nouveau dans la transaction
pour les modifications d’envies. Les comptes coorganisateurs ne sont jamais
traités comme propriétaires par l’authentification historique. Les invitations
circulent dans un fragment de lien puis dans un corps POST et seul leur hash est
stocké. Leur acceptation est atomique après vérification de l’expiration et de la
révocation. Les doublons dans une liste inaccessible ne sont pas révélés par la
validation ; les images privées et les sessions restent limitées à leur périmètre.
