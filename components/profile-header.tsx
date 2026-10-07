"use client";
import { useState } from "react";
import type { PublicProfile } from "../lib/gifts";
import { useI18n } from "./language";
import { Icon } from "./ui";

export type ProfileHeaderData = Pick<
  PublicProfile,
  "name" | "bio" | "avatar" | "banner" | "banner_position" | "socials"
>;

export function ProfileHeader({
  profile,
  preview = false,
}: {
  profile: ProfileHeaderData;
  preview?: boolean;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState(false);
  const Heading = preview ? "h3" : "h1";
  const socials: string[] = JSON.parse(profile.socials);
  return (
    <section
      className={`personal-profile${profile.banner ? "" : " profile-without-cover"}`}
    >
      {profile.banner && (
        <div className="profile-cover">
          <img
            className="profile-banner"
            src={profile.banner}
            alt=""
            style={{ objectPosition: `center ${profile.banner_position}%` }}
          />
        </div>
      )}
      <div className="profile-details">
        <div className="avatar">
          {profile.avatar ? (
            <img src={profile.avatar} alt="" />
          ) : (
            <span>
              {profile.name.slice(0, 1).toUpperCase() || <Icon name="user" />}
            </span>
          )}
        </div>
        <div className="profile-copy">
          <span className="profile-kicker">{t("Ma Ouichlist")}</span>
          <Heading aria-label={t("La Ouichlist de {0}", profile.name)}>
            {profile.name}
          </Heading>
          {profile.bio && <p className="profile-bio">{profile.bio}</p>}
          {socials.length > 0 && (
            <div className="social-links">
              {socials.map((url) => (
                <a
                  key={url}
                  href={url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <Icon name="link" size={14} />
                  {new URL(url).hostname.replace(/^www\./, "")}
                  <span aria-hidden="true">↗</span>
                </a>
              ))}
            </div>
          )}
        </div>
        {!preview && (
          <div className="profile-actions">
            <button
              type="button"
              className="button profile-share"
              aria-label={copied ? t("Lien copié !") : t("Partager")}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(location.href);
                  setCopied(true);
                  setShareError(false);
                } catch {
                  setShareError(true);
                }
              }}
            >
              <Icon name={copied ? "check" : "link"} size={16} />
              <span>{copied ? t("Lien copié !") : t("Partager")}</span>
            </button>
            <span className="share-feedback" role="status">
              {shareError
                ? t("Copiez l’adresse de cette page pour la partager.")
                : copied
                  ? t("Lien copié !")
                  : ""}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
