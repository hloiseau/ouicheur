import type { CSSProperties } from "react";

export type Appearance = {
  background: string;
  accent: string;
  banner_position: number;
  layout: "compact" | "comfortable";
};

export const defaultAppearance: Appearance = {
  background: "",
  accent: "#ff6682",
  banner_position: 50,
  layout: "compact",
};

function luminance(rgb: number[]) {
  return rgb.reduce((sum, channel, i) => {
    const value = channel / 255;
    return (
      sum +
      (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) *
        [0.2126, 0.7152, 0.0722][i]
    );
  }, 0);
}

// Keep custom accents readable on both surfaces, including black/white picks.
export function appearanceStyle(
  appearance: Pick<Appearance, "accent">,
): CSSProperties {
  const color = /^#[a-f\d]{6}$/i.test(appearance.accent)
    ? appearance.accent
    : defaultAppearance.accent;
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  let highlight = [...rgb];
  while (luminance(highlight) < 0.3)
    highlight = highlight.map((channel) => Math.min(255, channel + 12));
  let lightHighlight = [...rgb];
  while (luminance(lightHighlight) > 0.13)
    lightHighlight = lightHighlight.map((channel) => Math.max(0, channel - 12));
  return {
    "--profile-color": color,
    "--profile-ink": luminance(rgb) > 0.179 ? "#000000" : "#ffffff",
    "--accent": `light-dark(rgb(${lightHighlight.join(" ")}), rgb(${highlight.join(" ")}))`,
  } as CSSProperties;
}
