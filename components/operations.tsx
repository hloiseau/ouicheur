"use client";
import { NotificationPreferencesPanel } from "./notification-preferences";
import { SupportPanel } from "./support-panel";
import { useEffect, useState } from "react";
import { api, Field, Notice } from "./ui";
import { useI18n } from "./language";

type Settings = {
  notifications: boolean;
  backup_hours: 0 | 24 | 168;
  backup_keep: number;
  image_limit_mb: number;
};
type OperationsData = {
  settings: Settings;
  diagnostics: {
    version: string;
    revision: string;
    node: string;
    architecture: string;
    chromium: boolean;
    ntfy_configured: boolean;
    storage: { image_bytes: number; free_bytes: number | null };
    notification_counts: { state: string; count: number }[];
  };
  backups: { id: string; state: string; created_at: string; bytes: number }[];
  cleanup: {
    token: string;
    images: number;
    image_bytes: number;
    imports: number;
    intents: number;
    importing: boolean;
  };
};
export function Operations() {
  const { t, date } = useI18n();
  const [data, setData] = useState<OperationsData | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const refresh = async () => {
    const d = await api<OperationsData>("admin/operations");
    setData(d);
    setSettings(d.settings);
  };
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await refresh();
      setNotice(t("Opération terminée."));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack">
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      <SupportPanel />
      {data && settings && (
        <>
          <div className="operations-grid">
            <section className="panel stack">
              <h2>{t("Santé de l’instance")}</h2>
              <p>
                Ouicheur {data.diagnostics.version} ·{" "}
                {data.diagnostics.architecture} · Node {data.diagnostics.node}
              </p>
              <p>
                {t("Révision")} :{" "}
                {data.diagnostics.revision === "local" ? (
                  t("Construction locale sans commit intégré")
                ) : (
                  <a
                    href={`https://github.com/hloiseau/ouicheur/commit/${data.diagnostics.revision}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {data.diagnostics.revision.slice(0, 12)}
                  </a>
                )}{" "}
                · Chromium :{" "}
                {t(data.diagnostics.chromium ? "Disponible" : "À vérifier")}
              </p>
              <p>
                {t(
                  "Images stockées : {0} Mo",
                  Math.ceil(data.diagnostics.storage.image_bytes / 1048576),
                )}
              </p>
              <p>
                {t(
                  "Espace libre : {0} Mo",
                  data.diagnostics.storage.free_bytes === null
                    ? "—"
                    : Math.floor(data.diagnostics.storage.free_bytes / 1048576),
                )}
              </p>
              <a
                className="button secondary"
                download
                href="/api/admin/diagnostics"
              >
                {t("Télécharger le diagnostic anonymisé")}
              </a>
              <p className="fine-print">
                {t(
                  "Le diagnostic contient uniquement les versions, les compteurs et l’état technique.",
                )}
              </p>
            </section>
            <section className="panel stack">
              <h2>{t("Réglages de l’instance")}</h2>
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(() => api("admin/settings", settings));
                }}
              >
                <Field label={t("Sauvegardes automatiques")}>
                  <select
                    value={settings.backup_hours}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        backup_hours: Number(e.target.value) as 0 | 24 | 168,
                      })
                    }
                  >
                    <option value={0}>{t("Désactivées")}</option>
                    <option value={24}>{t("Chaque jour")}</option>
                    <option value={168}>{t("Chaque semaine")}</option>
                  </select>
                </Field>
                <Field label={t("Sauvegardes à conserver")}>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={settings.backup_keep}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        backup_keep: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label={t("Limite des images (Mo)")}>
                  <input
                    type="number"
                    min={100}
                    max={100000}
                    value={settings.image_limit_mb}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        image_limit_mb: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <button className="button primary" disabled={busy}>
                  {t("Enregistrer")}
                </button>
              </form>
              {data.diagnostics.notification_counts.map((n) => (
                <p key={n.state}>
                  {t(n.state)} : {n.count}
                </p>
              ))}
            </section>
          </div>
          <NotificationPreferencesPanel />
          <section className="panel stack">
            <h2>{t("Sauvegardes complètes")}</h2>
            <p>
              {t(
                "Les archives contiennent la base, les images et des données privées. Conservez une copie sur un autre appareil. La restauration se fait dans un dossier vide, application arrêtée.",
              )}
            </p>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void action(() => api("admin/backups", {}))}
            >
              {t("Créer une sauvegarde")}
            </button>
            {data.backups.map((b) => (
              <div className="history-row" key={b.id}>
                <span>
                  {date(b.created_at)} · {t(b.state)} ·{" "}
                  {Math.ceil(b.bytes / 1024)} Ko
                </span>
                {b.state === "done" && (
                  <a href={`/api/admin/backups/${b.id}`} download>
                    {t("Télécharger")}
                  </a>
                )}
              </div>
            ))}
          </section>
          <section className="panel stack">
            <h2>{t("Nettoyage des données")}</h2>
            <p>
              {t(
                "{0} images orphelines, {1} imports terminés et {2} intentions sans paiement peuvent être supprimés.",
                data.cleanup.images,
                data.cleanup.imports,
                data.cleanup.intents,
              )}
            </p>
            <p className="fine-print">
              {t(
                "Les images inutilisées sont conservées au moins 24 heures ; les imports terminés et intentions expirées, 90 jours. Le registre des paiements est conservé.",
              )}
            </p>
            {data.cleanup.importing && (
              <Notice>
                {t("Un import est en cours : ses images sont protégées.")}
              </Notice>
            )}
            <label>
              <input
                type="checkbox"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
              />
              {t(
                "Je confirme la suppression des éléments inutilisés indiqués ci-dessus.",
              )}
            </label>
            <button
              className="button secondary"
              disabled={busy || !confirm}
              onClick={() =>
                void action(async () => {
                  try {
                    await api("admin/cleanup", {
                      confirm: true,
                      token: data.cleanup.token,
                    });
                  } finally {
                    setConfirm(false);
                    await refresh();
                  }
                })
              }
            >
              {t("Nettoyer")}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
