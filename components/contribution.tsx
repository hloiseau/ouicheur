"use client";
import { useEffect, useState } from "react";
import { api, Field, Icon, Notice } from "./ui";
import { formatMoney, stateLabel } from "../lib/format";

export function ContributionForm({
  giftId,
  currency,
  closed,
  enabled,
}: {
  giftId: string;
  currency: string;
  closed: boolean;
  enabled: boolean;
}) {
  const [amount, setAmount] = useState("10");
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState("");
  const [publicName, setPublicName] = useState(false);
  const [publicMessage, setPublicMessage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (closed)
    return (
      <Notice>
        Les nouvelles contributions sont fermées pour ce cadeau. Merci pour
        toutes vos attentions !
      </Notice>
    );
  if (!enabled)
    return (
      <Notice>
        Le propriétaire prépare encore la réception des contributions. Revenez
        bientôt.
      </Notice>
    );
  return (
    <form
      className="contribution-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const result = await api<{ id: string }>("contributions", {
            gift_id: giftId,
            amount,
            nickname,
            message,
            public_name: publicName,
            public_message: publicMessage,
          });
          location.assign(`/contribution/${result.id}`);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Contribution impossible.");
          setBusy(false);
        }
      }}
    >
      <h2>Un petit coup de pouce ?</h2>
      <div className="amount-options">
        {[5, 10, 25, 50].map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={Number(amount) === value}
            className={Number(amount) === value ? "selected" : ""}
            onClick={() => setAmount(String(value))}
          >
            {formatMoney(value * 100, currency)}
          </button>
        ))}
      </div>
      <Field label={`Votre contribution (${currency})`}>
        <input
          required
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          maxLength={10}
        />
      </Field>
      <Field label="Votre petit nom (facultatif)">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={60}
          autoComplete="nickname"
          placeholder="Une personne attentionnée"
        />
      </Field>
      <Field label="Un mot qui fait sourire (facultatif)">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Pour tes prochaines aventures…"
        />
      </Field>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={publicName}
          onChange={(e) => setPublicName(e.target.checked)}
        />
        Afficher mon pseudonyme sur la wishlist après confirmation
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={publicMessage}
          onChange={(e) => setPublicMessage(e.target.checked)}
        />
        Afficher mon message sur la wishlist après confirmation
      </label>
      <p className="fine-print">
        Vos choix concernent uniquement cette wishlist. PayPal et l’autre partie
        peuvent voir les informations liées au paiement. Choisissez le type de
        transfert adapté à votre situation ; des frais peuvent s’appliquer.
      </p>
      {error && <Notice error>{error}</Notice>}
      <button className="button primary wide" disabled={busy}>
        {busy ? "Création de votre intention…" : "Continuer vers PayPal"}
        <Icon name="arrow" size={18} />
      </button>
      <p className="form-footnote">
        <Icon name="lock" size={13} />
        Sans compte visiteur · Confirmation par le propriétaire
      </p>
    </form>
  );
}
type Status = {
  id: string;
  gift_id: string;
  amount: number;
  currency: string;
  state: string;
  paypal_url: string | null;
  payment: null | {
    gross: number;
    fee: number | null;
    net: number | null;
    refunded: number;
    net_reversed: number;
    disputed: number;
    provenance: string;
  };
};
export function ContributionStatus({ id }: { id: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try {
      setStatus(await api<Status>(`contributions/${id}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, [id]);
  return (
    <section className="status-card">
      <span className="status-icon">
        <Icon name={status?.payment ? "check" : "heart"} size={38} />
      </span>
      <span className="eyebrow">Votre petite attention</span>
      <h1>
        {status?.payment
          ? "Votre versement est confirmé."
          : "Une envie se rapproche."}
      </h1>
      {error && <Notice error>{error}</Notice>}
      {!status && !error && (
        <p role="status">Chargement de votre contribution…</p>
      )}
      {status && (
        <>
          <p className="status-amount">
            {formatMoney(status.amount, status.currency)}
          </p>
          <p className="status-badge">
            {status.payment
              ? status.payment.provenance === "manual"
                ? "Confirmé par le propriétaire"
                : "Confirmé automatiquement par une source vérifiée"
              : stateLabel[status.state]}
          </p>
          {status.payment ? (
            <>
              <p>
                Net conservé pour ce cadeau :{" "}
                {status.payment.net === null
                  ? "frais encore inconnus, hors total net confirmé"
                  : formatMoney(
                      status.payment.net - status.payment.net_reversed,
                      status.currency,
                    )}
                .
              </p>
              {status.payment.refunded > 0 && (
                <p>
                  Remboursement enregistré :{" "}
                  {formatMoney(status.payment.refunded, status.currency)}.
                </p>
              )}
              {status.payment.disputed > 0 && (
                <Notice>
                  Un litige est en cours. Cela ne signifie pas qu’un
                  remboursement a eu lieu.
                </Notice>
              )}
            </>
          ) : (
            <>
              <p>
                L’intention a bien été enregistrée. Elle ne constitue pas une
                preuve de paiement.
              </p>
              {status.paypal_url && (
                <a
                  className="button primary wide"
                  href={status.paypal_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ouvrir PayPal pour envoyer{" "}
                  {formatMoney(status.amount, status.currency)} ↗
                </a>
              )}
              <p>
                Après l’envoi, revenez ici pour prévenir le propriétaire. Il
                vérifiera le versement dans son compte PayPal avant de
                confirmer.
              </p>
              {["intent", "expired"].includes(status.state) && (
                <button
                  className="button secondary wide"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api(`contributions/${id}/declare`, {});
                      await load();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  J’ai envoyé l’argent
                </button>
              )}
              {status.state === "expired" && (
                <Notice>
                  L’intention a expiré. Un versement déjà envoyé peut toujours
                  être rapproché par le propriétaire.
                </Notice>
              )}
              <p className="fine-print">
                Un clic sur ce bouton ne confirme aucun versement. N’envoyez pas
                une seconde fois l’argent si le statut reste en attente.
              </p>
            </>
          )}
          <details className="private-reference">
            <summary>Ma référence de suivi privée</summary>
            <code>{id}</code>
            <p>
              Conservez cette page. Vous pouvez communiquer cette référence au
              propriétaire pour l’aider à retrouver votre intention ; elle ne
              vaut pas preuve de paiement et n’est pas transmise automatiquement
              à PayPal.
            </p>
          </details>
          <button className="text-link" disabled={busy} onClick={load}>
            {busy ? "Vérification…" : "Actualiser le statut"}
          </button>
          <a className="text-link" href={`/cadeaux/${status.gift_id}`}>
            Retour au cadeau
          </a>
        </>
      )}
    </section>
  );
}
