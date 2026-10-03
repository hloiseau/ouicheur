"use client";
import { useEffect, useState } from "react";
import { useI18n } from "./language";
import { Field } from "./ui";
import { browserBookmarklet } from "../lib/bookmarklet";
export function BrowserBookmark() {
  const { t } = useI18n();
  const [value, setValue] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    setValue(browserBookmarklet(location.origin));
  }, []);
  return (
    <section id="quick-add" className="panel stack">
      <h2>{t("Ajouter depuis un favori de navigateur")}</h2>
      <ol>
        <li>
          {t(
            "Créez un favori nommé « Ajouter à Ouicheur » dans votre navigateur.",
          )}
        </li>
        <li>{t("Remplacez son adresse par le code ci-dessous.")}</li>
        <li>
          {t(
            "Sur une page marchande, cliquez sur ce favori. Vous pouvez sélectionner un titre ou un lien avant de cliquer.",
          )}
        </li>
        <li>
          {t(
            "Connectez-vous à Ouicheur, vérifiez l’aperçu et enregistrez l’envie.",
          )}
        </li>
      </ol>
      <Field label={t("Adresse du favori")}>
        <textarea readOnly value={value} onFocus={(e) => e.target.select()} />
      </Field>
      <button
        className="button secondary"
        disabled={!value}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setNotice(t("Code copié."));
          } catch {
            setNotice(t("Sélectionnez et copiez le code ci-dessus."));
          }
        }}
      >
        {t("Copier le code du favori")}
      </button>
      {notice && <p role="status">{notice}</p>}
      <p>
        {t(
          "Le favori transmet uniquement le titre ou texte sélectionné et l’URL, sans lire l’historique ni aspirer la page. Rien n’est enregistré automatiquement.",
        )}
      </p>
      <p>
        {t(
          "Certains sites ou navigateurs bloquent les favoris JavaScript. Utilisez alors l’ajout mobile/PWA ou copiez le lien dans Ouicheur.",
        )}
      </p>
    </section>
  );
}
