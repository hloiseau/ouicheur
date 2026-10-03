"use client";
import { useEffect, useState } from "react";
import type { SupportInfo } from "../lib/support";
import { api, Field, Notice } from "./ui";
import { useI18n } from "./language";

export function SupportPanel() {
  const { t } = useI18n();
  const [data, setData] = useState<SupportInfo | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void api<SupportInfo>("admin/support")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  const report = data
    ? [
        `Ouicheur: ${data.version}`,
        `Commit: ${data.revision}`,
        `Node: ${data.node}`,
        `Platform: ${data.platform} / ${data.architecture}`,
        `SQLite: ${data.sqlite}`,
        `Schema: ${data.schema}`,
      ].join("\n")
    : "";
  const link = new URL("https://github.com/hloiseau/ouicheur/issues/new");
  link.searchParams.set("template", "bug.yml");
  link.searchParams.set("technical", report);
  return (
    <section id="support" className="panel stack">
      <h2>{t("Signaler un problème")}</h2>
      <p>
        {t(
          "Ces informations identifient le logiciel. Elles ne contiennent ni envies, ni liens privés, ni données de compte. Rien n’est envoyé automatiquement.",
        )}
      </p>
      {error && <Notice error>{error}</Notice>}
      {data && (
        <>
          <Field label={t("Aperçu des informations techniques")}>
            <textarea
              readOnly
              rows={6}
              value={report}
              onFocus={(e) => e.target.select()}
            />
          </Field>
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(report);
                  setCopied(true);
                  setError("");
                } catch {
                  setError(t("Sélectionnez et copiez le texte dans l’aperçu."));
                }
              }}
            >
              {t("Copier les informations techniques")}
            </button>
            <a
              className="button secondary"
              href={link.toString()}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("Préparer un signalement sur GitHub")}
            </a>
          </div>
          {copied && <Notice>{t("Informations copiées.")}</Notice>}
          <p className="fine-print">
            {t(
              "Le formulaire GitHub reste à compléter et à envoyer par vous. Ajoutez un lien marchand uniquement si vous souhaitez le rendre public.",
            )}
          </p>
        </>
      )}
    </section>
  );
}

export function ImportFailureHelp({ error }: { error: string }) {
  const { t } = useI18n();
  const blocked =
    /HTTP (?:401|403|406|429)|captcha|access restrictions|refus|bloqu/i.test(
      error,
    );
  return (
    <div className="stack">
      <p className="fine-print">
        {blocked
          ? t(
              "Le marchand limite la lecture automatique. Vous pouvez ajouter l’envie manuellement ou fournir une page enregistrée.",
            )
          : t(
              "La cause n’est pas confirmée. Vous pouvez ajouter l’envie manuellement et nous transmettre les étapes qui reproduisent le problème.",
            )}
      </p>
      <div className="form-actions">
        <a href="/add" className="button secondary">
          {t("Ajouter manuellement")}
        </a>
        <a href="/admin?tab=operations#support" className="text-link">
          {t("Signaler un problème")}
        </a>
      </div>
    </div>
  );
}
