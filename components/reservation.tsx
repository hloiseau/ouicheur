"use client";
import { useEffect, useState } from "react";
import { api, Field, Notice } from "./ui";
import { useI18n } from "./language";

export function ReservationForm({
  giftId,
  available,
  closed,
}: {
  giftId: string;
  available: number;
  closed: boolean;
}) {
  const { t } = useI18n();
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel stack">
      <h2>{t("Offrir ce cadeau directement")}</h2>
      <p>
        {t(
          "Réservez pendant 14 jours, achetez chez le marchand puis confirmez l’achat avec votre lien personnel. Aucun paiement n’est enregistré par Ouicheur.",
        )}
      </p>
      <p>
        {available === 1
          ? t("1 exemplaire disponible")
          : t("{0} exemplaires disponibles", available)}
      </p>
      {closed && (
        <p>
          {t(
            "Réservation indisponible : envie fermée ou contributions existantes.",
          )}
        </p>
      )}
      {!closed && available > 0 && (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const r = await api<{ token: string }>("reservations", {
                gift_id: giftId,
                quantity,
              });
              window.location.assign(`/reservation/${r.token}`);
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          <Field label={t("Quantité")}>
            <input
              type="number"
              min={1}
              max={available}
              required
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </Field>
          <button className="button secondary" disabled={busy}>
            {t("Réserver ce cadeau")}
          </button>
        </form>
      )}
      {error && <Notice error>{error}</Notice>}
    </section>
  );
}
export function ReservationStatus({ token }: { token: string }) {
  const { t, date } = useI18n();
  const [data, setData] = useState<{
    quantity: number;
    state: string;
    expires_at: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const refresh = async () => {
    try {
      setData(await api(`reservations/${token}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
    setLink(window.location.href);
  }, [token]);
  return (
    <section className="panel stack reservation-status">
      <h1>{t("Votre réservation")}</h1>
      {!data && !error && <p role="status">{t("Chargement…")}</p>}
      {data && (
        <>
          <p>
            {data.state === "reserved"
              ? t(
                  "Conservez ce lien privé : il permet de confirmer ou d’annuler votre réservation sans compte.",
                )
              : t(
                  "Conservez ce lien privé pour retrouver le suivi de votre réservation.",
                )}
          </p>
          <input
            aria-label={t("Lien personnel")}
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
          />
          <button
            className="button secondary"
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
                setCopyFailed(false);
              } catch {
                setCopyFailed(true);
              }
            }}
          >
            {t("Copier le lien")}
          </button>
          {copied && <p role="status">{t("Lien copié.")}</p>}
          {copyFailed && (
            <p role="status">
              {t("Sélectionnez et copiez le lien ci-dessus.")}
            </p>
          )}
        </>
      )}
      {data && (
        <>
          <p>
            {t("Quantité")} : {data.quantity} · {t(data.state)}
          </p>
          {data.state === "reserved" && (
            <p>
              {t("Expiration")} : {date(data.expires_at)}
            </p>
          )}
          {data.state === "purchased" && (
            <Notice>
              {t(
                "L’achat est confirmé. Si vous devez revenir sur ce choix, contactez le propriétaire de la liste.",
              )}
            </Notice>
          )}
          {["cancelled", "expired"].includes(data.state) && (
            <Notice>{t("Cette réservation ne bloque plus le cadeau.")}</Notice>
          )}
          {data.state === "reserved" && (
            <div className="form-actions">
              {["purchased", "cancelled"].map((state) => (
                <button
                  key={state}
                  className="button secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await api(`reservations/${token}`, { state });
                      await refresh();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t(
                    state === "purchased"
                      ? "J’ai acheté le cadeau"
                      : "Annuler la réservation",
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {error && <Notice error>{error}</Notice>}
    </section>
  );
}
