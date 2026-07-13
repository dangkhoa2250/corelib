// Guest: Register route
routerAdd("POST", "/api/corelib/register", (e) => {
  const data = e.requestInfo().body;
  const displayName = data.displayName || "";
  const email = data.email || "";
  const password = data.password || "";
  const passwordConfirm = data.passwordConfirm || "";

  // Validation
  if (!displayName || displayName.trim().length === 0 || displayName.length > 80) {
    return e.json(400, { message: "invalid_input" });
  }

  if (!email || !email.includes("@")) {
    return e.json(400, { message: "invalid_input" });
  }

  if (password.length < 12 || password !== passwordConfirm) {
    return e.json(400, { message: "invalid_input" });
  }

  // Check if email already exists
  try {
    const existing = e.app.findAuthRecordByEmail("users", email);
    if (existing) {
      return e.json(409, { message: "email_taken" });
    }
  } catch (err) {
    // Expected: findAuthRecordByEmail throws when not found
  }

  // Create users auth record
  const usersCollection = e.app.findCollectionByNameOrId("users");
  const record = new Record(usersCollection);

  record.set("displayName", displayName.trim());
  record.set("email", email);
  record.setPassword(password);
  record.set("status", "pending");
  record.set("role", "member");
  record.set("analyticsEnabled", false);
  record.set("emailVisibility", true);

  try {
    e.app.save(record);
  } catch (err) {
    return e.json(400, { message: "invalid_input" });
  }

  return e.json(200, { status: "pending" });
});

// Guest: Sign-in route
routerAdd("POST", "/api/corelib/sign-in", (e) => {
  const safeProfile = (rec) => {
    return {
      id: rec.id,
      displayName: rec.getString("displayName"),
      email: rec.getString("email"),
      status: rec.getString("status"),
      role: rec.getString("role"),
      analyticsEnabled: rec.getBool("analyticsEnabled"),
    };
  };

  const data = e.requestInfo().body;
  const email = data.email || "";
  const password = data.password || "";

  if (!email || !password) {
    return e.json(401, { message: "invalid_credentials" });
  }

  let record;
  try {
    record = e.app.findAuthRecordByEmail("users", email);
  } catch (err) {
    return e.json(401, { message: "invalid_credentials" });
  }

  if (!record.validatePassword(password)) {
    return e.json(401, { message: "invalid_credentials" });
  }

  const status = record.getString("status");
  if (status !== "approved") {
    return e.json(200, { status: status });
  }

  // Approved account: return token and profile
  try {
    const token = record.newAuthToken();
    return e.json(200, {
      status: "approved",
      token: token,
      profile: safeProfile(record)
    });
  } catch (err) {
    return e.json(400, { message: err.toString() });
  }
});

// Approved token: Me route
routerAdd("GET", "/api/corelib/me", (e) => {
  const safeProfile = (rec) => {
    return {
      id: rec.id,
      displayName: rec.getString("displayName"),
      email: rec.getString("email"),
      status: rec.getString("status"),
      role: rec.getString("role"),
      analyticsEnabled: rec.getBool("analyticsEnabled"),
    };
  };

  const resolveFeatureKeys = (app, userId) => {
    const featureKeys = new Set();
    
    // 1. Fetch group members
    let groupMembers = [];
    try {
      groupMembers = app.findRecordsByFilter("group_members", "user = {:userId}", "", 0, 0, { userId: userId });
    } catch (_) {}
    
    const groupIds = [];
    for (const gm of groupMembers) {
      groupIds.push(gm.getString("group"));
    }

    // 2. Fetch group-level assignments
    if (groupIds.length > 0) {
      let groupFilter = "subjectType = 'group' && (";
      const params = {};
      for (let i = 0; i < groupIds.length; i++) {
        groupFilter += "subjectId = {:g" + i + "}";
        params["g" + i] = groupIds[i];
        if (i < groupIds.length - 1) {
          groupFilter += " || ";
        }
      }
      groupFilter += ")";
      
      let groupAssignments = [];
      try {
        groupAssignments = app.findRecordsByFilter("feature_assignments", groupFilter, "", 0, 0, params);
      } catch (_) {}

      for (const ga of groupAssignments) {
        if (ga.getBool("enabled")) {
          try {
            const feature = app.findRecordById("features", ga.getString("feature"));
            featureKeys.add(feature.getString("key"));
          } catch (_) {}
        }
      }
    }

    // 3. Fetch user-level assignments (and override group assignments)
    let userAssignments = [];
    try {
      userAssignments = app.findRecordsByFilter("feature_assignments", "subjectType = 'user' && subjectId = {:userId}", "", 0, 0, { userId: userId });
    } catch (_) {}

    for (const ua of userAssignments) {
      try {
        const feature = app.findRecordById("features", ua.getString("feature"));
        const key = feature.getString("key");
        if (ua.getBool("enabled")) {
          featureKeys.add(key);
        } else {
          featureKeys.delete(key);
        }
      } catch (_) {}
    }

    return Array.from(featureKeys).sort();
  };

  if (!e.auth) {
    return e.json(401, { message: "invalid_session" });
  }

  if (e.auth.getString("status") !== "approved") {
    return e.json(403, { message: "account_not_approved" });
  }

  try {
    const featureKeys = resolveFeatureKeys(e.app, e.auth.id);
    return e.json(200, {
      profile: safeProfile(e.auth),
      entitlements: {
        featureKeys: featureKeys,
        refreshedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    console.log("ME_ERROR: " + err + "\nStack: " + err.stack);
    return e.json(400, { message: err.toString() });
  }
});

// Approved token: Set analytics preference
routerAdd("POST", "/api/corelib/me/analytics", (e) => {
  const safeProfile = (rec) => {
    return {
      id: rec.id,
      displayName: rec.getString("displayName"),
      email: rec.getString("email"),
      status: rec.getString("status"),
      role: rec.getString("role"),
      analyticsEnabled: rec.getBool("analyticsEnabled"),
    };
  };

  if (!e.auth) {
    return e.json(401, { message: "invalid_session" });
  }

  if (e.auth.getString("status") !== "approved") {
    return e.json(403, { message: "account_not_approved" });
  }

  const data = e.requestInfo().body;
  const enabled = data.enabled === true;

  try {
    const before = safeProfile(e.auth);
    e.auth.set("analyticsEnabled", enabled);
    e.app.save(e.auth);
    const after = safeProfile(e.auth);

    // Audit log
    const auditCollection = e.app.findCollectionByNameOrId("admin_audit_logs");
    const log = new Record(auditCollection);
    log.set("actor", e.auth.id);
    log.set("action", "analytics_preference_changed");
    log.set("targetType", "user");
    log.set("targetId", e.auth.id);
    log.set("before", before);
    log.set("after", after);
    e.app.save(log);

    return e.json(200, after);
  } catch (err) {
    return e.json(400, { message: err.toString() });
  }
});

// Approved token: Analytics route
routerAdd("POST", "/api/corelib/analytics", (e) => {
  if (!e.auth) return e.json(401, { message: "invalid_session" });
  if (e.auth.getString("status") !== "approved") return e.json(403, { message: "account_not_approved" });

  // Check if analyticsEnabled is true
  if (!e.auth.getBool("analyticsEnabled")) {
    return e.json(403, { message: "analytics_disabled" });
  }

  const data = e.requestInfo().body;
  const installationId = data.installationId || "";
  const name = data.name || "";
  const appVersion = data.appVersion || "";
  const occurredAtStr = data.occurredAt || "";
  const payload = data.payload || {};

  // Enforce maximum 80-character installation IDs
  if (typeof installationId !== "string" || installationId.length === 0 || installationId.length > 80) {
    return e.json(400, { message: "invalid_event" });
  }

  // Enforce maximum 40-character app versions
  if (typeof appVersion !== "string" || appVersion.length === 0 || appVersion.length > 40) {
    return e.json(400, { message: "invalid_event" });
  }

  // Use this exact allowlist and payload keys
  const ANALYTICS_SCHEMA = {
    app_opened: ["source"],
    feature_opened: ["featureKey"],
    feature_completed: ["featureKey"],
    handled_error: ["code"],
    updater_state: ["state", "targetVersion"],
  };

  const allowedNames = Object.keys(ANALYTICS_SCHEMA);
  if (typeof name !== "string" || !allowedNames.includes(name)) {
    return e.json(400, { message: "invalid_event" });
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return e.json(400, { message: "invalid_event" });
  }

  // Enforce maximum 20 payload keys
  const payloadKeys = Object.keys(payload);
  if (payloadKeys.length > 20) {
    return e.json(400, { message: "invalid_event" });
  }

  const prohibited = ["query", "path", "content", "prompt", "location", "address"];
  const allowedKeys = ANALYTICS_SCHEMA[name] || [];

  for (const k of payloadKeys) {
    // Enforce 80-character keys, prohibited payload keys and schema allowlist
    if (k.length > 80 || prohibited.includes(k) || !allowedKeys.includes(k)) {
      return e.json(400, { message: "invalid_event" });
    }
    const val = payload[k];
    const valType = typeof val;
    // Accept only strings, finite numbers, and booleans as payload values
    if (valType !== "string" && valType !== "number" && valType !== "boolean") {
      return e.json(400, { message: "invalid_event" });
    }
    if (valType === "number" && !Number.isFinite(val)) {
      return e.json(400, { message: "invalid_event" });
    }
    // Enforce 160-character strings
    if (valType === "string" && val.length > 160) {
      return e.json(400, { message: "invalid_event" });
    }
  }

  // Save occurredAt supplied by the client only if it parses as RFC 3339 and is no more than 24 hours in the future; otherwise use server time.
  let occurredAt = new Date().toISOString();
  if (occurredAtStr) {
    const rfc3339Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
    if (rfc3339Regex.test(occurredAtStr)) {
      const parsedDate = new Date(occurredAtStr);
      if (!isNaN(parsedDate.getTime())) {
        const futureLimit = new Date(Date.now() + 24 * 60 * 60 * 1000);
        if (parsedDate <= futureLimit) {
          occurredAt = parsedDate.toISOString();
        }
      }
    }
  }

  try {
    const aeCollection = e.app.findCollectionByNameOrId("analytics_events");
    const record = new Record(aeCollection);
    record.set("user", e.auth.id);
    record.set("installationId", installationId);
    record.set("name", name);
    record.set("appVersion", appVersion);
    record.set("occurredAt", occurredAt);
    record.set("payload", payload);
    e.app.save(record);

    return e.json(204); // Returns 204 No Content upon success
  } catch (err) {
    return e.json(400, { message: err.toString() });
  }
});

// Admin-only: List users
routerAdd("GET", "/api/corelib/admin/users", (e) => {
  const safeProfile = (rec) => {
    return {
      id: rec.id,
      displayName: rec.getString("displayName"),
      email: rec.getString("email"),
      status: rec.getString("status"),
      role: rec.getString("role"),
      analyticsEnabled: rec.getBool("analyticsEnabled"),
    };
  };

  if (!e.auth) return e.json(401, { message: "invalid_session" });
  if (e.auth.getString("status") !== "approved") return e.json(403, { message: "account_not_approved" });
  if (e.auth.getString("role") !== "admin") return e.json(403, { message: "admin_required" });

  try {
    const users = e.app.findRecordsByFilter("users", "", "email", 0, 0);
    const result = [];
    for (const u of users) {
      const groupMembers = e.app.findRecordsByFilter("group_members", "user = {:userId}", "", 0, 0, { userId: u.id });
      const groupIds = [];
      for (const gm of groupMembers) {
        groupIds.push(gm.getString("group"));
      }
      result.push({
        profile: safeProfile(u),
        groupIds: groupIds
      });
    }
    return e.json(200, { users: result });
  } catch (err) {
    return e.json(400, { message: err.toString() });
  }
});

// Admin-only: Set target user status
routerAdd("POST", "/api/corelib/admin/users/{id}/status", (e) => {
  const safeProfile = (rec) => {
    return {
      id: rec.id,
      displayName: rec.getString("displayName"),
      email: rec.getString("email"),
      status: rec.getString("status"),
      role: rec.getString("role"),
      analyticsEnabled: rec.getBool("analyticsEnabled"),
    };
  };

  if (!e.auth) return e.json(401, { message: "invalid_session" });
  if (e.auth.getString("status") !== "approved") return e.json(403, { message: "account_not_approved" });
  if (e.auth.getString("role") !== "admin") return e.json(403, { message: "admin_required" });

  const targetId = e.request.pathValue("id");
  const data = e.requestInfo().body;
  const status = data.status || "";

  if (status !== "approved" && status !== "rejected" && status !== "pending") {
    return e.json(400, { message: "invalid_status" });
  }

  try {
    const target = e.app.findRecordById("users", targetId);
    const before = safeProfile(target);

    target.set("status", status);
    e.app.save(target);

    const after = safeProfile(target);

    // Audit log
    const auditCollection = e.app.findCollectionByNameOrId("admin_audit_logs");
    const log = new Record(auditCollection);
    log.set("actor", e.auth.id);
    log.set("action", "user_status_changed");
    log.set("targetType", "user");
    log.set("targetId", targetId);
    log.set("before", before);
    log.set("after", after);
    e.app.save(log);

    return e.json(200, after);
  } catch (err) {
    return e.json(404, { message: "user_not_found" });
  }
});

// Admin-only: Set target user groups
routerAdd("POST", "/api/corelib/admin/users/{id}/groups", (e) => {
  if (!e.auth) return e.json(401, { message: "invalid_session" });
  if (e.auth.getString("status") !== "approved") return e.json(403, { message: "account_not_approved" });
  if (e.auth.getString("role") !== "admin") return e.json(403, { message: "admin_required" });

  const targetId = e.request.pathValue("id");
  const data = e.requestInfo().body;
  const groupIds = data.groupIds || [];

  try {
    // Verify target user exists
    e.app.findRecordById("users", targetId);

    // Get current groups
    const currentGM = e.app.findRecordsByFilter("group_members", "user = {:userId}", "", 0, 0, { userId: targetId });
    const beforeGroupIds = [];
    for (const gm of currentGM) {
      beforeGroupIds.push(gm.getString("group"));
    }

    // Verify all requested groups exist
    for (const gid of groupIds) {
      e.app.findRecordById("groups", gid); // will throw if not found
    }

    // Delete existing memberships
    for (const gm of currentGM) {
      e.app.delete(gm);
    }

    // Insert new memberships
    const gmCollection = e.app.findCollectionByNameOrId("group_members");
    for (const gid of groupIds) {
      const gm = new Record(gmCollection);
      gm.set("user", targetId);
      gm.set("group", gid);
      e.app.save(gm);
    }

    // Audit log
    const auditCollection = e.app.findCollectionByNameOrId("admin_audit_logs");
    const log = new Record(auditCollection);
    log.set("actor", e.auth.id);
    log.set("action", "user_groups_changed");
    log.set("targetType", "user");
    log.set("targetId", targetId);
    log.set("before", { groupIds: beforeGroupIds });
    log.set("after", { groupIds: groupIds });
    e.app.save(log);

    return e.json(200, groupIds);
  } catch (err) {
    return e.json(400, { message: "invalid_input" });
  }
});

// Admin-only: Delete target user
routerAdd("DELETE", "/api/corelib/admin/users/{id}", (e) => {
  if (!e.auth) return e.json(401, { message: "invalid_session" });
  if (e.auth.getString("status") !== "approved") return e.json(403, { message: "account_not_approved" });
  if (e.auth.getString("role") !== "admin") return e.json(403, { message: "admin_required" });

  const targetId = e.request.pathValue("id");

  if (targetId === e.auth.id) {
    return e.json(400, { message: "cannot_delete_self" });
  }

  try {
    const target = e.app.findRecordById("users", targetId);
    const beforeProfile = {
      displayName: target.getString("displayName"),
      email: target.getString("email"),
      status: target.getString("status"),
      role: target.getString("role"),
    };

    // Delete related records
    const relatedGM = e.app.findRecordsByFilter("group_members", "user = {:userId}", "", 0, 0, { userId: targetId });
    for (const gm of relatedGM) { e.app.delete(gm); }

    const relatedEvents = e.app.findRecordsByFilter("analytics_events", "user = {:userId}", "", 0, 0, { userId: targetId });
    for (const ev of relatedEvents) { e.app.delete(ev); }

    // Delete audit logs where this user is the actor, otherwise the required
    // relation would block deletion of the user record.
    const relatedAudit = e.app.findRecordsByFilter("admin_audit_logs", "actor = {:userId}", "", 0, 0, { userId: targetId });
    for (const al of relatedAudit) { e.app.delete(al); }

    // Delete the user record
    e.app.delete(target);

    // Audit log
    const auditCollection = e.app.findCollectionByNameOrId("admin_audit_logs");
    const log = new Record(auditCollection);
    log.set("actor", e.auth.id);
    log.set("action", "user_deleted");
    log.set("targetType", "user");
    log.set("targetId", targetId);
    log.set("before", beforeProfile);
    log.set("after", null);
    e.app.save(log);

    return e.json(200, { deleted: true });
  } catch (err) {
    return e.json(400, { message: "invalid_input" });
  }
});

// Admin-only: List groups
routerAdd("GET", "/api/corelib/admin/groups", (e) => {
  if (!e.auth) return e.json(401, { message: "invalid_session" });
  if (e.auth.getString("status") !== "approved") return e.json(403, { message: "account_not_approved" });
  if (e.auth.getString("role") !== "admin") return e.json(403, { message: "admin_required" });

  try {
    const groups = e.app.findRecordsByFilter("groups", "", "name", 0, 0);
    const result = [];
    for (const g of groups) {
      result.push({
        id: g.id,
        name: g.getString("name"),
        description: g.getString("description")
      });
    }
    return e.json(200, { groups: result });
  } catch (err) {
    return e.json(400, { message: err.toString() });
  }
});

// Admin-only: Create group
routerAdd("POST", "/api/corelib/admin/groups", (e) => {
  if (!e.auth) return e.json(401, { message: "invalid_session" });
  if (e.auth.getString("status") !== "approved") return e.json(403, { message: "account_not_approved" });
  if (e.auth.getString("role") !== "admin") return e.json(403, { message: "admin_required" });

  const data = e.requestInfo().body;
  const name = data.name || "";
  const description = data.description || "";

  if (!name) {
    return e.json(400, { message: "invalid_input" });
  }

  // Check if group name already exists
  try {
    const existing = e.app.findRecordsByFilter("groups", "name = {:name}", "", 1, 0, { name: name });
    if (existing.length > 0) {
      return e.json(409, { message: "group_taken" });
    }
  } catch (_) {}

  try {
    const groupsCollection = e.app.findCollectionByNameOrId("groups");
    const group = new Record(groupsCollection);
    group.set("name", name);
    group.set("description", description);
    e.app.save(group);

    const auditCollection = e.app.findCollectionByNameOrId("admin_audit_logs");
    const log = new Record(auditCollection);
    log.set("actor", e.auth.id);
    log.set("action", "group_created");
    log.set("targetType", "group");
    log.set("targetId", group.id);
    log.set("before", null);
    log.set("after", { name: name, description: description });
    e.app.save(log);

    return e.json(200, {
      id: group.id,
      name: group.getString("name"),
      description: group.getString("description")
    });
  } catch (err) {
    return e.json(400, { message: err.toString() });
  }
});

// Admin-only: List features
routerAdd("GET", "/api/corelib/admin/features", (e) => {
  if (!e.auth) return e.json(401, { message: "invalid_session" });
  if (e.auth.getString("status") !== "approved") return e.json(403, { message: "account_not_approved" });
  if (e.auth.getString("role") !== "admin") return e.json(403, { message: "admin_required" });

  try {
    const features = e.app.findRecordsByFilter("features", "", "key", 0, 0);
    const result = [];
    for (const f of features) {
      result.push({
        id: f.id,
        key: f.getString("key"),
        description: f.getString("description")
      });
    }
    return e.json(200, { features: result });
  } catch (err) {
    return e.json(400, { message: err.toString() });
  }
});

// Admin-only: Create feature
routerAdd("POST", "/api/corelib/admin/features", (e) => {
  if (!e.auth) return e.json(401, { message: "invalid_session" });
  if (e.auth.getString("status") !== "approved") return e.json(403, { message: "account_not_approved" });
  if (e.auth.getString("role") !== "admin") return e.json(403, { message: "admin_required" });

  const data = e.requestInfo().body;
  const key = data.key || "";
  const description = data.description || "";

  if (!key) {
    return e.json(400, { message: "invalid_input" });
  }

  // Check if key already exists
  try {
    const existing = e.app.findRecordsByFilter("features", "key = {:key}", "", 1, 0, { key: key });
    if (existing.length > 0) {
      return e.json(409, { message: "feature_taken" });
    }
  } catch (_) {}

  try {
    const featuresCollection = e.app.findCollectionByNameOrId("features");
    const feature = new Record(featuresCollection);
    feature.set("key", key);
    feature.set("description", description);
    e.app.save(feature);

    const auditCollection = e.app.findCollectionByNameOrId("admin_audit_logs");
    const log = new Record(auditCollection);
    log.set("actor", e.auth.id);
    log.set("action", "feature_created");
    log.set("targetType", "feature");
    log.set("targetId", feature.id);
    log.set("before", null);
    log.set("after", { key: key, description: description });
    e.app.save(log);

    return e.json(200, {
      id: feature.id,
      key: feature.getString("key"),
      description: feature.getString("description")
    });
  } catch (err) {
    return e.json(400, { message: err.toString() });
  }
});

// Admin-only: Set feature assignment (creates or updates)
routerAdd("POST", "/api/corelib/admin/assignments", (e) => {
  if (!e.auth) return e.json(401, { message: "invalid_session" });
  if (e.auth.getString("status") !== "approved") return e.json(403, { message: "account_not_approved" });
  if (e.auth.getString("role") !== "admin") return e.json(403, { message: "admin_required" });

  const data = e.requestInfo().body;
  const featureKey = data.featureKey || "";
  const subjectType = data.subjectType || "";
  const subjectId = data.subjectId || "";
  const enabled = data.enabled === true;

  if (!featureKey || (subjectType !== "user" && subjectType !== "group") || !subjectId) {
    return e.json(400, { message: "invalid_input" });
  }

  try {
    // Find feature record
    const features = e.app.findRecordsByFilter("features", "key = {:key}", "", 1, 0, { key: featureKey });
    if (features.length === 0) {
      return e.json(400, { message: "invalid_assignment" });
    }
    const feature = features[0];

    // Find if assignment already exists
    let existingAssignment;
    try {
      const existing = e.app.findRecordsByFilter(
        "feature_assignments",
        "feature = {:featureId} && subjectType = {:subjectType} && subjectId = {:subjectId}",
        "",
        1,
        0,
        { featureId: feature.id, subjectType: subjectType, subjectId: subjectId }
      );
      if (existing.length > 0) {
        existingAssignment = existing[0];
      }
    } catch (_) {}

    const faCollection = e.app.findCollectionByNameOrId("feature_assignments");
    const assignment = existingAssignment || new Record(faCollection);

    const before = existingAssignment ? {
      id: assignment.id,
      featureKey: featureKey,
      subjectType: assignment.getString("subjectType"),
      subjectId: assignment.getString("subjectId"),
      enabled: assignment.getBool("enabled")
    } : null;

    assignment.set("feature", feature.id);
    assignment.set("subjectType", subjectType);
    assignment.set("subjectId", subjectId);
    assignment.set("enabled", enabled);
    e.app.save(assignment);

    const after = {
      id: assignment.id,
      featureKey: featureKey,
      subjectType: subjectType,
      subjectId: subjectId,
      enabled: enabled
    };

    // Audit log
    const auditCollection = e.app.findCollectionByNameOrId("admin_audit_logs");
    const log = new Record(auditCollection);
    log.set("actor", e.auth.id);
    log.set("action", "feature_assignment_changed");
    log.set("targetType", "feature_assignment");
    log.set("targetId", assignment.id);
    log.set("before", before);
    log.set("after", after);
    e.app.save(log);

    return e.json(200, after);
  } catch (err) {
    return e.json(400, { message: err.toString() });
  }
});

// Admin-only: Aggregate metrics route
routerAdd("GET", "/api/corelib/admin/metrics", (e) => {
  if (!e.auth) return e.json(401, { message: "invalid_session" });
  if (e.auth.getString("status") !== "approved") return e.json(403, { message: "account_not_approved" });
  if (e.auth.getString("role") !== "admin") return e.json(403, { message: "admin_required" });

  try {
    // 1. Count approved and pending users
    const approvedUsers = e.app.findRecordsByFilter("users", "status = 'approved'", "", 0, 0).length;
    const pendingUsers = e.app.findRecordsByFilter("users", "status = 'pending'", "", 0, 0).length;

    // 2. Count active users last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recentEvents = e.app.findRecordsByFilter("analytics_events", "occurredAt >= {:thirtyDaysAgo}", "", 0, 0, { thirtyDaysAgo: thirtyDaysAgo });
    const activeUserIds = new Set();
    for (const ev of recentEvents) {
      activeUserIds.add(ev.getString("user"));
    }
    let activeUsersLast30Days = 0;
    for (const uid of activeUserIds) {
      try {
        const u = e.app.findRecordById("users", uid);
        if (u.getString("status") === "approved") {
          activeUsersLast30Days++;
        }
      } catch (_) {}
    }

    // 3. Count eventsByName, versions, errorsByCode
    const allEvents = e.app.findRecordsByFilter("analytics_events", "", "", 0, 0);

    const countMap = {};
    const versionMap = {};
    const errorMap = {};

    for (const ev of allEvents) {
      const name = ev.getString("name");
      countMap[name] = (countMap[name] || 0) + 1;

      const ver = ev.getString("appVersion");
      versionMap[ver] = (versionMap[ver] || 0) + 1;

      if (name === "handled_error") {
        let code = "";
        try {
          const payloadStr = ev.getString("payload");
          if (payloadStr) {
            const payload = JSON.parse(payloadStr);
            code = payload.code || "";
          }
        } catch (_) {}
        if (code) {
          errorMap[code] = (errorMap[code] || 0) + 1;
        }
      }
    }

    const eventsByName = [];
    for (const name in countMap) {
      eventsByName.push({ name: name, count: countMap[name] });
    }
    eventsByName.sort((a, b) => a.name.localeCompare(b.name));

    const versions = [];
    for (const ver in versionMap) {
      versions.push({ appVersion: ver, count: versionMap[ver] });
    }
    versions.sort((a, b) => a.appVersion.localeCompare(b.appVersion));

    const errorsByCode = [];
    for (const code in errorMap) {
      errorsByCode.push({ code: code, count: errorMap[code] });
    }
    errorsByCode.sort((a, b) => a.code.localeCompare(b.code));

    return e.json(200, {
      approvedUsers: approvedUsers,
      pendingUsers: pendingUsers,
      activeUsersLast30Days: activeUsersLast30Days,
      eventsByName: eventsByName,
      versions: versions,
      errorsByCode: errorsByCode
    });
  } catch (err) {
    return e.json(400, { message: err.toString() });
  }
});
