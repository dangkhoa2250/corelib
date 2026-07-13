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
