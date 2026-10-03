"use client";
import { useState } from "react";
import { api, Notice } from "./ui";
import { useI18n } from "./language";
type Check = {
  id: string;
  price: number | null;
  currency: string;
  availability: string;
  checked_at: string;
  state: string;
  quantity: number;
  previous_target: number;
};
export function ProductRefresh({
  id,
  currency,
  onSaved,
  onChecked,
  allowApply = true,
}: {
  id: string;
  currency: string;
  onSaved: () => void;
  onChecked?: () => void;
  allowApply?: boolean;
}) {
  const { t, money, date } = useI18n();
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="refresh-product stack">
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setCheck(await api("admin/products/refresh", { id }));
            onChecked?.();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("Actualiser le prix et la disponibilité")}
      </button>
      {check && (
        <>
          <p>
            {date(check.checked_at)} · {t(check.availability)}
          </p>
          {check.state === "failed" ? (
            <Notice>
              {t(
                "Le marchand ne permet pas l’actualisation. Vous pouvez modifier les champs manuellement.",
              )}
            </Notice>
          ) : (
            <>
              <p>
                {t(
                  "Objectif actuel : {0}",
                  money(check.previous_target, currency),
                )}
              </p>
              <p>
                {t(
                  "Prix unitaire relevé : {0}",
                  check.price
                    ? money(check.price, check.currency || currency)
                    : "—",
                )}
              </p>
              {check.price && check.currency === currency && allowApply ? (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api("admin/products/apply", { id: check.id });
                      onSaved();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t(
                    "Confirmer le nouvel objectif : {0}",
                    money(check.price * check.quantity, currency),
                  )}
                </button>
              ) : (
                <p>
                  {t(
                    "Aucun objectif n’est modifié automatiquement. Une devise différente nécessite une saisie manuelle.",
                  )}
                </p>
              )}
            </>
          )}
        </>
      )}
      {error && <Notice error>{error}</Notice>}
    </section>
  );
}
