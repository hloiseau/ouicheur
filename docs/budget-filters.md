# Trouver un cadeau dans son budget

Premier lot de développement 1.2, suivi dans [l’issue #4](https://github.com/hloiseau/ouicheur/issues/4). Ces filtres sont proposés dans la nouvelle PR ; ils ne font pas partie de l’image 1.1.0.

Sur la liste publique ou dans **Mes envies**, ouvrir **Budget et disponibilité**.

- **Prix d’un exemplaire** compare le budget au prix d’un seul objet. Pour trois livres à 19,99 EUR, le budget de 20 EUR retrouve l’envie même si son objectif total est 59,97 EUR.
- **Objectif total** compare le budget à l’objectif complet, toutes quantités comprises.
- **Reste à financer** utilise l’objectif moins les participations actuellement comptées. Le réglage d’approbation des contributions de l’instance continue de s’appliquer.

Les limites sont inclusives et facultatives. Le point et la virgule sont acceptés, avec deux décimales maximum. Le premier montant saisi sélectionne la devise de l’instance si elle est présente, sinon une devise de la liste ; la sélection reste visible et modifiable. Les montants de devises différentes ne sont jamais convertis. Sans devise sélectionnée, un tri monétaire regroupe les résultats par devise avant de trier leurs montants.

**Encore à offrir uniquement** retire les envies fermées, achetées, entièrement financées ou entièrement réservées. Une réservation partielle laisse les autres exemplaires disponibles. Avec **Reste à financer**, toute réservation exclut l’envie : réservation et nouvelle contribution sont incompatibles. L’action définitive sur la fiche reste vérifiée par le serveur, notamment si quelqu’un réserve entre-temps.

La recherche ignore les accents. Budget, devise, recherche, catégorie, liste et favoris se combinent. Les résultats sont filtrés avant l’affichage progressif ; changer de filtre revient aux 24 premiers résultats. Réinitialiser conserve la liste choisie.

Les filtres restent dans la page courante et ne modifient ni les prix, ni les réservations, ni les données financières. Il n’y a pas de migration de base pour ce lot.
