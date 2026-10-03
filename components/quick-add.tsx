"use client";
import type { GiftPriority } from "../lib/priority-labels";
import { useEffect, useState } from "react";
import { GiftEditor } from "./admin-gifts";
import { api, Notice } from "./ui";
import { useI18n } from "./language";
export function QuickAdd({ url }: { url: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<{
    profile: { currency: string };
    priorities: GiftPriority[];
    categories: { id: string; name: string }[];
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void api<typeof data>("admin")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <h1>{t("Ajout mobile")}</h1>
      <p>
        {t(
          "Installez Ouicheur depuis le menu de votre navigateur pour recevoir les liens partagés par les autres applications. Une connexion propriétaire et une confirmation sont toujours nécessaires.",
        )}
      </p>
      {error && <Notice error>{error}</Notice>}
      {data && (
        <GiftEditor
          gift={null}
          initialUrl={url}
          priorities={data.priorities}
          categories={data.categories}
          currency={data.profile.currency}
          onDone={() => location.assign("/admin")}
          onSaved={() => location.assign("/admin")}
        />
      )}
    </>
  );
}
