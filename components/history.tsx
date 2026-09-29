"use client";
import { useEffect, useState } from "react";
import { api, Notice } from "./ui";
import { useI18n } from "./language";
import { Payments, type Contribution } from "./admin-payments";
type Row = {
  id: string;
  state?: string;
  title?: string;
  source?: string;
  created_at: string;
  quantity?: number;
  expires_at?: string;
  action?: string;
  detail?: string;
};
export function History({
  initialKind = "audit",
  fixed = false,
  onChange,
}: {
  initialKind?: string;
  fixed?: boolean;
  onChange?: () => Promise<void>;
}) {
  const { t, date } = useI18n();
  const [kind, setKind] = useState(initialKind);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ items: Row[]; total: number } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setError("");
    try {
      setData(await api(`admin/history?kind=${kind}&page=${page}`));
    } catch (e) {
      setData(null);
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    setData(null);
    void refresh();
  }, [kind, page]);
  return (
    <section className="stack">
      {!fixed && (
        <label>
          {t("Historique")}
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(0);
            }}
          >
            {[
              ["audit", "Journal"],
              ["contributions", "Contributions"],
              ["reservations", "Réservations"],
              ["imports", "Imports"],
            ].map(([v, label]) => (
              <option key={v} value={v}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <Notice error>{error}</Notice>}
      {kind === "contributions" && data ? (
        <Payments
          contributions={data.items as unknown as Contribution[]}
          refresh={async () => {
            await refresh();
            await onChange?.();
          }}
        />
      ) : (
        <div className="panel stack">
          {data?.items.map((r) => (
            <div key={r.id} className="history-row">
              <div>
                <strong>{r.title || r.source || r.action}</strong>
                <p>
                  {date(r.created_at)}
                  {r.state ? ` · ${t(r.state)}` : ""}
                  {r.quantity ? ` · ${t("Quantité")} : ${r.quantity}` : ""}
                </p>
                {r.detail && (
                  <details>
                    <summary>{t("Détails")}</summary>
                    <pre className="wrap-code">
                      {JSON.stringify(JSON.parse(r.detail), null, 2)}
                    </pre>
                  </details>
                )}
              </div>
              {kind === "reservations" &&
                ["reserved", "purchased"].includes(r.state || "") && (
                  <button
                    disabled={busy}
                    className="button secondary"
                    onClick={async () => {
                      if (
                        !window.confirm(
                          t(
                            "Annuler cette réservation et libérer sa quantité ?",
                          ),
                        )
                      )
                        return;
                      setBusy(true);
                      try {
                        await api("admin/reservations/cancel", {
                          id: r.id,
                          confirm: true,
                        });
                        await refresh();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {t("Annuler la réservation")}
                  </button>
                )}
            </div>
          ))}
        </div>
      )}
      {data && (
        <div className="form-actions">
          <button
            className="button secondary"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            {t("Précédent")}
          </button>
          <span>
            {t("Page {0}", page + 1)} · {data?.total || 0}
          </span>
          <button
            className="button secondary"
            disabled={!data || (page + 1) * 50 >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("Suivant")}
          </button>
        </div>
      )}
    </section>
  );
}
