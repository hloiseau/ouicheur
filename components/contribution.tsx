"use client";
import { useAppHref } from "./runtime";
import { useI18n } from "./language";

import { useEffect, useId, useState } from "react";
import { useApi, Field, Icon, Notice } from "./ui";
import {
  contributionLabel,
  type ContributionMethod,
} from "../lib/contribution-labels";

export function ContributionForm({
  giftId,
  currency,
  remaining,
  closed,
  paypalEnabled,
  strict = false,
}: {
  giftId: string;
  currency: string;
  remaining: number;
  closed: boolean;
  paypalEnabled: boolean;
  strict?: boolean;
}) {
  const { t, money } = useI18n();
  const api = useApi(),
    href = useAppHref();
  const amountHelpId = useId();
  const [amount, setAmount] = useState(String(Math.min(1000, remaining) / 100));
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState("");
  const [publicName, setPublicName] = useState(false);
  const [publicMessage, setPublicMessage] = useState(false);
  const [method, setMethod] = useState<ContributionMethod>(
    paypalEnabled ? "paypal" : "pledge",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const numericAmount = Number(amount.replace(",", "."));
  const overLimit = numericAmount > remaining / 100;
  const suggestions = [500, 1000, 2500, 5000].filter(
    (value) => value < remaining,
  );
  if (closed || remaining <= 0)
    return (
      <Notice>
        {t(
          "Les nouvelles contributions sont fermées pour ce cadeau. Merci pour toutes vos attentions !",
        )}{" "}
      </Notice>
    );
  return (
    <form
      className="contribution-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || overLimit) return;
        setBusy(true);
        setError("");
        // Open during the click so browsers allow the PayPal tab.
        const paypalTab =
          method === "paypal" ? window.open("about:blank", "_blank") : null;
        if (paypalTab) paypalTab.opener = null;
        try {
          const result = await api<{ id: string; paypal_url: string | null }>(
            "contributions",
            {
              gift_id: giftId,
              amount,
              method,
              nickname,
              message,
              public_name: publicName,
              public_message: publicMessage,
            },
          );
          if (paypalTab && !paypalTab.closed && result.paypal_url)
            paypalTab.location.replace(result.paypal_url);
          location.assign(href(`/contribution/${result.id}`));
        } catch (e) {
          paypalTab?.close();
          setError(
            e instanceof Error ? e.message : t("Contribution impossible."),
          );
          setBusy(false);
        }
      }}
    >
      <h2>{t("Un petit coup de pouce ?")}</h2>
      <Field label={t("Comment souhaitez-vous participer ?")}>
        <select
          value={method}
          disabled={busy}
          onChange={(e) => setMethod(e.target.value as ContributionMethod)}
        >
          {paypalEnabled && (
            <option value="paypal">{t("Envoyer avec PayPal")}</option>
          )}
          <option value="bank_transfer">{t("J’ai fait un virement")}</option>
          <option value="pledge">{t("Je participerai plus tard")}</option>
        </select>
      </Field>
      {method === "bank_transfer" && (
        <p className="fine-print">
          {t(
            "Déclarez uniquement un virement déjà effectué. Les coordonnées bancaires sont à demander directement au bénéficiaire ; Ouicheur n’effectue aucun virement.",
          )}
        </p>
      )}
      {method === "pledge" && (
        <p className="fine-print">
          {t(
            "Annoncez le montant que vous prévoyez de donner. Votre promesse reste séparée des versements et ne remplit pas l’objectif.",
          )}
        </p>
      )}
      <div
        className="amount-options"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, suggestions.length)}, 1fr)`,
        }}
      >
        {suggestions.map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={numericAmount === value / 100}
            className={numericAmount === value / 100 ? "selected" : ""}
            onClick={() => setAmount(String(value / 100))}
          >
            {money(value, currency)}
          </button>
        ))}
        <button
          type="button"
          style={{ gridColumn: "1 / -1" }}
          aria-pressed={numericAmount === remaining / 100}
          className={numericAmount === remaining / 100 ? "selected" : ""}
          onClick={() => setAmount(String(remaining / 100))}
        >
          {t("Financer le reste ({0})", money(remaining, currency))}
        </button>
      </div>
      <Field label={t("Votre contribution ({0})", currency)}>
        <input
          required
          inputMode="decimal"
          aria-describedby={amountHelpId}
          aria-invalid={overLimit}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          maxLength={10}
        />
      </Field>
      <p className="fine-print" id={amountHelpId}>
        {t("Maximum : {0}", money(remaining, currency))}
      </p>
      {overLimit && (
        <Notice error>
          {t(
            "La contribution ne peut pas dépasser le montant restant à financer.",
          )}
        </Notice>
      )}
      <Field label={t("Votre petit nom (facultatif)")}>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={60}
          autoComplete="nickname"
          placeholder={t("Une personne attentionnée")}
        />
      </Field>
      <Field label={t("Un mot qui fait sourire (facultatif)")}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder={t("Pour tes prochaines aventures…")}
        />
      </Field>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={publicName}
          onChange={(e) => setPublicName(e.target.checked)}
        />
        {t("Afficher mon pseudonyme sur la Ouichlist après confirmation")}{" "}
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={publicMessage}
          onChange={(e) => setPublicMessage(e.target.checked)}
        />
        {t("Afficher mon message sur la Ouichlist après confirmation")}{" "}
      </label>
      {method === "paypal" && (
        <p className="fine-print">
          {t(
            "Vos choix concernent uniquement cette Ouichlist. PayPal et l’autre partie peuvent voir les informations liées au paiement. Choisissez le type de transfert adapté à votre situation ; des frais peuvent s’appliquer.",
          )}{" "}
        </p>
      )}
      {error && <Notice error>{error}</Notice>}
      <button className="button primary wide" disabled={busy || overLimit}>
        {busy
          ? t("Enregistrement…")
          : method === "paypal"
            ? t("Continuer vers PayPal")
            : method === "bank_transfer"
              ? t("Déclarer mon virement")
              : t("Enregistrer ma promesse")}
        <Icon name="arrow" size={18} />
      </button>
      <p className="form-footnote">
        <Icon name="lock" size={13} />
        {method === "pledge"
          ? t("Sans compte · Aucun paiement à cette étape")
          : strict
            ? t("Sans compte · Participation soumise à validation")
            : t("Sans compte · Participation comptée dès l’envoi déclaré")}{" "}
      </p>
    </form>
  );
}
type Status = {
  strict_contributions: number;
  id: string;
  gift_id: string;
  amount: number;
  currency: string;
  state: string;
  approved: number;
  method: ContributionMethod;
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
  const { t, money } = useI18n();
  const api = useApi(),
    href = useAppHref();
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
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [id]);
  const counted =
    !!status?.payment ||
    !!status?.approved ||
    (!status?.strict_contributions && status?.state === "declared");
  return (
    <section className="status-card">
      <span className="status-icon">
        <Icon name={counted ? "check" : "heart"} size={38} />
      </span>
      <span className="eyebrow">{t("Votre petite attention")}</span>
      <h1>
        {error && !status
          ? t("Le suivi est indisponible.")
          : status?.payment || status?.approved
            ? t("Votre versement est confirmé.")
            : counted
              ? t("Merci pour votre participation !")
              : t("Une envie se rapproche.")}
      </h1>
      {error && <Notice error>{error}</Notice>}
      {!status && !error && (
        <p role="status">{t("Chargement de votre contribution…")}</p>
      )}
      {status && (
        <>
          <p className="status-amount">
            {money(status.amount, status.currency)}
          </p>
          <p className="status-badge">
            {status.payment
              ? status.payment.provenance === "manual"
                ? t("Confirmé par le propriétaire")
                : t("Confirmé automatiquement par une source vérifiée")
              : status.approved
                ? t("Confirmé par le propriétaire")
                : counted
                  ? t("Participation comptabilisée")
                  : t(contributionLabel(status.method, status.state))}
          </p>
          {status.payment ? (
            <>
              <p>
                {t("Net conservé pour ce cadeau :")}{" "}
                {status.payment.net === null
                  ? t("frais encore inconnus, hors total net confirmé")
                  : money(
                      status.payment.net - status.payment.net_reversed,
                      status.currency,
                    )}
                .
              </p>
              {status.payment.refunded > 0 && (
                <p>
                  {t("Remboursement enregistré :")}{" "}
                  {money(status.payment.refunded, status.currency)}.
                </p>
              )}
              {status.payment.disputed > 0 && (
                <Notice>
                  {t(
                    "Un litige est en cours. Cela ne signifie pas qu’un remboursement a eu lieu.",
                  )}{" "}
                </Notice>
              )}
            </>
          ) : counted ? (
            <p role="status">
              {t(
                "Votre participation est déjà incluse dans la progression du cadeau. Merci !",
              )}
            </p>
          ) : status.method === "pledge" && status.state === "intent" ? (
            <>
              <p role="status">
                {t(
                  "Votre promesse est enregistrée. Aucun argent n’a été envoyé et ce montant n’est pas encore inclus dans la progression du cadeau.",
                )}
              </p>
              <p>
                {t(
                  "Convenez du mode de versement directement avec le bénéficiaire. Conservez cette page pour déclarer votre versement plus tard ou annuler votre promesse.",
                )}
              </p>
              <button
                className="button primary wide"
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
                {t("J’ai versé ma participation")}
              </button>
              <button
                className="text-link"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(`contributions/${id}/cancel`, {});
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("Annuler ma promesse")}
              </button>
            </>
          ) : status.method === "pledge" && status.state === "expired" ? (
            <p role="status">
              {t(
                "Votre promesse a été annulée. Aucun versement n’a été enregistré.",
              )}
            </p>
          ) : status.state === "declared" && status.strict_contributions ? (
            <p role="status">
              {t("Votre déclaration attend la validation du propriétaire.")}
            </p>
          ) : status.state === "rejected" ? (
            <p>{t("Cette participation a été refusée par le propriétaire.")}</p>
          ) : (
            <>
              <p>
                {t(
                  "Une fois le versement effectué, indiquez-le ici pour compter votre participation.",
                )}{" "}
              </p>
              {["intent", "expired"].includes(status.state) && (
                <button
                  className="button primary wide"
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
                  {t("J’ai envoyé l’argent")}{" "}
                </button>
              )}
              {status.paypal_url && (
                <a
                  className="text-link"
                  href={status.paypal_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("Ouvrir PayPal si nécessaire ↗")}
                </a>
              )}
              {status.state === "expired" && (
                <Notice>
                  {t(
                    "L’intention a expiré. Un versement déjà envoyé peut toujours être rapproché par le propriétaire.",
                  )}{" "}
                </Notice>
              )}
            </>
          )}
          <a
            className={counted ? "button primary wide" : "text-link"}
            href={href(`/cadeaux/${status.gift_id}`)}
          >
            {t("Retour au cadeau")}
          </a>
          <details className="private-reference">
            <summary>{t("Ma référence de suivi privée")}</summary>
            <code>{id}</code>
            <p>
              {t(
                "Conservez cette page pour suivre votre participation. Ce lien est privé : il permet de gérer votre déclaration et ne vaut pas preuve de paiement.",
              )}{" "}
            </p>
          </details>
        </>
      )}
      {error && (
        <button className="text-link" disabled={busy} onClick={load}>
          {t("Actualiser le statut")}
        </button>
      )}
    </section>
  );
}
