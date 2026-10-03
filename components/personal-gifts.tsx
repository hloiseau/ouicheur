"use client";
import { useEffect, useState } from "react";
import { api, Field, Notice } from "./ui";
import { useI18n } from "./language";
import type { ReservedDetails } from "../lib/reservation-details";
type Donor = {
  id: string;
  quantity: number;
  state: string;
  expires_at: string;
  details: ReservedDetails | null;
};
type Received = {
  id: string;
  title: string;
  list_name: string;
  received: number;
  received_on: string;
  note: string;
  thanks: string;
  thanked: number;
};
type Result<T> = { items: T[]; total: number; page: number };
export function SaveReservation({ token }: { token?: string }) {
  const { t } = useI18n(),
    [value, setValue] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  return (
    <form
      className="panel stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setSaved(false);
        try {
          let key = token || value.trim();
          if (!token && key.includes("://")) {
            const url = new URL(key);
            if (
              url.origin !== location.origin ||
              !/^\/reservation\/[a-f0-9]{64}$/.test(url.pathname)
            )
              throw Error(t("Utilisez un lien personnel de cette instance."));
            key = url.pathname.split("/")[2];
          }
          if (!/^[a-f0-9]{64}$/.test(key))
            throw Error(t("Utilisez un lien personnel de cette instance."));
          await api("account/donor/save", { token: key, confirm: true });
          setSaved(true);
          setValue("");
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {!token && <h2>{t("Retrouver cette réservation dans mon compte")}</h2>}
      <p>
        {t(
          "Facultatif : ce suivi reste dans votre compte. Il ne révèle pas votre identité au destinataire. Vous devez être connecté ; le lien personnel continuera de fonctionner.",
        )}
      </p>
      {!token && (
        <Field label={t("Lien personnel de réservation")}>
          <input
            type="password"
            autoComplete="off"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={4096}
          />
        </Field>
      )}
      <button className="button secondary" disabled={busy}>
        {t("Rattacher à mon compte")}
      </button>
      {saved && (
        <p role="status">
          {t("Réservation rattachée.")}{" "}
          <a href="/my-gifts">{t("Ouvrir mon suivi")}</a>
        </p>
      )}
      {error && (
        <Notice error>
          {error} <a href="/my-gifts">{t("Ouvrir mon suivi")}</a>
        </Notice>
      )}
    </form>
  );
}
function ReceivedEditor({
  row,
  onSaved,
}: {
  row: Received;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n(),
    [value, setValue] = useState(row),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [copied, setCopied] = useState(false);
  const persist = async (remove = false) => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await api("account/received", {
        gift_id: row.id,
        received: !!value.received,
        received_on: value.received_on,
        note: value.note,
        thanks: value.thanks,
        thanked: !!value.thanked,
        remove,
      });
      await onSaved();
      if (remove)
        setValue({
          ...row,
          received: 0,
          received_on: "",
          note: "",
          thanks: "",
          thanked: 0,
        });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="panel stack">
      <summary>
        {row.title} · {row.list_name}
        {value.received ? ` · ${t("Reçu")}` : ""}
      </summary>
      <form
        className="stack"
        onChange={() => setSaved(false)}
        onSubmit={(e) => {
          e.preventDefault();
          void persist();
        }}
      >
        <label className="checkbox">
          <input
            type="checkbox"
            role="switch"
            checked={!!value.received}
            onChange={(e) =>
              setValue({ ...value, received: Number(e.target.checked) })
            }
          />
          {t("J’ai reçu ce cadeau")}
        </label>
        {value.received !== 0 && (
          <Field label={t("Date de réception, facultative")}>
            <input
              type="date"
              value={value.received_on}
              onChange={(e) =>
                setValue({ ...value, received_on: e.target.value })
              }
            />
          </Field>
        )}
        <Field label={t("Mon journal privé")}>
          <textarea
            maxLength={2000}
            value={value.note}
            onChange={(e) => setValue({ ...value, note: e.target.value })}
          />
        </Field>
        <Field
          label={t("Brouillon de remerciement")}
          hint={t(
            "Aucun nom de donneur n’est récupéré. Adaptez votre texte, puis copiez-le dans le canal de votre choix.",
          )}
        >
          <textarea
            maxLength={2000}
            value={value.thanks}
            onChange={(e) => setValue({ ...value, thanks: e.target.value })}
          />
        </Field>
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              if (
                !value.thanks ||
                window.confirm(
                  t("Remplacer ce brouillon par une proposition ?"),
                )
              )
                setValue({
                  ...value,
                  thanks: t(
                    "Merci pour cette belle attention ! Ce cadeau me fait très plaisir.",
                  ),
                });
            }}
          >
            {t("Proposer un texte")}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={!value.thanks || busy}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value.thanks);
                setCopied(true);
              } catch {
                setError(t("Sélectionnez et copiez le texte ci-dessus."));
              }
            }}
          >
            {t("Copier le remerciement")}
          </button>
        </div>
        {copied && (
          <p role="status">{t("Texte copié. Aucun message envoyé.")}</p>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={!!value.thanked}
            onChange={(e) =>
              setValue({ ...value, thanked: Number(e.target.checked) })
            }
          />
          {t("J’ai remercié cette personne")}
        </label>
        <div className="form-actions">
          <button className="button primary" disabled={busy}>
            {t("Enregistrer mon journal")}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  t(
                    "Effacer mon journal pour ce cadeau ? L’envie et les engagements seront conservés.",
                  ),
                )
              )
                void persist(true);
            }}
          >
            {t("Effacer ce suivi reçu")}
          </button>
        </div>
        {saved && <p role="status">{t("Journal enregistré.")}</p>}
        {error && <Notice error>{error}</Notice>}
      </form>
    </details>
  );
}
export function PersonalGifts() {
  const { t, date } = useI18n(),
    [view, setView] = useState<"donor" | "received">("donor"),
    [page, setPage] = useState(0),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [donor, setDonor] = useState<Result<Donor> | null>(null),
    [received, setReceived] = useState<Result<Received> | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => {
    if (view === "donor") setDonor(await api(`account/donor?page=${page}`));
    else
      setReceived(
        await api(
          `account/received?page=${page}&q=${encodeURIComponent(search)}`,
        ),
      );
  };
  useEffect(() => {
    let active = true;
    setError("");
    setDonor(null);
    setReceived(null);
    void api<Result<Donor> | Result<Received>>(
      `account/${view}?page=${page}&q=${encodeURIComponent(search)}`,
    )
      .then((d) => {
        if (active) {
          if (view === "donor") setDonor(d as Result<Donor>);
          else setReceived(d as Result<Received>);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [view, page, search]);
  const change = async (
    row: Donor,
    action: "purchased" | "cancelled" | "forget",
  ) => {
    if (
      !window.confirm(
        t(
          action === "forget"
            ? "Retirer ce suivi du compte ? La réservation restera active et son lien personnel sera nécessaire."
            : action === "cancelled"
              ? "Annuler cet engagement et libérer le cadeau ?"
              : "Confirmer que ce cadeau est acheté ou prêt à offrir ? Aucun paiement ne sera enregistré.",
        ),
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api("account/donor/change", { id: row.id, action, confirm: true });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const current = view === "donor" ? donor : received;
  return (
    <div className="stack personal-gifts">
      <nav className="form-actions" aria-label={t("Mon suivi cadeaux")}>
        <button
          className="button secondary"
          aria-pressed={view === "donor"}
          onClick={() => {
            setView("donor");
            setPage(0);
          }}
        >
          {t("À offrir")}
        </button>
        <button
          className="button secondary"
          aria-pressed={view === "received"}
          onClick={() => {
            setView("received");
            setPage(0);
          }}
        >
          {t("Reçus et remerciements")}
        </button>
      </nav>
      <p>
        {t(
          "Cet espace est privé à votre compte. L’administrateur du serveur peut lire les sauvegardes ; elles ne doivent pas être partagées.",
        )}
      </p>
      {error && <Notice error>{error}</Notice>}
      {view === "donor" ? (
        <>
          <p>
            {t(
              "Un achat déclaré n’est pas un paiement vérifié. Les réservations expirent après 14 jours. Si vous perdez à la fois le lien et l’accès au compte, demandez à l’organisateur de libérer le cadeau : aucun pseudonyme ne permet de retrouver un suivi.",
            )}
          </p>
          <SaveReservation />
          {donor?.items.map((row) => (
            <article className="panel stack" key={row.id}>
              <h2>{row.details?.title || t("Votre réservation")}</h2>
              <p>
                {t("Quantité")} : {row.quantity} ·{" "}
                {t(
                  row.state === "purchased"
                    ? "Acheté ou prêt, déclaré par vous"
                    : row.state,
                )}
              </p>
              {row.state === "reserved" && (
                <p>
                  {t("Expiration")} : {date(row.expires_at)}
                </p>
              )}
              {row.details && (
                <p>
                  {[row.details.size, row.details.color, row.details.model]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <div className="form-actions">
                {row.state === "reserved" && (
                  <button
                    disabled={busy}
                    className="button primary"
                    onClick={() => void change(row, "purchased")}
                  >
                    {t("Acheté ou prêt à offrir")}
                  </button>
                )}
                {["reserved", "purchased"].includes(row.state) && (
                  <button
                    disabled={busy}
                    className="button secondary"
                    onClick={() => void change(row, "cancelled")}
                  >
                    {t("Annuler mon engagement")}
                  </button>
                )}
                <button
                  disabled={busy}
                  className="text-link"
                  onClick={() => void change(row, "forget")}
                >
                  {t("Retirer de mon compte")}
                </button>
              </div>
            </article>
          ))}
        </>
      ) : (
        <>
          <p>
            {t(
              "Ce journal ne change ni les réservations, ni les achats, ni les paiements. Les notes et remerciements ne sont jamais publiés et ne reprennent aucune identité de donneur.",
            )}
          </p>
          <form
            className="form-actions"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(query);
              setPage(0);
            }}
          >
            <Field label={t("Rechercher dans mes cadeaux reçus")}>
              <input
                value={query}
                maxLength={160}
                onChange={(e) => setQuery(e.target.value)}
              />
            </Field>
            <button className="button secondary">{t("Rechercher")}</button>
          </form>
          {received?.items.map((row) => (
            <ReceivedEditor key={row.id} row={row} onSaved={load} />
          ))}
        </>
      )}
      {!current && !error && <p role="status">{t("Chargement…")}</p>}
      {current && !current.items.length && (
        <p>{t("Aucun cadeau dans ce suivi pour le moment.")}</p>
      )}
      {current && current.total > 50 && (
        <nav className="form-actions" aria-label={t("Pages du suivi")}>
          <button
            disabled={page === 0}
            className="button secondary"
            onClick={() => setPage(page - 1)}
          >
            {t("Précédent")}
          </button>
          <span>{t("Page {0}", page + 1)}</span>
          <button
            disabled={(page + 1) * 50 >= current.total}
            className="button secondary"
            onClick={() => setPage(page + 1)}
          >
            {t("Suivant")}
          </button>
        </nav>
      )}
    </div>
  );
}
