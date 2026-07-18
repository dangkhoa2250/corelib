/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const dailyStatistics = new Collection({
    name: "daily_statistics",
    type: "base",
    fields: [
      { name: "user", type: "relation", required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1 },
      { name: "schemaVersion", type: "number", required: true, min: 1, max: 1 },
      { name: "localDay", type: "text", required: true, min: 10, max: 10, pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
      { name: "appKey", type: "text", required: true, min: 1, max: 80, pattern: "^[a-z][a-z0-9_-]*$" },
      { name: "activeMs", type: "number", required: true, min: 0 },
      { name: "activeDay", type: "bool", required: true },
      { name: "sessionCount", type: "number", required: true, min: 0 },
      { name: "pageVisitCount", type: "number", required: false, min: 0 },
      { name: "uniquePageCount", type: "number", required: false, min: 0 },
      { name: "realReviewCount", type: "number", required: false, min: 0 },
      { name: "againCount", type: "number", required: false, min: 0 },
      { name: "hardCount", type: "number", required: false, min: 0 },
      { name: "goodCount", type: "number", required: false, min: 0 },
      { name: "easyCount", type: "number", required: false, min: 0 },
      { name: "lapseCount", type: "number", required: false, min: 0 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    indexes: [
      "CREATE UNIQUE INDEX `idx_daily_statistics_identity` ON `daily_statistics` (`user`,`localDay`,`appKey`,`schemaVersion`)",
      "CREATE INDEX `idx_daily_statistics_day_app` ON `daily_statistics` (`localDay`,`appKey`)",
    ],
  });
  app.save(dailyStatistics);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("daily_statistics")); } catch (_) {}
});
