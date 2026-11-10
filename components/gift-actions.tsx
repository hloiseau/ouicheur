"use client";

import { useEffect, useState } from "react";
import { useI18n } from "./language";
import { Modal } from "./modal";
import { useApi } from "./runtime";
import { ApiError, Notice } from "./ui";

type Removal = "delete" | "archive";

export function GiftActions({
  id,
  title,
  apiPrefix = "admin",
  onEdit,
  onRemoved,
}: {
  id: string;
  title: string;
  apiPrefix?: "admin" | "team";
  onEdit: () => void;
  onRemoved: () => void;
}) {
  const { t } = useI18n();
  const [review, setReview] = useState(false);
  return (
    <>
      <details className="gift-card-menu">
        <summary aria-label={t("Gérer l’envie {0}", title)}>
          {t("Gérer")}
        </summary>
        <div className="stack">
          <button
            type="button"
            className="text-link"
            onClick={(event) => {
              event.currentTarget.closest("details")!.open = false;
              onEdit();
            }}
          >
            {t("Modifier")}
          </button>
          <button
            type="button"
            className="text-link"
            onClick={(event) => {
              event.currentTarget.closest("details")!.open = false;
              setReview(true);
            }}
          >
            {t("Retirer de la liste")}
          </button>
        </div>
      </details>
      {review && (
        <GiftRemoval
          title={title}
          endpoint={`${apiPrefix}/gifts/${id}/remove`}
          onClose={() => setReview(false)}
          onRemoved={() => {
            setReview(false);
            onRemoved();
          }}
        />
      )}
    </>
  );
}

function GiftRemoval({
  title,
  endpoint,
  onClose,
  onRemoved,
}: {
  title: string;
  endpoint: string;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const { t } = useI18n();
  const api = useApi();
  const [action, setAction] = useState<Removal>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<{ action: Removal }>(endpoint, {}, { signal: controller.signal })
      .then((result) => setAction(result.action))
      .catch((error: Error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [api, endpoint, review]);
  return (
    <Modal
      title={t("Retirer {0} de la liste ?", title)}
      onClose={onClose}
      busy={busy}
    >
      <div className="stack">
        {action ? (
          <p>
            {t(
              action === "delete"
                ? "Cette envie et ses offres seront supprimées définitivement. Les alertes de prix seront arrêtées."
                : "Cette envie sera archivée. Ses offres et son historique d’achats, de réservations et de participations seront conservés. Les alertes de prix seront arrêtées.",
            )}
          </p>
        ) : !error ? (
          <p role="status">{t("Vérification des engagements…")}</p>
        ) : null}
        {error && <Notice error>{error}</Notice>}
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            {t("Annuler")}
          </button>
          {!action && error && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setError("");
                setReview((value) => value + 1);
              }}
            >
              {t("Recalculer le retrait")}
            </button>
          )}
          {action && (
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await api(endpoint, { confirm: action });
                  onRemoved();
                } catch (error) {
                  setError((error as Error).message);
                  if (error instanceof ApiError && error.status === 409)
                    setAction(undefined);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t(
                action === "delete"
                  ? "Supprimer définitivement"
                  : "Archiver cette envie",
              )}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
