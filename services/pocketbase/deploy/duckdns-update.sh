#!/usr/bin/env bash
#
# Refresh the DuckDNS record for the Library account service.
# The token is NEVER logged, echoed, or passed on the command line
# in a way that appears in process listings — it is sent only as a
# query parameter over HTTPS to duckdns.org.
#
set -euo pipefail

ENV_FILE="${DUCKDNS_ENV_FILE:-/etc/corelib-pocketbase.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found" >&2
  exit 1
fi

# shellcheck source=/dev/null
. "$ENV_FILE"

if [ -z "${DUCKDNS_DOMAIN:-}" ]; then
  echo "ERROR: DUCKDNS_DOMAIN is not set in $ENV_FILE" >&2
  exit 1
fi
if [ -z "${DUCKDNS_TOKEN:-}" ]; then
  echo "ERROR: DUCKDNS_TOKEN is not set in $ENV_FILE" >&2
  exit 1
fi

# Send the update request. The response body must be exactly "OK".
# curl is called with --silent so the URL (which contains the token)
# is never printed to stdout/stderr.
response=$(curl --silent --show-error \
  "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=" \
  2>&1) || {
    echo "ERROR: DuckDNS update request failed" >&2
    exit 1
  }

if [ "$response" = "OK" ]; then
  echo "DuckDNS updated successfully"
  exit 0
else
  echo "ERROR: DuckDNS update returned unexpected response" >&2
  exit 1
fi
