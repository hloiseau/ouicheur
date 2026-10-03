# Échanges familiaux / Secret Santa

Le propriétaire crée un échange depuis **Famille et coorganisateurs** ou **Mon suivi cadeaux → Échanges de cadeaux en famille**. Il choisit 2 à 50 comptes actifs, une date avec fuseau, un budget indicatif facultatif et des exclusions. Aucun paiement n’est collecté. Un proche peut être invité avec un compte sans aucune liste confiée : l’échange ne lui accorde pas de nouveaux droits sur les listes.

Les invitations sont visibles uniquement dans les comptes concernés, sans envoi externe automatique. Chacun accepte avant le tirage. Les idées facultatives sont partagées seulement avec la personne qui offrira son cadeau, sans partager automatiquement une liste privée. La date et le budget sont communs, les attributions restent individuelles. Les noms utilisés sont ceux choisis dans les comptes au moment de la création.

## Tirage

Une exclusion **A → B** interdit à A d’offrir à B. La case « dans les deux sens » ajoute aussi B → A. Personne ne peut se tirer soi-même. Un couplage biparti avec ordre aléatoire cryptographique trouve une solution ou refuse clairement les contraintes impossibles ; il ne garantit pas une distribution uniforme de toutes les solutions possibles. La vérification lors de la création ne conserve et ne révèle aucune attribution.

Le véritable tirage exige l’accord de tous les comptes encore actifs. Il est transactionnel et définitif pour cet échange, y compris après double clic ou requêtes concurrentes. Il n’existe aucune relance cachée, aperçu des résultats ou fonction de révélation globale. L’organisateur ne reçoit que les invitations et accords ; s’il participe, son propre destinataire reste accessible dans son compte comme pour les autres.

Pour changer la composition ou les exclusions, **annuler l’échange**, puis en créer un nouveau et recueillir de nouveaux accords. L’annulation est visible pour tous les participants, efface les attributions et conversations, et supprime les rappels en attente. Supprimer un compte participant annule les échanges concernés. Désactiver un compte bloque sa connexion ; contacter l’organisateur pour annuler/recréer si besoin. Les échanges annulés peuvent être supprimés ; maximum 100 échanges conservés par instance.

Les contraintes et très petits groupes peuvent permettre de déduire une attribution. La protection s’applique à l’interface et aux API : l’administrateur ayant accès au serveur peut lire la base et les sauvegardes. Ne pas partager une sauvegarde. Une **restauration annule les échanges restaurés** pour éviter de relancer silencieusement un ancien tirage ou de conserver un résultat obsolète.

## Questions, blocage et signalement

L’organisateur propose ou non les questions anonymes, puis chaque participant choisit séparément d’en recevoir. Seule la personne tirée peut recevoir les questions d’un donneur. Dix questions au maximum par donneur/échange, texte limité à 1 000 caractères, quota serveur et aucune récupération de contenu externe. Une réponse n’expose pas l’identité de l’auteur des questions. Le texte peut révéler volontairement une identité : ne pas l’y inscrire si la surprise doit être conservée.

Décocher la réception bloque les nouvelles questions. **Signaler et bloquer** transmet volontairement la conversation à l’organisateur et désactive la réception. L’organisateur ne voit pas les conversations ordinaires ni les identifiants du donneur dans le signalement ; il peut contacter les participants par ses moyens habituels ou annuler l’échange. Aucun message n’est envoyé automatiquement par cette action. Les questions ne sont pas incluses dans les exports de listes, diagnostics ni journaux techniques.

## Calendrier et rappels

Chaque participant ayant accepté peut télécharger un ICS authentifié, sans noms, idées, budget, attribution ni lien privé. Comme tout fichier téléchargé, il ne peut pas être retiré d’un calendrier externe après coup.

Un rappel demande deux consentements : la case propre à l’échange et une règle **Échange de cadeaux à venir / Toutes les listes** dans les notifications personnelles, avec un canal configuré. Les horaires calmes, fréquence et délai choisis s’appliquent. La file déduplique et recontrôle l’accord, le compte actif et l’état du tirage avant émission. Le message est neutre. Une annulation ou désactivation arrête les envois.

Migration 023 additive, FR/EN, formulaires au clavier. Tests synthétiques : exclusions dirigées/impossibles, 50 participants, tirage figé, droits intercomptes, questions et signalement, calendrier minimal, rappels avec consentement et annulation. Aucun destinataire réel contacté.
