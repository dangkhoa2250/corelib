export type StatisticsRange = "7d" | "30d" | "1y" | "all";

export interface ActivityBucket {
  localDay: string;
  activeMs: number;
}

export interface StatisticsOverview {
  activeMs: number;
  readingActiveMs: number;
  memoraActiveMs: number;
  currentStreak: number;
  activeDays: number;
  buckets: ActivityBucket[];
}

export interface RatingDistribution {
  again: number;
  hard: number;
  good: number;
  easy: number;
}

export interface DueForecast {
  today: number;
  next7Days: number;
  next30Days: number;
}

export interface CardStateCounts {
  new: number;
  learning: number;
  review: number;
  relearning: number;
  suspended: number;
}

export interface ReadingStatistics {
  activeMs: number;
  sessionCount: number;
  averageSessionMs: number | null;
  pageVisits: number;
  uniquePages: number;
  revisits: number;
  buckets: ActivityBucket[];
}

export interface DocumentStatistics {
  documentId: string;
  activeMs: number;
  sessionCount: number;
  averageSessionMs: number | null;
  pageVisits: number;
  uniquePages: number;
  revisits: number;
  coverage: number;
  realReviews: number;
  recallRate: number | null;
  againCount: number;
  lapses: number;
  buckets: ActivityBucket[];
}

export interface MemoraStatistics {
  activeMs: number;
  practiceActiveMs: number;
  sessionCount: number;
  realReviews: number;
  recallRate: number | null;
  ratingDistribution: RatingDistribution;
  averageAnswerMs: number | null;
  cardStates: CardStateCounts;
  lapseRate: number | null;
  activeDays: number;
  dueForecast: DueForecast;
  buckets: ActivityBucket[];
}

export interface DeckStatisticsDetail {
  deckId: string;
  activeMs: number;
  sessionCount: number;
  realReviews: number;
  recallRate: number | null;
  ratingDistribution: RatingDistribution;
  averageAnswerMs: number | null;
  cardStates: CardStateCounts;
  lapseRate: number | null;
  dueForecast: DueForecast;
  buckets: ActivityBucket[];
}

export interface StartActivitySessionInput {
  id: string;
  appKey: "reading" | "memora";
  activityKind: "reading" | "practice";
  contextKind?: "document" | "deck" | null;
  contextId?: string | null;
  occurredAt: string;
  localDay: string;
  timezoneOffsetMinutes: number;
}

export interface ActivityCheckpointInput {
  sessionId: string;
  occurredAt: string;
  activeMs: number;
  documentId?: string | null;
  page?: number | null;
  pageVisitIncrement: number;
}

export interface FinishActivitySessionInput {
  sessionId: string;
  occurredAt: string;
}
