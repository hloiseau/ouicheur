"use client";
import { useRef, useState } from "react";
import type { Gift } from "../lib/gifts";
import { useI18n } from "./language";
import { Field, Icon } from "./ui";

export function JapanSearch({
  title,
  url,
  description,
  target,
  currency,
  japan_search,
}: Pick<
  Gift,
  "title" | "url" | "description" | "target" | "currency" | "japan_search"
>) {
  const { t, locale, money } = useI18n();
  const field = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState("");
  if (!japan_search) return null;
  const prompt =
    locale === "fr"
      ? `Aide-moi à chiner cet objet sur des sites japonais et explique-moi comment l’acheter via Sendico. Réponds en français et recherche sur le Web.

Contexte essentiel : je suis en France et le pays de livraison est la France, sauf précision contraire de ma part. Je rencontre des blocages d’accès aux sites japonais, notamment Yahoo! JAPAN. Prévois un parcours utilisable depuis la France sans accès direct aux annonces japonaises. Ton accès éventuel à une page ne prouve pas que je peux l’ouvrir depuis la France ; indique ce que tu as réellement pu vérifier.

Objet : ${title}
Lien du produit de référence : ${url}
Description / préférences : ${description || "Non précisées."}
Objectif indiqué dans la Ouichlist : ${money(target, currency)} (${currency}). C’est un repère pour le coût total, pas un prix marchand vérifié ni un budget maximum confirmé.

1. Identifie la marque, le modèle, la référence et la variante exacte à partir des informations ci-dessus et des sources accessibles. Si le lien de référence est bloqué, continue avec le nom et la description ; demande seulement les précisions indispensables. Propose des mots-clés japonais, leurs traductions et des variantes de recherche.
2. Cherche en priorité sur Yahoo! JAPAN Flea Market (Yahoo!フリマ / PayPay Flea Market), puis Yahoo! JAPAN Auctions, Mercari Japon et Rakuma ; complète avec Mandarake ou Suruga-ya si pertinent. Privilégie les catalogues et moteurs intégrés à Sendico lorsqu’ils couvrent le site recherché. Un lien marchand bloqué ne suffit pas : fournis aussi une fiche Sendico réellement consultée, ou les mots-clés / l’identifiant à saisir et l’endroit exact où les coller. Vérifie ce que Sendico permet de consulter, séparément de ce qu’il permet de commander. Une page de présentation d’un magasin ou un formulaire de commande ne garantit pas un catalogue consultable. Privilégie la référence exacte et distingue clairement les alternatives.
3. Compare jusqu’à 5 annonces dans un tableau : lien d’origine / identifiant, chemin de consultation via Sendico, source réellement consultée, accessibilité depuis la France (vérifiée ou non vérifiée), possibilité d’achat via Sendico (confirmée ou à confirmer), titre, prix en JPY, équivalent estimé en ${currency} avec taux de change daté et sourcé, état, accessoires, fiabilité du vendeur et disponibilité. Distingue les annonces vérifiées des pistes non vérifiées issues d’extraits de moteurs de recherche ; un extrait indexé ne prouve ni le stock ni le prix actuel. Distingue achat immédiat et enchère. Signale les différences de variante, les contrefaçons suspectées, ジャンク (défectueux / pour pièces) et 動作未確認 (fonctionnement non vérifié). Ne présente pas une annonce vendue comme disponible.
4. Explique l’achat via Sendico (https://sendico.com) en vérifiant son aide officielle : recherche ou transmission du lien, confirmation de la prise en charge du site et de l’objet, compte et portefeuille, achat ou enchère, réception à l’entrepôt, regroupement éventuel et expédition vers la France. Pour un site non intégré, vérifie la procédure de commande manuelle (https://sendico.com/usage-guide/how-to-order-others). Pour Yahoo! Flea Market en particulier, vérifie la solution actuelle au lieu de supposer une intégration identique à Yahoo! Auctions. Si les annonces restent inaccessibles, donne des requêtes japonaises prêtes à copier avec l’endroit où les utiliser, puis un message en anglais prêt à envoyer au support Sendico pour demander s’il peut identifier l’objet, fournir les détails de l’annonce et confirmer l’achat avant tout paiement. Demande uniquement les informations que je peux fournir sans ouvrir le site bloqué ; ne fais pas dépendre la suite d’une capture ou d’un export HTML de cette page.
5. Décompose le coût total estimé livré en France : objet, livraison au Japon, commission Sendico, frais de paiement ou de change, options, livraison internationale, TVA / douane et frais du transporteur éventuels. Vérifie et source les tarifs actuels, sans inventer de frais fixes. Demande le budget maximal s’il manque et précise les coûts encore inconnus et les restrictions de transport pertinentes.

Date tes vérifications et cite tes sources. N’invente aucun lien, prix, stock ou résultat de recherche. Un accès bloqué ne signifie pas qu’aucune annonce n’existe. Si aucune annonce n’est vérifiable, présente un plan de recherche exploitable plutôt qu’un classement d’offres supposées. Termine par la prochaine action concrète réalisable depuis la France.`
      : `Help me find this item on Japanese websites and explain how to buy it through Sendico. Reply in English and search the web.

Essential context: I am in France and the delivery country is France unless I specify otherwise. I encounter access restrictions on Japanese websites, especially Yahoo! JAPAN. Provide a workflow usable from France without direct access to Japanese listings. Your ability to open a page does not prove that I can open it from France; state what you actually verified.

Item: ${title}
Reference product link: ${url}
Description / preferences: ${description || "Not specified."}
Ouichlist goal: ${money(target, currency)} (${currency}). This is a guide to the total cost, not a verified retail price or a confirmed maximum budget.

1. Identify the brand, model, reference and exact variant using the details above and accessible sources. If the reference link is blocked, continue with the name and description; ask only for essential missing details. Suggest Japanese search terms, translations and alternative queries.
2. Prioritize Yahoo! JAPAN Flea Market (Yahoo!フリマ / PayPay Flea Market), then Yahoo! JAPAN Auctions, Mercari Japan and Rakuma; include Mandarake or Suruga-ya where relevant. Prefer Sendico’s integrated catalogs and search where they cover the requested site. A blocked merchant link is not enough: also provide a Sendico listing you actually accessed, or keywords / an item ID and the exact place to paste them. Verify browsing support separately from purchasing support. A store introduction page or order form does not guarantee a browsable catalog. Prefer the exact reference and clearly distinguish alternatives.
3. Compare up to 5 listings in a table: original link / ID, viewing route through Sendico, source actually inspected, access from France (verified or unverified), purchase support through Sendico (confirmed or to confirm), title, JPY price, estimated equivalent in ${currency} with a dated and sourced exchange rate, condition, accessories, seller reliability and availability. Separate verified listings from unverified leads found in search snippets; indexed snippets prove neither current stock nor current prices. Distinguish buy-now listings from auctions. Flag variant differences, suspected counterfeits, ジャンク (faulty / for parts) and 動作未確認 (operation untested). Do not present sold listings as available.
4. Explain buying through Sendico (https://sendico.com), checking its official help: search or link submission, confirmation of support for the site and item, account and wallet, purchase or bidding, warehouse arrival, optional consolidation and shipping to France. For a non-integrated site, verify the manual order procedure (https://sendico.com/usage-guide/how-to-order-others). For Yahoo! Flea Market in particular, check the current route instead of assuming it shares Yahoo! Auctions’ integration. If listings remain inaccessible, give ready-to-paste Japanese queries and where to use them, then a ready-to-send English message asking Sendico support whether they can identify the item, provide listing details and confirm purchase support before any payment. Ask only for details I can supply without opening the blocked site; do not make progress depend on a screenshot or HTML export of that page.
5. Break down the estimated total delivered to France: item, domestic shipping in Japan, Sendico commission, payment or exchange fees, optional services, international shipping, VAT / customs and possible carrier fees. Verify and source current rates without inventing fixed fees. Ask for the maximum budget if missing and identify unknown costs and relevant shipping restrictions.

Date your checks and cite sources. Do not invent links, prices, stock or search results. Blocked access does not mean there are no listings. If none can be verified, provide an actionable search plan instead of ranking supposed offers. Finish with the next concrete action I can take from France.`;

  return (
    <details className="japan-search" lang={locale}>
      <summary>{t("Chiner au Japon avec ChatGPT")}</summary>
      <div className="stack">
        <p className="fine-print">
          {t(
            "Copiez ce prompt dans ChatGPT pour chiner depuis la France via Sendico, même si les sites japonais vous sont inaccessibles. Il demande des pistes vérifiables et une marche à suivre en cas de blocage.",
          )}
        </p>
        <Field label={t("Prompt de recherche au Japon")}>
          <textarea
            ref={field}
            readOnly
            rows={7}
            value={prompt}
            onFocus={(event) => event.currentTarget.select()}
          />
        </Field>
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(prompt);
                setStatus("Prompt et lien copiés ! Collez-les dans ChatGPT.");
              } catch {
                field.current?.focus();
                field.current?.select();
                setStatus(
                  "La copie automatique est indisponible. Copiez le texte sélectionné, puis collez-le dans ChatGPT.",
                );
              }
            }}
          >
            <Icon name="link" size={16} /> {t("Copier le prompt et le lien")}
          </button>
          <a
            className="button secondary"
            href="https://chatgpt.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("Ouvrir ChatGPT ↗")}
          </a>
        </div>
        <p className="fine-print" role="status">
          {t(status)}
        </p>
      </div>
    </details>
  );
}
