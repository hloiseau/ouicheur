"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "./language";
import { api, Icon, Notice } from "./ui";
export function ImagePicker({
  value,
  onChange,
  allowUrl = true,
  label = "",
  onBusyChange,
  endpoint = "admin/images",
}: {
  value: string;
  onChange: (value: string) => void;
  allowUrl?: boolean;
  label?: string;
  onBusyChange?: (busy: boolean) => void;
  endpoint?: string;
}) {
  const { t } = useI18n();
  label ||= t("Image");
  const [url, setUrl] = useState("");
  const latestChange = useRef(onChange);
  useEffect(() => {
    latestChange.current = onChange;
  }, [onChange]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async (data: unknown) => {
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const result = await api<{ image: string }>(endpoint, data);
      latestChange.current(result.image);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  return (
    <div className="image-picker">
      <span className="field-label">{label}</span>
      {value && (
        <div className="image-preview">
          <img src={value} alt={t("Aperçu {0}", label.toLowerCase())} />
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() => onChange("")}
          >
            {t("Retirer l’image")}{" "}
          </button>
        </div>
      )}
      {allowUrl && (
        <div className="inline-input">
          <input
            aria-label={t("URL de {0}", label.toLowerCase())}
            type="url"
            disabled={busy}
            placeholder="https://…/image.jpg"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => {
              if (url && !busy) void send({ url });
            }}
          />
        </div>
      )}
      {busy && <p role="status">{t("Import…")}</p>}
      <label className="file-picker">
        <Icon name="upload" size={17} />
        <span>
          {allowUrl
            ? t("Ou choisir un fichier JPEG, PNG, WebP (5 Mo max.)")
            : t("Choisir une image")}
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
              setError(t("Image limitée à 5 Mo."));
              return;
            }
            const reader = new FileReader();
            setBusy(true);
            onBusyChange?.(true);
            reader.onerror = () => {
              setError(t("Impossible de lire cette image."));
              setBusy(false);
              onBusyChange?.(false);
            };
            reader.onload = () => {
              void send({ base64: String(reader.result).split(",")[1] });
            };
            reader.readAsDataURL(file);
          }}
        />
      </label>
      {error && <Notice error>{error}</Notice>}
    </div>
  );
}
