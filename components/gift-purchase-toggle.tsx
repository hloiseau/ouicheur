"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "./language";
import { api, Notice } from "./ui";

export function GiftPurchaseToggle({
  id,
  title,
  purchased,
  onSaved,
  details = false,
}: {
  id: string;
  title: string;
  purchased: boolean;
  onSaved?: () => void;
  details?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [checked, setChecked] = useState(purchased);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setChecked(purchased), [purchased]);
  return (
    <div className="gift-purchase-control">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={t("Cadeau acheté : {0}", title)}
        className="purchase-switch"
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            const result = await api<{ purchased: boolean }>(
              `admin/gifts/${id}/purchased`,
              { purchased: !checked },
            );
            setChecked(result.purchased);
            if (onSaved) onSaved();
            else router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <span>{t("Cadeau acheté")}</span>
        <span className="purchase-switch-track" aria-hidden="true">
          <span />
        </span>
      </button>
      {details && (
        <p className="fine-print">
          {t(
            "Une fois acheté, ce cadeau n’accepte plus de nouvelles participations ni réservations. Vous pouvez annuler ce choix à tout moment.",
          )}
        </p>
      )}
      {error && <Notice error>{error}</Notice>}
    </div>
  );
}
