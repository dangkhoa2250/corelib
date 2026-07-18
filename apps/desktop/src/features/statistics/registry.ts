import type { StatisticsRange } from "../../domain/statistics";
import type { ComponentType } from "react";

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
  icon: ComponentType<{ className?: string }>;
  loadSummary(range: StatisticsRange): Promise<AppStatisticsSummary>;
  loadDetail(range: StatisticsRange): Promise<AppStatisticsDetail>;
}

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
