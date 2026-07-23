import { useCallback, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

export type GraphMode = "daily" | "weekly" | "cumulative";

export interface ActivityBucket {
  date: string;
  value: number;
}

export interface GraphAxisLabel {
  idx: number;
  label: string;
}

export interface ActivityGraphProps {
  buckets: ActivityBucket[];
  mode: GraphMode;
  onModeChange(mode: GraphMode): void;
  valueLabel: string;
  palette?: string[];
  allowedModes?: GraphMode[];
}

const VB_W = 600;
const VB_H = 200;
const PT = 20;
const PR = 20;
const PB = 30;
const PL = 50;
const PW = VB_W - PL - PR;
const PH = VB_H - PT - PB;

function parseDate(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function getMonday(dateStr: string): string {
  const { y, m, d } = parseDate(dateStr);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const mon = new Date(date);
  mon.setDate(date.getDate() - diff);
  return toDateStr(mon.getFullYear(), mon.getMonth() + 1, mon.getDate());
}

export function aggregateWeekly(buckets: ActivityBucket[]): ActivityBucket[] {
  const map = new Map<string, number>();
  for (const b of buckets) {
    const key = getMonday(b.date);
    map.set(key, (map.get(key) || 0) + b.value);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

export function cumulativeSum(buckets: ActivityBucket[]): ActivityBucket[] {
  let sum = 0;
  return buckets.map((b) => {
    sum += b.value;
    return { date: b.date, value: sum };
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatShortDate(dateStr: string): string {
  const { m, d } = parseDate(dateStr);
  return `${MONTHS[m - 1]} ${d}`;
}

export function graphAxisLabels(data: ActivityBucket[], mode: GraphMode): GraphAxisLabel[] {
  if (data.length === 0) return [];
  if (data.length === 1) return [{ idx: 0, label: formatShortDate(data[0].date) }];

  const maxLabels = mode === "weekly" ? 6 : 7;
  const labelCount = Math.min(data.length, maxLabels);
  const indices = new Set<number>();
  for (let index = 0; index < labelCount; index++) {
    indices.add(Math.round((index * (data.length - 1)) / (labelCount - 1)));
  }

  return Array.from(indices, (idx) => ({ idx, label: formatShortDate(data[idx].date) }));
}

const MODES: GraphMode[] = ["daily", "weekly", "cumulative"];

export function ActivityGraph({
  buckets,
  mode,
  onModeChange,
  valueLabel,
  palette,
  allowedModes = MODES,
}: ActivityGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);

  const data = useMemo(() => {
    if (mode === "weekly") return aggregateWeekly(buckets);
    if (mode === "cumulative") return cumulativeSum(buckets);
    return buckets;
  }, [buckets, mode]);

  const maxY = useMemo(() => Math.max(...data.map((b) => b.value), 1), [data]);
  const n = data.length;

  const xScale = useCallback((i: number) => {
    if (n <= 1) return PL + PW / 2;
    return PL + (i / (n - 1)) * PW;
  }, [n]);

  const yScale = useCallback((v: number) => {
    return PT + PH - (v / maxY) * PH;
  }, [maxY]);

  const linePath = useMemo(() => {
    if (n === 0) return "";
    return data
      .map((b, i) => {
        const x = xScale(i);
        const y = yScale(b.value);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [data, xScale, yScale, n]);

  const areaPath = useMemo(() => {
    if (n === 0) return "";
    const top = data
      .map((b, i) => {
        const x = xScale(i);
        const y = yScale(b.value);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    const lastX = xScale(n - 1);
    const firstX = xScale(0);
    const bottom = PT + PH;
    return `${top} L${lastX.toFixed(1)},${bottom} L${firstX.toFixed(1)},${bottom} Z`;
  }, [data, xScale, yScale, n]);

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = Math.max(1, Math.ceil(maxY / 4));
    for (let v = 0; v <= maxY; v += step) {
      ticks.push(v);
    }
    if (ticks[ticks.length - 1] < maxY) ticks.push(maxY);
    return ticks;
  }, [maxY]);

  const xLabels = useMemo(() => graphAxisLabels(data, mode), [data, mode]);

  const describePoint = useCallback(
    (bucket: ActivityBucket) => `${mode === "weekly" ? `Week of ${bucket.date}` : bucket.date}: ${bucket.value} ${valueLabel}`,
    [mode, valueLabel],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<SVGSVGElement>) => {
      let next = focusedIdx;
      switch (e.key) {
        case "ArrowRight":
          next = Math.min(focusedIdx + 1, n - 1);
          break;
        case "ArrowLeft":
          next = Math.max(focusedIdx - 1, 0);
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = n - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      setFocusedIdx(next);
      const cx = (xScale(next) / VB_W) * (containerRef.current?.getBoundingClientRect().width ?? PW);
      const cy = (yScale(data[next].value) / VB_H) * (containerRef.current?.getBoundingClientRect().height ?? PH) - 30;
      setTooltip({
        x: cx,
        y: cy,
        content: describePoint(data[next]),
      });
    },
    [focusedIdx, n, data, xScale, yScale, describePoint],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (n === 0) return;
      const rect = svgRef.current?.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!rect || !containerRect) return;

      const svgX = ((e.clientX - rect.left) / rect.width) * VB_W;
      let nearest = 0;
      let minDist = Infinity;
      for (let i = 0; i < n; i++) {
        const px = xScale(i);
        const dist = Math.abs(px - svgX);
        if (dist < minDist) {
          minDist = dist;
          nearest = i;
        }
      }

      setHoveredIdx(nearest);
      setTooltip({
        x: e.clientX - containerRect.left + 10,
        y: e.clientY - containerRect.top - 30,
        content: describePoint(data[nearest]),
      });
    },
    [n, data, xScale, describePoint],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredIdx(null);
    setTooltip(null);
  }, []);

  const handlePointFocus = useCallback(
    (idx: number) => {
      setFocusedIdx(idx);
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      const cx = (xScale(idx) / VB_W) * containerRect.width;
      const cy = (yScale(data[idx].value) / VB_H) * containerRect.height - 30;
      setTooltip({
        x: cx,
        y: cy,
        content: describePoint(data[idx]),
      });
    },
    [data, xScale, yScale, describePoint],
  );

  const handlePointBlur = useCallback(() => {
    setTooltip(null);
  }, []);

  const modeButtons = (
    <div className="statistics-graph__mode-bar">
      {allowedModes.map((m) => (
        <button
          key={m}
          className="statistics-graph__mode-btn"
          aria-pressed={mode === m}
          onClick={() => onModeChange(m)}
        >
          {m.charAt(0).toUpperCase() + m.slice(1)}
        </button>
      ))}
    </div>
  );
  const chartStyle = palette?.length
    ? ({ "--chart-line": palette[4], "--chart-fill": palette[2] } as CSSProperties)
    : undefined;

  if (buckets.length === 0) {
    return (
      <div className="statistics-graph" ref={containerRef} data-testid="activity-graph" style={chartStyle}>
        {modeButtons}
        <div className="statistics-empty-state">No data</div>
      </div>
    );
  }

  return (
    <div
      className="statistics-graph"
      ref={containerRef}
      data-testid="activity-graph"
      style={{ ...chartStyle, position: "relative" }}
    >
      {modeButtons}
      <svg
        ref={svgRef}
        role="img"
        aria-label={`${valueLabel.replace(/ /g, "-").toLowerCase()} trend, ${mode} view`}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        onKeyDown={handleKeyDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        tabIndex={0}
        focusable="true"
      >
        {yTicks.map((v) => {
          const y = yScale(v);
          return (
            <g key={`y-${v}`}>
              <line
                x1={PL}
                y1={y}
                x2={VB_W - PR}
                y2={y}
                stroke="var(--border-subtle)"
                strokeWidth={1}
              />
              <text
                x={PL - 6}
                y={y + 3}
                textAnchor="end"
                fill="var(--text-secondary)"
                fontSize={10}
              >
                {v}
              </text>
            </g>
          );
        })}
        {areaPath && (
          <path
            d={areaPath}
            fill="var(--chart-fill, currentColor)"
            fillOpacity={0.15}
          />
        )}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="var(--chart-line, currentColor)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}
        {xLabels.map(({ idx, label }) => (
          <text
            key={`xl-${idx}`}
            x={xScale(idx)}
            y={VB_H - 8}
            textAnchor="middle"
            fill="var(--text-secondary)"
            fontSize={10}
          >
            {label}
          </text>
        ))}
        {data.map((b, i) => {
          const isActive = focusedIdx === i || hoveredIdx === i;
          return (
            <circle
              key={i}
              cx={xScale(i)}
              cy={yScale(b.value)}
              r={isActive ? 5 : 3}
              fill="var(--chart-line, currentColor)"
              tabIndex={isActive ? 0 : -1}
              onFocus={() => handlePointFocus(i)}
              onBlur={handlePointBlur}
              aria-label={describePoint(b)}
            />
          );
        })}
      </svg>
      {tooltip && (
        <div
          className="statistics-graph__tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
}
