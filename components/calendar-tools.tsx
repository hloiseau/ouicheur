"use client";
import { useState } from "react";
import type { Wishlist } from "../lib/lists";
import { nextOccurrence } from "../lib/event-dates";
import { ShareLink } from "./lists";
import { useI18n } from "./language";
import { api, Notice } from "./ui";
export function CalendarTools({
  list,
  owner,
}: {
  list: Wishlist;
  owner: boolean;
}) {
  const { t, date } = useI18n();
  const [name, setName] = useState(false),
    [description, setDescription] = useState(false),
    [link, setLink] = useState(false),
    [feed, setFeed] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  if (!list.event_date || list.archived) return null;
  const next = nextOccurrence(list);
  const rotate = async (revoke: boolean) => {
    if (
      !window.confirm(
        t(
          revoke
            ? "Révoquer l’abonnement à ce calendrier ?"
            : "Créer un lien de calendrier privé ? Toute personne qui le possède pourra lire les champs choisis. L’ancien lien sera révoqué.",
        ),
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api<{ token: string | null }>("admin/calendar", {
        list_id: list.id,
        include_name: name,
        include_description: description,
        include_link: link,
        revoke,
        confirm: true,
      });
      setFeed(r.token ? `${location.origin}/api/calendar/feed/${r.token}` : "");
      setNotice(
        t(
          revoke
            ? "Abonnement révoqué. Les copies déjà importées peuvent subsister dans le calendrier."
            : "Copiez ce lien dans la fonction d’abonnement de votre calendrier. Conservez-le comme un lien privé.",
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="calendar-tools">
      <summary>{t("Ajouter à mon calendrier")}</summary>
      <div className="stack panel">
        <p>
          {next ? date(next, true) : date(list.event_date, true)} ·{" "}
          {list.event_timezone || "Europe/Paris"} ·{" "}
          {t(list.event_annual ? "Chaque année" : "Une seule fois")}
        </p>
        <p>
          {t(
            "L’événement occupe une journée. Choisissez les informations à exporter ; les cadeaux et participations restent exclus.",
          )}
        </p>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={name}
            onChange={(e) => setName(e.target.checked)}
          />
          {t("Inclure le nom de la liste")}
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={description}
            onChange={(e) => setDescription(e.target.checked)}
          />
          {t("Inclure sa description")}
        </label>
        {list.visibility === "public" && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={link}
              onChange={(e) => setLink(e.target.checked)}
            />
            {t("Inclure le lien public")}
          </label>
        )}
        <a
          className="button secondary"
          href={`/api/lists/${list.id}/calendar?name=${Number(name)}&description=${Number(description)}&link=${Number(link)}`}
        >
          {t("Télécharger l’événement (.ics)")}
        </a>
        {owner && (
          <>
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => void rotate(false)}
            >
              {t("Créer un lien d’abonnement")}
            </button>
            <button
              className="text-link"
              type="button"
              disabled={busy}
              onClick={() => void rotate(true)}
            >
              {t("Révoquer l’abonnement")}
            </button>
          </>
        )}
        {feed && <ShareLink value={feed} />}
        {notice && <p role="status">{notice}</p>}
        {error && <Notice error>{error}</Notice>}
      </div>
    </details>
  );
}
