"use client";
import { useI18n } from "./language";

import { useState } from "react";
import { decimal } from "../lib/format";
import {
  contributionLabel,
  contributionMethods,
  type ContributionMethod,
} from "../lib/contribution-labels";
import { api, Field, Notice } from "./ui";

export type Contribution = {
  method: ContributionMethod;
  paypal_recipient: string;
  id: string;
  gift_id: string;
  gift_title: string;
  amount: number;
  currency: string;
  nickname: string;
  message: string;
  state: string;
  approved: number;
  created_at: string;
  payment_id: string | null;
  transaction_ref: string | null;
  gross: number | null;
  fee: number | null;
  net: number | null;
  refunded: number | null;
  net_reversed: number | null;
  disputed: number | null;
  revision: number | null;
  provenance: string | null;
};
function CorrectionForm({
  contribution: c,
  onDone,
}: {
  contribution: Contribution;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [eventId] = useState(() => crypto.randomUUID());
  return (
    <form
      className="stack payment-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        const common = {
          event_id: eventId,
          gross: f.get("gross"),
          fee: f.get("fee"),
          reason: f.get("reason"),
        };
        try {
          await api("admin/correct", {
            ...common,
            payment_id: c.payment_id,
            revision: c.revision,
            refunded: f.get("refunded"),
            net_reversed: f.get("net_reversed"),
            disputed: f.get("disputed") === "on",
          });
          onDone();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>{t("Correction manuelle du versement")}</h3>
      <Notice>
        {t(
          "Indiquez les nouveaux montants cumulés, pas une différence. Une correction conserve l’historique et sa justification.",
        )}
      </Notice>
      <div className="form-grid">
        <Field label={t("Brut reçu ({0})", c.currency)}>
          <input
            name="gross"
            required
            inputMode="decimal"
            defaultValue={decimal(c.gross ?? c.amount)}
          />
        </Field>
        <Field
          label={t("Frais connus ({0})", c.currency)}
          hint={t(
            "Vide = inconnus, hors financement net. Indiquez 0 si l’absence de frais est vérifiée.",
          )}
        >
          <input name="fee" inputMode="decimal" defaultValue={decimal(c.fee)} />
        </Field>
      </div>
      <div className="form-grid">
        <Field label={t("Total brut remboursé au contributeur")}>
          <input
            required
            name="refunded"
            inputMode="decimal"
            defaultValue={decimal(c.refunded || 0)}
          />
        </Field>
        <Field
          label={t("Total net à retirer du financement")}
          hint={t(
            "Retrait constaté, y compris annulation confirmée. Ne devinez pas le remboursement des frais.",
          )}
        >
          <input
            required
            name="net_reversed"
            inputMode="decimal"
            defaultValue={decimal(c.net_reversed || 0)}
          />
        </Field>
      </div>
      <label className="checkbox">
        <input type="checkbox" name="disputed" defaultChecked={!!c.disputed} />
        {t("Litige en cours (ne retire pas de fonds à lui seul)")}{" "}
      </label>
      <p className="fine-print">
        {t(
          "Pour annuler entièrement le financement, retirez tout le net initial. Si le brut a été intégralement remboursé, le net restant doit être nul.",
        )}{" "}
      </p>
      <Field label={t("Justification privée de la vérification ou correction")}>
        <textarea
          name="reason"
          required
          minLength={5}
          maxLength={1000}
          rows={3}
          placeholder={t("Éléments vérifiés et raison de l’opération…")}
        />
      </Field>
      {error && <Notice error>{error}</Notice>}
      <button className="button primary" disabled={busy}>
        {busy ? t("Enregistrement…") : t("Enregistrer la correction manuelle")}
      </button>
    </form>
  );
}
export function Payments({
  contributions,
  refresh,
}: {
  contributions: Contribution[];
  refresh: () => Promise<void>;
}) {
  const { t, money, date } = useI18n();
  const [filter, setFilter] = useState("pending");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [success, setSuccess] = useState("");
  const review = async (id: string, approved: boolean) => {
    if (busy) return;
    setBusy(id);
    setError("");
    setSuccess("");
    try {
      await api("admin/contributions/review", { id, approved });
      setSuccess(
        approved ? t("Participation validée.") : t("Participation refusée."),
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const rows = contributions.filter(
    (c) =>
      filter === "all" ||
      (filter === "confirmed"
        ? !!c.payment_id || !!c.approved
        : filter === "promised"
          ? !c.payment_id &&
            !c.approved &&
            c.method === "pledge" &&
            c.state === "intent"
          : filter === "rejected"
            ? !c.payment_id && c.state === "rejected"
            : !c.payment_id &&
              !c.approved &&
              (["declared", "detected"].includes(c.state) ||
                (c.method === "pledge" && c.state === "intent"))),
  );
  return (
    <section>
      <div className="panel-heading">
        <div>
          <h2>{t("Les attentions reçues")}</h2>
          <p className="muted">
            {t(
              "Confirmez uniquement les sommes reçues. Les promesses restent à venir tant qu’aucun versement n’est déclaré ou confirmé.",
            )}{" "}
          </p>
        </div>
        <label className="field">
          {t("Afficher")}{" "}
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="pending">{t("À suivre")}</option>
            <option value="promised">{t("Promesses")}</option>
            <option value="confirmed">{t("Validées")}</option>
            <option value="rejected">{t("Refusées")}</option>
            <option value="all">{t("Toutes les intentions")}</option>
          </select>
        </label>
      </div>
      {error && <Notice error>{error}</Notice>}
      {success && <Notice>{success}</Notice>}
      {!rows.length && (
        <div className="empty-state compact">
          <h3>{t("Tout est à jour.")}</h3>
          <p>{t("Aucune contribution dans cette vue.")}</p>
        </div>
      )}
      <div className="stack">
        {rows.map((c) => (
          <article className="panel contribution-row" key={c.id}>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">
                  {c.nickname || t("Pseudonyme non renseigné")}
                </span>
                <h3>{c.gift_title}</h3>
                <p>
                  {money(c.amount, c.currency)} {t("annoncés ·")}{" "}
                  {date(c.created_at)}
                </p>
                <p className="fine-print">{t(contributionMethods[c.method])}</p>
              </div>
              <span
                className={`badge ${c.payment_id || c.approved ? "green" : "amber"}`}
              >
                {c.payment_id || c.approved
                  ? t("Validée")
                  : t(contributionLabel(c.method, c.state))}
              </span>
            </div>
            {c.message && (
              <blockquote className="private-message">
                {t("Message :")} {c.message}
              </blockquote>
            )}
            <details>
              <summary>{t("Références privées")}</summary>
              <code className="wrap-code">
                {t("Intention :")} {c.id}
              </code>
              {c.method === "paypal" && (
                <p>
                  {t("Destinataire prévu : PayPal.Me/")}
                  {c.paypal_recipient}
                </p>
              )}
              {c.transaction_ref && (
                <p>
                  {t("Transaction :")} {c.transaction_ref}
                </p>
              )}
            </details>
            {c.payment_id && (
              <p>
                {t("Brut :")} {money(c.gross!, c.currency)} {t("· Frais :")}{" "}
                {c.fee === null ? t("inconnus") : money(c.fee, c.currency)}{" "}
                {t("· Net restant :")}{" "}
                {c.net === null
                  ? t("non établi")
                  : money(c.net - (c.net_reversed || 0), c.currency)}
                {c.disputed ? t(" · Litige en cours") : ""}
              </p>
            )}
            {c.payment_id ? (
              <div className="form-actions">
                <button
                  className="button secondary"
                  onClick={() => setSelected(selected === c.id ? "" : c.id)}
                >
                  {selected === c.id ? t("Fermer") : t("Corriger / rembourser")}
                </button>
              </div>
            ) : (
              <div className="form-actions">
                {!c.approved && (
                  <button
                    className="button primary"
                    disabled={!!busy}
                    onClick={() => void review(c.id, true)}
                  >
                    {c.method === "paypal"
                      ? t("Valider")
                      : t("Confirmer la réception")}
                  </button>
                )}
                {c.state !== "rejected" && (
                  <button
                    className="button secondary"
                    disabled={!!busy}
                    onClick={() => void review(c.id, false)}
                  >
                    {t("Refuser")}
                  </button>
                )}
              </div>
            )}
            {c.payment_id && selected === c.id && (
              <CorrectionForm
                key={`${c.id}-${c.revision}`}
                contribution={c}
                onDone={() => {
                  setSelected("");
                  refresh();
                }}
              />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
