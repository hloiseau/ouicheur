"use client";
import { useState } from "react";
import { decimal, formatMoney, stateLabel } from "../lib/format";
import { api, Field, Notice } from "./ui";

export type Contribution = {
  paypal_recipient: string;
  id: string;
  gift_id: string;
  gift_title: string;
  amount: number;
  currency: string;
  nickname: string;
  message: string;
  state: string;
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
function PaymentForm({
  contribution: c,
  onDone,
}: {
  contribution: Contribution;
  onDone: () => void;
}) {
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
          if (c.payment_id)
            await api("admin/correct", {
              ...common,
              payment_id: c.payment_id,
              revision: c.revision,
              refunded: f.get("refunded"),
              net_reversed: f.get("net_reversed"),
              disputed: f.get("disputed") === "on",
            });
          else
            await api("admin/confirm", {
              ...common,
              contribution_id: c.id,
              transaction_ref: f.get("transaction_ref"),
              currency: c.currency,
              recipient_checked: f.get("recipient_checked") === "on",
              association_checked: f.get("association_checked") === "on",
              received_checked: f.get("received_checked") === "on",
            });
          onDone();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>
        {c.payment_id
          ? "Correction manuelle du versement"
          : "Confirmer après vérification dans PayPal"}
      </h3>
      <Notice>
        {c.payment_id
          ? "Indiquez les nouveaux montants cumulés, pas une différence. Une correction conserve l’historique et sa justification."
          : "Vérifiez le destinataire, l’état encaissé, la devise et l’association à cette intention. Le montant et l’heure seuls ne prouvent pas le rapprochement."}
      </Notice>
      {!c.payment_id && (
        <Field label="Référence réelle de transaction PayPal (privée)">
          <input
            name="transaction_ref"
            required
            minLength={3}
            maxLength={100}
          />
        </Field>
      )}
      <div className="form-grid">
        <Field label={`Brut reçu (${c.currency})`}>
          <input
            name="gross"
            required
            inputMode="decimal"
            defaultValue={decimal(c.gross ?? c.amount)}
          />
        </Field>
        <Field
          label={`Frais connus (${c.currency})`}
          hint="Vide = inconnus, hors financement net. Indiquez 0 si l’absence de frais est vérifiée."
        >
          <input name="fee" inputMode="decimal" defaultValue={decimal(c.fee)} />
        </Field>
      </div>
      {c.payment_id ? (
        <>
          <div className="form-grid">
            <Field label="Total brut remboursé au contributeur">
              <input
                required
                name="refunded"
                inputMode="decimal"
                defaultValue={decimal(c.refunded || 0)}
              />
            </Field>
            <Field
              label="Total net à retirer du financement"
              hint="Retrait constaté, y compris annulation confirmée. Ne devinez pas le remboursement des frais."
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
            <input
              type="checkbox"
              name="disputed"
              defaultChecked={!!c.disputed}
            />
            Litige en cours (ne retire pas de fonds à lui seul)
          </label>
          <p className="fine-print">
            Pour annuler entièrement le financement, retirez tout le net
            initial. Si le brut a été intégralement remboursé, le net restant
            doit être nul.
          </p>
        </>
      ) : (
        <>
          <label className="checkbox">
            <input required type="checkbox" name="recipient_checked" />
            J’ai vérifié que mon compte a reçu ce versement dans la bonne
            devise.
          </label>
          <label className="checkbox">
            <input required type="checkbox" name="received_checked" />
            Le paiement est effectivement encaissé, et non en attente.
          </label>
          <label className="checkbox">
            <input required type="checkbox" name="association_checked" />
            J’ai vérifié l’association certaine avec cette intention et ce
            cadeau.
          </label>
        </>
      )}
      <Field label="Justification privée de la vérification ou correction">
        <textarea
          name="reason"
          required
          minLength={5}
          maxLength={1000}
          rows={3}
          placeholder="Éléments vérifiés et raison de l’opération…"
        />
      </Field>
      {error && <Notice error>{error}</Notice>}
      <button className="button primary" disabled={busy}>
        {busy
          ? "Enregistrement…"
          : c.payment_id
            ? "Enregistrer la correction manuelle"
            : "Confirmer manuellement ce versement"}
      </button>
    </form>
  );
}
export function Payments({
  contributions,
  refresh,
}: {
  contributions: Contribution[];
  refresh: () => void;
}) {
  const [filter, setFilter] = useState("pending");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const rows = contributions.filter(
    (c) =>
      filter === "all" ||
      (filter === "confirmed"
        ? !!c.payment_id
        : !c.payment_id && ["declared", "detected"].includes(c.state)),
  );
  return (
    <section>
      <div className="panel-heading">
        <div>
          <h2>Les attentions reçues</h2>
          <p className="muted">
            Un registre précis, avec confirmation manuelle explicite.
          </p>
        </div>
        <label className="field">
          Afficher
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="pending">À rapprocher</option>
            <option value="confirmed">Confirmées</option>
            <option value="all">Toutes les intentions</option>
          </select>
        </label>
      </div>
      <Notice>
        Une intention annoncée ou détectée n’augmente jamais la cagnotte. Les
        références PayPal et les messages privés restent dans cet espace.
      </Notice>
      {error && <Notice error>{error}</Notice>}
      {!rows.length && (
        <div className="empty-state compact">
          <h3>Tout est à jour.</h3>
          <p>Aucune contribution dans cette vue.</p>
        </div>
      )}
      <div className="stack">
        {rows.map((c) => (
          <article className="panel contribution-row" key={c.id}>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">
                  {c.nickname || "Pseudonyme non renseigné"}
                </span>
                <h3>{c.gift_title}</h3>
                <p>
                  {formatMoney(c.amount, c.currency)} annoncés ·{" "}
                  {new Date(c.created_at).toLocaleString("fr-FR")}
                </p>
              </div>
              <span className={`badge ${c.payment_id ? "green" : "amber"}`}>
                {c.payment_id
                  ? c.provenance === "manual"
                    ? "Confirmé par le propriétaire"
                    : "Confirmé automatiquement par une source vérifiée"
                  : stateLabel[c.state]}
              </span>
            </div>
            {c.message && (
              <blockquote className="private-message">
                Message : {c.message}
              </blockquote>
            )}
            <details>
              <summary>Références privées</summary>
              <code className="wrap-code">Intention : {c.id}</code>
              <p>Destinataire prévu : PayPal.Me/{c.paypal_recipient}</p>
              {c.transaction_ref && <p>Transaction : {c.transaction_ref}</p>}
            </details>
            {c.payment_id && (
              <p>
                Brut : {formatMoney(c.gross!, c.currency)} · Frais :{" "}
                {c.fee === null ? "inconnus" : formatMoney(c.fee, c.currency)} ·
                Net restant :{" "}
                {c.net === null
                  ? "non établi"
                  : formatMoney(c.net - (c.net_reversed || 0), c.currency)}
                {c.disputed ? " · Litige en cours" : ""}
              </p>
            )}
            <div className="form-actions">
              <button
                className="button secondary"
                onClick={() => setSelected(selected === c.id ? "" : c.id)}
              >
                {selected === c.id
                  ? "Fermer"
                  : c.payment_id
                    ? "Corriger / rembourser"
                    : "Vérifier le versement"}
              </button>
            </div>
            {!c.payment_id && (
              <form
                className="state-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  setError("");
                  try {
                    await api("admin/contribution-state", {
                      id: c.id,
                      state: data.get("state"),
                      reason: data.get("reason"),
                    });
                    refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <details>
                  <summary>Mettre en attente ou refuser</summary>
                  <div className="form-grid">
                    <Field label="Statut">
                      <select name="state">
                        <option value="detected">Détectée, à vérifier</option>
                        <option value="rejected">Refusée</option>
                        <option value="declared">Annoncée, à vérifier</option>
                      </select>
                    </Field>
                    <Field label="Justification">
                      <input
                        name="reason"
                        required
                        minLength={5}
                        maxLength={1000}
                      />
                    </Field>
                  </div>
                  <button className="button secondary">
                    Enregistrer le statut
                  </button>
                </details>
              </form>
            )}
            {selected === c.id && (
              <PaymentForm
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
