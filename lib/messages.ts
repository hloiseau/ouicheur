import { exchangeEnglish } from "./exchange-messages.ts";
import { trackingEnglish } from "./tracking-messages.ts";
import { finalEnglish } from "./final-messages.ts";
import { productEnglish } from "./product-messages.ts";
import { suggestionEnglish } from "./suggestion-messages.ts";
import { accountEnglish } from "./account-messages.ts";
import { familyEnglish } from "./family-messages.ts";
// French source messages and their English translations. Keep placeholders in both.
export const english: Record<string, string> = {
  Filtres: "Filters",
  "Effacer les filtres": "Clear filters",
  "Trouver une envie…": "Find a wish…",
  "Budget estimé": "Estimated budget",
  "Offrir ou participer": "Gift or contribute",
  Thème: "Theme",
  Appareil: "System",
  Clair: "Light",
  Sombre: "Dark",
  "{0} sur {1} envies affichées": "{0} of {1} wishes shown",
  "Réessayer le chargement": "Retry loading",
  "Description complète de cette envie": "Full wish description",
  "Le lien redirige vers une page sans fiche produit identifiable. Vérifiez le lien ou complétez l’envie manuellement.":
    "The link redirects to a page without an identifiable product. Check the link or fill in the wish manually.",
  "Le prix n’a pas été trouvé. Saisissez-le ou choisissez « Budget non précisé ».":
    "The price could not be found. Enter it or choose ‘Budget not specified’.",
  PayPal: "PayPal",
  "Virement bancaire": "Bank transfer",
  "Participation promise": "Pledged contribution",
  "Promesse annulée": "Pledge cancelled",
  "Comment souhaitez-vous participer ?": "How would you like to contribute?",
  "Envoyer avec PayPal": "Send with PayPal",
  "J’ai fait un virement": "I have made a bank transfer",
  "Je participerai plus tard": "I will contribute later",
  "Déclarer mon virement": "Report my bank transfer",
  "Enregistrer ma promesse": "Save my pledge",
  "Déclarez uniquement un virement déjà effectué. Les coordonnées bancaires sont à demander directement au bénéficiaire ; Ouicheur n’effectue aucun virement.":
    "Only report a bank transfer you have already made. Ask the recipient directly for their bank details; Ouicheur does not transfer money.",
  "Annoncez le montant que vous prévoyez de donner. Votre promesse reste séparée des versements et ne remplit pas l’objectif.":
    "Enter the amount you plan to give. Your pledge stays separate from payments and does not fund the goal.",
  "Sans compte · Aucun paiement à cette étape":
    "No account · No payment at this stage",
  "Votre promesse est enregistrée. Aucun argent n’a été envoyé et ce montant n’est pas encore inclus dans la progression du cadeau.":
    "Your pledge has been saved. No money has been sent and this amount is not yet included in the gift’s funding progress.",
  "Convenez du mode de versement directement avec le bénéficiaire. Conservez cette page pour déclarer votre versement plus tard ou annuler votre promesse.":
    "Arrange payment directly with the recipient. Keep this page to report your payment later or cancel your pledge.",
  "J’ai versé ma participation": "I have sent my contribution",
  "Annuler ma promesse": "Cancel my pledge",
  "Votre promesse a été annulée. Aucun versement n’a été enregistré.":
    "Your pledge has been cancelled. No payment has been recorded.",
  "Une fois le versement effectué, indiquez-le ici pour compter votre participation.":
    "Once you have made your payment, report it here to count your contribution.",
  "Conservez cette page pour suivre votre participation. Ce lien est privé : il permet de gérer votre déclaration et ne vaut pas preuve de paiement.":
    "Keep this page to track your contribution. This link is private: it lets you manage your declaration and is not proof of payment.",
  "Vous pouvez utiliser PayPal, déclarer un virement déjà effectué ou promettre une participation pour plus tard. Une promesse ne compte pas comme de l’argent versé.":
    "You can use PayPal, report a bank transfer you have already made, or pledge a contribution for later. A pledge does not count as money sent.",
  "{0} promis en plus, pas encore versés":
    "{0} additionally pledged, not yet paid",
  "Choisissez une envie et votre montant. Un versement déclaré compte dans la progression ; une promesse reste séparée jusqu’à son versement. Le propriétaire achète lui-même le cadeau.":
    "Choose a wish and an amount. Reported payments count toward progress; pledges stay separate until paid. The owner buys the gift.",
  "Ouicheur n’ajoute aucune commission. Les frais éventuels dépendent du moyen de paiement choisi. L’argent reçu reste chez le propriétaire même si l’objectif n’est pas atteint. Commande, expédition et remboursement ne sont pas automatiques.":
    "Ouicheur adds no commission. Any fees depend on your payment method. The owner keeps funds received even if the goal is not reached. Orders, shipping and refunds are not automatic.",
  "Les virements déclarés et les promesses sont disponibles sans PayPal. Communiquez vos coordonnées bancaires directement à vos proches si nécessaire.":
    "Bank transfer declarations and pledges are available without PayPal. Share your bank details directly with your friends and family if needed.",
  "Confirmez uniquement les sommes reçues. Les promesses restent à venir tant qu’aucun versement n’est déclaré ou confirmé.":
    "Only confirm money you have received. Pledges remain pending until payment is reported or confirmed.",
  "À suivre": "To follow up",
  Promesses: "Pledges",
  "Confirmer la réception": "Confirm receipt",
  "Cette promesse a été annulée. Créez une nouvelle participation.":
    "This pledge has been cancelled. Create a new contribution.",
  "Seule une promesse non versée peut être annulée ici.":
    "Only an unpaid pledge can be cancelled here.",
  "La liste a changé. Actualisez les résultats pour continuer.":
    "The list changed. Results have been refreshed; continue from the first page.",
  "Le serveur est occupé. Réessayez dans un instant.":
    "The server is busy. Please try again shortly.",
  "Signaler un problème": "Report a problem",
  "Ces informations identifient le logiciel. Elles ne contiennent ni envies, ni liens privés, ni données de compte. Rien n’est envoyé automatiquement.":
    "These details identify the software. They contain no wishes, private links or account data. Nothing is sent automatically.",
  "Aperçu des informations techniques": "Technical information preview",
  "Sélectionnez et copiez le texte dans l’aperçu.":
    "Select and copy the text in the preview.",
  "Copier les informations techniques": "Copy technical information",
  "Préparer un signalement sur GitHub": "Prepare a GitHub report",
  "Informations copiées.": "Information copied.",
  "Le formulaire GitHub reste à compléter et à envoyer par vous. Ajoutez un lien marchand uniquement si vous souhaitez le rendre public.":
    "You still need to complete and submit the GitHub form. Add a shop link only if you want to make it public.",
  "Le marchand limite la lecture automatique. Vous pouvez ajouter l’envie manuellement ou fournir une page enregistrée.":
    "The shop restricts automated access. You can add the wish manually or provide a saved page.",
  "La cause n’est pas confirmée. Vous pouvez ajouter l’envie manuellement et nous transmettre les étapes qui reproduisent le problème.":
    "The cause is not confirmed. You can add the wish manually and share the steps that reproduce the problem.",
  Révision: "Revision",
  "Construction locale sans commit intégré":
    "Local build without an embedded commit",
  "Construction locale": "Local build",
  "Ajouter manuellement": "Add manually",
  ...finalEnglish,
  ...exchangeEnglish,
  ...trackingEnglish,
  ...productEnglish,
  ...suggestionEnglish,
  ...accountEnglish,
  ...familyEnglish,
  Retirer: "Remove",
  "Gérer les priorités": "Manage priorities",
  "Les envies sont triées de haut en bas selon cet ordre. Choisissez la priorité affichée avec un cœur sur les cartes et dans les filtres.":
    "Wishes are sorted from top to bottom in this order. Choose the priority shown with a heart on cards and in filters.",
  "Priorités, de la plus forte à la plus faible":
    "Priorities, from highest to lowest",
  "Nom de la priorité {0}": "Priority {0} name",
  "Afficher avec un cœur": "Show with a heart",
  "Afficher {0} avec un cœur": "Show {0} with a heart",
  "Monter {0}": "Move {0} up",
  "Descendre {0}": "Move {0} down",
  "Ajouter une priorité": "Add a priority",
  "Filtrer par priorité": "Filter by priority",
  "Toutes les priorités": "All priorities",
  "Les priorités ont changé. Rechargez la page avant de réessayer.":
    "The priorities have changed. Reload the page before trying again.",
  "Configuration des priorités invalide.": "Invalid priority configuration.",
  "Donnez un nom à chaque priorité.": "Give each priority a name.",
  "Chaque priorité doit avoir un nom différent.":
    "Each priority must have a different name.",
  "Priorité inconnue.": "Unknown priority.",
  "Modifier la liste": "Edit list",
  "Liste enregistrée.": "List saved.",
  "Importez une liste publique Amazon ou Throne, puis vérifiez les envies avant de les ajouter. Si le site bloque la lecture, utilisez une page enregistrée ou un fichier CSV/JSON.":
    "Import a public Amazon or Throne list, then review the wishes before adding them. If the site blocks access, use a saved page or a CSV/JSON file.",
  "Le suivi est indisponible.": "Tracking is unavailable.",
  "Votre espace n’a pas pu être chargé. Réessayez dans un instant.":
    "Your space could not be loaded. Please try again in a moment.",
  "La mise à jour a échoué. Les dernières données affichées sont conservées.":
    "The refresh failed. Your last loaded data is still displayed.",
  "Créer une catégorie": "Create a category",
  "Toutes les réservations": "All reservations",
  "1 exemplaire disponible": "1 item available",
  "1 exemplaire réservé": "1 item reserved",
  "Gérer les réservations": "Manage reservations",
  "Chargement…": "Loading…",
  "Aucune réservation pour le moment.": "No reservations yet.",
  "Aucune activité pour le moment.": "No activity yet.",
  "Envie introuvable.": "Wish not found.",
  "Conservez ce lien privé pour retrouver le suivi de votre réservation.":
    "Keep this private link to check your reservation.",
  "L’achat est confirmé. Si vous devez revenir sur ce choix, contactez le propriétaire de la liste.":
    "The purchase is confirmed. Contact the list owner if you need to undo it.",
  "Cette réservation ne bloque plus le cadeau.":
    "This reservation no longer holds the gift.",

  "Les réservations et achats sont visibles dans cette session. Les autres sessions restent protégées.":
    "Reservations and purchases are visible in this session. Other sessions remain protected.",
  "Mode surprise": "Surprise mode",
  "Surprises révélées pour cette session":
    "Surprises revealed for this session",
  "Surprise préservée": "Surprise preserved",
  "Les réservations et les achats des listes protégées restent masqués dans votre espace et son aperçu public. Les contributions financières restent visibles et exactes.":
    "Reservations and purchases on protected lists stay hidden in your space and its public preview. Financial contributions remain visible and accurate.",
  "L’historique détaillé, les exports, les sauvegardes et la modification des envies protégées demandent une révélation volontaire. Une visite anonyme à une liste publique ou l’accès au serveur peut contourner ce mode de confort.":
    "Detailed history, exports, backups and editing protected wishes require a deliberate reveal. An anonymous visit to a public list or server access can bypass this convenience feature.",
  "Révéler les réservations et achats de toutes les listes protégées pour cette session ?":
    "Reveal reservations and purchases on all protected lists for this session?",
  "Masquer à nouveau": "Hide again",
  "Révéler pour cette session": "Reveal for this session",
  "Révélez les surprises pour cette session avant d’ouvrir ces informations ou de modifier cette envie.":
    "Reveal surprises for this session before opening this information or editing this wish.",
  "Confirmez la désactivation du mode surprise.":
    "Confirm turning off surprise mode.",
  "Désactiver le mode surprise pour cette liste et afficher ses réservations et achats ?":
    "Turn off surprise mode for this list and show its reservations and purchases?",
  "Préserver la surprise sur cette liste": "Keep this list a surprise",
  "Masque les réservations et achats au propriétaire connecté, y compris dans son aperçu public. Les proches gardent les disponibilités réelles. Les contributions financières restent visibles ; ce mode ne protège pas contre une visite anonyme ou l’accès au serveur.":
    "Hides reservations and purchases from the signed-in owner, including in their public preview. Friends and family still see actual availability. Financial contributions remain visible; this mode does not protect against an anonymous visit or server access.",
  "Le filtre de disponibilité et les envies réalisées sont masqués pour préserver la surprise.":
    "Availability filtering and completed wishes are hidden to preserve the surprise.",
  "Révéler avant de modifier": "Reveal before editing",
  "Budget et disponibilité": "Budget and availability",
  "Filtres actifs": "Filters active",
  "Comparer le budget avec": "Compare budget with",
  "Prix d’un exemplaire": "Price of one item",
  "Objectif total": "Total goal",
  "Reste à financer": "Remaining to fund",
  "Devise du budget": "Budget currency",
  "Toutes les devises": "All currencies",
  "Budget minimum": "Minimum budget",
  "Budget maximum": "Maximum budget",
  "Sans limite": "No limit",
  "Encore à offrir uniquement": "Only wishes still available to give",
  "Budget invalide : utilisez un montant entre 0 et 1 000 000, avec deux décimales maximum.":
    "Invalid budget: enter an amount between 0 and 1,000,000, with at most two decimal places.",
  "Le budget minimum doit être inférieur ou égal au maximum.":
    "The minimum budget must be less than or equal to the maximum.",
  "Choisissez une devise pour filtrer par budget.":
    "Choose a currency to filter by budget.",
  "Le budget porte sur le montant choisi, dans la devise sélectionnée. Les devises ne sont pas converties.":
    "The budget applies to the selected amount in the chosen currency. Currencies are not converted.",
  "Les envies réservées sont exclues : elles ne peuvent pas recevoir de nouvelles contributions.":
    "Reserved wishes are excluded: they cannot receive new contributions.",
  "Les montants sont triés séparément dans chaque devise.":
    "Amounts are sorted separately within each currency.",
  "Objectif décroissant": "Highest total goal first",
  "Prix unitaire croissant": "Lowest unit price first",
  "Prix unitaire décroissant": "Highest unit price first",
  "Reste à financer croissant": "Least remaining to fund first",
  "Nom (A–Z)": "Name (A–Z)",
  "Essayez un autre budget, une autre catégorie ou quelques mots différents.":
    "Try another budget, category or a few different words.",
  Quantité: "Quantity",
  "Objectif total : {0}": "Total goal: {0}",
  "Quantité : {0} × {1}": "Quantity: {0} × {1}",
  "Montant pour un exemplaire, livraison comprise. Le total est multiplié par la quantité.":
    "Amount per item, including shipping. The total is multiplied by the quantity.",
  "Autoriser un doublon": "Allow a duplicate",
  "Autoriser un doublon (créer une nouvelle envie)":
    "Allow a duplicate (create a new wish)",
  "Ce lien produit existe déjà dans votre Ouichlist. Cochez « Autoriser un doublon » pour créer une autre envie.":
    "This product link is already in your Ouichlist. Select ‘Allow a duplicate’ to create another wish.",
  "Choisissez de remplacer ou de créer un doublon, pas les deux.":
    "Choose either to replace or to create a duplicate.",
  "Plusieurs envies correspondent. Modifiez l’envie souhaitée dans Mes envies ou autorisez un doublon.":
    "Several wishes match. Edit the intended wish in My wishes or allow a duplicate.",
  "Doublon : « {0} ». Choisissez de remplacer, d’autoriser un doublon ou décochez cet élément.":
    "Duplicate: ‘{0}’. Choose to replace it, allow a duplicate, or deselect this item.",
  "Même lien que l’élément {0} : désélectionné par défaut. Autorisez un doublon pour conserver les deux envies.":
    "Same link as item {0}: deselected by default. Allow a duplicate to keep both wishes.",
  "Impossible de lire cette image.": "This image could not be read.",
  "Plus d’options": "More options",
  "Modifier la catégorie {0}": "Edit category {0}",
  "Nouvelle catégorie": "New category",
  "Un nom, une image": "A name, an image",
  "Modifier la catégorie": "Edit category",
  "Nom de la catégorie": "Category name",
  "Image de la catégorie": "Category image",
  Enregistrer: "Save",
  "Supprimer cette catégorie": "Delete this category",
  "Les envies seront conservées, sans catégorie.":
    "Wishes will be kept without a category.",
  "Confirmer la suppression": "Confirm deletion",
  "Choisir une image": "Choose an image",
  Archivées: "Archived",
  "Les participations comptent dès l’envoi déclaré. Dans « Contributions », validez celles reçues ou refusez-les en un clic.":
    "Contributions count as soon as sending is reported. In Contributions, approve received payments or reject them with one click.",
  Valider: "Approve",
  Refuser: "Reject",
  "À valider": "To approve",
  Validées: "Approved",
  Validée: "Approved",
  Refusées: "Rejected",
  "Participation validée.": "Contribution approved.",
  "Participation refusée.": "Contribution rejected.",
  "Validez les participations reçues ou refusez-les.":
    "Approve received contributions or reject them.",
  "Ouverture de PayPal…": "Opening PayPal…",
  "Sans compte · Participation comptée dès l’envoi déclaré":
    "No account · Counted as soon as you report sending it",
  "Merci pour votre participation !": "Thank you for your contribution!",
  "Participation comptabilisée": "Contribution counted",
  "Votre participation est déjà incluse dans la progression du cadeau. Merci !":
    "Your contribution is already included in the gift’s progress. Thank you!",
  "Cette participation a été refusée par le propriétaire.":
    "The owner declined this contribution.",
  "Une fois le paiement envoyé sur PayPal, indiquez-le ici pour compter votre participation.":
    "Once you have sent the payment on PayPal, let us know here to count your contribution.",
  "Ouvrir PayPal si nécessaire ↗": "Open PayPal if needed ↗",
  "de participations": "contributed",
  dont: "including",
  "participés /": "contributed /",
  "Choisissez une envie et votre montant, puis envoyez votre participation via PayPal. Elle compte dès que vous indiquez l’avoir envoyée. Le propriétaire achète lui-même le cadeau.":
    "Choose a wish and an amount, then send your contribution via PayPal. It counts as soon as you report sending it. The owner buys the gift.",
  "Votre participation compte dès que vous indiquez l’avoir envoyée. Le total inclut les envois déclarés et s’ajuste ensuite aux frais et remboursements vérifiés par le propriétaire.":
    "Your contribution counts as soon as you report sending it. The total includes reported payments and is later adjusted for fees and refunds verified by the owner.",
  "Les envois déclarés comptent immédiatement dans la progression. La vérification ajuste le montant sans le compter deux fois. Refuser une déclaration la retire du total. Les références PayPal et messages privés restent ici.":
    "Reported payments count toward progress immediately. Verification adjusts the amount without counting it twice. Rejecting a declaration removes it from the total. PayPal references and private messages stay here.",
  "Les envies sélectionnées seront publiées dès l’enregistrement. Les images sont récupérées automatiquement. Vérifiez les montants et la devise.":
    "Selected wishes will be published when saved. Images are retrieved automatically. Check the amounts and currency.",
  "L’image n’a pas pu être récupérée automatiquement.":
    "The image could not be retrieved automatically.",
  "Le fichier d’import est vide.": "The import file is empty.",
  "Pagination Amazon invalide ou interrompue. Aucun aperçu partiel n’a été enregistré.":
    "Amazon pagination is invalid or was interrupted. No partial preview was saved.",
  "La liste Amazon dépasse la limite de 200 éléments ou de 20 pages.":
    "The Amazon list exceeds the limit of 200 items or 20 pages.",
  "Un même cadeau ne peut être remplacé qu’une fois par import.":
    "A gift can only be replaced once per import.",
  "La page marchande présente un contrôle d’accès. Réessayez plus tard.":
    "The merchant page requires an access check. Try again later.",
  "Throne — page enregistrée (HTML)": "Throne — saved page (HTML)",
  "Page Throne enregistrée (.html)": "Saved Throne page (.html)",
  "Importer une page enregistrée": "Import a saved page",
  "Si Throne refuse le lien, ouvrez votre profil public dans le navigateur, attendez l’affichage des cadeaux, puis enregistrez la page avec Ctrl+S au format HTML. Importez ensuite le fichier .html ici (900 Ko maximum).":
    "If Throne rejects the link, open your public profile in your browser, wait for the gifts to appear, then save the page with Ctrl+S as HTML. Upload the .html file here (900 KB maximum).",
  "Les prix et les images sont récupérés sur les fiches marchandes, pour la variante choisie. Aucune conversion de devise ni reprise des montants financés sur Throne.":
    "Prices and images are retrieved from merchant pages for the selected variant. Currencies are not converted and Throne funding is not imported.",
  "Les informations du produit n’ont pas pu être récupérées chez le marchand.":
    "Product information could not be retrieved from the merchant.",
  "Prix source : {0} {1}": "Source price: {0} {1}",
  "Prix : {0}": "Price: {0}",
  "Les prix marchands sont récupérés et convertis automatiquement en {0}.":
    "Merchant prices are retrieved and automatically converted to {0}.",
  "Converti depuis {0} {1} · taux BCE du {2}":
    "Converted from {0} {1} · ECB rate dated {2}",
  "Conversion indisponible. Saisissez un objectif en {0} ou relancez l’import.":
    "Conversion unavailable. Enter a goal in {0} or retry the import.",
  "Conversion indisponible pour cette devise.":
    "Conversion unavailable for this currency.",
  "Conversion temporairement indisponible. Réessayez l’import.":
    "Conversion temporarily unavailable. Please retry the import.",
  "Même lien que l’élément {0} : désélectionné par défaut. Choisissez le cadeau à conserver ou corrigez son lien avant de sélectionner les deux.":
    "Same link as item {0}: unchecked by default. Choose which gift to keep or correct its link before selecting both.",
  "Aucun produit dans cette page Throne. Ouvrez le profil public, attendez l’affichage des cadeaux et enregistrez la page au format HTML (Ctrl+S).":
    "No products found in this Throne page. Open the public profile, wait for the gifts to appear and save the page as HTML (Ctrl+S).",
  "Aperçu {0}": "{0} preview",
  "Retirer l’image": "Remove image",
  "URL de {0}": "{0} URL",
  "Import…": "Importing…",
  "Ou choisir un fichier JPEG, PNG, WebP (5 Mo max.)":
    "Or choose a JPEG, PNG or WebP file (5 MB max.)",
  "Image limitée à 5 Mo.": "Images must be 5 MB or smaller.",
  "Lien du produit": "Product link",
  "Nom de cette envie": "Gift name",
  "Pourquoi ce cadeau ?": "Why this gift?",
  "Objectif ({0})": "Goal ({0})",
  "Incluez les frais de livraison prévus.":
    "Include any expected shipping costs.",
  Catégorie: "Category",
  "Sans catégorie": "Uncategorized",
  Priorité: "Priority",
  "Une petite envie": "A little wish",
  "J’aimerais beaucoup": "Would really love this",
  "Coup de cœur": "Favorite",
  Visibilité: "Visibility",
  "Visible sur ma Ouichlist": "Visible on my Ouichlist",
  "Archivé (privé)": "Archived (private)",
  "Mettre cette envie en pause": "Pause this wish",
  "Bloque les nouvelles participations et réservations sans supprimer le cadeau. Les participations déjà commencées peuvent être finalisées.":
    "Blocks new contributions and reservations without deleting the gift. Contributions already started can still be completed.",
  "En pause": "Paused",
  "Cette envie est en pause.": "This wish is paused.",
  "Cadeau acheté": "Gift purchased",
  "Cadeau acheté : {0}": "Gift purchased: {0}",
  "Une fois acheté, ce cadeau n’accepte plus de nouvelles participations ni réservations. Vous pouvez annuler ce choix à tout moment.":
    "Once purchased, this gift no longer accepts new contributions or reservations. You can undo this choice at any time.",
  "Modifier cette envie": "Edit this wish",
  "Une nouvelle envie": "A new wish",
  Fermer: "Close",
  "Commencer avec un lien produit": "Start with a product link",
  "Collez le lien de votre envie…": "Paste a product link…",
  "Aperçu récupéré le {0}. Vérifiez les informations avant d’enregistrer. {1}":
    "Preview retrieved on {0}. Check the details before saving. {1}",
  "Les informations sont récupérées, mais l’image n’a pas pu être importée : {0}":
    "The details were retrieved, but the image could not be imported: {0}",
  "La source indique {0} : saisissez votre objectif en {1}, sans conversion automatique.":
    "The source uses {0}: enter your goal in {1}. Currency is not converted automatically.",
  "Le prix est une suggestion, sans garantie de disponibilité.":
    "The price is a suggestion; availability is not guaranteed.",
  "{0} Vous pouvez compléter le formulaire ci-dessous ; votre lien est conservé.":
    "{0} You can fill in the form below; your link has been kept.",
  "Lecture…": "Reading…",
  "Récupérer les informations": "Get product details",
  "La récupération est facultative. Seuls les champs vides sont complétés.":
    "Fetching details is optional. Only empty fields will be filled in.",
  "La récupération automatique n’a pas abouti. Votre lien est conservé : ajoutez le nom et le montant pour enregistrer cette envie.":
    "We couldn’t fetch the product details. Your link has been kept: add a name and an amount to save this wish.",
  "Compléter manuellement": "Fill in manually",
  "Détail de l’erreur": "Error details",
  "Enregistrement…": "Saving…",
  "Enregistrer cette envie": "Save this wish",
  Annuler: "Cancel",
  "Vos envies, déjà ailleurs ?": "Already have a Ouichlist?",
  "Import ponctuel, aperçu obligatoire, aucun historique financier importé.":
    "Review your list before importing. Payment history is not imported.",
  "Amazon et Throne : adaptateurs de HTML public, accès réel dépendant de la source. Un CAPTCHA, une connexion ou des produits absents du HTML bloquent l’import natif. Le secours CSV/JSON reste distinct.":
    "Amazon and Throne imports depend on their public pages. If a page requires a login or CAPTCHA, or does not include the products, use a CSV or JSON export instead.",
  Source: "Source",
  "Liste Amazon — lien public ou partagé":
    "Amazon list — public or shared link",
  "Liste Throne — profil public": "Throne list — public profile",
  "Fichier CSV générique": "Generic CSV file",
  "Fichier JSON générique": "Generic JSON file",
  "Lien de votre liste autorisée":
    "Link to a list you have permission to import",
  "Fichier {0} (200 éléments maximum)": "{0} file (up to 200 items)",
  "Fichier trop volumineux (900 Ko maximum).":
    "File too large (900 KB maximum).",
  "Contenu à importer": "Content to import",
  "Télécharger un exemple": "Download an example",
  "Préparation de l’aperçu…": "Preparing preview…",
  "Préparer l’aperçu": "Preview import",
  "Aperçu de l’import": "Import preview",
  "Élément {0}": "Item {0}",
  "Source :": "Source:",
  "· ID :": "· ID:",
  "Prix d’origine en {0}. Saisissez un objectif en {1} ; aucune conversion automatique.":
    "Original price in {0}. Enter a goal in {1}; currency is not converted automatically.",
  "Doublon détecté : je choisis de remplacer les champs locaux de ce cadeau. Les contributions et sa devise seront conservées.":
    "Duplicate found: replace this gift’s local details. Its contributions and currency will be kept.",
  "Vérifier et modifier les champs": "Review and edit details",
  "Enregistrer {0} envie(s) sélectionnée(s)": "Save selected wishes ({0})",
  "Import enregistré. Vos envies sont visibles sur votre page publique.":
    "Import saved. Your wishes are visible on your public page.",
  "Voir mes envies": "View my wishes",
  "Imports enregistrés et reprises": "Import history",
  "Vos imports apparaîtront ici.": "Your imports will appear here.",
  "tentative(s)": "attempts",
  Reprendre: "Resume",
  Voir: "View",
  "Correction manuelle du versement": "Manual payment correction",
  "Confirmer après vérification dans PayPal": "Confirm after checking PayPal",
  "Indiquez les nouveaux montants cumulés, pas une différence. Une correction conserve l’historique et sa justification.":
    "Enter the new cumulative amounts, not the difference. Corrections keep the history and your reason.",
  "Vérifiez le destinataire, l’état encaissé, la devise et l’association à cette intention. Le montant et l’heure seuls ne prouvent pas le rapprochement.":
    "Check the recipient, completed payment status, currency and connection to this contribution request. Amount and time alone do not prove a match.",
  "Référence réelle de transaction PayPal (privée)":
    "Actual PayPal transaction reference (private)",
  "Brut reçu ({0})": "Gross received ({0})",
  "Frais connus ({0})": "Known fees ({0})",
  "Vide = inconnus, hors financement net. Indiquez 0 si l’absence de frais est vérifiée.":
    "Leave blank if unknown; the payment will stay outside net funding. Enter 0 only if you verified there were no fees.",
  "Total brut remboursé au contributeur":
    "Total gross refunded to the contributor",
  "Total net à retirer du financement": "Total net to remove from funding",
  "Retrait constaté, y compris annulation confirmée. Ne devinez pas le remboursement des frais.":
    "Use the verified amount removed, including confirmed reversals. Do not estimate refunded fees.",
  "Litige en cours (ne retire pas de fonds à lui seul)":
    "Open dispute (does not remove funds by itself)",
  "Pour annuler entièrement le financement, retirez tout le net initial. Si le brut a été intégralement remboursé, le net restant doit être nul.":
    "To reverse all funding, remove the full original net amount. If the gross amount was fully refunded, the remaining net must be zero.",
  "J’ai vérifié que mon compte a reçu ce versement dans la bonne devise.":
    "I verified that my account received this payment in the correct currency.",
  "Le paiement est effectivement encaissé, et non en attente.":
    "The payment is completed, not pending.",
  "J’ai vérifié l’association certaine avec cette intention et ce cadeau.":
    "I verified that this payment matches this contribution request and gift.",
  "Justification privée de la vérification ou correction":
    "Private reason for verification or correction",
  "Éléments vérifiés et raison de l’opération…":
    "What you checked and why you are making this change…",
  "Enregistrer la correction manuelle": "Save manual correction",
  "Confirmer manuellement ce versement": "Manually confirm this payment",
  "Les attentions reçues": "Contributions received",
  "Un registre précis, avec confirmation manuelle explicite.":
    "Keep track of contributions and confirm each payment manually.",
  Afficher: "Show",
  "À rapprocher": "To review",
  Confirmées: "Confirmed",
  "Toutes les intentions": "All contribution requests",
  "Une intention annoncée ou détectée n’augmente jamais la cagnotte. Les références PayPal et les messages privés restent dans cet espace.":
    "Reported or detected contributions do not increase funding. PayPal references and private messages stay in this space.",
  "Tout est à jour.": "All caught up.",
  "Aucune contribution dans cette vue.": "No contributions in this view.",
  "Pseudonyme non renseigné": "No nickname provided",
  "annoncés ·": "reported ·",
  "Confirmé par le propriétaire": "Confirmed by the owner",
  "Confirmé automatiquement par une source vérifiée":
    "Automatically confirmed by a verified source",
  "Message :": "Message:",
  "Références privées": "Private references",
  "Intention :": "Contribution request:",
  "Destinataire prévu : PayPal.Me/": "Expected recipient: PayPal.Me/",
  "Transaction :": "Transaction:",
  "Brut :": "Gross:",
  "· Frais :": "· Fees:",
  "· Net restant :": "· Remaining net:",
  inconnus: "unknown",
  "non établi": "not established",
  " · Litige en cours": " · Open dispute",
  "Corriger / rembourser": "Correct / refund",
  "Vérifier le versement": "Review payment",
  "Mettre en attente ou refuser": "Mark as pending or reject",
  Statut: "Status",
  "Détectée, à vérifier": "Detected, needs review",
  Refusée: "Rejected",
  "Annoncée, à vérifier": "Reported, needs review",
  Justification: "Reason",
  "Enregistrer le statut": "Save status",
  "Vue d’ensemble": "Overview",
  "Mes envies": "My wishes",
  Contributions: "Contributions",
  "Importer une liste": "Import a list",
  "Mon profil": "My profile",
  Journal: "Activity log",
  "Ouverture de votre espace…": "Opening your space…",
  "Voir la Ouichlist ↗": "View Ouichlist ↗",
  "Rien qu’à vous": "Just for you",
  "Le coin des envies.": "Your little wish corner.",
  "Votre espace pour ajouter des cadeaux et prendre soin des petites attentions.":
    "Your space to add gifts and manage contributions.",
  "Mot de passe": "Password",
  "Connexion…": "Signing in…",
  "Entrer dans mon espace": "Sign in",
  "Accès perdu ? La commande locale": "Lost access? The local command",
  "permet de réinitialiser votre mot de passe.":
    "lets you reset your password.",
  "Mon petit espace": "My space",
  Administration: "Administration",
  Déconnexion: "Sign out",
  "Ma Ouichlist publique ↗": "My public Ouichlist ↗",
  "Se déconnecter": "Sign out",
  Propriétaire: "Owner",
  "Votre Ouichlist personnelle": "Your personal Ouichlist",
  "Bonjour {0} ✦": "Hello {0} ✦",
  "Ajouter une envie": "Add a wish",
  "envies à partager": "wishes to share",
  "attentions à vérifier": "contributions to review",
  "objectifs atteints": "goals reached",
  "Configurez votre lien PayPal.Me dans « Mon profil » pour ouvrir les contributions.":
    "Add your PayPal.Me link in My profile to enable contributions.",
  "Vérifier les contributions": "Review contributions",
  "Confirmation manuelle": "Manual confirmation",
  "Vous recevez directement les versements sur votre compte particulier. Vérifiez chaque transaction dans PayPal, puis confirmez-la dans « Contributions ». Aucune déclaration visiteur n’est créditée automatiquement.":
    "Payments go directly to your personal account. Check each transaction in PayPal, then confirm it in Contributions. Visitor reports are never credited automatically.",
  "Consulter les contributions": "View contributions",
  "Ma collection": "My collection",
  "envie(s)": "wishes",
  "Votre première envie vous attend.": "Make your first wish.",
  "Ajoutez un lien produit ou importez votre liste existante.":
    "Add a product link or import your existing list.",
  "nets /": "net /",
  "Ancienne devise : nouvelles contributions fermées.":
    "Previous currency: closed to new contributions.",
  Acheté: "Purchased",
  Modifier: "Edit",
  "Journal d’administration": "Activity log",
  "Exporter mes données": "Export my data",
  "Les 100 dernières opérations. L’export JSON contient l’intégralité du journal et du registre, sans mot de passe ni session.":
    "The latest 100 actions. The JSON export includes the full activity and payment history, without passwords or sessions.",
  "Référence :": "Reference:",
  "Vos données, chez vous.": "Your data, on your server.",
  "Les catégories": "Categories",
  "Nom de la catégorie {0}": "Name of category {0}",
  Renommer: "Rename",
  Supprimer: "Delete",
  "Nom de la nouvelle catégorie": "New category name",
  "Une nouvelle catégorie…": "A new category…",
  Ajouter: "Add",
  "Votre profil est enregistré.": "Your profile has been saved.",
  "Votre profil public": "Your public profile",
  "Pseudonyme public": "Public nickname",
  Présentation: "About you",
  Avatar: "Avatar",
  Image: "Image",
  Bannière: "Banner",
  "Liens sociaux (un par ligne, six maximum)":
    "Social links (one per line, up to six)",
  "Recevoir les contributions": "Receive contributions",
  "Votre lien PayPal.Me personnel": "Your personal PayPal.Me link",
  "Visible dans le parcours de paiement. Votre adresse e-mail PayPal n’est pas demandée.":
    "Shown during payment. Your PayPal email address is not required.",
  "Devise des nouveaux cadeaux": "Currency for new gifts",
  "Les cadeaux existants conservent leur devise. Ceux dans une ancienne devise sont fermés aux nouvelles contributions ; le rapprochement des versements déjà engagés reste possible.":
    "Existing gifts keep their currency. Gifts in a previous currency close to new contributions; existing payments can still be reviewed and confirmed.",
  "Enregistrer mon profil": "Save my profile",
  "Protéger mon espace": "Protect my space",
  "Mot de passe actuel": "Current password",
  "Nouveau mot de passe (12 caractères minimum)":
    "New password (at least 12 characters)",
  "Changer le mot de passe et fermer les sessions":
    "Change password and sign out all sessions",
  "Emporter mes données": "Take my data with me",
  "Export JSON du profil, des cadeaux, des contributions et de leur historique. Il contient des messages privés : conservez-le pour vous. Les images se sauvegardent avec la commande locale de sauvegarde.":
    "Download your profile, gifts, contributions and history as JSON. It contains private messages, so keep it private. Use the local backup command to include images.",
  "Télécharger mes données": "Download my data",
  "Les nouvelles contributions sont fermées pour ce cadeau. Merci pour toutes vos attentions !":
    "This gift is closed to new contributions. Thank you for your kindness!",
  "Le propriétaire prépare encore la réception des contributions. Revenez bientôt.":
    "The owner is still setting up contributions. Check back soon.",
  "Contribution impossible.": "Unable to create this contribution.",
  "Un petit coup de pouce ?": "Want to chip in?",
  "Votre contribution ({0})": "Your contribution ({0})",
  "Financer le reste ({0})": "Fund the remaining amount ({0})",
  "Maximum : {0}": "Maximum: {0}",
  "La contribution ne peut pas dépasser le montant restant à financer.":
    "The contribution cannot exceed the amount left to fund.",
  "Votre petit nom (facultatif)": "Your nickname (optional)",
  "Une personne attentionnée": "Someone thoughtful",
  "Un mot qui fait sourire (facultatif)": "A little message (optional)",
  "Pour tes prochaines aventures…": "For your next adventures…",
  "Afficher mon pseudonyme sur la Ouichlist après confirmation":
    "Show my nickname on the Ouichlist after confirmation",
  "Afficher mon message sur la Ouichlist après confirmation":
    "Show my message on the Ouichlist after confirmation",
  "Vos choix concernent uniquement cette Ouichlist. PayPal et l’autre partie peuvent voir les informations liées au paiement. Choisissez le type de transfert adapté à votre situation ; des frais peuvent s’appliquer.":
    "These choices only apply to this Ouichlist. PayPal and the other party may see payment information. Choose the transfer type that fits your situation; fees may apply.",
  "Création de votre intention…": "Creating your contribution request…",
  "Continuer vers PayPal": "Continue to PayPal",
  "Sans compte visiteur · Confirmation par le propriétaire":
    "No visitor account needed · Confirmed by the owner",
  "Votre petite attention": "Your contribution",
  "Votre versement est confirmé.": "Your payment is confirmed.",
  "Une envie se rapproche.": "One step closer to a wish.",
  "Chargement de votre contribution…": "Loading your contribution…",
  "Net conservé pour ce cadeau :": "Net funding kept for this gift:",
  "frais encore inconnus, hors total net confirmé":
    "fees still unknown, excluded from confirmed net funding",
  "Remboursement enregistré :": "Refund recorded:",
  "Un litige est en cours. Cela ne signifie pas qu’un remboursement a eu lieu.":
    "A dispute is open. This does not mean a refund has been made.",
  "L’intention a bien été enregistrée. Elle ne constitue pas une preuve de paiement.":
    "Your contribution request has been saved. It is not proof of payment.",
  "Ouvrir PayPal pour envoyer": "Open PayPal to send",
  "Après l’envoi, revenez ici pour prévenir le propriétaire. Il vérifiera le versement dans son compte PayPal avant de confirmer.":
    "After sending, return here to notify the owner. They will check their PayPal account before confirming the payment.",
  "J’ai envoyé l’argent": "I’ve sent the money",
  "L’intention a expiré. Un versement déjà envoyé peut toujours être rapproché par le propriétaire.":
    "This contribution request has expired. The owner can still match and confirm a payment you have already sent.",
  "Un clic sur ce bouton ne confirme aucun versement. N’envoyez pas une seconde fois l’argent si le statut reste en attente.":
    "Clicking this button does not confirm a payment. Do not send the money again if the status is still pending.",
  "Ma référence de suivi privée": "My private tracking reference",
  "Conservez cette page. Vous pouvez communiquer cette référence au propriétaire pour l’aider à retrouver votre intention ; elle ne vaut pas preuve de paiement et n’est pas transmise automatiquement à PayPal.":
    "Keep this page. You can share this reference with the owner to help them find your contribution request. It is not proof of payment and is not sent to PayPal automatically.",
  "Vérification…": "Checking…",
  "Actualiser le statut": "Refresh status",
  "Retour au cadeau": "Back to the gift",
  "confirmés nets": "confirmed net",
  "sur {0}": "of {0}",
  "{0} financés sur {1}": "{0} funded out of {1}",
  "Objectif de": "Goal:",
  "bruts reçus, frais à préciser": "gross received, fees not yet known",
  "La Ouichlist de {0}": "{0}’s Ouichlist",
  "Ma Ouichlist": "My Ouichlist",
  "Lien copié !": "Link copied!",
  Partager: "Share",
  "Les envies": "Wishes",
  "Rechercher une envie": "Search wishes",
  Rechercher: "Search",
  "Trier par": "Sort by",
  "Coups de cœur": "Favorites",
  "Objectif croissant": "Lowest goal first",
  "Financement avancé": "Most funded first",
  "Filtrer par catégorie": "Filter by category",
  Tout: "All",
  "Découvrir {0}": "View {0}",
  "Déjà acheté": "Purchased",
  "Objectif atteint": "Goal reached",
  "Voir cette envie": "View this wish",
  "Aucune envie trouvée": "No wishes found",
  "Pas encore d’envies": "No wishes yet",
  "Essayez une autre catégorie ou quelques mots différents.":
    "Try another category or different search terms.",
  "La liste est vide pour le moment.": "The list is empty for now.",
  "Espace propriétaire": "Owner space",
  "À propos des participations": "About contributions",
  "Choisissez une envie et le montant de votre choix. Le versement se fait directement au propriétaire via PayPal.Me ; il vérifie sa réception avant de confirmer le financement et achète lui-même le cadeau.":
    "Choose a wish and an amount. Payment goes directly to the owner through PayPal.Me. They check it before confirming the funding and buy the gift themselves.",
  "Ouicheur n’ajoute aucune commission. Des frais PayPal peuvent s’appliquer. L’argent reçu reste chez le propriétaire même si l’objectif n’est pas atteint. Commande, expédition et remboursement ne sont pas automatiques.":
    "Ouicheur adds no commission. PayPal fees may apply. The owner keeps funds received even if the goal is not reached. Orders, shipping and refunds are not automatic.",
  "Mon espace": "My space",
  "Votre Ouichlist commence ici.": "Your Ouichlist starts here.",
  "Créez votre espace personnel. Cette étape ne sera demandée qu’une fois.":
    "Create your personal space. You only need to do this once.",
  "Code d’installation": "Setup code",
  "Dans TrueNAS, ouvrez les journaux de l’application Ouicheur et copiez le code affiché au démarrage.":
    "In TrueNAS, open the Ouicheur app logs and copy the code shown at startup.",
  "Votre nom ou pseudonyme": "Your name or nickname",
  "Il sera affiché sur votre Ouichlist.": "This will appear on your Ouichlist.",
  "Au moins 12 caractères. Choisissez un mot de passe réservé à cette application.":
    "At least 12 characters. Choose a password you only use for this app.",
  "Confirmer le mot de passe": "Confirm password",
  "Devise de la Ouichlist": "Ouichlist currency",
  "Lien PayPal.Me (facultatif)": "PayPal.Me link (optional)",
  "Vous pourrez l’ajouter plus tard dans votre profil.":
    "You can add it later in your profile.",
  "Création de votre espace…": "Creating your space…",
  "Créer ma Ouichlist": "Create my Ouichlist",
  "L’opération a échoué.": "Something went wrong.",
  "Ouicheur, accueil": "Ouicheur, home",
  "Un petit contretemps.": "A little hiccup.",
  "La page n’a pas pu être chargée. Vous pouvez réessayer.":
    "This page could not be loaded. Please try again.",
  Réessayer: "Try again",
  "Retour à l’accueil": "Back to home",
  "Ouicheur · Les petites envies": "Ouicheur · Little wishes",
  "Une Ouichlist personnelle, des envies à partager et des cadeaux à financer ensemble.":
    "A personal Ouichlist, wishes to share and gifts to fund together.",
  "Aller au contenu": "Skip to content",
  "Les envies se préparent…": "Getting the wishes ready…",
  "Cette envie est introuvable.": "This wish could not be found.",
  "Elle a peut-être été archivée.": "It may have been archived.",
  "Retrouver la Ouichlist": "Back to the Ouichlist",
  "Installer votre Ouichlist": "Set up your Ouichlist",
  "← La Ouichlist de {0}": "← {0}’s Ouichlist",
  "Voir le produit chez le marchand ↗": "View product at the store ↗",
  "Ce cadeau a été acheté par le propriétaire.":
    "The owner has purchased this gift.",
  "Prix suggéré lors de l’extraction :": "Suggested price when retrieved:",
  "). Prix et disponibilité non garantis.":
    "). Price and availability are not guaranteed.",
  "Votre geste, en toute clarté.": "How your contribution works.",
  "Votre contribution va directement à {0}, qui achètera ensuite le cadeau. Les sommes reçues restent chez le bénéficiaire même si l’objectif n’est pas atteint. Atteindre l’objectif ne déclenche aucun achat automatique.":
    "Your contribution goes directly to {0}, who will buy the gift. The recipient keeps funds received even if the goal is not reached. Reaching the goal does not trigger an automatic purchase.",
  "Le total net augmente après vérification manuelle du versement par le propriétaire. Un prix marchand peut évoluer sans modifier les contributions déjà reçues.":
    "Net funding increases after the owner manually verifies the payment. Store prices may change without affecting contributions already received.",
  "Des petites attentions ♡": "A little kindness ♡",
  "← Retour à la Ouichlist": "← Back to the Ouichlist",
  "Votre contribution": "Your contribution",
  Langue: "Language",
  "Requête trop volumineuse.": "Request too large.",
  "Corps de requête manquant.": "Missing request body.",
  "JSON invalide.": "Invalid JSON.",
  "Méthode refusée.": "Method not allowed.",
  "Cette instance est déjà initialisée. Connectez-vous à votre espace.":
    "This instance is already set up. Sign in to your space.",
  "Connexion impossible. Vérifiez le mot de passe.":
    "Unable to sign in. Check your password.",
  "Connexion administrateur requise.": "Owner sign-in required.",
  "Mot de passe actuel incorrect.": "Incorrect current password.",
  "Utilisez une correction du versement confirmé.":
    "Use a correction for the confirmed payment.",
  "Extraction impossible. Conservez le lien et complétez les champs manuellement.":
    "Could not retrieve product details. Keep the link and fill in the fields manually.",
  "Choisissez une image ou un lien.": "Choose an image or a link.",
  "Téléchargement impossible. Vous pouvez choisir un fichier local.":
    "Download failed. You can choose a local file instead.",
  "Vérifiez les champs : {0}": "Check these fields: {0}",
  "Une donnée existe déjà ou ne respecte pas les contraintes du registre.":
    "An entry already exists or does not meet the record requirements.",
  "L’opération a échoué. Vos données confirmées restent conservées.":
    "The operation failed. Your confirmed data is still saved.",
  "Le mot de passe doit contenir entre 12 et 256 caractères.":
    "Your password must contain between 12 and 256 characters.",
  "Pseudonyme invalide.": "Invalid nickname.",
  "Cette instance est déjà initialisée.": "This instance is already set up.",
  "Initialisez d’abord le propriétaire.": "Create the owner account first.",
  "Trop de tentatives. Réessayez un peu plus tard.":
    "Too many attempts. Please try again later.",
  "Origine de la requête refusée. Rechargez la page ; derrière un proxy, vérifiez APP_ORIGIN.":
    "Request origin rejected. Reload the page; behind a proxy, check APP_ORIGIN.",
  "Format JSON requis.": "JSON format required.",
  "Choisissez un dossier de sauvegarde qui n’existe pas encore.":
    "Choose a backup folder that does not exist yet.",
  "La restauration exige une destination sans base existante. Arrêtez l’application et utilisez un nouveau DATA_DIR.":
    "Restoring requires a destination without an existing database. Stop the app and use a new DATA_DIR.",
  "Sauvegarde non reconnue.": "Unrecognized backup.",
  "Sauvegarde corrompue ou nom de fichier invalide.":
    "Corrupted backup or invalid filename.",
  "La base sauvegardée est corrompue.": "The backed-up database is corrupted.",
  "Cette destination réseau est interdite.":
    "This network destination is blocked.",
  "Les adresses privées ou réservées sont interdites.":
    "Private or reserved addresses are blocked.",
  "Résolution DNS trop lente.": "DNS lookup timed out.",
  "La résolution DNS pointe vers une adresse privée ou réservée.":
    "DNS resolves to a private or reserved address.",
  "Trop de redirections ou serveur trop lent.":
    "Too many redirects or the server took too long.",
  "Redirection sans destination.": "Redirect without a destination.",
  "Source inaccessible (HTTP {0}). Aucun contournement effectué.":
    "Source unavailable (HTTP {0}). No access restrictions were bypassed.",
  "Encodage distant non pris en charge.": "Unsupported remote encoding.",
  "Format distant non autorisé.": "Remote file format not allowed.",
  "Fichier distant trop volumineux.": "Remote file too large.",
  "Intention créée": "Contribution request created",
  "Intention expirée": "Contribution request expired",
  Visible: "Visible",
  Archivé: "Archived",
  "En attente": "Queued",
  "En cours": "In progress",
  "Aperçu disponible": "Preview ready",
  "Accès impossible": "Access failed",
  "Import enregistré": "Import saved",
  "Instance non initialisée.": "This instance has not been set up.",
  "Catégorie inconnue.": "Unknown category.",
  "Ce lien produit existe déjà dans votre Ouichlist.":
    "This product link is already in your Ouichlist.",
  "Utilisez une image JPEG, PNG ou WebP.": "Use a JPEG, PNG or WebP image.",
  "Cette image ne peut pas être décodée en toute sécurité.":
    "This image cannot be decoded safely.",
  "URL marchande manquante ou invalide : correction requise.":
    "Missing or invalid product URL: please correct it.",
  "Titre manquant.": "Missing title.",
  "Objectif à renseigner.": "Enter a funding goal.",
  "Devise à vérifier.": "Check the currency.",
  "Fichier invalide. Vérifiez le format de l’exemple CSV ou JSON.":
    "Invalid file. Check the CSV or JSON example format.",
  "L’import attend un tableau de 200 éléments maximum.":
    "Import expects an array of up to 200 items.",
  "Indiquez un lien de liste Amazon public ou partagé.":
    "Enter a public or shared Amazon list link.",
  "Indiquez le lien public de votre profil Throne.":
    "Enter your public Throne profile link.",
  "Import introuvable.": "Import not found.",
  "Trois tentatives atteintes.": "Three attempts reached.",
  "La source présente une protection anti-robot. Import natif bloqué ; utilisez votre export CSV/JSON.":
    "The source uses bot protection. Direct import is blocked; use your CSV or JSON export.",
  "Aucun produit exploitable dans le HTML public. Liste vide, privée ou chargée par JavaScript ; import natif non vérifié. Utilisez votre export CSV/JSON.":
    "No usable products found on the public page. The list may be empty, private or loaded with JavaScript. Direct import could not be verified; use your CSV or JSON export.",
  "Accès à la source impossible (réseau, DNS ou délai). Aucun contournement effectué.":
    "Could not access the source (network, DNS or timeout). No access restrictions were bypassed.",
  "Cet aperçu est déjà enregistré ou indisponible.":
    "This preview is already saved or unavailable.",
  "Sélection invalide.": "Invalid selection.",
  "Doublon : « {0} ». Choisissez explicitement de remplacer ou décochez cet élément.":
    "Duplicate: “{0}”. Choose to replace it or deselect this item.",
  "Cadeau introuvable.": "Gift not found.",
  "Les détails de ce cadeau doivent être complétés.":
    "This gift's details must be completed.",
  "Le financement de ce cadeau est terminé.":
    "Funding for this gift has closed.",
  "Ce cadeau utilise une ancienne devise. Les nouvelles contributions sont fermées.":
    "This gift uses a previous currency. New contributions are closed.",
  "Contribution introuvable.": "Contribution not found.",
  "Les frais dépassent le montant reçu.": "Fees exceed the amount received.",
  "La devise doit correspondre à celle de l’intention.":
    "The currency must match the contribution request.",
  "Cette transaction ou cette contribution est déjà confirmée. Utilisez une correction explicite.":
    "This transaction or contribution is already confirmed. Use an explicit correction.",
  "Identifiant d’événement déjà utilisé.": "Event ID already used.",
  "Événement déjà utilisé avec d’autres données.":
    "This event has already been used with different data.",
  "Versement introuvable.": "Payment not found.",
  "Une autre correction a eu lieu. Rechargez les montants avant de continuer.":
    "Another correction was made. Reload the amounts before continuing.",
  "Les montants cumulés dépassent le versement.":
    "Cumulative amounts exceed the payment.",
  "Un remboursement total doit retirer tout le financement de ce versement.":
    "A full refund must remove all funding from this payment.",
  "Les mots de passe ne correspondent pas.": "Passwords do not match.",
  "Code d’installation incorrect. Retrouvez-le dans les journaux de l’application.":
    "Incorrect setup code. Find it in the app logs.",
  "Montant invalide : utilisez au maximum deux décimales.":
    "Invalid amount: use no more than two decimal places.",
  "Montant hors limites (maximum 1 000 000).":
    "Amount out of range (maximum 1,000,000).",
  "URL invalide.": "Invalid URL.",
  "Utilisez un lien HTTP(S) sans identifiants.":
    "Use an HTTP(S) link without credentials.",
  "Importez d’abord cette image dans le stockage local.":
    "Import this image into local storage first.",
  "Lien PayPal.Me invalide : indiquez le nom ou https://paypal.me/nom.":
    "Invalid PayPal.Me link: enter the name or https://paypal.me/name.",
  "Le propriétaire n’a pas encore configuré PayPal.Me.":
    "The owner has not set up PayPal.Me yet.",
  "Page introuvable.": "Page not found.",
  "Action inconnue.": "Unknown action.",
  "Copiez l’adresse de cette page pour la partager.":
    "Copy this page’s address to share it.",
  "Afficher les envies": "Browse wishes",
  Participer: "Contribute",
  "1 envie": "1 wish",
  "Envies réalisées": "Fulfilled wishes",
  "{0} envies": "{0} wishes",
  "Objectif à financer": "Funding goal",
  "Réinitialiser les filtres": "Reset filters",
  "Position de la bannière": "Cover position",
  "Déplacez le cadrage vertical dans l’aperçu.":
    "Adjust the vertical crop in the preview.",
  "L’ambiance de votre Ouichlist": "Make your Ouichlist yours",
  "Couleur d’accent": "Accent color",
  Rose: "Pink",
  Acidulé: "Acid",
  Menthe: "Mint",
  "Image de fond": "Background image",
  "Disposition des cadeaux": "Gift layout",
  "Compacte · plus de cadeaux": "Compact · more gifts",
  "Aérée · grandes cartes": "Roomy · larger cards",
  "Restaurer le style Ouicheur": "Reset to Ouicheur style",
  "Aperçu du profil": "Profile preview",
  "En direct": "Live",
  "Les changements apparaissent ici avant de publier votre profil.":
    "See your changes here before publishing your profile.",
};
