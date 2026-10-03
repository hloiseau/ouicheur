"use client";
import { useState } from "react";
import QRCode from "qrcode";
import { useI18n } from "./language";
import { Notice } from "./ui";
export function PrintControls({
  listId,
  publicList,
}: {
  listId: string;
  publicList: boolean;
}) {
  const { t } = useI18n();
  const [qr, setQr] = useState(""),
    [error, setError] = useState("");
  return (
    <>
      <div className="print-controls form-actions">
        <button className="button primary" onClick={() => window.print()}>
          {t("Imprimer ou enregistrer en PDF")}
        </button>
        {publicList && (
          <button
            className="button secondary"
            onClick={async () => {
              try {
                setQr(
                  qr
                    ? ""
                    : await QRCode.toDataURL(
                        `${location.origin}/lists/${listId}`,
                        { width: 160, margin: 1 },
                      ),
                );
              } catch {
                setError(t("Impossible de créer le QR code."));
              }
            }}
          >
            {qr ? t("Retirer le QR code") : t("Ajouter un QR code")}
          </button>
        )}
        <a href={`/lists/${listId}`}>{t("Retour à la liste")}</a>
        {error && <Notice error>{error}</Notice>}
      </div>
      {qr && (
        <img
          src={qr}
          className="print-qr"
          width={160}
          height={160}
          alt={t("QR code du lien de partage")}
        />
      )}
    </>
  );
}
