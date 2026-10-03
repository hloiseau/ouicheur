"use client";
import type { GiftPriority } from "../lib/priority-labels";
import { useEffect, useState } from "react";
import type { Wishlist } from "../lib/lists";
import type { Suggestion, SuggestionStatus } from "../lib/suggestions";
import { GiftEditor } from "./admin-gifts";
import { useI18n } from "./language";
import { Modal } from "./modal";
import { api, Field, Notice } from "./ui";

const labels = {
  pending: "Suggestion en attente",
  accepted: "Suggestion acceptée",
  rejected: "Suggestion refusée",
};

function TrackingLink({ token }: { token: string }) {
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const value = `${location.origin}/suggestions#${token}`;
  return (
    <div className="stack">
      <Field label={t("Lien personnel de suivi")}>
        <input readOnly value={value} onFocus={(e) => e.target.select()} />
      </Field>
      <p className="fine-print">
        {t(
          "Conservez ce lien pour suivre ou supprimer votre proposition. Toute personne qui le possède peut la gérer. Aucun compte ni récupération par e-mail.",
        )}
      </p>
      <div className="form-actions">
        <button
          type="button"
          className="button secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setMessage(t("Lien copié."));
            } catch {
              setMessage(t("Sélectionnez et copiez le lien ci-dessus."));
            }
          }}
        >
          {t("Copier le lien")}
        </button>
        <a className="text-link" href={`/suggestions#${token}`}>
          {t("Ouvrir le suivi")}
        </a>
      </div>
      {message && <p role="status">{message}</p>}
    </div>
  );
}

export function SuggestGift({
  lists,
  initialList,
}: {
  lists: Wishlist[];
  initialList: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [value, setValue] = useState({
    list_id: initialList || lists[0]?.id || "",
    title: "",
    nickname: "",
    url: "",
    message: "",
    recipient_visible: false,
  });
  if (!lists.length) return null;
  return (
    <>
      <button
        className="button secondary"
        type="button"
        onClick={() => {
          if (!token)
            setValue((v) => ({ ...v, list_id: initialList || lists[0].id }));
          setOpen(true);
        }}
      >
        {t("Proposer une idée")}
      </button>
      {open && (
        <Modal
          title={t("Proposer une idée")}
          busy={busy}
          onClose={() => setOpen(false)}
        >
          {token ? (
            <div className="stack">
              <Notice>
                {t(
                  secret
                    ? "Votre idée secrète a été confiée au coorganisateur de cette liste."
                    : "Votre suggestion a été envoyée. Elle reste privée jusqu’à la décision du propriétaire.",
                )}
              </Notice>
              <TrackingLink token={token} />
              <button
                className="button secondary"
                onClick={() => {
                  setToken("");
                  setConsent(false);
                  setValue((v) => ({
                    ...v,
                    title: "",
                    nickname: "",
                    message: "",
                    url: "",
                    recipient_visible: false,
                  }));
                }}
              >
                {t("Proposer une autre idée")}
              </button>
            </div>
          ) : (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                setBusy(true);
                setError("");
                try {
                  const r = await api<{ token: string }>("suggestions", {
                    ...value,
                    recipient_visible: !secret,
                  });
                  setToken(r.token);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <p>
                {t(
                  secret
                    ? "Seul le coorganisateur désigné peut lire et préparer cette idée dans l’application. Le destinataire ne la voit pas, même en révélant ses surprises."
                    : "Le propriétaire lira votre idée, votre pseudo et votre message, même en mode surprise. Les autres visiteurs ne voient pas votre proposition.",
                )}
              </p>
              <Field label={t("Liste")}>
                <select
                  value={value.list_id}
                  onChange={(e) => {
                    setValue({ ...value, list_id: e.target.value });
                    setSecret(false);
                    setConsent(false);
                  }}
                >
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Field>
              {lists.find((l) => l.id === value.list_id)
                ?.secret_suggestions_available && (
                <Field label={t("Qui peut lire cette idée ?")}>
                  <select
                    value={secret ? "secret" : "owner"}
                    onChange={(e) => {
                      setSecret(e.target.value === "secret");
                      setConsent(false);
                    }}
                  >
                    <option value="owner">{t("Le propriétaire")}</option>
                    <option value="secret">
                      {t("Le coorganisateur, en secret")}
                    </option>
                  </select>
                </Field>
              )}
              <Field label={t("Votre idée")}>
                <input
                  required
                  maxLength={160}
                  value={value.title}
                  onChange={(e) =>
                    setValue({ ...value, title: e.target.value })
                  }
                />
              </Field>
              <Field label={t("Votre pseudo (facultatif)")}>
                <input
                  maxLength={80}
                  value={value.nickname}
                  onChange={(e) =>
                    setValue({ ...value, nickname: e.target.value })
                  }
                />
              </Field>
              <Field label={t("Lien du produit (facultatif)")}>
                <input
                  type="url"
                  maxLength={2048}
                  value={value.url}
                  onChange={(e) => setValue({ ...value, url: e.target.value })}
                />
              </Field>
              <Field
                label={t(
                  secret
                    ? "Message (facultatif)"
                    : "Message au propriétaire (facultatif)",
                )}
              >
                <textarea
                  maxLength={2000}
                  value={value.message}
                  onChange={(e) =>
                    setValue({ ...value, message: e.target.value })
                  }
                />
              </Field>
              <label className="checkbox">
                <input
                  type="checkbox"
                  required
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                {t(
                  secret
                    ? "Je confie cette idée au coorganisateur. Comme toute donnée auto-hébergée, elle reste accessible à la personne qui administre le serveur et ses sauvegardes."
                    : "Je comprends que cette proposition sera visible au propriétaire.",
                )}
              </label>
              {error && <Notice error>{error}</Notice>}
              <button className="button primary" disabled={busy}>
                {busy ? t("Envoi…") : t("Envoyer ma suggestion")}
              </button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

export function SuggestionTracker() {
  const { t, date } = useI18n();
  const [token, setToken] = useState("");
  const [value, setValue] = useState<SuggestionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const read = () => {
      const fragment = location.hash.slice(1);
      setToken(/^[a-f0-9]{64}$/.test(fragment) ? fragment : "");
      setValue(null);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  useEffect(() => {
    if (!token) return;
    let active = true;
    setBusy(true);
    setError("");
    void api<SuggestionStatus>("suggestions/manage", {
      token,
      action: "status",
    })
      .then((v) => {
        if (active) setValue(v);
      })
      .catch((e) => {
        if (active) {
          setValue(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [token, revision]);
  const action = async (kind: "rotate" | "delete") => {
    if (
      busy ||
      !window.confirm(
        kind === "delete"
          ? t(
              "Supprimer votre proposition et son lien ? Une envie déjà acceptée restera sur la liste.",
            )
          : t("Créer un nouveau lien personnel et révoquer l’ancien ?"),
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ token?: string }>("suggestions/manage", {
        token,
        action: kind,
        confirm: true,
      });
      if (kind === "delete") {
        setDeleted(true);
        setValue(null);
        setToken("");
        history.replaceState(null, "", "/suggestions");
      } else if (r.token) {
        history.replaceState(null, "", `/suggestions#${r.token}`);
        setToken(r.token);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel stack">
      <h1>{t("Ma suggestion")}</h1>
      {deleted ? (
        <Notice>{t("Votre proposition et son lien ont été supprimés.")}</Notice>
      ) : (
        <>
          {!token && (
            <p>
              {t(
                "Ouvrez le lien personnel obtenu lors de l’envoi de votre suggestion.",
              )}
            </p>
          )}
          {busy && <p role="status">{t("Chargement…")}</p>}
          {error && <Notice error>{error}</Notice>}
          {value && (
            <>
              <h2>{value.title}</h2>
              {value.secret && (
                <Notice>
                  {t(
                    "Idée secrète : supprimer la proposition supprime aussi sa préparation privée.",
                  )}
                </Notice>
              )}
              <strong>{t(labels[value.state])}</strong>
              <p>{date(value.created_at)}</p>
              {value.nickname && <p>{value.nickname}</p>}
              {value.message && <p className="wrap-code">{value.message}</p>}
              {value.url && <p className="wrap-code">{value.url}</p>}
              <TrackingLink key={token} token={token} />
              <div className="form-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setRevision((r) => r + 1)}
                >
                  {t("Actualiser")}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void action("rotate")}
                >
                  {t("Renouveler mon lien")}
                </button>
                <button
                  className="text-link"
                  disabled={busy}
                  onClick={() => void action("delete")}
                >
                  {t("Supprimer ma proposition")}
                </button>
              </div>
              <p className="fine-print">
                {t(
                  "La suppression retire votre pseudo, votre message et votre suivi de l’instance active. Une envie déjà acceptée est conservée. Les sauvegardes existantes peuvent encore contenir votre proposition.",
                )}
              </p>
            </>
          )}
        </>
      )}
      <a className="text-link" href="/">
        {t("Retour à la Ouichlist")}
      </a>
    </section>
  );
}

export function SuggestionsInbox({
  priorities,
  categories,
  currency,
  refresh,
}: {
  priorities: GiftPriority[];
  categories: { id: string; name: string }[];
  currency: string;
  refresh: () => Promise<void>;
}) {
  const { t, date } = useI18n();
  const [state, setState] = useState<Suggestion["state"]>("pending");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<{
    items: Suggestion[];
    total: number;
  } | null>(null);
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    void api<{ items: Suggestion[]; total: number }>(
      `admin/suggestions?state=${state}&page=${page}`,
    )
      .then((r) => {
        if (!active) return;
        if (!r.items.length && page > 0) setPage((p) => p - 1);
        else setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [state, page, revision]);
  const review = async (row: Suggestion, action: "reject" | "delete") => {
    if (
      busy ||
      !window.confirm(
        action === "delete"
          ? t(
              "Supprimer cette proposition et révoquer son lien ? Une envie déjà créée sera conservée.",
            )
          : t("Refuser cette suggestion ?"),
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`admin/suggestions/${row.id}/review`, {
        action,
        confirm: true,
      });
      setRevision((r) => r + 1);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack">
      <p>
        {t(
          "Les propositions sont privées. Vérifiez l’idée avant de créer une envie ; le pseudo et le message ne sont pas publiés automatiquement.",
        )}
      </p>
      <Field label={t("État des suggestions")}>
        <select
          value={state}
          onChange={(e) => {
            setState(e.target.value as Suggestion["state"]);
            setPage(0);
          }}
        >
          {Object.entries(labels).map(([key, label]) => (
            <option key={key} value={key}>
              {t(label)}
            </option>
          ))}
        </select>
      </Field>
      {error && <Notice error>{error}</Notice>}
      {data && !data.items.length && (
        <p>{t("Aucune suggestion dans cette catégorie.")}</p>
      )}
      {data?.items.map((row) => (
        <article className="panel stack" key={row.id}>
          <h2>{row.title}</h2>
          <p>
            {row.list_name} · {date(row.created_at)}
          </p>
          <p>{row.nickname || t("Sans pseudo")}</p>
          {row.message && <p className="wrap-code">{row.message}</p>}
          {row.url && <p className="wrap-code">{row.url}</p>}
          <div className="form-actions">
            {row.state === "pending" && (
              <>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => setSelected(row)}
                >
                  {t("Préparer cette envie")}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void review(row, "reject")}
                >
                  {t("Refuser")}
                </button>
              </>
            )}
            {row.gift_id && (
              <a className="text-link" href={`/cadeaux/${row.gift_id}`}>
                {t("Voir l’envie créée")}
              </a>
            )}
            <button
              className="text-link"
              disabled={busy}
              onClick={() => void review(row, "delete")}
            >
              {t("Supprimer la proposition")}
            </button>
          </div>
        </article>
      ))}
      {data && data.total > 20 && (
        <div className="form-actions">
          <button
            className="button secondary"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            {t("Précédent")}
          </button>
          <span>{t("Page {0}", page + 1)}</span>
          <button
            className="button secondary"
            disabled={(page + 1) * 20 >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("Suivant")}
          </button>
        </div>
      )}
      {selected && (
        <GiftEditor
          gift={null}
          priorities={priorities}
          onCategoriesChanged={() => void refresh()}
          categories={categories}
          currency={currency}
          listId={selected.list_id}
          initialUrl={selected.url}
          suggestion={{ id: selected.id, title: selected.title }}
          onDone={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            setRevision((r) => r + 1);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
