migrate((app) => {
  // 1. Fetch and modify the built-in users (auth) collection
  const users = app.findCollectionByNameOrId("users");

  // Reset rules to locked (null)
  users.listRule = null;
  users.viewRule = null;
  users.createRule = null;
  users.updateRule = null;
  users.deleteRule = null;

  // Add custom fields using PocketBase v0.23/v0.24 fields.add API
  users.fields.add(new TextField({
    name: "displayName",
    required: true,
    min: null,
    max: 80,
    pattern: ""
  }));

  users.fields.add(new SelectField({
    name: "status",
    required: true,
    values: ["pending", "approved", "rejected"],
    maxSelect: 1
  }));

  users.fields.add(new SelectField({
    name: "role",
    required: true,
    values: ["member", "admin"],
    maxSelect: 1
  }));

  users.fields.add(new BoolField({
    name: "analyticsEnabled",
    required: false,
  }));

  app.save(users);

  // Helper function to define autodate fields
  const autoDateFields = () => [
    {
      name: "created",
      type: "autodate",
      onCreate: true,
      onUpdate: false
    },
    {
      name: "updated",
      type: "autodate",
      onCreate: true,
      onUpdate: true
    }
  ];

  // 2. Create groups collection
  const groups = new Collection({
    name: "groups",
    type: "base",
    fields: [
      {
        name: "name",
        type: "text",
        required: true,
        min: null,
        max: 80,
      },
      {
        name: "description",
        type: "text",
        required: false,
        max: 240,
      },
      ...autoDateFields()
    ],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    indexes: [
      "CREATE UNIQUE INDEX `idx_groups_name` ON `groups` (`name`)"
    ]
  });
  app.save(groups);

  // 3. Create group_members collection
  const groupMembers = new Collection({
    name: "group_members",
    type: "base",
    fields: [
      {
        name: "user",
        type: "relation",
        required: true,
        collectionId: users.id,
        cascadeDelete: true,
        maxSelect: 1
      },
      {
        name: "group",
        type: "relation",
        required: true,
        collectionId: groups.id,
        cascadeDelete: true,
        maxSelect: 1
      },
      ...autoDateFields()
    ],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    indexes: [
      "CREATE UNIQUE INDEX `idx_group_members_user_group` ON `group_members` (`user`, `group`)"
    ]
  });
  app.save(groupMembers);

  // 4. Create features collection
  const features = new Collection({
    name: "features",
    type: "base",
    fields: [
      {
        name: "key",
        type: "text",
        required: true,
        min: null,
        max: 80,
      },
      {
        name: "description",
        type: "text",
        required: false,
        max: 240,
      },
      ...autoDateFields()
    ],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    indexes: [
      "CREATE UNIQUE INDEX `idx_features_key` ON `features` (`key`)"
    ]
  });
  app.save(features);

  // 5. Create feature_assignments collection
  const featureAssignments = new Collection({
    name: "feature_assignments",
    type: "base",
    fields: [
      {
        name: "feature",
        type: "relation",
        required: true,
        collectionId: features.id,
        cascadeDelete: true,
        maxSelect: 1
      },
      {
        name: "subjectType",
        type: "select",
        required: true,
        values: ["user", "group"],
        maxSelect: 1
      },
      {
        name: "subjectId",
        type: "text",
        required: true,
      },
      {
        name: "enabled",
        type: "bool",
        required: false,
      },
      ...autoDateFields()
    ],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    indexes: [
      "CREATE INDEX `idx_feature_assignments_composite` ON `feature_assignments` (`feature`, `subjectType`, `subjectId`)"
    ]
  });
  app.save(featureAssignments);

  // 6. Create analytics_events collection
  const analyticsEvents = new Collection({
    name: "analytics_events",
    type: "base",
    fields: [
      {
        name: "user",
        type: "relation",
        required: true,
        collectionId: users.id,
        cascadeDelete: true,
        maxSelect: 1
      },
      {
        name: "installationId",
        type: "text",
        required: true,
        max: 80,
      },
      {
        name: "name",
        type: "select",
        required: true,
        values: ["app_opened", "feature_opened", "feature_completed", "handled_error", "updater_state"],
        maxSelect: 1
      },
      {
        name: "appVersion",
        type: "text",
        required: true,
        max: 40,
      },
      {
        name: "occurredAt",
        type: "date",
        required: true,
      },
      {
        name: "payload",
        type: "json",
        required: false,
      },
      ...autoDateFields()
    ],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    indexes: [
      "CREATE INDEX `idx_analytics_events_user_occurred` ON `analytics_events` (`user`, `occurredAt`)",
      "CREATE INDEX `idx_analytics_events_name_occurred` ON `analytics_events` (`name`, `occurredAt`)"
    ]
  });
  app.save(analyticsEvents);

  // 7. Create admin_audit_logs collection
  const adminAuditLogs = new Collection({
    name: "admin_audit_logs",
    type: "base",
    fields: [
      {
        name: "actor",
        type: "relation",
        required: true,
        collectionId: users.id,
        cascadeDelete: false,
        maxSelect: 1
      },
      {
        name: "action",
        type: "text",
        required: true,
        max: 80,
      },
      {
        name: "targetType",
        type: "text",
        required: false,
        max: 40,
      },
      {
        name: "targetId",
        type: "text",
        required: false,
        max: 40,
      },
      {
        name: "before",
        type: "json",
        required: false,
      },
      {
        name: "after",
        type: "json",
        required: false,
      },
      ...autoDateFields()
    ],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    indexes: [
      "CREATE INDEX `idx_admin_audit_logs_created` ON `admin_audit_logs` (`created`)"
    ]
  });
  app.save(adminAuditLogs);

}, (app) => {
  // Down migration: remove custom collections and revert users collection
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("displayName");
  users.fields.removeByName("status");
  users.fields.removeByName("role");
  users.fields.removeByName("analyticsEnabled");
  app.save(users);

  const collectionsToDelete = [
    "admin_audit_logs",
    "analytics_events",
    "feature_assignments",
    "features",
    "group_members",
    "groups"
  ];

  for (const name of collectionsToDelete) {
    try {
      const col = app.findCollectionByNameOrId(name);
      app.delete(col);
    } catch (_) {}
  }
});
