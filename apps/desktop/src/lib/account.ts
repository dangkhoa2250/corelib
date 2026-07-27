import { invoke } from "@tauri-apps/api/core";
import type { Invoke } from "./desktop";
import type {
  AccountApi,
  AccountStatus,
  AccountStatusResponse,
  SessionSnapshot,
  AccountProfile,
  AnalyticsEventInput,
  AccountGroup,
  FeatureDefinition,
  FeatureAssignmentInput,
  FeatureAssignment,
  AdminMetrics,
  AdminStatistics,
  DailyStatisticsSnapshot,
} from "../domain/account";

// Validation & Invocation helpers
export function registerAccount(
  payload: Record<string, any>,
  call: Invoke = invoke as Invoke,
): Promise<AccountStatusResponse> {
  const displayName = payload.displayName || "";
  const email = payload.email || "";
  const password = payload.password || "";

  if (typeof displayName !== "string" || displayName.trim().length === 0) {
    return Promise.reject(new Error("invalid_input"));
  }
  if (typeof email !== "string" || !email.includes("@")) {
    return Promise.reject(new Error("invalid_input"));
  }
  if (typeof password !== "string" || password.length < 12) {
    return Promise.reject(new Error("invalid_input"));
  }

  return call<AccountStatusResponse>("account_register", {
    displayName,
    email,
    password,
  });
}

export function signInAccount(
  payload: Record<string, any>,
  call: Invoke = invoke as Invoke,
): Promise<AccountStatusResponse> {
  const email = payload.email || "";
  const password = payload.password || "";
  const remember = Boolean(payload.remember);

  if (typeof email !== "string" || email.trim().length === 0) {
    return Promise.reject(new Error("invalid_credentials"));
  }
  if (typeof password !== "string" || password.length === 0) {
    return Promise.reject(new Error("invalid_credentials"));
  }

  return call<AccountStatusResponse>("account_sign_in", { email, password, remember });
}

export function loadAccountSession(call: Invoke = invoke as Invoke): Promise<SessionSnapshot> {
  return call<SessionSnapshot>("account_session");
}

export function signOutAccount(call: Invoke = invoke as Invoke): Promise<void> {
  return call<void>("account_sign_out");
}

export function setAnalyticsEnabled(
  enabled: boolean,
  call: Invoke = invoke as Invoke,
): Promise<AccountProfile> {
  return call<AccountProfile>("account_set_analytics_enabled", { enabled });
}

const ANALYTICS_SCHEMA: Record<string, string[]> = {
  app_opened: ["source"],
  feature_opened: ["featureKey"],
  feature_completed: ["featureKey"],
  handled_error: ["code"],
  updater_state: ["state", "targetVersion"],
};

export function trackAnalyticsEvent(
  event: AnalyticsEventInput,
  call: Invoke = invoke as Invoke,
): Promise<void> {
  const { installationId, name, appVersion, payload } = event;

  if (typeof installationId !== "string" || installationId.length === 0 || installationId.length > 80) {
    return Promise.reject(new Error("invalid_event"));
  }

  if (typeof appVersion !== "string" || appVersion.length === 0 || appVersion.length > 40) {
    return Promise.reject(new Error("invalid_event"));
  }

  const allowedKeys = ANALYTICS_SCHEMA[name];
  if (!allowedKeys) {
    return Promise.reject(new Error("invalid_event"));
  }

  const payloadObj = payload || {};
  if (typeof payloadObj !== "object" || payloadObj === null || Array.isArray(payloadObj)) {
    return Promise.reject(new Error("invalid_event"));
  }

  const keys = Object.keys(payloadObj);
  if (keys.length > 20) {
    return Promise.reject(new Error("invalid_event"));
  }

  const prohibited = ["query", "path", "content", "prompt", "location", "address"];

  for (const k of keys) {
    if (k.length > 80 || prohibited.includes(k) || !allowedKeys.includes(k)) {
      return Promise.reject(new Error("invalid_event"));
    }
    const val = payloadObj[k];
    const valType = typeof val;
    if (valType !== "string" && valType !== "number" && valType !== "boolean") {
      return Promise.reject(new Error("invalid_event"));
    }
    if (valType === "number" && !Number.isFinite(val)) {
      return Promise.reject(new Error("invalid_event"));
    }
    if (valType === "string" && val.length > 160) {
      return Promise.reject(new Error("invalid_event"));
    }
  }

  return call<void>("account_track_event", {
    installationId,
    name,
    appVersion,
    occurredAt: event.occurredAt,
    payload: payloadObj,
  });
}

// Client Class Implementation
export class PocketBaseAccountApiClient implements AccountApi {
  constructor(private call: Invoke = invoke as Invoke) {}

  register(displayName: string, email: string, password: string): Promise<AccountStatusResponse> {
    return registerAccount({ displayName, email, password }, this.call);
  }

  signIn(email: string, password: string, remember: boolean): Promise<AccountStatusResponse> {
    return signInAccount({ email, password, remember }, this.call);
  }

  currentSession(): Promise<SessionSnapshot> {
    return loadAccountSession(this.call);
  }

  signOut(): Promise<void> {
    return signOutAccount(this.call);
  }

  setAnalyticsEnabled(enabled: boolean): Promise<AccountProfile> {
    return setAnalyticsEnabled(enabled, this.call);
  }

  sendAnalytics(event: AnalyticsEventInput): Promise<void> {
    return trackAnalyticsEvent(event, this.call);
  }

  adminListUsers(status?: AccountStatus): Promise<AccountProfile[]> {
    return this.call<AccountProfile[]>("admin_list_users", { status });
  }

  adminSetStatus(userId: string, status: AccountStatus): Promise<AccountProfile> {
    return this.call<AccountProfile>("admin_set_user_status", { userId, status });
  }

  adminSetGroups(userId: string, groupIds: string[]): Promise<void> {
    return this.call<void>("admin_set_user_groups", { userId, groupIds });
  }

  adminListGroups(): Promise<AccountGroup[]> {
    return this.call<AccountGroup[]>("admin_list_groups");
  }

  adminCreateGroup(name: string, description: string): Promise<AccountGroup> {
    return this.call<AccountGroup>("admin_create_group", { name, description });
  }

  adminListFeatures(): Promise<FeatureDefinition[]> {
    return this.call<FeatureDefinition[]>("admin_list_features");
  }

  adminCreateFeature(key: string, description: string): Promise<FeatureDefinition> {
    return this.call<FeatureDefinition>("admin_create_feature", { key, description });
  }

  adminSetFeatureAssignment(input: FeatureAssignmentInput): Promise<FeatureAssignment> {
    return this.call<FeatureAssignment>("admin_set_feature_assignment", {
      featureKey: input.featureKey,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      enabled: input.enabled,
    });
  }

  adminMetrics(): Promise<AdminMetrics> {
    return this.call<AdminMetrics>("admin_get_metrics");
  }

  adminDeleteUser(userId: string): Promise<void> {
    return this.call<void>("admin_delete_user", { userId });
  }

  upsertDailyStatistics(expectedAccountId: string, input: DailyStatisticsSnapshot): Promise<void> {
    return this.call<void>("account_upsert_daily_statistics", {
      expectedAccountId,
      input,
    });
  }

  adminStatistics(range: string, appKey: string): Promise<AdminStatistics> {
    return this.call<AdminStatistics>("admin_get_statistics", { range, appKey });
  }
}
