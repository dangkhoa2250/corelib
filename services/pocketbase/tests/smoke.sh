#!/usr/bin/env bash
set -euo pipefail

base_url="${1:?pass PocketBase base URL, e.g. http://127.0.0.1:8090}"
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

