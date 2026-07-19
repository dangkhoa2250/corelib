routerAdd("POST", "/api/corelib/analytics/daily-statistics", (e) => {
  if (!e.auth) return e.json(401, { message: "invalid_session" });
  if (e.auth.getString("status") !== "approved") return e.json(403, { message: "account_not_approved" });
  if (!e.auth.getBool("analyticsEnabled")) return e.json(403, { message: "analytics_disabled" });

  const data = e.requestInfo().body;

  if (!data || JSON.stringify(data).length > 16384) {
    return e.json(400, { message: "invalid_statistics_snapshot" });
  }

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

  for (const requiredKey of allowedKeys) {
    if (data[requiredKey] === undefined) {
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
      if (typeof data[field] !== "number" || !Number.isSafeInteger(data[field]) || data[field] < 0) {
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

routerAdd("GET", "/api/corelib/admin/statistics", (e) => {
  if (!e.auth) return e.json(401, { message: "invalid_session" });
  if (e.auth.getString("status") !== "approved") return e.json(403, { message: "account_not_approved" });
  if (e.auth.getString("role") !== "admin") return e.json(403, { message: "admin_required" });

  const q = e.requestInfo().query || {};
  const range = q.range || "30d";
  const appKey = q.appKey || "all";

  const getISOWeek = (date) => {
    const dayNum = date.getUTCDay() || 7;
    const thursday = new Date(date);
    thursday.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((thursday - yearStart) / 86400000) + 1) / 7);
    return thursday.getUTCFullYear() + "-W" + String(weekNum).padStart(2, "0");
  };

  if (!["7d", "30d", "1y", "all"].includes(range)) return e.json(400, { message: "invalid_range" });
  if (!["all", "reading", "memora"].includes(appKey)) return e.json(400, { message: "invalid_appKey" });

  const now = new Date();
  let filter = "";
  const filterParams = {};
  if (range !== "all") {
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 365;
    const cutoff = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    filter = "localDay >= {:cutoff}";
    filterParams.cutoff = cutoff;
  }
  if (appKey !== "all") {
    filter = filter ? filter + " && appKey = {:appKey}" : "appKey = {:appKey}";
    filterParams.appKey = appKey;
  }

  try {
    const approvedUsers = e.app.findRecordsByFilter("users", "status = 'approved'", "", 0, 0).length;
    const analyticsEnabledUsers = e.app.findRecordsByFilter("users", "status = 'approved' && analyticsEnabled = true", "", 0, 0).length;
    const optInPercentage = approvedUsers > 0 ? parseFloat(((analyticsEnabledUsers / approvedUsers) * 100).toFixed(1)) : null;

    const records = filter
      ? e.app.findRecordsByFilter("daily_statistics", filter, "", 0, 0, filterParams)
      : e.app.findRecordsByFilter("daily_statistics", "", "", 0, 0);

    const contributingUserIds = new Set();
    const dayUsers = {};
    const weekUsers = {};
    const monthUsers = {};
    const appMs = { reading: 0, memora: 0 };
    const dayBuckets = {};
    let totalActiveMs = 0;
    let totalActiveDays = 0;
    let totalSessionCount = 0;
    let readingActiveMs = 0;
    let readingSessionCount = 0;
    let readingPageVisits = 0;
    const readingUserDays = {};
    let memoraActiveMs = 0;
    let memoraSessionCount = 0;
    let memoraRealReviewCount = 0;
    let memoraAgainCount = 0;
    let memoraHardCount = 0;
    let memoraGoodCount = 0;
    let memoraEasyCount = 0;
    let memoraLapseCount = 0;
    const memoraUserDays = {};
    const memoraReviewWeeks = {};

    for (const r of records) {
      const userId = r.getString("user");
      const localDay = r.getString("localDay");
      const app = r.getString("appKey");
      const activeMs = r.getInt("activeMs");
      const activeDay = r.getBool("activeDay");
      const sessionCount = r.getInt("sessionCount");

      contributingUserIds.add(userId);

      if (!dayBuckets[localDay]) dayBuckets[localDay] = { users: new Set(), activeMs: 0 };
      dayBuckets[localDay].users.add(userId);
      dayBuckets[localDay].activeMs += activeMs;

      if (!dayUsers[localDay]) dayUsers[localDay] = new Set();
      dayUsers[localDay].add(userId);

      const date = new Date(localDay + "T00:00:00Z");
      const isoWeek = getISOWeek(date);
      if (!weekUsers[isoWeek]) weekUsers[isoWeek] = new Set();
      weekUsers[isoWeek].add(userId);

      const month = localDay.substring(0, 7);
      if (!monthUsers[month]) monthUsers[month] = new Set();
      monthUsers[month].add(userId);

      totalActiveMs += activeMs;
      if (activeDay) totalActiveDays++;
      totalSessionCount += sessionCount;

      if (app === "reading") {
        appMs.reading += activeMs;
        readingActiveMs += activeMs;
        readingSessionCount += sessionCount;
        readingPageVisits += r.getInt("pageVisitCount");
        readingUserDays[userId] = readingUserDays[userId] || new Set();
        readingUserDays[userId].add(localDay);
      } else if (app === "memora") {
        appMs.memora += activeMs;
        memoraActiveMs += activeMs;
        memoraSessionCount += sessionCount;
        memoraRealReviewCount += r.getInt("realReviewCount");
        memoraAgainCount += r.getInt("againCount");
        memoraHardCount += r.getInt("hardCount");
        memoraGoodCount += r.getInt("goodCount");
        memoraEasyCount += r.getInt("easyCount");
        memoraLapseCount += r.getInt("lapseCount");
        memoraUserDays[userId] = memoraUserDays[userId] || new Set();
        memoraUserDays[userId].add(localDay);
        if (r.getInt("realReviewCount") > 0) {
          if (!memoraReviewWeeks[userId]) memoraReviewWeeks[userId] = {};
          if (!memoraReviewWeeks[userId][isoWeek]) memoraReviewWeeks[userId][isoWeek] = new Set();
          memoraReviewWeeks[userId][isoWeek].add(localDay);
        }
      }
    }

    const contributingUsers = contributingUserIds.size;

    const sortedDays = Object.keys(dayBuckets).sort();
    const bucketList = [];
    for (const day of sortedDays) {
      const b = dayBuckets[day];
      const dayContributing = b.users.size;
      const entry = { localDay: day, contributingUsers: dayContributing, insufficientSample: dayContributing < 5 };
      if (dayContributing >= 5) entry.activeMs = b.activeMs;
      bucketList.push(entry);
    }

    const response = {
      approvedUsers,
      analyticsEnabledUsers,
      optInPercentage,
      contributingUsers,
      insufficientSample: contributingUsers < 5,
      buckets: bucketList,
    };

    if (contributingUsers >= 5) {
      const dayValues = Object.values(dayUsers);
      if (dayValues.length > 0) {
        let sum = 0;
        for (const s of dayValues) sum += s.size;
        response.dau = parseFloat((sum / dayValues.length).toFixed(1));
      }

      const weekValues = Object.values(weekUsers);
      if (weekValues.length > 0) {
        let sum = 0;
        for (const s of weekValues) sum += s.size;
        response.wau = parseFloat((sum / weekValues.length).toFixed(1));
      }

      const monthValues = Object.values(monthUsers);
      if (monthValues.length > 0) {
        let sum = 0;
        for (const s of monthValues) sum += s.size;
        response.mau = parseFloat((sum / monthValues.length).toFixed(1));
      }

      response.activeMs = totalActiveMs;
      response.activeDays = totalActiveDays;
      response.averageActiveMs = totalActiveMs / contributingUsers;
      response.averageActiveDays = parseFloat((totalActiveDays / contributingUsers).toFixed(1));

      const totalAppMs = appMs.reading + appMs.memora;
      response.appAllocation = {};
      if (totalAppMs > 0) {
        response.appAllocation.reading = parseFloat(((appMs.reading / totalAppMs) * 100).toFixed(1));
        response.appAllocation.memora = parseFloat(((appMs.memora / totalAppMs) * 100).toFixed(1));
      } else {
        response.appAllocation.reading = 0;
        response.appAllocation.memora = 0;
      }

      const readingUserIds = Object.keys(readingUserDays);
      if (readingUserIds.length > 0) {
        if (readingUserIds.length < 5) {
          response.reading = {
            activeUsers: readingUserIds.length,
            contributingUsers: readingUserIds.length,
            insufficientSample: true,
          };
        } else {
          let returningCount = 0;
          for (const uid of readingUserIds) {
            if (readingUserDays[uid].size >= 2) returningCount++;
          }
          response.reading = {
            activeUsers: readingUserIds.length,
            contributingUsers: readingUserIds.length,
            insufficientSample: false,
            activeMs: readingActiveMs,
            sessionCount: readingSessionCount,
            pageVisitCount: readingPageVisits,
            returningUserRate: parseFloat((returningCount / readingUserIds.length).toFixed(3)),
          };
        }
      }

      const memoraUserIds = Object.keys(memoraUserDays);
      if (memoraUserIds.length > 0) {
        if (memoraUserIds.length < 5) {
          response.memora = {
            activeUsers: memoraUserIds.length,
            contributingUsers: memoraUserIds.length,
            insufficientSample: true,
          };
        } else {
          const recallSum = memoraHardCount + memoraGoodCount + memoraEasyCount;
          const totalReviews = memoraAgainCount + recallSum;
          let wlfTotalDays = 0;
          for (const uid of memoraUserIds) {
            const weeks = memoraReviewWeeks[uid];
            if (weeks) {
              for (const wk in weeks) wlfTotalDays += weeks[wk].size;
            }
          }
          const allWeeks = Object.keys(weekUsers).length;
          const frequencyDenominator = memoraUserIds.length * allWeeks;
          response.memora = {
            activeUsers: memoraUserIds.length,
            contributingUsers: memoraUserIds.length,
            insufficientSample: false,
            activeMs: memoraActiveMs,
            sessionCount: memoraSessionCount,
            realReviewCount: memoraRealReviewCount,
            againCount: memoraAgainCount,
            hardCount: memoraHardCount,
            goodCount: memoraGoodCount,
            easyCount: memoraEasyCount,
            lapseCount: memoraLapseCount,
            recallRate: totalReviews > 0 ? parseFloat((recallSum / totalReviews).toFixed(3)) : null,
            weeklyLearningFrequency: frequencyDenominator > 0 ? parseFloat((wlfTotalDays / frequencyDenominator).toFixed(3)) : null,
          };
        }
      }
    }

    return e.json(200, response);
  } catch (err) {
    return e.json(400, { message: err.toString() });
  }
});
