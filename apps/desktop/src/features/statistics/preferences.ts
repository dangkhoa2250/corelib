const STORAGE_KEY = "library.statistics.preferences.v1";
const DEFAULT_BASE_COLOR = "#3778d4";

const HEX_RE = /^#[0-9a-f]{6}$/i;

const LIGHT_MIX = [18, 36, 55, 76, 96] as const;
const DARK_MIX = [28, 45, 62, 79, 96] as const;

export type StatisticsChartView = "heatmap" | "graph";

export interface StatisticsPreferences {
  baseColor: string;
  chartView: StatisticsChartView;
}

function hexToRgb(hex: string): [number, number, number] {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  const hr = Math.round(r).toString(16).padStart(2, "0");
  const hg = Math.round(g).toString(16).padStart(2, "0");
  const hb = Math.round(b).toString(16).padStart(2, "0");
  return `#${hr}${hg}${hb}`;
}

function srgbToHsl(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  const l = (max + min) / 2;

  if (d === 0) {
    return [0, 0, l];
  }

  const s = l <= 0.5 ? d / (max + min) : d / (2 - max - min);

  let h: number;
  if (max === rn) {
    h = ((gn - bn) / d) % 6;
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;

  return [h, s, l];
}

function hslToSrgb(
  h: number,
  s: number,
  l: number,
): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }

  const m2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const m1 = 2 * l - m2;
  const hue = h / 360;

  const hueToRgb = (m1: number, m2: number, h: number): number => {
    if (h < 0) h += 1;
    if (h > 1) h -= 1;
    if (h < 1 / 6) return m1 + (m2 - m1) * 6 * h;
    if (h < 1 / 2) return m2;
    if (h < 2 / 3) return m1 + (m2 - m1) * (2 / 3 - h) * 6;
    return m1;
  };

  const r = Math.round(hueToRgb(m1, m2, hue + 1 / 3) * 255);
  const g = Math.round(hueToRgb(m1, m2, hue) * 255);
  const b = Math.round(hueToRgb(m1, m2, hue - 1 / 3) * 255);

  return [r, g, b];
}

function normalizeHex(hex: string): string {
  if (!HEX_RE.test(hex)) {
    return DEFAULT_BASE_COLOR;
  }

  const lower = hex.toLowerCase();
  const [r, g, b] = hexToRgb(lower);
  const [h, s, l] = srgbToHsl(r, g, b);

  const clampedS = Math.max(0, Math.min(s, 0.9));
  const clampedL = Math.max(0.28, Math.min(l, 0.72));

  const [cr, cg, cb] = hslToSrgb(h, clampedS, clampedL);
  return rgbToHex(cr, cg, cb);
}

export function loadStatisticsPreferences(): StatisticsPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { baseColor: DEFAULT_BASE_COLOR, chartView: "heatmap" };
    }
    const parsed = JSON.parse(raw);
    const baseColor =
      typeof parsed.baseColor === "string"
        ? normalizeHex(parsed.baseColor)
        : DEFAULT_BASE_COLOR;
    const chartView =
      parsed.chartView === "heatmap" || parsed.chartView === "graph"
        ? (parsed.chartView as StatisticsChartView)
        : "heatmap";
    return { baseColor, chartView };
  } catch {
    return { baseColor: DEFAULT_BASE_COLOR, chartView: "heatmap" };
  }
}

export function saveStatisticsPreferences(value: StatisticsPreferences): void {
  try {
    const baseColor = normalizeHex(value.baseColor);
    const chartView =
      value.chartView === "heatmap" || value.chartView === "graph"
        ? value.chartView
        : "heatmap";
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ baseColor, chartView }),
    );
  } catch {
    // storage errors never break statistics
  }
}

export function deriveStatisticsPalette(
  baseColor: string,
  theme: "light" | "dark",
): string[] {
  const hex = HEX_RE.test(baseColor) ? baseColor.toLowerCase() : DEFAULT_BASE_COLOR;
  const mix = theme === "light" ? LIGHT_MIX : DARK_MIX;
  return mix.map(
    (pct) => `color-mix(in oklch, ${hex} ${pct}%, var(--surface-1))`,
  );
}
