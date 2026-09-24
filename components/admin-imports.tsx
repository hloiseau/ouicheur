"use client";
import { useEffect, useState } from "react";
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
}: {
  categories: { id: string; name: string }[];
  currency: string;
  jobs: Omit<Job, "items">[];
  refresh: () => void;
}) {
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
        selected: !i.duplicate_id,
        replace: false,
        gift: {
          ...blankGift(),
          url: i.url,
          title: i.title,
          description: i.description,
          target: i.currency === currency ? i.price : "",
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
        <h2>Vos envies, déjà ailleurs ?</h2>
        <p className="muted">
          Import ponctuel, aperçu obligatoire, aucun historique financier
          importé.
        </p>
      </div>
      <Notice>
        Amazon et Throne : adaptateurs de HTML public, accès réel dépendant de
        la source. Un CAPTCHA, une connexion ou des produits absents du HTML
        bloquent l’import natif. Le secours CSV/JSON reste distinct.
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
        <Field label="Source">
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setContent("");
            }}
          >
            <option value="amazon">
              Wishlist Amazon — lien public ou partagé
            </option>
            <option value="throne">Wishlist Throne — profil public</option>
            <option value="csv">Fichier CSV générique</option>
            <option value="json">Fichier JSON générique</option>
          </select>
        </Field>
        {["amazon", "throne"].includes(source) ? (
          <Field label="Lien de votre liste autorisée">
            <input
              required
              type="url"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                source === "amazon"
                  ? "https://www.amazon.fr/hz/wishlist/ls/…"
                  : "https://throne.com/votre-profil"
              }
            />
          </Field>
        ) : (
          <>
            <Field
              label={`Fichier ${source.toUpperCase()} (200 éléments maximum)`}
            >
              <input
                type="file"
                accept={
                  source === "csv" ? ".csv,text/csv" : ".json,application/json"
                }
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 900000) {
                    setError("Fichier trop volumineux (900 Ko maximum).");
                    return;
                  }
                  setContent(await file.text());
                }}
              />
            </Field>
            <Field label="Contenu à importer">
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
              Télécharger un exemple {source.toUpperCase()}
            </a>
          </>
        )}
        <button className="button primary" disabled={busy || !content}>
          {busy ? "Préparation de l’aperçu…" : "Préparer l’aperçu"}
        </button>
      </form>
      {error && <Notice error>{error}</Notice>}
      {job && (
        <section className="panel stack">
          <div className="panel-heading">
            <h3>Aperçu de l’import</h3>
            <span className="badge">{stateLabel[job.state]}</span>
          </div>
          {job.error && <Notice error>{job.error}</Notice>}
          {job.state === "preview" && (
            <>
              <p>
                Les éléments sélectionnés seront enregistrés comme brouillons.
                Corrigez les erreurs, choisissez un objectif en {currency} et
                importez les images souhaitées. Les contributions démarrent à
                zéro.
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
                          ? [{ index, replace: c.replace, gift: c.gift }]
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
                      <strong>{item.title || `Élément ${index + 1}`}</strong>
                    </label>
                    <p className="fine-print">
                      Source : {item.source} · ID : {item.source_id}
                    </p>
                    {item.currency && item.currency !== currency && (
                      <Notice>
                        Prix d’origine en {item.currency}. Saisissez un objectif
                        en {currency} ; aucune conversion automatique.
                      </Notice>
                    )}
                    {item.errors.length > 0 && (
                      <Notice>{item.errors.join(" ")}</Notice>
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
                                  ? { ...v, replace: e.target.checked }
                                  : v,
                              ),
                            )
                          }
                        />
                        Doublon détecté : je choisis de remplacer les champs
                        locaux de ce cadeau. Les contributions et sa devise
                        seront conservées.
                      </label>
                    )}
                    {choices[index]?.selected && (
                      <details open={job.items.length === 1}>
                        <summary>Vérifier et modifier les champs</summary>
                        <div className="stack">
                          <GiftFields
                            value={choices[index].gift}
                            onChange={(gift) =>
                              setChoices((c) =>
                                c.map((v, n) =>
                                  n === index ? { ...v, gift } : v,
                                ),
                              )
                            }
                            categories={categories}
                            currency={currency}
                            remoteImage={item.image_url}
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
                    ? "Enregistrement…"
                    : `Enregistrer ${choices.filter((c) => c.selected).length} envie(s) sélectionnée(s)`}
                </button>
              </form>
            </>
          )}
          {job.state === "done" && (
            <Notice>
              Import enregistré. Retrouvez les cadeaux dans votre collection
              pour les publier.
            </Notice>
          )}
        </section>
      )}
      <section className="panel">
        <h3>Imports enregistrés et reprises</h3>
        {!jobs.length && <p className="muted">Vos imports apparaîtront ici.</p>}
        {jobs.map((j) => (
          <div className="history-row" key={j.id}>
            <span>
              {j.source.toUpperCase()} · {stateLabel[j.state]} · {j.attempts}{" "}
              tentative(s)
            </span>
            <button
              className="text-link"
              disabled={busy}
              onClick={() =>
                load(j.id, ["queued", "running"].includes(j.state))
              }
            >
              {["queued", "running"].includes(j.state) ? "Reprendre" : "Voir"}
            </button>
          </div>
        ))}
      </section>
    </section>
  );
}
