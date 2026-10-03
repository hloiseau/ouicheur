"use client";
import { useState } from "react";
import { api, Notice } from "./ui";
import { useI18n } from "./language";

export function SurpriseNotice({ revealed = false }: { revealed?: boolean }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="panel stack" aria-label={t("Mode surprise")}>
      <strong>
        {revealed
          ? t("Surprises révélées pour cette session")
          : t("Surprise préservée")}
      </strong>
      <p>
        {revealed
          ? t(
              "Les réservations et achats sont visibles dans cette session. Les autres sessions restent protégées.",
            )
          : t(
              "Les réservations et les achats des listes protégées restent masqués dans votre espace et son aperçu public. Les contributions financières restent visibles et exactes.",
            )}
      </p>
      <p className="fine-print">
        {t(
          "La modification des envies protégées demande une révélation volontaire. Une visite anonyme à une liste publique ou l’accès au serveur peut contourner ce mode de confort.",
        )}
      </p>
      <button
        className="button secondary"
        disabled={busy}
        onClick={async () => {
          if (
            !revealed &&
            !window.confirm(
              t(
                "Révéler les réservations et achats de toutes les listes protégées pour cette session ?",
              ),
            )
          )
            return;
          setBusy(true);
          setError("");
          try {
            await api("account/surprises", {
              reveal: !revealed,
              confirm: true,
            });
            // Drop previously rendered pages and prefetched recipient data too.
            location.reload();
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {revealed ? t("Masquer à nouveau") : t("Révéler pour cette session")}
      </button>
      {error && <Notice error>{error}</Notice>}
    </section>
  );
}
