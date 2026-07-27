interface MiniSparklineProps {
  label: string;
  points: number[];
}

const WIDTH = 96;
const HEIGHT = 36;
const PADDING = 3;

function toPath(points: number[]): string | null {
  const finitePoints = points.filter(Number.isFinite);
  if (finitePoints.length < 2) return null;

  const minimum = Math.min(...finitePoints);
  const maximum = Math.max(...finitePoints);
  const drawableWidth = WIDTH - PADDING * 2;
  const drawableHeight = HEIGHT - PADDING * 2;

  return finitePoints
    .map((point, index) => {
      const x = PADDING + (drawableWidth * index) / (finitePoints.length - 1);
      const y = maximum === minimum
        ? HEIGHT / 2
        : HEIGHT - PADDING - ((point - minimum) / (maximum - minimum)) * drawableHeight;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function MiniSparkline({ label, points }: MiniSparklineProps) {
  const path = toPath(points);

  return (
    <svg
      className="statistics-mini-sparkline"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      {path ? (
        <path d={path} fill="none" stroke="var(--statistics-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      ) : (
        <line
          x1={PADDING}
          x2={WIDTH - PADDING}
          y1={HEIGHT / 2}
          y2={HEIGHT / 2}
          stroke="var(--border-subtle)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
