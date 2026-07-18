routerAdd("POST", "/api/corelib/analytics/daily-statistics", (e) => {
  if (!e.auth) return e.json(401, { message: "invalid_session" });
  if (e.auth.getString("status") !== "approved") return e.json(403, { message: "account_not_approved" });
  if (!e.auth.getBool("analyticsEnabled")) return e.json(403, { message: "analytics_disabled" });

  const data = e.requestInfo().body;

  const COMMON = ["schemaVersion", "localDay", "appKey", "activeMs", "activeDay", "sessionCount"];
  const APPROVED_KEYS = ["reading", "memora"];
  const APP_KEYS = {
    reading: COMMON.concat(["pageVisitCount", "uniquePageCount"]),
    memora: COMMON.concat(["realReviewCount", "againCount", "hardCount", "goodCount", "easyCount", "lapseCount"]),
  };

  if (typeof data.appKey !== "string" || !/^[a-z][a-z0-9_-]*$/.test(data.appKey) || !APPROVED_KEYS.includes(data.appKey)) {
    return e.json(400, { message: "invalid_statistics_snapshot" });
  }

  const allowedKeys = APP_KEYS[data.appKey];
  for (const k of Object.keys(data)) {
    if (!allowedKeys.includes(k)) {
      return e.json(400, { message: "invalid_statistics_snapshot" });
    }
  }

  if (data.schemaVersion !== 1) {
    return e.json(400, { message: "invalid_statistics_snapshot" });
  }

  if (typeof data.localDay !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(data.localDay)) {
    return e.json(400, { message: "invalid_statistics_snapshot" });
  }
  const parts = data.localDay.split("-").map(Number);
  const parsed = new Date(data.localDay + "T00:00:00Z");
  if (isNaN(parsed.getTime()) || parsed.getUTCFullYear() !== parts[0] || parsed.getUTCMonth() + 1 !== parts[1] || parsed.getUTCDate() !== parts[2]) {
    return e.json(400, { message: "invalid_statistics_snapshot" });
  }

  if (typeof data.activeDay !== "boolean") {
    return e.json(400, { message: "invalid_statistics_snapshot" });
  }

  const numericFields = ["activeMs", "sessionCount", "pageVisitCount", "uniquePageCount", "realReviewCount", "againCount", "hardCount", "goodCount", "easyCount", "lapseCount"];
  for (const field of numericFields) {
    if (data[field] !== undefined) {
      if (typeof data[field] !== "number" || !Number.isInteger(data[field]) || data[field] < 0) {
        return e.json(400, { message: "invalid_statistics_snapshot" });
      }
    }
  }

  if (data.realReviewCount !== undefined) {
    const sum = (data.againCount || 0) + (data.hardCount || 0) + (data.goodCount || 0) + (data.easyCount || 0);
    if (sum !== data.realReviewCount) {
      return e.json(400, { message: "invalid_statistics_snapshot" });
    }
  }

  if (data.lapseCount !== undefined && data.againCount !== undefined && data.lapseCount > data.againCount) {
    return e.json(400, { message: "invalid_statistics_snapshot" });
  }

  if (data.uniquePageCount !== undefined && data.pageVisitCount !== undefined && data.uniquePageCount > data.pageVisitCount) {
    return e.json(400, { message: "invalid_statistics_snapshot" });
  }

  try {
    const collection = e.app.findCollectionByNameOrId("daily_statistics");

    let existing;
    try {
      const records = e.app.findRecordsByFilter(
        "daily_statistics",
        "user = {:userId} && localDay = {:localDay} && appKey = {:appKey} && schemaVersion = {:schemaVersion}",
        "",
        1,
        0,
        { userId: e.auth.id, localDay: data.localDay, appKey: data.appKey, schemaVersion: 1 }
      );
      if (records.length > 0) existing = records[0];
    } catch (_) {}

    const record = existing || new Record(collection);
    record.set("user", e.auth.id);
    record.set("schemaVersion", data.schemaVersion);
    record.set("localDay", data.localDay);
    record.set("appKey", data.appKey);
    record.set("activeMs", data.activeMs);
    record.set("activeDay", data.activeDay);
    record.set("sessionCount", data.sessionCount);
    if (data.pageVisitCount !== undefined) record.set("pageVisitCount", data.pageVisitCount);
    if (data.uniquePageCount !== undefined) record.set("uniquePageCount", data.uniquePageCount);
    if (data.realReviewCount !== undefined) record.set("realReviewCount", data.realReviewCount);
    if (data.againCount !== undefined) record.set("againCount", data.againCount);
    if (data.hardCount !== undefined) record.set("hardCount", data.hardCount);
    if (data.goodCount !== undefined) record.set("goodCount", data.goodCount);
    if (data.easyCount !== undefined) record.set("easyCount", data.easyCount);
    if (data.lapseCount !== undefined) record.set("lapseCount", data.lapseCount);
    e.app.save(record);

    return e.json(204);
  } catch (err) {
    return e.json(400, { message: err.toString() });
  }
});
