"use client";
import { useI18n } from "./language";

import { useEffect, useState } from "react";
import type { Wishlist } from "../lib/lists";
import type { ImportItem } from "../lib/imports";
import { blankGift, GiftFields, type GiftDraft } from "./admin-gifts";
import { api, Field, Notice } from "./ui";
import { stateLabel } from "../lib/format";

type Job = {
  id: string;
  state: string;
  error: string;
  source: string;
  attempts: number;
  items: ImportItem[];
};
type Choice = { selected: boolean; replace: boolean; gift: GiftDraft };
export function Imports({
  categories,
  currency,
  jobs,
  refresh,
  onViewGifts,
  lists = [],
}: {
  lists?: Wishlist[];
  categories: { id: string; name: string }[];
  currency: string;
  jobs: Omit<Job, "items">[];
  refresh: () => void;
  onViewGifts: () => void;
}) {
  const { t, storedError, money, date } = useI18n();
  const [listId, setListId] = useState("default");
  const [source, setSource] = useState("amazon");
  const [content, setContent] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const accept = (j: Job) => {
    setJob(j);
    setChoices(
      j.items.map((i) => ({
        selected: !i.duplicate_id && i.duplicate_index === undefined,
        replace: false,
        gift: {
          ...blankGift(),
          url: i.url,
          title: i.title,
          description: i.description,
          image: i.image || "",
          target:
            i.currency === (i.duplicate_currency || currency) ? i.price : "",
        },
      })),
    );
  };
  const load = async (id: string, run = false) => {
    setBusy(true);
    setError("");
    try {
      accept(
        await api<Job>(
          `admin/imports/${id}${run ? "/run" : ""}`,
          run ? {} : undefined,
        ),
      );
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!job || !["running", "queued"].includes(job.state)) return;
    const timer = setTimeout(() => {
      void load(job.id, true);
    }, 3500);
    return () => clearTimeout(timer);
  }, [job]);
  return (
    <section className="stack">
      <div>
        <h2>{t("Vos envies, déjà ailleurs ?")}</h2>
        <p className="muted">
          {t(
            "Import ponctuel, aperçu obligatoire, aucun historique financier importé.",
          )}{" "}
        </p>
      </div>
      <Notice>
        {t(
          "Amazon et Throne : adaptateurs de HTML public, accès réel dépendant de la source. Un CAPTCHA, une connexion ou des produits absents du HTML bloquent l’import natif. Le secours CSV/JSON reste distinct.",
        )}{" "}
      </Notice>
      <form
        className="panel stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const { id } = await api<{ id: string }>("admin/imports", {
              source,
              content,
            });
            await load(id, source === "amazon" || source === "throne");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t("Source")}>
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setContent("");
            }}
          >
            <option value="amazon">
              {t("Liste Amazon — lien public ou partagé")}{" "}
            </option>
            <option value="throne">{t("Liste Throne — profil public")}</option>
            <option value="throne-html">
              {t("Throne — page enregistrée (HTML)")}
            </option>
            <option value="csv">{t("Fichier CSV générique")}</option>
            <option value="json">{t("Fichier JSON générique")}</option>
          </select>
        </Field>
        {source === "throne-html" && (
          <Notice>
            {t(
              "Si Throne refuse le lien, ouvrez votre profil public dans le navigateur, attendez l’affichage des cadeaux, puis enregistrez la page avec Ctrl+S au format HTML. Importez ensuite le fichier .html ici (900 Ko maximum).",
            )}
          </Notice>
        )}
        {["amazon", "throne"].includes(source) ? (
          <Field label={t("Lien de votre liste autorisée")}>
            <input
              required
              type="url"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                source === "amazon"
                  ? "https://www.amazon.com/hz/wishlist/ls/…"
                  : "https://throne.com/your-profile"
              }
            />
          </Field>
        ) : (
          <>
            <Field
              label={
                source === "throne-html"
                  ? t("Page Throne enregistrée (.html)")
                  : t(
                      "Fichier {0} (200 éléments maximum)",
                      source.toUpperCase(),
                    )
              }
            >
              <input
                type="file"
                key={source}
                disabled={busy}
                accept={
                  source === "throne-html"
                    ? ".html,.htm,text/html"
                    : source === "csv"
                      ? ".csv,text/csv"
                      : ".json,application/json"
                }
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  setContent("");
                  setError("");
                  if (!file) return;
                  if (file.size > 900000) {
                    setError(t("Fichier trop volumineux (900 Ko maximum)."));
                    return;
                  }
                  setContent(await file.text());
                }}
              />
            </Field>
            {source !== "throne-html" && (
              <>
                <Field label={t("Contenu à importer")}>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={6}
                    required
                  />
                </Field>
                <a
                  className="text-link"
                  href={`/examples/import.${source}`}
                  download
                >
                  {t("Télécharger un exemple")} {source.toUpperCase()}
                </a>
              </>
            )}
          </>
        )}
        <button className="button primary" disabled={busy || !content}>
          {busy ? t("Préparation de l’aperçu…") : t("Préparer l’aperçu")}
        </button>
      </form>
      {error && <Notice error>{error}</Notice>}
      {job && (
        <section className="panel stack">
          <div className="panel-heading">
            <h3>{t("Aperçu de l’import")}</h3>
            <span className="badge">{t(stateLabel[job.state])}</span>
          </div>
          {job.error && <Notice error>{storedError(job.error)}</Notice>}
          {job.state === "failed" && job.source === "throne" && (
            <button
              className="button"
              type="button"
              disabled={busy}
              onClick={() => {
                setSource("throne-html");
                setContent("");
                setError("");
                setJob(null);
              }}
            >
              {t("Importer une page enregistrée")}
            </button>
          )}
          {job.state === "preview" && (
            <>
              {job.source.startsWith("throne") && (
                <Notice>
                  {t(
                    "Les prix marchands sont récupérés et convertis automatiquement en {0}.",
                    currency,
                  )}
                </Notice>
              )}
              <p>
                {t(
                  "Les envies sélectionnées seront publiées dès l’enregistrement. Les images sont récupérées automatiquement. Vérifiez les montants et la devise.",
                )}
              </p>
              <form
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    await api(`admin/imports/${job.id}/commit`, {
                      selection: choices.flatMap((c, index) =>
                        c.selected
                          ? [
                              {
                                index,
                                replace: c.replace,
                                gift: { ...c.gift, list_id: listId },
                              },
                            ]
                          : [],
                      ),
                    });
                    await load(job.id);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Field label={t("Liste")}>
                  <select
                    value={listId}
                    onChange={(e) => setListId(e.target.value)}
                  >
                    {lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {job.items.map((item, index) => (
                  <article className="import-item" key={index}>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={choices[index]?.selected || false}
                        onChange={(e) =>
                          setChoices((c) =>
                            c.map((v, n) =>
                              n === index
                                ? { ...v, selected: e.target.checked }
                                : v,
                            ),
                          )
                        }
                      />
                      <strong>
                        {item.title || t("Élément {0}", index + 1)}
                      </strong>
                    </label>
                    {item.price && (
                      <p className="fine-print">
                        {t(
                          "Prix : {0}",
                          item.currency
                            ? money(Number(item.price) * 100, item.currency)
                            : item.price,
                        )}
                      </p>
                    )}
                    {item.conversion && (
                      <p className="fine-print">
                        {t(
                          "Converti depuis {0} {1} · taux BCE du {2}",
                          item.conversion.price,
                          item.conversion.currency,
                          date(item.conversion.date, true),
                        )}
                      </p>
                    )}
                    {item.duplicate_index !== undefined && (
                      <Notice>
                        {t(
                          "Même lien que l’élément {0} : désélectionné par défaut. Autorisez un doublon pour conserver les deux envies.",
                          item.duplicate_index + 1,
                        )}
                      </Notice>
                    )}
                    {item.currency &&
                      item.currency !==
                        (choices[index]?.gift.allow_duplicate
                          ? currency
                          : item.duplicate_currency || currency) && (
                        <Notice>
                          {t(
                            "Conversion indisponible. Saisissez un objectif en {0} ou relancez l’import.",
                            choices[index]?.gift.allow_duplicate
                              ? currency
                              : item.duplicate_currency || currency,
                          )}
                        </Notice>
                      )}
                    {item.errors.length > 0 && (
                      <Notice>
                        {item.errors.map((message) => t(message)).join(" ")}
                      </Notice>
                    )}
                    {item.image_error && <Notice>{t(item.image_error)}</Notice>}
                    {item.metadata_error && (
                      <Notice>{t(item.metadata_error)}</Notice>
                    )}
                    {item.duplicate_id && (
                      <label className="checkbox warning">
                        <input
                          type="checkbox"
                          checked={choices[index]?.replace || false}
                          onChange={(e) =>
                            setChoices((c) =>
                              c.map((v, n) =>
                                n === index
                                  ? {
                                      ...v,
                                      replace: e.target.checked,
                                      selected: e.target.checked || v.selected,
                                      gift: {
                                        ...v.gift,
                                        allow_duplicate: false,
                                        target:
                                          v.gift.allow_duplicate &&
                                          item.duplicate_currency &&
                                          item.duplicate_currency !== currency
                                            ? ""
                                            : v.gift.target,
                                      },
                                    }
                                  : v,
                              ),
                            )
                          }
                        />
                        {t(
                          "Doublon détecté : je choisis de remplacer les champs locaux de ce cadeau. Les contributions et sa devise seront conservées.",
                        )}{" "}
                      </label>
                    )}
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={choices[index]?.gift.allow_duplicate || false}
                        onChange={(e) =>
                          setChoices((c) =>
                            c.map((v, n) =>
                              n === index
                                ? {
                                    ...v,
                                    replace: false,
                                    selected: e.target.checked || v.selected,
                                    gift: {
                                      ...v.gift,
                                      allow_duplicate: e.target.checked,
                                      target:
                                        item.duplicate_currency &&
                                        item.duplicate_currency !== currency
                                          ? ""
                                          : v.gift.target,
                                    },
                                  }
                                : v,
                            ),
                          )
                        }
                      />
                      {t("Autoriser un doublon (créer une nouvelle envie)")}
                    </label>
                    {choices[index]?.selected && (
                      <details open={job.items.length === 1}>
                        <summary>
                          {t("Vérifier et modifier les champs")}
                        </summary>
                        <div className="stack">
                          <GiftFields
                            showDuplicate={false}
                            value={choices[index].gift}
                            onChange={(gift) =>
                              setChoices((c) =>
                                c.map((v, n) =>
                                  n === index ? { ...v, gift } : v,
                                ),
                              )
                            }
                            categories={categories}
                            currency={
                              choices[index].gift.allow_duplicate
                                ? currency
                                : item.duplicate_currency || currency
                            }
                          />
                        </div>
                      </details>
                    )}
                  </article>
                ))}
                <button
                  className="button primary"
                  disabled={busy || !choices.some((c) => c.selected)}
                >
                  {busy
                    ? t("Enregistrement…")
                    : t(
                        "Enregistrer {0} envie(s) sélectionnée(s)",
                        choices.filter((c) => c.selected).length,
                      )}
                </button>
              </form>
            </>
          )}
          {job.state === "done" && (
            <>
              <Notice>
                {t(
                  "Import enregistré. Vos envies sont visibles sur votre page publique.",
                )}{" "}
              </Notice>
              <button
                className="button primary"
                type="button"
                onClick={onViewGifts}
              >
                {t("Voir mes envies")}
              </button>
            </>
          )}
        </section>
      )}
      <section className="panel">
        <h3>{t("Imports enregistrés et reprises")}</h3>
        {!jobs.length && (
          <p className="muted">{t("Vos imports apparaîtront ici.")}</p>
        )}
        {jobs.map((j) => (
          <div className="history-row" key={j.id}>
            <span>
              {j.source.toUpperCase()} · {t(stateLabel[j.state])} · {j.attempts}{" "}
              {t("tentative(s)")}{" "}
            </span>
            <button
              className="text-link"
              disabled={busy}
              onClick={() =>
                load(j.id, ["queued", "running"].includes(j.state))
              }
            >
              {["queued", "running"].includes(j.state)
                ? t("Reprendre")
                : t("Voir")}
            </button>
          </div>
        ))}
      </section>
    </section>
  );
}
