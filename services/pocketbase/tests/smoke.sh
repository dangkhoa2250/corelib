#!/usr/bin/env bash
set -euo pipefail

base_url="${1:?pass PocketBase base URL, e.g. http://127.0.0.1:8090}"

# Clear database tables to make the test idempotent
sqlite3 services/pocketbase/pb_data/data.db "DELETE FROM users; DELETE FROM groups; DELETE FROM group_members; DELETE FROM features; DELETE FROM feature_assignments; DELETE FROM admin_audit_logs; DELETE FROM analytics_events;"

status="$(curl --silent --output /tmp/corelib-register.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/register" \
  --header 'content-type: application/json' \
  --data '{"displayName":"Test Member","email":"member@example.test","password":"correct horse battery staple","passwordConfirm":"correct horse battery staple"}')"

test "${status}" = "200"
grep -q '"status":"pending"' /tmp/corelib-register.json

status="$(curl --silent --output /tmp/corelib-escalation.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/register" \
  --header 'content-type: application/json' \
  --data '{"displayName":"Escalation","email":"escalation@example.test","password":"correct horse battery staple","passwordConfirm":"correct horse battery staple","status":"approved","role":"admin"}')"
test "${status}" = "200"
grep -q '"status":"pending"' /tmp/corelib-escalation.json

# Pending account: HTTP 200 and no token field
status="$(curl --silent --output /tmp/corelib-signin-pending.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/sign-in" \
  --header 'content-type: application/json' \
  --data '{"email":"member@example.test","password":"correct horse battery staple"}')"
test "${status}" = "200"
grep -q '"status":"pending"' /tmp/corelib-signin-pending.json
if grep -q '"token"' /tmp/corelib-signin-pending.json; then
  echo "Error: pending sign-in response should not contain a token"
  exit 1
fi

# Wrong password: HTTP 401 with error code invalid_credentials
status="$(curl --silent --output /tmp/corelib-signin-wrong.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/sign-in" \
  --header 'content-type: application/json' \
  --data '{"email":"member@example.test","password":"wrong"}')"
test "${status}" = "401"
grep -q '"invalid_credentials"' /tmp/corelib-signin-wrong.json

# /me with no Authorization header: HTTP 401
status="$(curl --silent --output /tmp/corelib-me-anon.json --write-out '%{http_code}' \
  --request GET "${base_url}/api/corelib/me")"
test "${status}" = "401"

# Approve the member via sqlite3
sqlite3 services/pocketbase/pb_data/data.db "UPDATE users SET status = 'approved' WHERE email = 'member@example.test';"

# Sign-in approved account: HTTP 200 with token and profile
status="$(curl --silent --output /tmp/corelib-signin-approved.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/sign-in" \
  --header 'content-type: application/json' \
  --data '{"email":"member@example.test","password":"correct horse battery staple"}')"
test "${status}" = "200"
grep -q '"status":"approved"' /tmp/corelib-signin-approved.json
grep -q '"token"' /tmp/corelib-signin-approved.json

# Extract token using a simple command (e.g. sed or python)
token="$(python3 -c 'import json; print(json.load(open("/tmp/corelib-signin-approved.json"))["token"])')"

# /me with Authorization header: HTTP 200 with profile and entitlements
status="$(curl --silent --output /tmp/corelib-me-approved.json --write-out '%{http_code}' \
  --request GET "${base_url}/api/corelib/me" \
  --header "Authorization: Bearer ${token}")"
test "${status}" = "200"
grep -q '"email":"member@example.test"' /tmp/corelib-me-approved.json
grep -q '"status":"approved"' /tmp/corelib-me-approved.json

# 1. Approved member -> GET /api/corelib/admin/users returns 403 admin_required
status="$(curl --silent --output /tmp/corelib-admin-users-fail.json --write-out '%{http_code}' \
  --request GET "${base_url}/api/corelib/admin/users" \
  --header "Authorization: Bearer ${token}")"
test "${status}" = "403"
grep -q '"admin_required"' /tmp/corelib-admin-users-fail.json

# Register admin
status="$(curl --silent --output /tmp/corelib-register-admin.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/register" \
  --header 'content-type: application/json' \
  --data '{"displayName":"Admin User","email":"admin@example.test","password":"correct horse battery staple","passwordConfirm":"correct horse battery staple"}')"
test "${status}" = "200"

# Approve and make admin via sqlite3
sqlite3 services/pocketbase/pb_data/data.db "UPDATE users SET status = 'approved', role = 'admin' WHERE email = 'admin@example.test';"

# Sign in as admin to get token
status="$(curl --silent --output /tmp/corelib-signin-admin.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/sign-in" \
  --header 'content-type: application/json' \
  --data '{"email":"admin@example.test","password":"correct horse battery staple"}')"
test "${status}" = "200"
admin_token="$(python3 -c 'import json; print(json.load(open("/tmp/corelib-signin-admin.json"))["token"])')"

# Admin can list users
status="$(curl --silent --output /tmp/corelib-admin-users.json --write-out '%{http_code}' \
  --request GET "${base_url}/api/corelib/admin/users" \
  --header "Authorization: Bearer ${admin_token}")"
test "${status}" = "200"
grep -q '"email":"member@example.test"' /tmp/corelib-admin-users.json

# Register pending user
status="$(curl --silent --output /tmp/corelib-register-pending.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/register" \
  --header 'content-type: application/json' \
  --data '{"displayName":"Pending User","email":"pending@example.test","password":"correct horse battery staple","passwordConfirm":"correct horse battery staple"}')"
test "${status}" = "200"
pending_id="$(sqlite3 services/pocketbase/pb_data/data.db "SELECT id FROM users WHERE email = 'pending@example.test';")"

# 2. Admin approves a pending user -> response is approved and audit row count increases by one
status="$(curl --silent --output /tmp/corelib-admin-approve.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/admin/users/${pending_id}/status" \
  --header "Authorization: Bearer ${admin_token}" \
  --header 'content-type: application/json' \
  --data '{"status":"approved"}')"
test "${status}" = "200"
grep -q '"status":"approved"' /tmp/corelib-admin-approve.json

audit_count="$(sqlite3 services/pocketbase/pb_data/data.db "SELECT count(*) FROM admin_audit_logs;")"
test "${audit_count}" = "1"

# 3. Member in group beta gets feature beta_reader when group assignment is enabled
status="$(curl --silent --output /tmp/corelib-admin-create-group.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/admin/groups" \
  --header "Authorization: Bearer ${admin_token}" \
  --header 'content-type: application/json' \
  --data '{"name":"beta","description":"Beta group"}')"
test "${status}" = "200"
group_id="$(python3 -c 'import json; print(json.load(open("/tmp/corelib-admin-create-group.json"))["id"])')"

status="$(curl --silent --output /tmp/corelib-admin-create-feature.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/admin/features" \
  --header "Authorization: Bearer ${admin_token}" \
  --header 'content-type: application/json' \
  --data '{"key":"beta_reader","description":"Beta Reader Feature"}')"
test "${status}" = "200"

status="$(curl --silent --output /tmp/corelib-admin-assign-group.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/admin/assignments" \
  --header "Authorization: Bearer ${admin_token}" \
  --header 'content-type: application/json' \
  --data "{\"featureKey\":\"beta_reader\",\"subjectType\":\"group\",\"subjectId\":\"${group_id}\",\"enabled\":true}")"
test "${status}" = "200"

member_id="$(sqlite3 services/pocketbase/pb_data/data.db "SELECT id FROM users WHERE email = 'member@example.test';")"
status="$(curl --silent --output /tmp/corelib-admin-user-groups.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/admin/users/${member_id}/groups" \
  --header "Authorization: Bearer ${admin_token}" \
  --header 'content-type: application/json' \
  --data "{\"groupIds\":[\"${group_id}\"]}")"
test "${status}" = "200"

status="$(curl --silent --output /tmp/corelib-me-beta.json --write-out '%{http_code}' \
  --request GET "${base_url}/api/corelib/me" \
  --header "Authorization: Bearer ${token}")"
test "${status}" = "200"
grep -q '"beta_reader"' /tmp/corelib-me-beta.json

# 4. A user assignment enabled=false for beta_reader overrides the group assignment
status="$(curl --silent --output /tmp/corelib-admin-assign-user.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/admin/assignments" \
  --header "Authorization: Bearer ${admin_token}" \
  --header 'content-type: application/json' \
  --data "{\"featureKey\":\"beta_reader\",\"subjectType\":\"user\",\"subjectId\":\"${member_id}\",\"enabled\":false}")"
test "${status}" = "200"

status="$(curl --silent --output /tmp/corelib-me-denied.json --write-out '%{http_code}' \
  --request GET "${base_url}/api/corelib/me" \
  --header "Authorization: Bearer ${token}")"
test "${status}" = "200"
if grep -q '"beta_reader"' /tmp/corelib-me-denied.json; then
  echo "Error: Deny override did not exclude beta_reader feature"
  exit 1
fi

# 5. A pending/rejected token cannot call /me (status check propagation)
status="$(curl --silent --output /tmp/corelib-register-prop.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/register" \
  --header 'content-type: application/json' \
  --data '{"displayName":"Prop User","email":"prop@example.test","password":"correct horse battery staple","passwordConfirm":"correct horse battery staple"}' )"
test "${status}" = "200"
prop_id="$(sqlite3 services/pocketbase/pb_data/data.db "SELECT id FROM users WHERE email = 'prop@example.test';")"

sqlite3 services/pocketbase/pb_data/data.db "UPDATE users SET status = 'approved' WHERE email = 'prop@example.test';"

status="$(curl --silent --output /tmp/corelib-signin-prop.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/sign-in" \
  --header 'content-type: application/json' \
  --data '{"email":"prop@example.test","password":"correct horse battery staple"}' )"
test "${status}" = "200"
prop_token="$(python3 -c 'import json; print(json.load(open("/tmp/corelib-signin-prop.json"))["token"])')"

# Reject them via admin status endpoint
status="$(curl --silent --output /tmp/corelib-admin-reject-prop.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/admin/users/${prop_id}/status" \
  --header "Authorization: Bearer ${admin_token}" \
  --header 'content-type: application/json' \
  --data '{"status":"rejected"}')"
test "${status}" = "200"

# Verify call with prop_token returns 403 account_not_approved
status="$(curl --silent --output /tmp/corelib-me-prop-fail.json --write-out '%{http_code}' \
  --request GET "${base_url}/api/corelib/me" \
  --header "Authorization: Bearer ${prop_token}")"
test "${status}" = "403"
grep -q '"account_not_approved"' /tmp/corelib-me-prop-fail.json

# 6. Analytics Ingestion and Aggregate Metrics
# Check analytics endpoint with approved user token: should return 403 analytics_disabled
status="$(curl --silent --output /tmp/corelib-analytics-discard.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/analytics" \
  --header "Authorization: Bearer ${token}" \
  --header 'content-type: application/json' \
  --data '{"installationId":"inst-1","name":"app_opened","appVersion":"1.0.0","occurredAt":"2026-07-13T21:00:00Z","payload":{"source":"manual"}}')"
test "${status}" = "403"
grep -q '"analytics_disabled"' /tmp/corelib-analytics-discard.json

# Opt in to analytics: returns 200
status="$(curl --silent --output /tmp/corelib-optin.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/me/analytics" \
  --header "Authorization: Bearer ${token}" \
  --header 'content-type: application/json' \
  --data '{"enabled":true}')"
test "${status}" = "200"
grep -q '"analyticsEnabled":true' /tmp/corelib-optin.json

# Send valid analytics event -> returns 204
status="$(curl --silent --output /tmp/corelib-analytics-save.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/analytics" \
  --header "Authorization: Bearer ${token}" \
  --header 'content-type: application/json' \
  --data '{"installationId":"inst-1","name":"app_opened","appVersion":"1.0.0","occurredAt":"2026-07-13T21:00:00Z","payload":{"source":"manual"}}')"
test "${status}" = "204"

# Send prohibited event name "pdf_content" -> returns 400
status="$(curl --silent --output /tmp/corelib-analytics-invalid-name.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/analytics" \
  --header "Authorization: Bearer ${token}" \
  --header 'content-type: application/json' \
  --data '{"installationId":"inst-1","name":"pdf_content","appVersion":"1.0.0","occurredAt":"2026-07-13T21:00:00Z","payload":{}}')"
test "${status}" = "400"
grep -q '"invalid_event"' /tmp/corelib-analytics-invalid-name.json

# Send prohibited payload key "query" -> returns 400
status="$(curl --silent --output /tmp/corelib-analytics-prohibited.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/analytics" \
  --header "Authorization: Bearer ${token}" \
  --header 'content-type: application/json' \
  --data '{"installationId":"inst-1","name":"app_opened","appVersion":"1.0.0","occurredAt":"2026-07-13T21:00:00Z","payload":{"query":"select"}}')"
test "${status}" = "400"
grep -q '"invalid_event"' /tmp/corelib-analytics-prohibited.json

# Send second valid event (handled_error) -> returns 204
status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/analytics" \
  --header "Authorization: Bearer ${token}" \
  --header 'content-type: application/json' \
  --data '{"installationId":"inst-1","name":"handled_error","appVersion":"1.0.0","occurredAt":"2026-07-13T21:05:00Z","payload":{"code":"network_unavailable"}}')"
test "${status}" = "204"

# Call admin metrics endpoint -> returns 200 with aggregate shape
status="$(curl --silent --output /tmp/corelib-admin-metrics.json --write-out '%{http_code}' \
  --request GET "${base_url}/api/corelib/admin/metrics" \
  --header "Authorization: Bearer ${admin_token}")"
test "${status}" = "200"

# Verify metrics aggregate counters and arrays
grep -q '"approvedUsers":3' /tmp/corelib-admin-metrics.json
grep -q '"pendingUsers":1' /tmp/corelib-admin-metrics.json
grep -q '"activeUsersLast30Days":1' /tmp/corelib-admin-metrics.json
grep -q '"name":"app_opened"' /tmp/corelib-admin-metrics.json
grep -q '"name":"handled_error"' /tmp/corelib-admin-metrics.json
grep -q '"appVersion":"1.0.0"' /tmp/corelib-admin-metrics.json
grep -q '"code":"network_unavailable"' /tmp/corelib-admin-metrics.json






