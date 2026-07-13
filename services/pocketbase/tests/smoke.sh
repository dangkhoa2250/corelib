#!/usr/bin/env bash
set -euo pipefail

base_url="${1:?pass PocketBase base URL, e.g. http://127.0.0.1:8090}"

# Clear database users to make the test idempotent
sqlite3 services/pocketbase/pb_data/data.db "DELETE FROM users;"

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



