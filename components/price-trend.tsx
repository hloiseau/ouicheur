"use client";
import type { PricePoint } from "../lib/offer-observations.ts";
import { useI18n } from "./language";

export function PriceTrend({
  currency,
  points,
}: {
  currency: string;
  points: PricePoint[];
}) {
  const { t, money } = useI18n();
  const samples = points
    .map(({ checkedAt, price }) => ({ time: Date.parse(checkedAt), price }))
    .filter(({ time }) => Number.isFinite(time))
    .reverse();
  if (!samples.length) return null;
  const low = Math.min(...samples.map(({ price }) => price));
  const high = Math.max(...samples.map(({ price }) => price));
  const start = samples[0].time;
  const duration = samples.at(-1)!.time - start;
  const coordinates = samples.map(({ time, price }, index) => {
    const x = duration
      ? (time - start) / duration
      : index / Math.max(1, samples.length - 1);
    const y = high === low ? 0.5 : (price - low) / (high - low);
    return `${8 + x * 344},${72 - y * 64}`;
  });
  return (
    <div className="stack price-trend">
      <p>{t("Plus bas observé : {0}", money(low, currency))}</p>
      {coordinates.length > 1 && (
        <svg
          viewBox="0 0 360 80"
          role="img"
          aria-label={t("Évolution du prix vérifié")}
        >
          <polyline
            points={coordinates.join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </div>
  );
}
