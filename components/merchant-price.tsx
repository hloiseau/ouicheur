"use client";

import type { OfferObservation } from "../lib/offer-observations.ts";
import { useI18n } from "./language";

export function MerchantPrice({
  observation,
}: {
  observation?: OfferObservation;
}) {
  const { t, money, date } = useI18n();
  if (!observation) return null;
  const {
    merchant,
    price,
    currency,
    shipping,
    availability,
    checkedAt,
    priceCheckedAt,
    verified,
    stale,
  } = observation;
  return (
    <div className="merchant-quote fine-print">
      <p>
        <strong>
          {price === null
            ? t("Prix marchand non vérifiable chez {0}", merchant)
            : t(
                verified && !stale
                  ? "Prix relevé chez {0} : {1}"
                  : "Dernier prix vérifié chez {0} : {1}",
                merchant,
                money(price, currency),
              )}
        </strong>
      </p>
      <p>
        {t("Relevé du {0}", date(priceCheckedAt ?? checkedAt, true))}
        {stale ? ` · ${t("Relevé ancien")}` : ""}
        {` · ${t(availability)}`}
        {shipping !== null
          ? ` · ${t("Livraison indiquée : {0}", money(shipping, currency))}`
          : ""}
      </p>
      {!verified && priceCheckedAt && (
        <p>
          {t("Dernière tentative non vérifiable le {0}", date(checkedAt, true))}
        </p>
      )}
    </div>
  );
}
