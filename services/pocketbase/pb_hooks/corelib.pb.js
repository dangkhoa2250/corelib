// Custom router endpoints
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
    console.log("NEW_AUTH_TOKEN_ERROR: " + err + "\nStack: " + err.stack);
    return e.json(400, { message: err.toString() });
  }
});

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

  if (!e.auth) {
    return e.json(401, { message: "invalid_session" });
  }

  if (e.auth.getString("status") !== "approved") {
    return e.json(403, { message: "account_not_approved" });
  }

  return e.json(200, {
    profile: safeProfile(e.auth),
    entitlements: {
      featureKeys: [],
      refreshedAt: new Date().toISOString()
    }
  });
});
