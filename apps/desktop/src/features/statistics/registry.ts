import type { StatisticsPeriod } from "../../domain/statistics";
import type { ComponentType } from "react";
import { IconLibrary, IconMemora } from "../../app/icons";
import { getMemoraStatistics, getReadingStatistics } from "../../lib/statistics";

export interface AppMetricValue {
  id: string;
  label: string;
  value: number | null;
  unit: "milliseconds" | "count" | "ratio";
}

export interface ActivityBucket {
  date: string;
  value: number;
}

export interface AppStatisticsSummary {
  appKey: string;
  primary: AppMetricValue;
  secondary: AppMetricValue;
  buckets: ActivityBucket[];
}

export interface AppStatisticsDetail {
  appKey: string;
  metrics: AppMetricValue[];
  buckets: ActivityBucket[];
}

export interface ActivityChartSeries {
  appKey: string;
  title: string;
  buckets: ActivityBucket[];
}

export interface StatisticsAppDefinition {
  key: string;
  title: string;
  icon: ComponentType;
  loadSummary(period: StatisticsPeriod): Promise<AppStatisticsSummary>;
  loadDetail(period: StatisticsPeriod): Promise<AppStatisticsDetail>;
}

const ReadingIcon = () => IconLibrary({ size: 18 });
const MemoraIcon = () => IconMemora({ size: 18 });

export const DEFAULT_STATISTICS_APPS: StatisticsAppDefinition[] = [
  {
    key: "reading",
    title: "Reading",
    icon: ReadingIcon,
    async loadSummary(period) {
      const data = await getReadingStatistics(period);
      return {
        appKey: "reading",
        primary: { id: "active-time", label: "Active time", value: data.activeMs, unit: "milliseconds" },
        secondary: { id: "sessions", label: "Sessions", value: data.sessionCount, unit: "count" },
        buckets: data.buckets.map((bucket) => ({ date: bucket.localDay, value: Math.round(bucket.activeMs / 60_000) })),
      };
    },
    async loadDetail(period) {
      const data = await getReadingStatistics(period);
      return {
        appKey: "reading",
        metrics: [
          { id: "active-time", label: "Active time", value: data.activeMs, unit: "milliseconds" },
          { id: "sessions", label: "Sessions", value: data.sessionCount, unit: "count" },
          { id: "average-session", label: "Average session", value: data.averageSessionMs, unit: "milliseconds" },
          { id: "page-visits", label: "Page visits", value: data.pageVisits, unit: "count" },
          { id: "unique-pages", label: "Unique pages", value: data.uniquePages, unit: "count" },
          { id: "revisits", label: "Revisits", value: data.revisits, unit: "count" },
        ],
        buckets: data.buckets.map((bucket) => ({ date: bucket.localDay, value: Math.round(bucket.activeMs / 60_000) })),
      };
    },
  },
  {
    key: "memora",
    title: "Memora",
    icon: MemoraIcon,
    async loadSummary(period) {
      const data = await getMemoraStatistics(period);
      return {
        appKey: "memora",
        primary: { id: "active-time", label: "Active time", value: data.activeMs, unit: "milliseconds" },
        secondary: { id: "reviews", label: "Reviews", value: data.realReviews, unit: "count" },
        buckets: data.buckets.map((bucket) => ({ date: bucket.localDay, value: Math.round(bucket.activeMs / 60_000) })),
      };
    },
    async loadDetail(period) {
      const data = await getMemoraStatistics(period);
      return {
        appKey: "memora",
        metrics: [
          { id: "active-time", label: "Active time", value: data.activeMs, unit: "milliseconds" },
          { id: "practice-time", label: "Practice active time", value: data.practiceActiveMs, unit: "milliseconds" },
          { id: "sessions", label: "Sessions", value: data.sessionCount, unit: "count" },
          { id: "reviews", label: "Reviews", value: data.realReviews, unit: "count" },
          { id: "recall-rate", label: "Recall rate", value: data.recallRate, unit: "ratio" },
          { id: "average-answer", label: "Average answer time", value: data.averageAnswerMs, unit: "milliseconds" },
          { id: "lapse-rate", label: "Lapse rate", value: data.lapseRate, unit: "ratio" },
          { id: "active-days", label: "Active days", value: data.activeDays, unit: "count" },
          { id: "due-today", label: "Due today", value: data.dueForecast.today, unit: "count" },
          { id: "due-7-days", label: "Due next 7 days", value: data.dueForecast.next7Days, unit: "count" },
          { id: "due-30-days", label: "Due next 30 days", value: data.dueForecast.next30Days, unit: "count" },
        ],
        buckets: data.buckets.map((bucket) => ({ date: bucket.localDay, value: Math.round(bucket.activeMs / 60_000) })),
      };
    },
  },
];

const registry = new Map<string, StatisticsAppDefinition>();

export function registerApp(app: StatisticsAppDefinition): void {
  registry.set(app.key, app);
}

export function getApp(key: string): StatisticsAppDefinition | undefined {
  return registry.get(key);
}

export function getAllApps(): StatisticsAppDefinition[] {
  return Array.from(registry.values());
}

export function clearApps(): void {
  registry.clear();
}
