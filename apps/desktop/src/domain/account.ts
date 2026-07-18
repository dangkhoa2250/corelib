export type AccountStatus = "pending" | "approved" | "rejected";
export type AccountRole = "member" | "admin";

export interface AccountProfile {
  id: string;
  displayName: string;
  email: string;
  status: AccountStatus;
  role: AccountRole;
  analyticsEnabled: boolean;
}

export interface Entitlements {
  featureKeys: string[];
  refreshedAt: string;
}

export interface SessionSnapshot {
  profile: AccountProfile;
  entitlements: Entitlements;
}

export type AccountStatusResponse = "pending" | "rejected" | { approved: SessionSnapshot };

export interface AnalyticsEventInput {
  installationId: string;
  name: string;
  appVersion: string;
  occurredAt: string;
  payload: Record<string, any>;
}

export interface AccountGroup {
  id: string;
  name: string;
  description: string;
}

export interface FeatureDefinition {
  id: string;
  key: string;
  description: string;
}

export interface FeatureAssignmentInput {
  featureKey: string;
  subjectType: "user" | "group";
  subjectId: string;
  enabled: boolean;
}

export interface FeatureAssignment {
  id: string;
  featureKey: string;
  subjectType: "user" | "group";
  subjectId: string;
  enabled: boolean;
}

export interface MetricCount {
  name: string;
  count: number;
}

export interface MetricVersion {
  appVersion: string;
  count: number;
}

export interface MetricErrorCode {
  code: string;
  count: number;
}

export interface AdminMetrics {
  approvedUsers: number;
  pendingUsers: number;
  activeUsersLast30Days: number;
  eventsByName: MetricCount[];
  versions: MetricVersion[];
  errorsByCode: MetricErrorCode[];
}

export interface DailyStatisticsSnapshot {
  schemaVersion: 1;
  localDay: string;
  appKey: "reading" | "memora";
  activeMs: number;
  activeDay: boolean;
  sessionCount: number;
  pageVisitCount?: number;
  uniquePageCount?: number;
  realReviewCount?: number;
  againCount?: number;
  hardCount?: number;
  goodCount?: number;
  easyCount?: number;
  lapseCount?: number;
}

export interface AdminStatisticsBucket {
  localDay: string;
  contributingUsers: number;
  insufficientSample: boolean;
  activeMs?: number;
}

export interface AdminAppAggregate {
  activeUsers: number;
  activeMs: number;
  sessionCount: number;
  pageVisitCount?: number;
  realReviewCount?: number;
  againCount?: number;
  hardCount?: number;
  goodCount?: number;
  easyCount?: number;
  lapseCount?: number;
  recallRate?: number | null;
  returningUserRate?: number | null;
  weeklyLearningFrequency?: number | null;
}

export interface AdminStatistics {
  approvedUsers: number;
  analyticsEnabledUsers: number;
  optInPercentage: number;
  contributingUsers: number;
  insufficientSample: boolean;
  dau?: number;
  wau?: number;
  mau?: number;
  activeMs?: number;
  activeDays?: number;
  averageActiveMs?: number | null;
  averageActiveDays?: number | null;
  appAllocation?: Record<string, number>;
  reading?: AdminAppAggregate;
  memora?: AdminAppAggregate;
  buckets: AdminStatisticsBucket[];
}

export interface AccountApi {
  register(displayName: string, email: string, password: string): Promise<AccountStatusResponse>;
  signIn(email: string, password: string, remember: boolean): Promise<AccountStatusResponse>;
  currentSession(): Promise<SessionSnapshot>;
  signOut(): Promise<void>;
  setAnalyticsEnabled(enabled: boolean): Promise<AccountProfile>;
  sendAnalytics(event: AnalyticsEventInput): Promise<void>;
  adminListUsers(status?: AccountStatus): Promise<AccountProfile[]>;
  adminSetStatus(userId: string, status: AccountStatus): Promise<AccountProfile>;
  adminSetGroups(userId: string, groupIds: string[]): Promise<void>;
  adminListGroups(): Promise<AccountGroup[]>;
  adminCreateGroup(name: string, description: string): Promise<AccountGroup>;
  adminListFeatures(): Promise<FeatureDefinition[]>;
  adminCreateFeature(key: string, description: string): Promise<FeatureDefinition>;
  adminSetFeatureAssignment(input: FeatureAssignmentInput): Promise<FeatureAssignment>;
  adminMetrics(): Promise<AdminMetrics>;
  adminDeleteUser(userId: string): Promise<void>;
  upsertDailyStatistics(input: DailyStatisticsSnapshot): Promise<void>;
  adminStatistics(range: string, appKey: string): Promise<AdminStatistics>;
}

export function hasFeature(entitlements: Entitlements | null | undefined, key: string): boolean {
  if (!entitlements || !entitlements.featureKeys) return false;
  return entitlements.featureKeys.includes(key);
}
