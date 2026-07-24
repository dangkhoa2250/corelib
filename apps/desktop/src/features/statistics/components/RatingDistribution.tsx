import type { RatingDistribution as RatingDistributionType } from "../../../domain/statistics";

const entries = [
  ["again", "Again"],
  ["hard", "Hard"],
  ["good", "Good"],
  ["easy", "Easy"],
] as const;

interface RatingDistributionProps {
  distribution: RatingDistributionType;
}

export function RatingDistribution({ distribution }: RatingDistributionProps) {
  const total = entries.reduce((sum, [key]) => sum + distribution[key], 0);
  const ariaLabel = total === 0
    ? "Rating distribution: no reviews"
    : `Rating distribution: ${entries
        .map(([key, label]) => `${label} ${distribution[key]}`)
        .join(", ")}`;

  return (
    <div className="rating-distribution" aria-label={ariaLabel}>
      <div className="rating-distribution__bar">
        {entries.map(([key]) => (
          <div
            className={`rating-distribution__segment rating-distribution__segment--${key}`}
            data-testid={`rating-${key}-segment`}
            key={key}
            style={{ flexGrow: total === 0 ? 0 : distribution[key] }}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="rating-distribution__labels">
        {entries.map(([key, label]) => (
          <span className={`rating-distribution__label rating-distribution__label--${key}`} key={key}>
            {label} <span>{distribution[key]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
