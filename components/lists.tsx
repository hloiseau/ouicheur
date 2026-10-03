"use client";
import { ListTools } from "./list-tools";
import { useRef, useState } from "react";
import QRCode from "qrcode";
import type { Wishlist } from "../lib/lists";
import { api, Field, Notice } from "./ui";
import { useI18n } from "./language";

export function ShareLink({ value }: { value: string }) {
  const { t } = useI18n();
  const [qr, setQr] = useState("");
  const [message, setMessage] = useState("");
  return (
    <div className="stack">
      <Field label={t("Lien de partage")}>
        <input readOnly value={value} onFocus={(e) => e.target.select()} />
      </Field>
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
        <button
          type="button"
          className="button secondary"
          onClick={async () => {
            try {
              setQr(await QRCode.toDataURL(value, { width: 256, margin: 2 }));
            } catch {
              setMessage(t("Impossible de créer le QR code."));
            }
          }}
        >
          {t("QR code")}
        </button>
        {typeof navigator !== "undefined" && !!navigator.share && (
          <button
            type="button"
            className="button secondary"
            onClick={() => void navigator.share({ url: value }).catch(() => {})}
          >
            {t("Partager")}
          </button>
        )}
      </div>
      {qr && (
        <img
          width={256}
          height={256}
          src={qr}
          alt={t("QR code du lien de partage")}
        />
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
const empty = {
  name: "",
  description: "",
  visibility: "private" as Wishlist["visibility"],
  archived: false,
  surprise_mode: false,
  suggestions_enabled: false,
  event_date: "",
  event_annual: false,
  event_timezone: "Europe/Paris",
  leap_day: "feb28",
};
export function ListsEditor({
  lists,
  refresh,
}: {
  lists: Wishlist[];
  refresh: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState<{
    id?: string;
    name: string;
    description: string;
    visibility: Wishlist["visibility"];
    archived: boolean;
    surprise_mode: boolean;
    suggestions_enabled: boolean;
    event_date: string;
    event_annual: boolean;
    event_timezone: string;
    leap_day: string;
  }>(empty);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState("");
  const [saved, setSaved] = useState(false);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="operations-grid">
      <section className="panel stack">
        <h2>{t("Mes listes et événements")}</h2>
        {lists.map((l) => (
          <button
            key={l.id}
            className="button secondary"
            disabled={busy}
            aria-pressed={value.id === l.id}
            onClick={() => {
              setSaved(false);
              formHeading.current?.focus();
              setValue({
                ...l,
                event_annual: !!l.event_annual,
                event_timezone: l.event_timezone || "Europe/Paris",
                leap_day: l.leap_day || "feb28",
                archived: !!l.archived,
                surprise_mode: !!l.surprise_mode,
                suggestions_enabled: !!l.suggestions_enabled,
              });
              setShare(
                l.visibility === "public" && !l.archived
                  ? `${location.origin}/lists/${l.id}`
                  : "",
              );
            }}
          >
            {l.name} · {t(l.visibility)}
            {l.archived ? ` · ${t("Archivées")}` : ""}
          </button>
        ))}
        <button
          className="button primary"
          disabled={busy}
          onClick={() => {
            setSaved(false);
            formHeading.current?.focus();
            setValue(empty);
            setShare("");
          }}
        >
          {t("Nouvelle liste")}
        </button>
      </section>
      <section className="panel stack">
        <h2 ref={formHeading} tabIndex={-1}>
          {value.id ? t("Modifier la liste") : t("Nouvelle liste")}
        </h2>
        <form
          className="stack"
          onChange={() => setSaved(false)}
          onSubmit={(e) => {
            e.preventDefault();
            const previous = lists.find((l) => l.id === value.id);
            const disablingSurprise =
              !!previous?.surprise_mode && !value.surprise_mode;
            if (
              disablingSurprise &&
              !window.confirm(
                t(
                  "Désactiver le mode surprise pour cette liste et afficher ses réservations et achats ?",
                ),
              )
            )
              return;
            void action(async () => {
              const r = await api<{ id: string }>("admin/lists", {
                ...value,
                confirm_reveal: disablingSurprise,
              });
              if (!!previous?.surprise_mode !== value.surprise_mode) {
                location.reload();
                return;
              }
              setValue((v) => ({ ...v, id: r.id }));
              setSaved(true);
              setShare(
                value.visibility === "public" && !value.archived
                  ? `${location.origin}/lists/${r.id}`
                  : "",
              );
            });
          }}
        >
          <Field label={t("Nom de la liste")}>
            <input
              required
              maxLength={80}
              value={value.name}
              onChange={(e) => setValue({ ...value, name: e.target.value })}
            />
          </Field>
          <Field label={t("Description")}>
            <textarea
              maxLength={1000}
              value={value.description}
              onChange={(e) =>
                setValue({ ...value, description: e.target.value })
              }
            />
          </Field>
          <Field label={t("Date de l’événement")}>
            <input
              type="date"
              value={value.event_date}
              onChange={(e) =>
                setValue({ ...value, event_date: e.target.value })
              }
            />
          </Field>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={value.event_annual}
              onChange={(e) =>
                setValue({ ...value, event_annual: e.target.checked })
              }
            />
            {t("Répéter chaque année")}
          </label>
          <Field label={t("Fuseau horaire de l’événement")}>
            <input
              required
              maxLength={80}
              value={value.event_timezone}
              placeholder="Europe/Paris"
              onChange={(e) =>
                setValue({ ...value, event_timezone: e.target.value })
              }
            />
          </Field>
          {value.event_annual && value.event_date.endsWith("02-29") && (
            <Field label={t("Le 29 février les années non bissextiles")}>
              <select
                value={value.leap_day}
                onChange={(e) =>
                  setValue({ ...value, leap_day: e.target.value })
                }
              >
                <option value="feb28">{t("Fêter le 28 février")}</option>
                <option value="skip">
                  {t("Uniquement les années bissextiles")}
                </option>
              </select>
            </Field>
          )}
          <Field label={t("Confidentialité")}>
            <select
              value={value.visibility}
              onChange={(e) =>
                setValue({
                  ...value,
                  visibility: e.target.value as Wishlist["visibility"],
                })
              }
            >
              {["public", "unlisted", "private"].map((v) => (
                <option key={v} value={v}>
                  {t(v)}
                </option>
              ))}
            </select>
          </Field>
          <p className="fine-print">
            {t(
              "Publique : visible par tous. Non répertoriée : accessible avec un lien privé. Privée : réservée au propriétaire. Le profil est commun à vos listes.",
            )}
          </p>
          <label>
            <input
              type="checkbox"
              checked={value.archived}
              onChange={(e) =>
                setValue({ ...value, archived: e.target.checked })
              }
            />
            {t("Archiver cette liste")}
          </label>
          <label>
            <input
              type="checkbox"
              checked={value.surprise_mode}
              onChange={(e) =>
                setValue({ ...value, surprise_mode: e.target.checked })
              }
            />
            {t("Préserver la surprise sur cette liste")}
          </label>
          <p className="fine-print">
            {t(
              "Masque les réservations et achats au propriétaire connecté, y compris dans son aperçu public. Les proches gardent les disponibilités réelles. Les contributions financières restent visibles ; ce mode ne protège pas contre une visite anonyme ou l’accès au serveur.",
            )}
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={value.suggestions_enabled}
              onChange={(e) =>
                setValue({ ...value, suggestions_enabled: e.target.checked })
              }
            />
            {t("Autoriser les suggestions des proches")}
          </label>
          <p className="fine-print">
            {t(
              "Les visiteurs autorisés peuvent vous proposer une idée. Vous la lirez et déciderez de la publier, même en mode surprise. Une liste privée ou archivée ne reçoit pas de suggestions.",
            )}
          </p>
          <p className="fine-print">
            {t(
              "Changer la confidentialité ou archiver révoque le lien existant.",
            )}
          </p>
          {saved && <Notice>{t("Liste enregistrée.")}</Notice>}
          <button className="button primary" disabled={busy}>
            {busy ? t("Enregistrement…") : t("Enregistrer")}
          </button>
        </form>
        {value.id && (
          <>
            <a href={`/lists/${value.id}`} className="text-link">
              {t("Ouvrir cette liste")}
            </a>
            {value.visibility === "unlisted" && !value.archived && (
              <>
                <p>
                  {t(
                    "Créer un nouveau lien révoque immédiatement l’ancien. Conservez le lien affiché ici.",
                  )}
                </p>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const r = await api<{ token: string }>(
                        "admin/lists/share",
                        { id: value.id },
                      );
                      setShare(`${location.origin}/s/${r.token}`);
                    })
                  }
                >
                  {t("Créer un nouveau lien privé")}
                </button>
                <button
                  className="text-link"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await api("admin/lists/share", {
                        id: value.id,
                        revoke: true,
                      });
                      setShare("");
                    })
                  }
                >
                  {t("Révoquer le lien")}
                </button>
              </>
            )}
          </>
        )}
        {share && <ShareLink key={share} value={share} />}
        {value.id && lists.find((l) => l.id === value.id) && (
          <ListTools
            key={value.id}
            list={lists.find((l) => l.id === value.id)!}
            owner
          />
        )}
        {error && <Notice error>{error}</Notice>}
      </section>
    </div>
  );
}
